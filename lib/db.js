'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function resolveDbPath(config) {
    if (config.INDEXER && config.INDEXER.DB_PATH) {
        return config.INDEXER.DB_PATH;
    }
    return path.join(__dirname, '..', 'data', 'cambria.db');
}

function initSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS indexer_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chain_events (
            tx_hash TEXT NOT NULL,
            log_index INTEGER NOT NULL,
            duel_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            block_number INTEGER NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (tx_hash, log_index)
        );
        CREATE INDEX IF NOT EXISTS idx_chain_events_duel_block
            ON chain_events(duel_id, block_number DESC);
        CREATE INDEX IF NOT EXISTS idx_chain_events_type_block
            ON chain_events(event_type, block_number DESC);
    `);
}

/**
 * @param {object} config - root CONFIG from config.js
 * @returns {import('better-sqlite3').Database}
 */
function openDb(config) {
    const dbPath = resolveDbPath(config);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    try {
        db.pragma('journal_mode = WAL');
    } catch (_) {
        /* ignore */
    }
    initSchema(db);
    return db;
}

function getMeta(db, key) {
    const row = db.prepare('SELECT value FROM indexer_meta WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setMeta(db, key, value) {
    db.prepare('INSERT OR REPLACE INTO indexer_meta (key, value) VALUES (?, ?)').run(key, String(value));
}

function insertEvents(db, rows) {
    if (!rows.length) return 0;
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO chain_events (tx_hash, log_index, duel_id, event_type, block_number, payload)
        VALUES (@tx_hash, @log_index, @duel_id, @event_type, @block_number, @payload)
    `);
    const run = db.transaction((batch) => {
        for (const r of batch) stmt.run(r);
    });
    run(rows);
    return rows.length;
}

function eventCount(db) {
    const row = db.prepare('SELECT COUNT(*) AS c FROM chain_events').get();
    return row ? row.c : 0;
}

module.exports = {
    openDb,
    getMeta,
    setMeta,
    insertEvents,
    eventCount,
    resolveDbPath
};
