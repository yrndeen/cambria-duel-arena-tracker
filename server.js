// Cambria Duel Arena API Server
//
// Architecture:
// 1) Indexer (lib/indexer.js) pulls duel contract logs in block chunks and upserts into SQLite.
// 2) data/cambria.db holds chain_events; meta keys last_scanned_block / last_chain_tip.
// 3) When the DB has rows, /api/live-feed and /api/duels/:address read from the DB (fast, RPC-light).
//    Otherwise responses fall back to direct queryFilter (same as before).
// 4) Live feed: ?page=1&limit=100&includeClaimed=1 (paginated JSON: total, duels, hasNext, hasPrevious).
// 5) NodeCache still used for wallet stats and duel tx details.
//
// Run one-shot sync: npm run index. The server also runs the indexer on startup and on POLL_MS.

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const NodeCache = require('node-cache');
const CONFIG = require('./config');
const { openDb, eventCount, getMeta, resolveDbPath } = require('./lib/db');
const { runIndexerOnce } = require('./lib/indexer');
const {
    getLiveFeedFromDb,
    getWalletDuelsFromDb,
    getStatisticsFromDb,
    getLeaderboardFromDb,
    getDuelTransactionsFromDb
} = require('./lib/feedFromDb');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize cache
const cache = new NodeCache({
    stdTTL: 300, // 5 minutes default TTL
    checkperiod: 60 // Check for expired keys every 60 seconds
});

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);

// Initialize contracts
const duelArenaBattle = new ethers.Contract(
    CONFIG.CONTRACTS.DUEL_ARENA_BATTLE,
    CONFIG.ABIS.DUEL_ARENA_BATTLE,
    provider
);

const duelArenaEscrow = new ethers.Contract(
    CONFIG.CONTRACTS.DUEL_ARENA_ESCROW,
    CONFIG.ABIS.DUEL_ARENA_ESCROW,
    provider
);

/**
 * Paginated live feed from RPC (newest battle id first). Best-effort when SQLite is empty.
 */
async function buildLiveFeedRpcPage({ page, pageSize, includeClaimed }) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(String(pageSize), 10) || 100));
    const offset = (pageNum - 1) * size;

    const nextIdBn = await duelArenaBattle.nextBattleId();
    const totalBattles = Math.max(0, nextIdBn.toNumber() - 1);

    const ids = [];
    for (let k = 0; k < size; k++) {
        const id = totalBattles - offset - k;
        if (id >= 1) ids.push(id);
    }

    if (!ids.length) {
        const totalPages0 = totalBattles > 0 ? Math.ceil(totalBattles / size) : 0;
        return {
            total: totalBattles,
            page: pageNum,
            pageSize: size,
            totalPages: totalPages0,
            hasNext: false,
            hasPrevious: pageNum > 1,
            duels: []
        };
    }

    const latestBlock = await provider.getBlockNumber();
    const battles = await Promise.all(ids.map((id) => duelArenaBattle.getBattle(id)));
    const completedLists = await Promise.all(
        ids.map((id) => duelArenaBattle.queryFilter(duelArenaBattle.filters.DuelCompleted(id)))
    );

    let claimedIds = null;
    if (!includeClaimed) {
        const claimed = await duelArenaBattle.queryFilter(
            duelArenaBattle.filters.ProceedsClaimed(),
            Math.max(0, latestBlock - 500000),
            latestBlock
        );
        claimedIds = new Set(claimed.map((e) => e.args.duelId.toString()));
    }

    const statusLabels = ['pending', 'active', 'completed', 'cancelled'];
    const duels = [];

    for (let i = 0; i < ids.length; i++) {
        const duelId = String(ids[i]);
        if (claimedIds && claimedIds.has(duelId)) {
            continue;
        }

        const b = battles[i];
        if (!b || b.player1 === ethers.constants.AddressZero) {
            continue;
        }

        const statusNum =
            typeof b.status === 'number'
                ? b.status
                : b.status != null && typeof b.status.toNumber === 'function'
                  ? b.status.toNumber()
                  : Number(b.status);
        let status = statusLabels[statusNum] || 'unknown';
        let winner = null;
        let loser = null;
        const cev = completedLists[i][0];
        if (cev) {
            winner = cev.args.winner;
            loser = cev.args.loser;
            status = 'completed';
        }

        const createdAt = b.createdAt ? b.createdAt.toNumber() : 0;

        duels.push({
            id: duelId,
            player1: b.player1,
            player2: b.player2,
            wager: parseFloat(ethers.utils.formatEther(b.wager)),
            winner,
            loser,
            status,
            timestamp: createdAt,
            transactionHash: cev ? cev.transactionHash : null,
            blockNumber: createdAt
        });
    }

    const hasNext = offset + ids.length < totalBattles;
    const hasPrevious = pageNum > 1;
    const totalPages = totalBattles > 0 ? Math.ceil(totalBattles / size) : 0;

    return {
        total: totalBattles,
        page: pageNum,
        pageSize: size,
        totalPages,
        hasNext,
        hasPrevious,
        duels
    };
}

