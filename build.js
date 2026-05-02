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
  
  const summary = {
    totalEvents: events.length,
    lastUpdated: new Date().toISOString(),
    status: 'static-export',
    note: 'Data exported from SQLite database'
  };
  
  fs.writeFileSync(
    path.join(apiDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log(`✅ Exported ${events.length} events to api-data/`);
} catch (error) {
  console.log('⚠️ Could not export data:', error.message);
}

console.log('🎉 Build complete! Files are ready for deployment.');
console.log('📁 Built files are in the ./dist directory');