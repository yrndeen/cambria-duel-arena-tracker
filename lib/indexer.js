'use strict';

const { ethers } = require('ethers');
const { getMeta, setMeta, insertEvents } = require('./db');

const EVENT_TYPES = [
  'BattleInitialized',
  'Deposited',
  'DuelInitiated',
  'DuelJoined',
  'DuelCompleted',
  'DuelNullified',
  'ProceedsClaimed'
];

function eventToRow(eventType, ev) {
  const args = ev.args || {};
  let battleId = args.battleId || args.duelId;
  if (battleId) battleId = battleId.toString();
  
  const payload = {};

  switch (eventType) {
    case 'BattleInitialized':
      battleId = args.battleId.toString();
      payload.player1 = args.playerOne || args.player1;
      payload.player2 = args.playerTwo || args.player2;
      payload.wager = args.amtOrTokenId && args.amtOrTokenId.length > 0 
        ? ethers.utils.formatEther(args.amtOrTokenId[0]) 
        : '0';
      payload.assetEnum = args.assetEnum || [];
      payload.contractAddr = args.contractAddr || [];
      payload.amtOrTokenId = args.amtOrTokenId || [];
      break;
    case 'Deposited':
      battleId = args.battleId.toString();
      payload.payee = args.payee;
      payload.assetEnum = args.assetEnum || [];
      payload.contractAddr = args.contractAddr || [];
      payload.amtOrTokenId = args.amtOrTokenId || [];
      break;
    case 'DuelInitiated':
      battleId = args.duelId.toString();
      payload.player1 = args.player1;
      payload.player2 = args.player2;
      payload.wager = ethers.utils.formatEther(args.wager);
      break;
    case 'DuelJoined':
      battleId = args.duelId.toString();
      payload.player2 = args.player2;
      break;
    case 'DuelCompleted':
      battleId = args.duelId.toString();
      payload.winner = args.winner;
      payload.loser = args.loser;
      payload.totalWinnings = ethers.utils.formatEther(args.totalWinnings);
      payload.fee = ethers.utils.formatEther(args.fee);
      break;
    case 'DuelNullified':
      battleId = args.duelId.toString();
      payload.player = args.player;
      payload.refundAmount = ethers.utils.formatEther(args.refundAmount);
      break;
    case 'ProceedsClaimed':
      battleId = args.duelId.toString();
      payload.winner = args.winner;
      payload.amount = ethers.utils.formatEther(args.amount);
      payload.fee = ethers.utils.formatEther(args.fee);
      break;
    default:
      break;
  }

  return {
    tx_hash: ev.transactionHash,
    log_index: ev.logIndex,
    duel_id: battleId,
    event_type: eventType,
    block_number: ev.blockNumber,
    payload: JSON.stringify(payload)
  };
}

async function ingestChunk(duelArenaBattle, fromBlock, toBlock) {
    const filters = EVENT_TYPES.map((t) => duelArenaBattle.filters[t]());
    const results = await Promise.all(
        filters.map((f) => duelArenaBattle.queryFilter(f, fromBlock, toBlock))
    );

    const rows = [];
    for (let i = 0; i < EVENT_TYPES.length; i++) {
        for (const ev of results[i]) {
            rows.push(eventToRow(EVENT_TYPES[i], ev));
        }
    }
    return rows;
}

/**
 * Incrementally scan from last checkpoint to chain tip and upsert events.
 * @returns {{ ingested: number, fromBlock: number, toBlock: number, latest: number }}
 */
async function runIndexerOnce({ db, provider, duelArenaBattle, config }) {
    const INDEXER = config.INDEXER || {};
    const chunk = INDEXER.CHUNK_SIZE || 8000;
    const lookback = INDEXER.INITIAL_LOOKBACK ?? 150000;

    const latest = await provider.getBlockNumber();
    const lastScanned = getMeta(db, 'last_scanned_block');
    let nextFrom;

    if (INDEXER.START_BLOCK != null && !Number.isNaN(INDEXER.START_BLOCK)) {
        if (lastScanned == null) {
            nextFrom = Math.max(0, INDEXER.START_BLOCK);
        } else {
            nextFrom = parseInt(lastScanned, 10) + 1;
        }
    } else if (lastScanned == null) {
        nextFrom = Math.max(0, latest - lookback);
    } else {
        nextFrom = parseInt(lastScanned, 10) + 1;
    }

    if (nextFrom > latest) {
        setMeta(db, 'last_chain_tip', String(latest));
        return { ingested: 0, fromBlock: latest, toBlock: latest, latest };
    }

    let totalIngested = 0;
    let scanFrom = nextFrom;

    while (scanFrom <= latest) {
        const toBlock = Math.min(scanFrom + chunk - 1, latest);
        const rows = await ingestChunk(duelArenaBattle, scanFrom, toBlock);
        const n = insertEvents(db, rows);
        totalIngested += n;
        setMeta(db, 'last_scanned_block', String(toBlock));
        setMeta(db, 'last_chain_tip', String(latest));
        scanFrom = toBlock + 1;
    }

    return { ingested: totalIngested, fromBlock: nextFrom, toBlock: latest, latest };
}

module.exports = {
    runIndexerOnce,
    EVENT_TYPES
};