let db = null;
try {
    db = openDb(CONFIG);
    console.log('SQLite DB:', resolveDbPath(CONFIG));
} catch (err) {
    console.warn('SQLite unavailable (npm install better-sqlite3):', err.message);
}

async function syncIndexer() {
    if (!db) return;
    try {
        const r = await runIndexerOnce({ db, provider, duelArenaBattle, config: CONFIG });
        if (r.ingested > 0) {
            console.log(`Indexer: +${r.ingested} event rows (tip ${r.latest})`);
        }
    } catch (e) {
        console.error('Indexer sync failed:', e.message || e);
    }
}

// API Routes
app.get('/api/wallet/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        // Check cache first
        const cacheKey = `wallet-${address}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached data for wallet ${address}`);
            return res.json(cachedData);
        }
        
        // Get wallet stats from contract
        const playerStats = await duelArenaBattle.getPlayerStats(address);
        
        // Calculate net profit (after 5% fee)
        const totalWagered = parseFloat(ethers.utils.formatEther(playerStats.totalWagered || 0));
        const totalProfit = parseFloat(ethers.utils.formatEther(playerStats.totalProfit || 0));
        const netProfit = totalProfit * 0.95; // Apply 5% fee deduction
        
        // Calculate total ETH won (before fees)
        const totalETHWon = totalProfit; // This is the total ETH won before fees
        
        // Get total duels and wins
        const totalDuels = playerStats.totalDuels ? playerStats.totalDuels.toNumber() : 0;
        const wins = playerStats.wins ? playerStats.wins.toNumber() : 0;
        const losses = totalDuels - wins;
        
        // Calculate win rate
        const winRate = totalDuels > 0 ? (wins / totalDuels * 100).toFixed(1) : "0.0";
        
        const result = {
            address,
            totalDuels,
            wins,
            losses,
            totalWagered,
            totalETHWon,
            totalProfit,
            netProfit,
            winRate
        };
        
        // Cache the result
        cache.set(cacheKey, result);
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching wallet stats:', error);
        res.status(500).json({ error: 'Failed to fetch wallet stats' });
    }
});

