#!/usr/bin/env node

// Cambria Duel Arena Tracker - Deployment Script
// This script helps deploy the site to various platforms

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Cambria Duel Arena Tracker - Deployment Script');
console.log('================================================\n');

// Check if required files exist
const requiredFiles = [
    'index.html',
    'web3-utils.js',
    'config.js',
    'package.json',
    'server.js'
];

console.log('📋 Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ Some required files are missing. Please ensure all files are present before deploying.');
    process.exit(1);
}

console.log('\n✅ All required files are present!\n');

// Display deployment options
console.log('🌐 Deployment Options:');
console.log('1. Vercel (Recommended)');
console.log('2. Netlify');
console.log('3. GitHub Pages');
console.log('4. Heroku');
console.log('5. Local Development Server');

// Get user choice
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('\nSelect deployment option (1-5): ', (choice) => {
    switch (choice) {
        case '1':
            deployToVercel();
            break;
        case '2':
            deployToNetlify();
            break;
        case '3':
            deployToGitHubPages();
            break;
        case '4':
            deployToHeroku();
            break;
        case '5':
            startLocalServer();
            break;
        default:
            console.log('❌ Invalid choice. Please run the script again and select 1-5.');
            rl.close();
    }
});

function deployToVercel() {
    console.log('\n🚀 Deploying to Vercel...');
    try {
        // Check if Vercel CLI is installed
        execSync('vercel --version', { stdio: 'pipe' });
        console.log('✅ Vercel CLI is installed');
        
        // Deploy
        console.log('📤 Deploying...');
        execSync('vercel --prod', { stdio: 'inherit' });
        console.log('✅ Deployment successful!');
    } catch (error) {
        console.log('❌ Error deploying to Vercel:');
        console.log('Please install Vercel CLI: npm install -g vercel');
        console.log('Then run: vercel --prod');
    }
    rl.close();
}

function deployToNetlify() {
    console.log('\n🚀 Deploying to Netlify...');
    try {
        // Check if Netlify CLI is installed
        execSync('netlify --version', { stdio: 'pipe' });
        console.log('✅ Netlify CLI is installed');
        
        // Deploy
        console.log('📤 Deploying...');
        execSync('netlify deploy --prod --dir .', { stdio: 'inherit' });
        console.log('✅ Deployment successful!');
    } catch (error) {
        console.log('❌ Error deploying to Netlify:');
        console.log('Please install Netlify CLI: npm install -g netlify-cli');
        console.log('Then run: netlify deploy --prod --dir .');
    }
    rl.close();
}

function deployToGitHubPages() {
    console.log('\n🚀 GitHub Pages Deployment Instructions:');
    console.log('1. Create a GitHub repository');
    console.log('2. Push your code:');
    console.log('   git add .');
    console.log('   git commit -m "Deploy to GitHub Pages"');
    console.log('   git push origin main');
    console.log('3. Go to repository Settings > Pages');
    console.log('4. Select source: Deploy from a branch');
    console.log('5. Choose main branch and save');
    console.log('6. Your site will be available at: https://<username>.github.io/<repository-name>');
    rl.close();
}

function deployToHeroku() {
    console.log('\n🚀 Deploying to Heroku...');
    try {
        // Check if Heroku CLI is installed
        execSync('heroku --version', { stdio: 'pipe' });
        console.log('✅ Heroku CLI is installed');
        
        // Check if git is initialized
        if (!fs.existsSync('.git')) {
            console.log('📝 Initializing git repository...');
            execSync('git init', { stdio: 'inherit' });
            execSync('git add .', { stdio: 'inherit' });
            execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
        }
        
        // Create Heroku app
        console.log('📤 Creating Heroku app...');
        execSync('heroku create cambria-duel-tracker', { stdio: 'inherit' });
        
        // Deploy
        console.log('📤 Deploying...');
        execSync('git push heroku main', { stdio: 'inherit' });
        console.log('✅ Deployment successful!');
    } catch (error) {
        console.log('❌ Error deploying to Heroku:');
        console.log('Please install Heroku CLI and login');
        console.log('Then run: heroku create cambria-duel-tracker');
        console.log('And: git push heroku main');
    }
    rl.close();
}

function startLocalServer() {
    console.log('\n🚀 Starting local development server...');
    try {
        // Check if dependencies are installed
        if (!fs.existsSync('node_modules')) {
            console.log('📦 Installing dependencies...');
            execSync('npm install', { stdio: 'inherit' });
        }
        
        // Start server
        console.log('🌐 Starting server on http://localhost:3000');
        execSync('npm start', { stdio: 'inherit' });
    } catch (error) {
        console.log('❌ Error starting local server:');
        console.log('Please run: npm install && npm start');
    }
    rl.close();
}