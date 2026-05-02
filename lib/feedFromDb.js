'use strict';

const NO_CLAIMED_FILTER_SQL = `AND NOT EXISTS (
    SELECT 1 FROM chain_events pc
    WHERE pc.duel_id = ce.duel_id AND pc.event_type = 'ProceedsClaimed'
)`;

function mapInitiatedRowsToLiveFeedDuels(db, rows) {
  const completedStmt = db.prepare(
    `SELECT payload FROM chain_events
     WHERE duel_id = ? AND event_type IN ('DuelCompleted', 'ProceedsClaimed')
     ORDER BY block_number DESC LIMIT 1`
  );
  const joinedStmt = db.prepare(
    `SELECT 1 AS ok FROM chain_events
     WHERE duel_id = ? AND event_type IN ('DuelJoined', 'Deposited') LIMIT 1`
  );
  const nullStmt = db.prepare(
    `SELECT 1 AS ok FROM chain_events
     WHERE duel_id = ? AND event_type = 'DuelNullified' LIMIT 1`
  );

    return rows.map((r) => {
        const p = JSON.parse(r.payload);
        const completed = completedStmt.get(r.duel_id);
        const hasJoined = joinedStmt.get(r.duel_id);
        const hasNull = nullStmt.get(r.duel_id);

        let status = 'pending';
        let winner = null;
        let loser = null;

        if (hasNull) {
            status = 'cancelled';
        } else if (completed) {
            const cp = JSON.parse(completed.payload);
            status = 'completed';
            winner = cp.winner;
            loser = cp.loser;
        } else if (hasJoined) {
            status = 'active';
        }

        return {
            id: r.duel_id,
            player1: p.player1,
            player2: p.player2,
            wager: parseFloat(p.wager || '0'),
            winner,
            loser,
            status,
            timestamp: r.block_number,
            transactionHash: r.tx_hash,
            blockNumber: r.block_number
        };
    });
}

/**
 * Paginated live-feed from indexed chain_events (newest first).
 * @returns {{ total: number, duels: object[] }}
 */
function getLiveFeedFromDb(db, { limit, offset, includeClaimed }) {
    const filterSql = includeClaimed ? '' : NO_CLAIMED_FILTER_SQL;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM chain_events ce
       WHERE ce.event_type IN ('DuelInitiated', 'BattleInitialized') ${filterSql}`
    )
    .get();
  const total = countRow ? countRow.c : 0;

  const rows = db
    .prepare(
      `SELECT ce.duel_id, ce.block_number, ce.tx_hash, ce.payload
       FROM chain_events ce
       WHERE ce.event_type IN ('DuelInitiated', 'BattleInitialized') ${filterSql}
       ORDER BY ce.block_number DESC
             LIMIT ? OFFSET ?`
        )
        .all(limit, offset);

    return {
        total,
        duels: mapInitiatedRowsToLiveFeedDuels(db, rows)
    };
}

/**
 * Wallet duel history from DB (same response shape as /api/duels/:address).
 */
function getWalletDuelsFromDb(db, address, limit, page) {
    const addr = address.toLowerCase();
    const offset = (page - 1) * limit;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM chain_events
      WHERE event_type IN ('DuelInitiated', 'BattleInitialized')
      AND (
        lower(json_extract(payload, '$.player1')) = ?
        OR lower(json_extract(payload, '$.player2')) = ?
      )`
    )
    .get(addr, addr);
  const total = countRow ? countRow.c : 0;

  const rows = db
    .prepare(
      `SELECT duel_id, block_number, tx_hash, payload
       FROM chain_events
       WHERE event_type IN ('DuelInitiated', 'BattleInitialized')
       AND (
         lower(json_extract(payload, '$.player1')) = ?
         OR lower(json_extract(payload, '$.player2')) = ?
       )
       ORDER BY block_number DESC
       LIMIT ? OFFSET ?`
    )
    .all(addr, addr, limit, offset);

  const completedStmt = db.prepare(
    `SELECT payload FROM chain_events
     WHERE duel_id = ? AND event_type IN ('DuelCompleted', 'ProceedsClaimed')
     ORDER BY block_number DESC LIMIT 1`
  );
  const joinedStmt = db.prepare(
    `SELECT 1 AS ok FROM chain_events
     WHERE duel_id = ? AND event_type IN ('DuelJoined', 'Deposited') LIMIT 1`
  );
  const nullStmt = db.prepare(
    `SELECT 1 AS ok FROM chain_events
     WHERE duel_id = ? AND event_type = 'DuelNullified' LIMIT 1`
  );

    const duels = rows.map((r) => {
        const p = JSON.parse(r.payload);
        const completed = completedStmt.get(r.duel_id);
        const hasJoined = joinedStmt.get(r.duel_id);
        const hasNull = nullStmt.get(r.duel_id);
        let winner = null;
        let loser = null;
        let netProfit = 0;
        let status = 'pending';

        if (hasNull) {
            status = 'cancelled';
        } else if (completed) {
            const cp = JSON.parse(completed.payload);
            winner = cp.winner;
            loser = cp.loser;
            status = 'completed';
            const wager = parseFloat(p.wager || '0');
            if (winner && winner.toLowerCase() === addr) {
                netProfit = wager * 1.9;
            } else {
                netProfit = -wager;
            }
        } else if (hasJoined) {
            status = 'active';
        }

        return {
            id: r.duel_id,
            player1: p.player1,
            player2: p.player2,
            wager: parseFloat(p.wager || '0'),
            winner,
            loser,
            currentPlayer: address,
            netProfit,
            status,
            timestamp: r.block_number,
            transactionHash: r.tx_hash,
            blockNumber: r.block_number
        };
    });

    return { duels, hasMore: offset + rows.length < total };
}

