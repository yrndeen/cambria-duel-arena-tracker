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
    'leaderboard.html', 
    'statistics.html',
    'about.html',
    'donate.html',
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

// Create a simple index.html redirect for the root
const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cambria Duel Arena Tracker</title>
    <script>
        // Redirect to the main page
        window.location.href = './index.html';
    </script>
</head>
<body>
    <p>Redirecting to <a href="./index.html">Cambria Duel Arena Tracker</a>...</p>
</body>
</html>`;

fs.writeFileSync(path.join(distDir, 'index.html'), indexContent);
console.log('✅ Created redirect index.html');

// Create .nojekyll file to prevent Jekyll processing
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
console.log('✅ Created .nojekyll file');

console.log('🎉 Build complete! Files are ready for GitHub Pages deployment.');
console.log('📁 Built files are in the ./dist directory');