#!/usr/bin/env node
/**
 * Re-index blockchain events with corrected ABI
 * Clears old "Unknown" events and re-processes with correct event signatures
 */

const { ethers } = require('ethers');
const CONFIG = require('../config');
const { openDb, setMeta, getMeta } = require('../lib/db');

const ABI = [
  "event BattleInitialized(uint256 indexed battleId, address indexed playerOne, address indexed playerTwo, uint256[] assetEnum, address[] contractAddr, uint256[] amtOrTokenId)",
  "event Deposited(uint256 indexed battleId, address indexed payee, uint256[] assetEnum, address[] contractAddr, uint256[] amtOrTokenId)"
];

async function main() {
  console.log('🔄 Re-indexing Cambria events with corrected ABI...\n');
  
  const db = openDb(CONFIG);
  
  // Clear old events
  console.log('Clearing old events...');
  db.exec('DELETE FROM chain_events');
  db.exec("DELETE FROM indexer_meta WHERE key = 'last_scanned_block'");
  console.log('✓ Old events cleared\n');
  
  const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
  const contract = new ethers.Contract(
    CONFIG.CONTRACTS.DUEL_ARENA_BATTLE,
    ABI,
    provider
  );
  
  // Get current block
  const latestBlock = await provider.getBlockNumber();
  console.log(`Current block: ${latestBlock}`);
  
  // Start from a reasonable block (look back ~1M blocks or use checkpoint)
  let fromBlock = Math.max(0, latestBlock - 1000000);
  const checkpoint = getMeta(db, 'last_scanned_block');
  if (checkpoint) {
    fromBlock = parseInt(checkpoint, 10) + 1;
  }
  
  console.log(`Scanning from block: ${fromBlock}`);
  console.log(`Contract: ${CONFIG.CONTRACTS.DUEL_ARENA_BATTLE}\n`);
  
  const CHUNK_SIZE = 100000;
  let totalEvents = 0;
  let scanFrom = fromBlock;
  
  while (scanFrom <= latestBlock) {
    const toBlock = Math.min(scanFrom + CHUNK_SIZE - 1, latestBlock);
    console.log(`Scanning blocks ${scanFrom} to ${toBlock}...`);
    
    try {
      // Get BattleInitialized events
      const battleFilter = contract.filters.BattleInitialized();
      const battleEvents = await contract.queryFilter(battleFilter, scanFrom, toBlock);
      
      // Get Deposited events  
      const depositFilter = contract.filters.Deposited();
      const depositEvents = await contract.queryFilter(depositFilter, scanFrom, toBlock);
      
      const allEvents = [...battleEvents, ...depositEvents];
      
      if (allEvents.length > 0) {
        console.log(`  Found ${allEvents.length} events`);
        
        // Insert events
        const rows = allEvents.map(ev => {
          const eventType = ev.event;
          const args = ev.args || {};
          let battleId = args.battleId ? args.battleId.toString() : 'unknown';
          
          const payload = {
            battleId,
            blockNumber: ev.blockNumber,
            transactionHash: ev.transactionHash
          };
          
          if (eventType === 'BattleInitialized') {
            payload.player1 = args.playerOne || args.player1;
            payload.player2 = args.playerTwo || args.player2;
            payload.wager = args.amtOrTokenId && args.amtOrTokenId.length > 0 
              ? ethers.utils.formatEther(args.amtOrTokenId[0]) 
              : '0';
          } else if (eventType === 'Deposited') {
            payload.payee = args.payee;
          }
          
          return {
            tx_hash: ev.transactionHash,
            log_index: ev.logIndex,
            duel_id: battleId,
            event_type: eventType,
            block_number: ev.blockNumber,
            payload: JSON.stringify(payload)
          };
        });
        
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO chain_events 
          (tx_hash, log_index, duel_id, event_type, block_number, payload)
          VALUES (@tx_hash, @log_index, @duel_id, @event_type, @block_number, @payload)
        `);
        
        const insert = db.transaction((batch) => {
          for (const r of batch) stmt.run(r);
        });
        
        insert(rows);
        totalEvents += rows.length;
        console.log(`  ✓ Inserted ${rows.length} events (Total: ${totalEvents})`);
      } else {
        console.log(`  No events found`);
      }
      
      // Update checkpoint
      setMeta(db, 'last_scanned_block', String(toBlock));
      
    } catch (error) {
      console.error(`  Error scanning chunk: ${error.message}`);
    }
    
    scanFrom = toBlock + 1;
  }
  
  console.log(`\n✅ Re-indexing complete!`);
  console.log(`Total events indexed: ${totalEvents}`);
  
  db.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
