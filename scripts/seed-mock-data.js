#!/usr/bin/env node
'use strict';

/**
 * Seed mock data for testing when RPC is unavailable
 */

const { openDb, insertEvents } = require('../lib/db');
const CONFIG = require('../config');

const mockDuels = [
  {
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    log_index: 0,
    duel_id: '1',
    event_type: 'DuelInitiated',
    block_number: 1000000,
    payload: JSON.stringify({
      player1: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      player2: '0x8Ba1f109551bD432803012645Hac136D9c5678bd',
      wager: '0.01'
    })
  },
  {
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    log_index: 1,
    duel_id: '1',
    event_type: 'DuelJoined',
    block_number: 1000001,
    payload: JSON.stringify({
      player2: '0x8Ba1f109551bD432803012645Hac136D9c5678bd'
    })
  },
  {
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    log_index: 2,
    duel_id: '1',
    event_type: 'DuelCompleted',
    block_number: 1000002,
    payload: JSON.stringify({
      winner: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      loser: '0x8Ba1f109551bD432803012645Hac136D9c5678bd',
      totalWinnings: '0.02',
      fee: '0.001'
    })
  },
  {
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    log_index: 0,
    duel_id: '2',
    event_type: 'DuelInitiated',
    block_number: 1000050,
    payload: JSON.stringify({
      player1: '0x9Cd083f2D8b3e8b8e8F8b8e8F8b8e8F8b8e8F8b8',
      player2: '0x1234567890abcdef1234567890abcdef12345678',
      wager: '0.05'
    })
  },
  {
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    log_index: 1,
    duel_id: '2',
    event_type: 'DuelJoined',
    block_number: 1000051,
    payload: JSON.stringify({
      player2: '0x1234567890abcdef1234567890abcdef12345678'
    })
  },
  {
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    log_index: 2,
    duel_id: '2',
    event_type: 'DuelCompleted',
    block_number: 1000052,
    payload: JSON.stringify({
      winner: '0x1234567890abcdef1234567890abcdef12345678',
      loser: '0x9Cd083f2D8b3e8b8e8F8b8e8F8b8e8F8b8e8F8b8',
      totalWinnings: '0.1',
      fee: '0.005'
    })
  }
];

async function main() {
  const db = openDb(CONFIG);
  
  console.log('Seeding mock data...');
  const count = insertEvents(db, mockDuels);
  console.log(`✅ Inserted ${count} mock events`);
  console.log('Total events in database:', require('../lib/db').eventCount(db));
}

main().catch(console.error);
