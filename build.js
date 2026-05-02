#!/usr/bin/env node

// Build script for GitHub Pages deployment
// This script prepares the static files for deployment

const fs = require('fs');
const path = require('path');

console.log('🏗️  Building for GitHub Pages...');

// Create dist directory
const distDir = './dist';
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Files to copy
const filesToCopy = [
    'index.html',
    'wallet.html',
    'leaderboard.html', 
    'statistics.html',
    'about.html',
    'donate.html',
    'theme.css',
    'super-shell.css',
    'super-fx.js',
    'theme-animations.js',
    'config.js',
    'web3-utils.js',
    'README.md'
];

// Copy files
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(distDir, file));
        console.log(`✅ Copied ${file}`);
    } else {
        console.log(`⚠️  File not found: ${file}`);
    }
});

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) {
        console.log(`⚠️  Directory not found: ${src}`);
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`✅ Copied ${srcPath} → ${destPath}`);
        }
    }
}

copyDirSync('assets', path.join(distDir, 'assets'));

// Create .nojekyll file to prevent Jekyll processing
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
console.log('✅ Created .nojekyll file');

// Export data to static JSON
try {
  const { openDb } = require('./lib/db');
  const CONFIG = require('./config');
  const db = openDb(CONFIG);
  const events = db.prepare('SELECT * FROM chain_events ORDER BY block_number DESC').all();

  const apiDir = path.join(distDir, 'api-data');
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(apiDir, 'events.json'),
    JSON.stringify(events, null, 2)
  );

  // Create enhanced summary
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

  console.log(`✅ Exported ${events.length} events to api-data/`);
} catch (error) {
  console.log('⚠️ Could not export data:', error.message);
}

// Generate wallet function with embedded data for Netlify Functions
try {
  const eventsData = fs.readFileSync(path.join(distDir, 'api-data', 'events.json'), 'utf8');
  const walletFunction = `// Auto-generated file - DO NOT EDIT
// Generated: ${new Date().toISOString()}
const eventsData = ${eventsData};

exports.handler = async (event, context) => {
  const pathParts = event.path.split('/').filter(p => p);
  const walletAddress = pathParts[pathParts.length - 1]?.toLowerCase();
  
  if (!walletAddress || walletAddress === 'wallet-address') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing wallet address' }) };
  }

  try {
    const allEvents = eventsData;
    const walletEvents = allEvents.filter(event => {
      try {
        const payload = JSON.parse(event.payload);
        const addr = walletAddress.toLowerCase();
        return (
          payload.player1?.toLowerCase() === addr ||
          payload.player2?.toLowerCase() === addr ||
          payload.winner?.toLowerCase() === addr ||
          payload.loser?.toLowerCase() === addr ||
          payload.payee?.toLowerCase() === addr
        );
      } catch { return false; }
    });

    const stats = { totalDuels: 0, wins: 0, losses: 0, totalWagered: 0, totalProfit: 0, winRate: 0 };
    const duelInitiated = walletEvents.filter(e => e.event_type === 'DuelInitiated' || e.event_type === 'BattleInitialized');
    const duelCompleted = walletEvents.filter(e => e.event_type === 'DuelCompleted' || e.event_type === 'ProceedsClaimed');
    stats.totalDuels = duelInitiated.length;

    duelCompleted.forEach(event => {
      const payload = JSON.parse(event.payload);
      if (payload.winner?.toLowerCase() === walletAddress) { stats.wins++; stats.totalProfit += parseFloat(payload.totalWinnings || 0); }
      else if (payload.loser?.toLowerCase() === walletAddress) { stats.losses++; }
    });

    duelInitiated.forEach(event => {
      const payload = JSON.parse(event.payload);
      if (payload.wager) stats.totalWagered += parseFloat(payload.wager);
    });

    stats.winRate = stats.totalDuels > 0 ? (stats.wins / stats.totalDuels * 100).toFixed(2) : 0;

    return {
      statusCode: 200,
      body: JSON.stringify({ stats, events: walletEvents.slice(0, 100), totalCount: walletEvents.length, address: walletAddress }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
`;
  
  fs.writeFileSync(path.join('netlify', 'functions', 'wallet-address.js'), walletFunction);
  console.log('✅ Generated wallet function with embedded data');
} catch (error) {
  console.log('⚠️ Could not generate wallet function:', error.message);
}

// Also create api folder alias for web3-utils.js compatibility
try {
  const apiDir = path.join(distDir, 'api');
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }
  
  // Create live-feed.json as an alias to events.json
  const eventsData = JSON.parse(fs.readFileSync(path.join(distDir, 'api-data', 'events.json'), 'utf8'));
  fs.writeFileSync(
    path.join(apiDir, 'live-feed.json'),
    JSON.stringify({ events: eventsData }, null, 2)
  );
  console.log('✅ Created api/live-feed.json alias');
} catch (error) {
  console.log('⚠️ Could not create api alias:', error.message);
}

console.log('🎉 Build complete! Files are ready for deployment.');
console.log('📁 Built files are in the ./dist directory');