app.get('/api/duels/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const page = parseInt(req.query.page) || 1;

        if (db && eventCount(db) > 0) {
            try {
                const fromDb = getWalletDuelsFromDb(db, address, limit, page);
                return res.json(fromDb);
            } catch (dbErr) {
                console.warn('Wallet duels DB read failed, using RPC:', dbErr.message || dbErr);
            }
        }

        // Check cache first
        const cacheKey = `duels-${address}-${limit}-${page}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached data for duels of wallet ${address}`);
            return res.json(cachedData);
        }
        
        // Calculate block ranges for pagination
        const blockWindow = 10000; // 10k blocks per query
        const latestBlock = await provider.getBlockNumber();
        const startBlock = Math.max(0, latestBlock - blockWindow * page);
        const endBlock = page === 1 ? latestBlock : startBlock + blockWindow;
        
        console.log(`Querying blocks ${startBlock} to ${endBlock} for wallet ${address}`);
        
        // Batch queries for better performance
        const [
            duelStartedEventsAsPlayer1,
            duelStartedEventsAsPlayer2
        ] = await Promise.all([
            // Query past DuelInitiated events for this wallet as player1 / player2 (see config ABI)
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelInitiated(null, address, null),
                startBlock,
                endBlock
            ),
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelInitiated(null, null, address),
                startBlock,
                endBlock
            )
        ]);
        
        // Combine and process events
        const allEvents = [...duelStartedEventsAsPlayer1, ...duelStartedEventsAsPlayer2];
        
        // If no events found, return empty array
        if (allEvents.length === 0) {
            const emptyResult = { duels: [], hasMore: false };
            cache.set(cacheKey, emptyResult);
            return res.json(emptyResult);
        }
        
        // Sort events by block number (newest first) and limit
        allEvents.sort((a, b) => b.blockNumber - a.blockNumber);
        const paginatedEvents = allEvents.slice(0, limit);
        const hasMore = allEvents.length > limit;
        
        // Prepare duel IDs for batch query
        const duelIds = paginatedEvents.map(event => event.args.duelId.toString());
        
        // Batch query for completed duels
        const completedEventsPromises = duelIds.map(duelId => 
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelCompleted(duelId)
            )
        );
        
        // Wait for all queries to complete
        const completedEventsResults = await Promise.all(completedEventsPromises);
        
        // Map completed events by duel ID for quick lookup
        const completedEventsByDuelId = {};
        completedEventsResults.forEach((events, index) => {
            if (events.length > 0) {
                completedEventsByDuelId[duelIds[index]] = events[0];
            }
        });
        
        const duels = [];
        
        for (const event of paginatedEvents) {
            const duelId = event.args.duelId.toString();
            const player1 = event.args.player1;
            const player2 = event.args.player2;
            const wager = parseFloat(ethers.utils.formatEther(event.args.wager));
            const currentPlayer = address; // Store the current player for UI display
            
            let winner = null;
            let loser = null;
            let netProfit = 0;
            let status = 'pending';
            let transactionHash = event.transactionHash;
            
            // Check if we have a completed event for this duel
            const completedEvent = completedEventsByDuelId[duelId];
            if (completedEvent) {
                winner = completedEvent.args.winner;
                loser = completedEvent.args.loser;
                status = 'completed';
                
                // Calculate net profit (after 5% fee)
                if (winner.toLowerCase() === address.toLowerCase()) {
                    netProfit = wager * 1.9; // 2 * wager - 0.1 * wager (5% fee on total winnings)
                } else {
                    netProfit = -wager; // Lost the wager
                }
            }
            
            duels.push({
                id: duelId,
                player1,
                player2,
                wager,
                winner,
                loser,
                currentPlayer,
                netProfit,
                status,
                timestamp: event.blockNumber,
                transactionHash,
                blockNumber: event.blockNumber
            });
        }
        
        const result = { duels, hasMore };
        
        // Cache the result
        cache.set(cacheKey, result);
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching duel history:', error);
        res.status(500).json({ error: 'Failed to fetch duel history' });
    }
});

