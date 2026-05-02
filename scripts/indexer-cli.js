#!/usr/bin/env node
'use strict';

/**
 * One-shot chain sync into data/cambria.db (same schema the API server uses).
 * Run on a schedule in production: e.g. cron every minute alongside the API.
 */

const { ethers } = require('ethers');
const CONFIG = require('../config');
const { openDb, eventCount } = require('../lib/db');
const { runIndexerOnce } = require('../lib/indexer');

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const duelArenaBattle = new ethers.Contract(
        CONFIG.CONTRACTS.DUEL_ARENA_BATTLE,
        CONFIG.ABIS.DUEL_ARENA_BATTLE,
        provider
    );

    const db = openDb(CONFIG);
    const result = await runIndexerOnce({ db, provider, duelArenaBattle, config: CONFIG });
    console.log('Indexer:', result);
    console.log('Total rows in chain_events:', eventCount(db));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