function shortAddr(addr) {
    if (!addr || typeof addr !== 'string' || addr.length < 12) return addr || '';
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

/**
 * Aggregate ecosystem stats from indexed chain_events (approximate vs on-chain player stats).
 */
function getStatisticsFromDb(db) {
  const totalDuels = db
    .prepare(`SELECT COUNT(*) AS c FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')`)
    .get().c;

  const volRow = db
    .prepare(
      `SELECT IFNULL(SUM(CAST(json_extract(payload, '$.wager') AS REAL)), 0) AS v
       FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')`
    )
    .get();
  const totalVolume = volRow ? volRow.v : 0;

  const twRow = db
    .prepare(
      `SELECT IFNULL(SUM(CAST(json_extract(payload, '$.totalWinnings') AS REAL)), 0) AS s
       FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')`
    )
    .get();
  const totalETHWon = twRow ? twRow.s : 0;

  const feeRow = db
    .prepare(
      `SELECT IFNULL(SUM(CAST(json_extract(payload, '$.fee') AS REAL)), 0) AS s
       FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')`
    )
    .get();
  const totalFees = feeRow ? feeRow.s : 0;

  const maxRow = db
    .prepare(
      `SELECT IFNULL(MAX(CAST(json_extract(payload, '$.wager') AS REAL)), 0) AS m
       FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')`
        )
        .get();
    const largestSingleDuel = maxRow ? maxRow.m : 0;

  const largestDuelIdRow = db
    .prepare(
      `SELECT duel_id FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')
       ORDER BY CAST(json_extract(payload, '$.wager') AS REAL) DESC LIMIT 1`
    )
    .get();
  const largestDuelId = largestDuelIdRow ? largestDuelIdRow.duel_id : null;

  const u = db
    .prepare(
      `SELECT COUNT(DISTINCT a) AS c FROM (
        SELECT lower(json_extract(payload, '$.player1')) AS a
        FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')
        AND json_extract(payload, '$.player1') IS NOT NULL
        UNION
        SELECT lower(json_extract(payload, '$.player2'))
        FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')
        AND json_extract(payload, '$.player2') IS NOT NULL
        UNION
        SELECT lower(json_extract(payload, '$.winner'))
        FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')
        UNION
        SELECT lower(json_extract(payload, '$.loser'))
        FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')
      )`
    )
    .get();
  const activePlayers = u ? u.c : 0;

  const averageDuelSize = totalDuels > 0 ? totalVolume / totalDuels : 0;

  const modeRow = db
    .prepare(
      `SELECT ROUND(CAST(json_extract(payload, '$.wager') AS REAL), 4) AS bucket, COUNT(*) AS cnt
       FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')
       GROUP BY 1 ORDER BY cnt DESC LIMIT 1`
    )
    .get();
  const mostCommonDuelAmount = modeRow && modeRow.bucket != null ? modeRow.bucket : 0;
  const mostCommonPct =
    totalDuels > 0 && modeRow ? Math.round((100 * modeRow.cnt) / totalDuels) : 0;

  const minMax = db
    .prepare(
      `SELECT MIN(block_number) AS lo, MAX(block_number) AS hi
       FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')`
    )
    .get();

  const volumeHistory = [];
  if (minMax && minMax.lo != null && minMax.hi != null && minMax.hi >= minMax.lo) {
    const span = Math.max(1, minMax.hi - minMax.lo);
    const buckets = 10;
    for (let i = 0; i < buckets; i++) {
      const lo = minMax.lo + Math.floor((span * i) / buckets);
      const hi = minMax.lo + Math.floor((span * (i + 1)) / buckets);
      const r = db
        .prepare(
          `SELECT IFNULL(SUM(CAST(json_extract(payload, '$.wager') AS REAL)), 0) AS s
           FROM chain_events
           WHERE event_type IN ('DuelInitiated', 'BattleInitialized') AND block_number >= ? AND block_number <= ?`
        )
        .get(lo, hi);
      volumeHistory.push(r && r.s != null ? r.s : 0);
    }
  } else {
    for (let i = 0; i < 10; i++) volumeHistory.push(0);
  }

  const distRow = db
    .prepare(
      `WITH per AS (
        SELECT addr,
          SUM(CASE WHEN role = 'w' THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN role = 'l' THEN 1 ELSE 0 END) AS losses
        FROM (
          SELECT lower(json_extract(payload, '$.winner')) AS addr, 'w' AS role
          FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')
          UNION ALL
          SELECT lower(json_extract(payload, '$.loser')), 'l'
          FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')
        )
        GROUP BY addr
        HAVING (wins + losses) >= 1
      )
            SELECT
                SUM(CASE WHEN 1.0 * wins / (wins + losses) >= 0.4 AND 1.0 * wins / (wins + losses) < 0.5 THEN 1 ELSE 0 END) AS b40,
                SUM(CASE WHEN 1.0 * wins / (wins + losses) >= 0.5 AND 1.0 * wins / (wins + losses) < 0.6 THEN 1 ELSE 0 END) AS b50,
                SUM(CASE WHEN 1.0 * wins / (wins + losses) >= 0.6 AND 1.0 * wins / (wins + losses) < 0.7 THEN 1 ELSE 0 END) AS b60,
                SUM(CASE WHEN 1.0 * wins / (wins + losses) >= 0.7 AND 1.0 * wins / (wins + losses) < 0.8 THEN 1 ELSE 0 END) AS b70,
                SUM(CASE WHEN 1.0 * wins / (wins + losses) >= 0.8 THEN 1 ELSE 0 END) AS b80
            FROM per`
        )
        .get();

    const winRateDistribution = {
        '40-50%': distRow && distRow.b40 ? distRow.b40 : 0,
        '50-60%': distRow && distRow.b50 ? distRow.b50 : 0,
        '60-70%': distRow && distRow.b60 ? distRow.b60 : 0,
        '70-80%': distRow && distRow.b70 ? distRow.b70 : 0,
        '80%+': distRow && distRow.b80 ? distRow.b80 : 0
    };

    const topWin = db
        .prepare(
            `WITH per AS (
                SELECT addr,
                    SUM(CASE WHEN role = 'w' THEN 1 ELSE 0 END) AS wins,
                    SUM(CASE WHEN role = 'l' THEN 1 ELSE 0 END) AS losses
                FROM (
                    SELECT lower(json_extract(payload, '$.winner')) AS addr, 'w' AS role
                    FROM chain_events WHERE event_type = 'DuelCompleted'
                    UNION ALL
                    SELECT lower(json_extract(payload, '$.loser')), 'l'
                    FROM chain_events WHERE event_type = 'DuelCompleted'
                )
                GROUP BY addr
                HAVING (wins + losses) >= 3
            )
            SELECT addr, (100.0 * wins / (wins + losses)) AS wr
            FROM per ORDER BY wr DESC LIMIT 1`
        )
        .get();

    return {
        totalDuels,
        activePlayers,
        totalVolume,
        totalETHWon,
        averageDuelSize,
        mostCommonDuelAmount,
        mostCommonPct,
        largestSingleDuel,
        largestDuelId,
        totalFees,
        averageWinRate: null,
        winRateDistribution,
        volumeHistory,
        topPerformerWinRate: topWin ? topWin.wr : null,
        topPerformerAddr: topWin ? topWin.addr : null
    };
}

/**
 * Leaderboard rows from indexed events (volume / wins / win rate / profit are chain-event estimates).
 */
function getLeaderboardFromDb(db, sortBy, limit = 50) {
    const n = parseInt(String(limit), 10);
    const cap = Math.min(100, Math.max(1, Number.isFinite(n) && n > 0 ? n : 50));
  const completed = db
    .prepare(
      `SELECT lower(json_extract(payload, '$.winner')) AS w,
       lower(json_extract(payload, '$.loser')) AS l,
       CAST(json_extract(payload, '$.totalWinnings') AS REAL) AS tw,
       CAST(json_extract(payload, '$.fee') AS REAL) AS fee
       FROM chain_events WHERE event_type IN ('DuelCompleted', 'ProceedsClaimed')`
    )
    .all();

  const stats = new Map();
  function ensure(addr) {
    if (!addr || addr === '0x0000000000000000000000000000000000000000') return null;
    const a = addr.toLowerCase();
    if (!stats.has(a)) {
      stats.set(a, {
        wallet: a,
        wins: 0,
        losses: 0,
        ethWon: 0,
        volume: 0,
        duels: 0
      });
    }
    return stats.get(a);
  }

  for (const r of completed) {
    const sw = ensure(r.w);
    const sl = ensure(r.l);
    if (sw) {
      sw.wins += 1;
      sw.ethWon += r.tw || 0;
    }
    if (sl) sl.losses += 1;
  }

  const inits = db
    .prepare(
      `SELECT lower(json_extract(payload, '$.player1')) AS p1,
       lower(json_extract(payload, '$.player2')) AS p2,
       CAST(json_extract(payload, '$.wager') AS REAL) AS wager
       FROM chain_events WHERE event_type IN ('DuelInitiated', 'BattleInitialized')`
    )
    .all();

    for (const r of inits) {
        const s1 = ensure(r.p1);
        const s2 = ensure(r.p2);
        const w = r.wager || 0;
        if (s1) {
            s1.volume += w;
            s1.duels += 1;
        }
        if (s2) {
            s2.volume += w;
            s2.duels += 1;
        }
    }

    const rows = [];
    for (const s of stats.values()) {
        const decided = s.wins + s.losses;
        const winRate = decided > 0 ? ((100 * s.wins) / decided).toFixed(1) : '0.0';
        const netProfit = s.ethWon * 0.95;
        rows.push({
            wallet: s.wallet,
            walletShort: shortAddr(s.wallet),
            totalETHWon: s.ethWon,
            profit: netProfit,
            winRate: parseFloat(winRate),
            duels: s.duels,
            volume: s.volume,
            wins: s.wins
        });
    }

    const sortKey = sortBy === 'wins' ? 'wins' : sortBy === 'winrate' ? 'winRate' : sortBy === 'volume' ? 'volume' : 'profit';
    rows.sort((a, b) => {
        if (sortKey === 'winRate') return b.winRate - a.winRate || b.volume - a.volume;
        return b[sortKey] - a[sortKey] || b.volume - a.volume;
    });

    return rows.slice(0, cap).map((r, i) => ({
        rank: i + 1,
        wallet: r.walletShort,
        walletFull: r.wallet,
        totalETHWon: `${r.totalETHWon.toFixed(3)} ETH`,
        profit: `${r.profit >= 0 ? '+' : ''}${r.profit.toFixed(3)} ETH`,
        winRate: `${r.winRate.toFixed(1)}%`,
        duels: r.duels,
        volume: `${r.volume.toFixed(3)} ETH`
    }));
}

function formatAddressServer(address) {
    if (!address || typeof address !== 'string') return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Duel transaction timeline from DB (same general shape as server RPC path).
 */
function getDuelTransactionsFromDb(db, duelId) {
    const rows = db
        .prepare(
            `SELECT event_type, block_number, tx_hash, payload
             FROM chain_events WHERE duel_id = ?
             ORDER BY block_number ASC, log_index ASC`
        )
        .all(String(duelId));

  const initRow = rows.find((r) => r.event_type === 'DuelInitiated' || r.event_type === 'BattleInitialized');
  let initWager = 0;
  if (initRow) {
    const p = JSON.parse(initRow.payload);
    initWager = parseFloat(p.wager || '0');
  }

  const transactions = [];
  for (const r of rows) {
    const p = JSON.parse(r.payload);
    switch (r.event_type) {
      case 'DuelInitiated':
      case 'BattleInitialized':
        transactions.push({
          type: 'Duel Started',
          typeClass: 'join-battle',
          transactionHash: r.tx_hash,
          blockNumber: r.block_number,
          player1: p.player1,
          player2: p.player2,
          wager: parseFloat(p.wager || '0'),
          duelId: String(duelId),
          description: 'Duel initiated between players'
        });
        break;
      case 'DuelJoined':
      case 'Deposited':
        transactions.push({
          type: 'Duel Joined',
          typeClass: 'join-battle',
          transactionHash: r.tx_hash,
          blockNumber: r.block_number,
          player: p.player2,
          amount: null,
          duelId: String(duelId),
          description: `Player ${formatAddressServer(p.player2 || p.payee)} joined the duel`
        });
        break;
      case 'DuelCompleted':
      case 'ProceedsClaimed':
        transactions.push({
          type: 'Duel Completed',
          typeClass: 'duel-completed',
          transactionHash: r.tx_hash,
          blockNumber: r.block_number,
          winner: p.winner,
          loser: p.loser,
          totalWinnings: parseFloat(p.totalWinnings || '0'),
          fee: parseFloat(p.fee || '0'),
          duelId: String(duelId),
          description: `Duel completed - Winner: ${formatAddressServer(p.winner)}`
        });
        break;
      case 'DuelNullified':
        transactions.push({
          type: 'Duel Nullified',
          typeClass: 'duel-nullified',
          transactionHash: r.tx_hash,
          blockNumber: r.block_number,
          player: p.player,
          refundAmount: parseFloat(p.refundAmount || '0'),
          duelId: String(duelId),
          description: `Duel cancelled — refund ${parseFloat(p.refundAmount || '0').toFixed(4)} ETH`
        });
        break;
      default:
        break;
    }
  }

    for (const t of transactions) {
        if (t.type === 'Duel Joined' && (t.wager == null || Number.isNaN(t.wager))) {
            t.wager = initWager;
        }
    }

    return transactions;
}

module.exports = {
    getLiveFeedFromDb,
    getWalletDuelsFromDb,
    getStatisticsFromDb,
    getLeaderboardFromDb,
    getDuelTransactionsFromDb
};
