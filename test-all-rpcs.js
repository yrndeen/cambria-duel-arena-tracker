const { ethers } = require('ethers');

// All known Abstract RPC endpoints
const rpcUrls = [
  'https://api.abstract.xyz',
  'https://rpc.abs.xyz', 
  'https://abstract.publicnode.com',
  'https://abstract-mainnet.rpc.grove.city/v1/8951d5b2',
  'https://base-mainnet.g.alchemy.com/v2/demo', // Test fallback
];

async function testAllRPCs() {
  console.log('Testing all Abstract RPC endpoints...\n');
  
  for (const url of rpcUrls) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(url);
      const blockNumber = await provider.getBlockNumber();
      console.log(`✅ ${url}`);
      console.log(`   Block: ${blockNumber}\n`);
      
      // Found one that works!
      console.log(`\n🎉 SUCCESS! Update config.js with: ${url}`);
      return url;
    } catch (error) {
      console.log(`❌ ${url}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }
  
  console.log('No working RPC found. Abstract network may be down.');
  return null;
}

testAllRPCs().catch(console.error);
