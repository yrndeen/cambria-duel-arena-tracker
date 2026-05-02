const ethers = require('ethers');

const provider = new ethers.providers.JsonRpcProvider('https://abstract.api.onfinality.io/public');
const contractAddress = '0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbb';

const abi = [
  'event DuelInitiated(uint256 indexed duelId, address indexed player1, address indexed player2, uint256 wager)',
  'event DuelJoined(uint256 indexed duelId, address indexed player2)',
  'event DuelCompleted(uint256 indexed duelId, address indexed winner, address indexed loser, uint256 totalWinnings, uint256 fee)',
  'event DuelNullified(uint256 indexed duelId, address indexed player, uint256 refundAmount)',
  'event ProceedsClaimed(uint256 indexed duelId, address indexed winner, uint256 amount, uint256 fee)'
];

async function main() {
  console.log('🔍 Debugging Cambria Contract Events\n');
  
  // 1. Verify contract exists
  const code = await provider.getCode(contractAddress);
  console.log('1. Contract exists:', code !== '0x');
  if (code === '0x') {
    console.log('   ❌ Contract not deployed!');
    return;
  }
  
  // 2. Get current block
  const currentBlock = await provider.getBlockNumber();
  console.log('2. Current block:', currentBlock);
  
  // 3. Get event topics
  const iface = new ethers.utils.Interface(abi);
  console.log('\n3. Event topics:');
  const eventTopics = {};
  abi.forEach(eventStr => {
    const eventName = eventStr.match(/(\w+)\(/)[1];
    const topic = ethers.utils.id(eventName).slice(0, 66);
    eventTopics[eventName] = topic;
    console.log(`   ${eventName}: ${topic}`);
  });
  
  // 4. Try getLogs with explicit filter
  console.log('\n4. Searching for events...');
  const duelInitiatedTopic = eventTopics['DuelInitiated'];
  
  const filter = {
    address: contractAddress,
    topics: [duelInitiatedTopic],
    fromBlock: Math.max(0, currentBlock - 1000000),
    toBlock: currentBlock
  };
  
  try {
    const logs = await provider.getLogs(filter);
    console.log('   Found', logs.length, 'DuelInitiated events');
    
    if (logs.length > 0) {
      console.log('\n✅ SUCCESS! Found real events!');
      console.log('First event:');
      console.log('  Block:', logs[0].blockNumber);
      console.log('  TxHash:', logs[0].transactionHash);
      console.log('  Data:', logs[0].data);
      console.log('  Topics:', logs[0].topics);
      
      // Try to parse
      try {
        const parsed = iface.parseLog(logs[0]);
        console.log('\nParsed event:');
        console.log('  Name:', parsed.name);
        console.log('  Args:', parsed.args);
      } catch (e) {
        console.log('Could not parse:', e.message);
      }
    } else {
      console.log('   ❌ No events found in last 1,000,000 blocks');
      console.log('   Possible issues:');
      console.log('   - Contract doesn\'t emit events');
      console.log('   - Event signature mismatch');
      console.log('   - Contract address is wrong');
    }
  } catch (error) {
    console.log('   ❌ Error querying logs:', error.message);
  }
}

main().catch(console.error);
