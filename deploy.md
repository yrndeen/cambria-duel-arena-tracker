# Cambria Duel Arena Tracker - Deployment Guide

## Quick Start

### Option 1: Deploy to Vercel (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel --prod
   ```

3. **Configure Environment Variables** (if needed):
   - Go to your Vercel dashboard
   - Select your project
   - Go to Settings > Environment Variables
   - Add any required environment variables

### Option 2: Deploy to Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**:
   ```bash
   netlify deploy --prod --dir .
   ```

### Option 3: Deploy to GitHub Pages

1. **Create a GitHub repository**
2. **Push your code**:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Enable GitHub Pages**:
   - Go to repository Settings
   - Scroll to Pages section
   - Select source: Deploy from a branch
   - Choose main branch
   - Save

### Option 4: Deploy to Heroku

1. **Install Heroku CLI**
2. **Create Heroku app**:
   ```bash
   heroku create cambria-duel-tracker
   ```

3. **Deploy**:
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

## Local Development

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd cambria-data-site
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Open your browser**:
   Navigate to `http://localhost:3000`

### Development Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with auto-reload
- `npm test` - Run tests (if any)

## Features

✅ **Completed Features**:
- Local storage caching for wallet data
- Optimized blockchain queries with pagination/batching
- Enhanced data visualizations with additional charts
- Backend API for caching blockchain data
- Search history feature for quick access to recent wallets
- Custom theme options (Default, Blue, Green, Red)
- Real-time duel activity feed
- Wallet statistics tracking
- Duel history with transaction details
- Responsive design for mobile and desktop

## API Endpoints

The backend API provides the following endpoints:

- `GET /api/wallet/:address` - Get wallet statistics
- `GET /api/duels/:address` - Get duel history for a wallet
- `GET /api/live-feed` - Get recent duel activity
- `GET /api/duel/:duelId/transactions` - Get transactions for a specific duel

## Configuration

The site uses the following smart contracts on Abstract L2:
- DuelArenaBattle: `0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbbe`
- DuelArenaEscrow: `0x682a307e2274c24f305d6a81682a0b5eb7612a7e`

## Support

For issues or questions, please check the repository issues or create a new one.

## License

MIT License - see LICENSE file for details.