app.get('/api/live-feed', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(
            200,
            Math.max(1, parseInt(req.query.limit, 10) || CONFIG.UI.LIVE_FEED_PAGE_SIZE || 100)
        );
        const includeClaimed = req.query.includeClaimed === '1' || req.query.includeClaimed === 'true';
        const offset = (page - 1) * pageSize;

        if (db && eventCount(db) > 0) {
            try {
                const { total, duels } = getLiveFeedFromDb(db, {
                    limit: pageSize,
                    offset,
                    includeClaimed
                });
                const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
                const payload = {
                    total,
                    page,
                    pageSize,
                    totalPages,
                    hasNext: page * pageSize < total,
                    hasPrevious: page > 1,
                    duels
                };
                return res.json(payload);
            } catch (dbErr) {
                console.warn('Live feed DB read failed, using RPC:', dbErr.message || dbErr);
            }
        }

        const cacheKey = `live-feed-p${page}-s${pageSize}-${includeClaimed ? 'all' : 'open'}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            console.log('Using cached live feed data');
            return res.json(cachedData);
        }

        const payload = await buildLiveFeedRpcPage({ page, pageSize, includeClaimed });
        cache.set(cacheKey, payload);
        res.json(payload);
    } catch (error) {
        console.error('Error fetching live feed:', error);
        res.status(500).json({ error: 'Failed to fetch live feed' });
    }
});

app.get('/api/duel/:duelId/transactions', async (req, res) => {
    try {
        const { duelId } = req.params;
        
        // Check cache first
        const cacheKey = `duel-transactions-${duelId}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached transactions for duel ${duelId}`);
            return res.json(cachedData);
        }

        if (db && eventCount(db) > 0) {
            try {
                const fromDb = getDuelTransactionsFromDb(db, duelId);
                if (fromDb.length > 0) {
                    cache.set(cacheKey, fromDb);
                    return res.json(fromDb);
                }
            } catch (dbErr) {
                console.warn('Duel transactions DB read failed, using RPC:', dbErr.message || dbErr);
            }
        }
        
        // Batch all event queries in parallel
        const [
            duelInitiatedEvents,
            duelJoinedEvents,
            duelCompletedEvents,
            fundsReleasedEvents
        ] = await Promise.all([
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelInitiated(duelId)
            ),
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelJoined(duelId)
            ),
            // Get DuelCompleted event
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelCompleted(duelId)
            ),
            // Get FundsReleased events
            duelArenaEscrow.queryFilter(
                duelArenaEscrow.filters.FundsReleased(duelId)
            )
        ]);
        
        // Process all events into transactions array
        const transactions = [];
        
        // Process DuelInitiated events
        for (const event of duelInitiatedEvents) {
            transactions.push({
                type: 'Duel Started',
                typeClass: 'join-battle',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                player1: event.args.player1,
                player2: event.args.player2,
                wager: parseFloat(ethers.utils.formatEther(event.args.wager)),
                duelId: event.args.duelId.toString(),
                description: 'Duel initiated between players'
            });
        }
        
        // Process DuelJoined events (joinBattle)
        for (const event of duelJoinedEvents) {
            transactions.push({
                type: 'Duel Joined',
                typeClass: 'join-battle',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                player: event.args.player2,
                amount: null,
                duelId: event.args.duelId.toString(),
                description: `Player ${formatAddress(event.args.player2)} joined the duel`
            });
        }
        
        // Process DuelCompleted events
        for (const event of duelCompletedEvents) {
            transactions.push({
                type: 'Duel Completed',
                typeClass: 'duel-completed',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                winner: event.args.winner,
                loser: event.args.loser,
                totalWinnings: parseFloat(ethers.utils.formatEther(event.args.totalWinnings)),
                fee: parseFloat(ethers.utils.formatEther(event.args.fee)),
                duelId: event.args.duelId.toString(),
                description: `Duel completed - Winner: ${formatAddress(event.args.winner)}`
            });
        }
        
        // Process FundsReleased events
        for (const event of fundsReleasedEvents) {
            transactions.push({
                type: 'Funds Released',
                typeClass: 'funds-released',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                winner: event.args.winner,
                amount: parseFloat(ethers.utils.formatEther(event.args.amount)),
                fee: parseFloat(ethers.utils.formatEther(event.args.fee)),
                duelId: event.args.duelId.toString(),
                description: `Funds released to winner ${formatAddress(event.args.winner)}`
            });
        }

        // Sort transactions by block number
        transactions.sort((a, b) => a.blockNumber - b.blockNumber);
        
        // Cache the result
        cache.set(cacheKey, transactions);
        
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching duel transactions:', error);
        res.status(500).json({ error: 'Failed to fetch duel transactions' });
    }
});

// Helper function to format addresses
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

app.get('/api/statistics', (req, res) => {
    const empty = {
        totalDuels: 0,
        activePlayers: 0,
        totalVolume: 0,
        totalETHWon: 0,
        averageDuelSize: 0,
        mostCommonDuelAmount: 0,
        mostCommonPct: 0,
        largestSingleDuel: 0,
        largestDuelId: null,
        totalFees: 0,
        averageWinRate: null,
        winRateDistribution: { '40-50%': 0, '50-60%': 0, '60-70%': 0, '70-80%': 0, '80%+': 0 },
        volumeHistory: Array(10).fill(0),
        topPerformerWinRate: null,
        topPerformerAddr: null,
        source: db ? 'empty' : 'no_db'
    };
    if (!db || eventCount(db) === 0) {
        return res.json(empty);
    }
    try {
        const data = getStatisticsFromDb(db);
        res.json({ ...data, source: 'indexer' });
    } catch (err) {
        console.error('Statistics DB error:', err);
        res.status(500).json({ error: 'Failed to load statistics' });
    }
});

app.get('/api/leaderboard', (req, res) => {
    const sortBy = ['profit', 'wins', 'winrate', 'volume'].includes(req.query.sort)
        ? req.query.sort
        : 'profit';
    const limit = parseInt(req.query.limit, 10) || 50;
    if (!db || eventCount(db) === 0) {
        return res.json([]);
    }
    try {
        res.json(getLeaderboardFromDb(db, sortBy, limit));
    } catch (err) {
        console.error('Leaderboard DB error:', err);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

app.get('/api/indexer/status', (req, res) => {
    if (!db) {
        return res.json({ enabled: false, reason: 'sqlite_not_open' });
    }
    res.json({
        enabled: true,
        rowCount: eventCount(db),
        last_scanned_block: getMeta(db, 'last_scanned_block'),
        last_chain_tip: getMeta(db, 'last_chain_tip')
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Cambria Duel Arena API server running on port ${port}`);
    console.log(`Access the frontend at http://localhost:${port}`);

    if (db) {
        const poll = (CONFIG.INDEXER && CONFIG.INDEXER.POLL_MS) || 45000;
        syncIndexer().catch(() => {});
        setInterval(() => {
            syncIndexer().catch(() => {});
        }, poll);
    }
});