# Cambria Duel Arena Data Tracker

A comprehensive website to track Cambria Duel Arena data on the Abstract L2 chain. This platform provides wallet statistics, profit tracking, and detailed duel information between players.

## Features

### 🏠 Home Page
- **Wallet Search**: Search for any wallet address to view detailed statistics
- **Search History**: Quick access to recently searched wallets with timestamps
- **Performance Metrics**: Track total wager, profit/loss, win rate, and duel count
- **Interactive Charts**: Visualize profit/loss trends and wager distribution using Chart.js
- **Duel History**: Complete table of all duels with opponent information and results
- **Live Duel Feed**: Real-time feed of all duel activity with clickable wallet addresses
- **Transaction Modals**: Detailed transaction history for each duel

### 🏆 Leaderboard
- **Multiple Rankings**: Sort by profit, wins, win rate, or volume
- **Top Performers**: See the best duelers in the arena
- **Interactive Filters**: Switch between different ranking criteria
- **Real-time Updates**: Data refreshes to show current standings

### 📊 Statistics
- **Ecosystem Overview**: Total duels, active players, volume, and average duel size
- **Visual Analytics**: Charts showing volume trends and win rate distribution
- **Key Insights**: Important metrics and trends from the duel arena
- **Performance Analysis**: Detailed breakdown of arena activity

### ℹ️ About
- **Platform Information**: Learn about the tracker's mission and features
- **How It Works**: Technical details about data sourcing and processing
- **Contact Information**: Links to social media and support channels
- **Disclaimer**: Important legal and risk information

## Design Features

- **Dark Theme**: Purple and blue accent colors matching Cambria's branding
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern UI**: Clean, professional interface with smooth animations
- **Interactive Elements**: Hover effects, transitions, and dynamic content

## Technical Implementation

### Frontend
- **HTML5**: Semantic markup with proper structure
- **CSS3**: Custom properties, Grid, Flexbox, and modern styling
- **JavaScript**: Interactive functionality and Chart.js integration
- **Fonts**: Orbitron for headings, Roboto for body text
- **Local Storage**: Caching for improved performance and offline capability

### Backend API
- **Express.js**: RESTful API server for data caching and aggregation
- **Node.js**: Server-side JavaScript runtime
- **Ethers.js**: Blockchain interaction and smart contract queries
- **Node-Cache**: In-memory caching for improved performance
- **CORS**: Cross-origin resource sharing for frontend integration

### Performance Optimizations
- **Pagination**: Efficient data loading with pagination support
- **Batching**: Parallel blockchain queries for faster data retrieval
- **Caching**: Multi-layer caching (localStorage + server-side)
- **Lazy Loading**: On-demand data loading for better user experience

### Data Visualization
- **Chart.js**: Professional charts for profit trends and statistics
- **Responsive Charts**: Automatically adapt to different screen sizes
- **Custom Styling**: Charts match the site's dark theme

### Responsive Design
- **Mobile-First**: Optimized for all device sizes
- **Flexible Layouts**: Grid and Flexbox for adaptive design
- **Touch-Friendly**: Large buttons and touch targets for mobile

## File Structure

```
cambria-data-site/
├── index.html              # Main homepage with wallet search and stats
├── leaderboard.html        # Top performers and rankings
├── statistics.html         # Ecosystem analytics and insights
├── about.html              # Platform information and contact
├── config.js               # Smart contract configuration and ABIs
├── web3-utils.js           # Web3 connection and contract utilities
├── server.js               # Express.js backend API server
├── package.json            # Node.js dependencies and scripts
├── deploy.js               # Deployment automation script
├── deploy.md               # Comprehensive deployment guide
├── Dockerfile              # Docker container configuration
├── docker-compose.yml      # Docker Compose configuration
├── .gitignore              # Git ignore rules
└── README.md              # This documentation file
```

## Getting Started

### Quick Start (Recommended)

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

4. **Access the application**:
   - Open your browser and navigate to `http://localhost:3000`
   - The site will automatically connect to the Abstract L2 network
   - Search for any wallet address to view its duel statistics

### Alternative: Static File Serving

If you prefer to serve the files statically without the backend API:

1. **Open `index.html`** in your web browser, or serve it using a local web server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

2. **Access the application**:
   - Open your browser and navigate to `http://localhost:8000`
   - The site will use direct blockchain queries (slower but functional)

### Deployment

For production deployment, see the [deployment guide](deploy.md) for detailed instructions on deploying to:
- Vercel (Recommended)
- Netlify
- GitHub Pages
- Heroku
- Docker

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Smart Contract Integration

This website is now fully integrated with the Cambria Duel Arena smart contracts on Abstract L2:

### Contract Addresses
- **DuelArenaBattle**: `0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbbe`
- **DuelArenaEscrow**: `0x682a307e2274c24f305d6a81682a0b5eb7612a7e`

### Features
- **Real-time Data**: Live updates from smart contracts
- **No Wallet Required**: Works in read-only mode without MetaMask
- **Live Duel Feed**: Real-time feed of all duel activity on the main page
- **Clickable Links**: All wallet addresses link to Abstract L2 explorer
- **Transaction Links**: Direct links to join battle transactions
- **Pending Duels**: Shows both completed and pending duels
- **Fee Calculation**: Accurate 10% fee deduction on all profits

### Setup Instructions

1. **Open the Website**: Simply open `index.html` in any modern web browser
2. **No Wallet Required**: The site works in read-only mode without any wallet connection
3. **Search Wallets**: Enter any wallet address to view their duel statistics
4. **View Live Activity**: The main page shows a live feed of all duel activity

### Technical Implementation

#### Files Added
- `config.js` - Smart contract configuration and ABIs
- `web3-utils.js` - Web3 connection and contract interaction utilities

#### Key Features
- **Automatic Network Detection**: Switches to Abstract L2 automatically
- **Real-time Event Listening**: Monitors duel events for live updates
- **Error Handling**: Graceful fallbacks to cached data
- **Loading States**: Visual feedback during data loading
- **Fee Structure**: Correctly calculates 10% platform fees

#### Smart Contract Events Monitored
- `DuelStarted` - New duel initiated
- `DuelCompleted` - Duel finished with winner
- `WagerDeposited` - ETH wagers placed
- `FundsReleased` - Winnings distributed

### Usage

1. **View Live Feed**: The main page shows real-time duel activity
2. **Search Wallets**: Enter any wallet address to view their statistics
3. **Click Links**: All wallet addresses and transactions are clickable
4. **Real-time Updates**: Data refreshes automatically every 30 seconds
5. **Pending Duels**: See duels that are still in progress
6. **Live Leaderboard**: Rankings update in real-time
7. **Statistics**: Ecosystem stats refresh automatically

## Future Enhancements

For a production implementation, consider adding:

1. **Backend API**: RESTful API for data caching and aggregation
2. **User Accounts**: Save favorite wallets and preferences
3. **Advanced Analytics**: More detailed performance metrics
4. **Notifications**: Browser push notifications for events
5. **Export Features**: Download data as CSV or PDF
6. **Mobile App**: Native mobile application
7. **Social Features**: Share achievements and statistics

## Disclaimer

This is an independent project and is not affiliated with, endorsed by, or sponsored by @playcambria or any official Cambria entities. This platform is provided for informational purposes only.

## License

This project is open source and available under the MIT License.

---

**Built with ❤️ for the Cambria community**