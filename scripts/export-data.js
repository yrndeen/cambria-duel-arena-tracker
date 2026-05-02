#!/usr/bin/env node
const { openDb } = require('../lib/db');
const CONFIG = require('../config');
const fs = require('fs');
const path = require('path');

const db = openDb(CONFIG);

// Export all data to JSON files
const events = db.prepare('SELECT * FROM chain_events ORDER BY block_number DESC').all();

// Create dist/api-data directory
const apiDir = path.join(__dirname, '..', 'dist', 'api-data');
if (!fs.existsSync(apiDir)) {
  fs.mkdirSync(apiDir, { recursive: true });
}

// Write events to JSON
fs.writeFileSync(
  path.join(apiDir, 'events.json'),
  JSON.stringify(events, null, 2)
);

// Create summary
const battleEvents = events.filter(e => e.event_type === 'BattleInitialized');
const uniquePlayers = new Set();
let totalWagered = 0;

battleEvents.forEach(ev => {
  try {
    const payload = JSON.parse(ev.payload);
    if (payload.player1) uniquePlayers.add(payload.player1.toLowerCase());
    if (payload.player2) uniquePlayers.add(payload.player2.toLowerCase());
    if (payload.wager) totalWagered += parseFloat(payload.wager);
  } catch (e) {}
});

const summary = {
  totalEvents: events.length,
  totalBattles: battleEvents.length,
  uniquePlayers: uniquePlayers.size,
  totalWagered: totalWagered.toFixed(4),
  lastUpdated: new Date().toISOString(),
  status: 'static-export'
};

fs.writeFileSync(
  path.join(apiDir, 'summary.json'),
  JSON.stringify(summary, null, 2)
);

console.log(`✅ Exported ${events.length} events to dist/api-data/`);
console.log('Files created:');
console.log('  - dist/api-data/events.json');
console.log('  - dist/api-data/summary.json');
