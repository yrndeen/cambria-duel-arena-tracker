const { ethers } = require('ethers');

const rpcUrls = [
  'https://api.abstract.xyz',
  'https://rpc.abs.xyz',
  'https://abstract.drpc.org',
  'https://abstract.publicnode.com',
];

async function testRPC(url) {
  try {
    console.log(`\nTesting: ${url}`);
    const provider = new ethers.providers.JsonRpcProvider(url);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Success! Block: ${blockNumber}`);
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing Abstract L2 RPC endpoints...\n');
  
  for (const url of rpcUrls) {
    const success = await testRPC(url);
    if (success) {
      console.log(`\n🎉 Using working RPC: ${url}`);
      // Update config.js
      const fs = require('fs');
      let config = fs.readFileSync('config.js', 'utf8');
      config = config.replace(/RPC_URL: '.*'/, `RPC_URL: '${url}'`);
      fs.writeFileSync('config.js', config);
      console.log('✅ Config updated!');
      return;
    }
  }
  
  console.log('\n⚠️  No working RPC found. Please check Abstract L2 documentation.');
}

main().catch(console.error);
