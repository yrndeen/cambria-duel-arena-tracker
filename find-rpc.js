const { ethers } = require('ethers');
const https = require('https');

// All possible Abstract RPC endpoints from various sources
const rpcUrls = [
  // Official sources
  'https://api.abstract.xyz',
  'https://rpc.abs.xyz',
  
  // Alternative endpoints
  'https://abstract.publicnode.com',
  'https://abstract.drpc.org',
  'https://abstract-mainnet.rpc.grove.city/v1/8951d5b2',
  
  // Chainlist endpoints
  'https://abstract.blockpi.network/v1/rpc/public',
  'https://abstract-rpc.bwarelabs.com',
  
  // Try with different ports
  'https://api.abstract.xyz:443',
  'https://rpc.abs.xyz:443',
  
  // WebSocket versions (convert to HTTP for testing)
  'https://abstract.api.onfinality.io/public',
  
  // Testnet endpoints (might have mainnet data)
  'https://abstract-testnet.public.blastapi.io',
];

async function checkEndpoint(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const testProvider = async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(url, {
          chainId: 2741,
          name: 'abstract'
        });
        
        // Try to get block number with timeout
        const blockPromise = provider.getBlockNumber();
        const timeout = setTimeout(() => {
          resolve({ url, success: false, error: 'timeout' });
        }, 8000);
        
        const blockNumber = await blockPromise;
        clearTimeout(timeout);
        
        const latency = Date.now() - startTime;
        resolve({ 
          url, 
          success: true, 
          blockNumber, 
          latency,
          chainId: provider.network?.chainId 
        });
      } catch (error) {
        resolve({ 
          url, 
          success: false, 
          error: error.message?.substring(0, 100) 
        });
      }
    };
    
    testProvider();
  });
}

async function main() {
  console.log('🔍 Testing Abstract L2 RPC Endpoints\n');
  console.log('Chain ID: 2741 (Abstract)\n');
  
  const results = [];
  
  // Test all endpoints
  for (const url of rpcUrls) {
    process.stdout.write(`Testing: ${url}... `);
    const result = await checkEndpoint(url);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ SUCCESS (Block: ${result.blockNumber}, Latency: ${result.latency}ms)`);
    } else {
      console.log(`❌ ${result.error}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  
  const working = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Working: ${working.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (working.length > 0) {
    console.log('\n🎉 WORKING ENDPOINTS:');
    working.forEach(r => {
      console.log(`   ${r.url}`);
      console.log(`      Block: ${r.blockNumber} | Latency: ${r.latency}ms | Chain: ${r.chainId}`);
    });
    
    console.log('\n💡 Recommended config.js update:');
    console.log(`   RPC_URL: '${working[0].url}'`);
  } else {
    console.log('\n⚠️  NO ENDPOINTS WORKING');
    console.log('\nPossible reasons:');
    console.log('   1. Abstract L2 network is not publicly launched');
    console.log('   2. Network is temporarily down for maintenance');
    console.log('   3. RPC endpoints require authentication/API key');
    console.log('   4. Firewall blocking access to Abstract network');
    console.log('\nNext steps:');
    console.log('   - Check Abstract official Discord/Twitter for status');
    console.log('   - Visit https://docs.abs.xyz for latest RPC info');
    console.log('   - Try again in a few hours');
  }
}

main().catch(console.error);
