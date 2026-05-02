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

// Copy api-data to functions directory for Netlify Functions access
try {
  const functionsApiDir = path.join('netlify', 'functions', 'api-data');
  if (!fs.existsSync(functionsApiDir)) {
    fs.mkdirSync(functionsApiDir, { recursive: true });
  }
  
  fs.copyFileSync(
    path.join(distDir, 'api-data', 'events.json'),
    path.join(functionsApiDir, 'events.json')
  );
  fs.copyFileSync(
    path.join(distDir, 'api-data', 'summary.json'),
    path.join(functionsApiDir, 'summary.json')
  );
  console.log('✅ Copied api-data to functions directory');
} catch (error) {
  console.log('⚠️ Could not copy api-data to functions:', error.message);
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