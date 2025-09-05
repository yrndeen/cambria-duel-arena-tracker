// Cambria Duel Arena Smart Contract Configuration
// Abstract L2 Chain Integration

const CONFIG = {
    // Abstract L2 Chain Configuration
    CHAIN_ID: 2741,
    CHAIN_NAME: 'Abstract',
    RPC_URL: 'https://api.abstract.xyz',
    EXPLORER_URL: 'https://abscan.org',
    
    // Smart Contract Addresses
    CONTRACTS: {
        DUEL_ARENA_BATTLE: '0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbbe',
        DUEL_ARENA_ESCROW: '0x682a307e2274c24f305d6a81682a0b5eb7612a7e'
    },
    
    // Contract ABIs (simplified for key functions)
    ABIS: {
        DUEL_ARENA_BATTLE: [
            // Events
            "event DuelStarted(uint256 indexed duelId, address indexed player1, address indexed player2, uint256 wager)",
            "event DuelCompleted(uint256 indexed duelId, address indexed winner, address indexed loser, uint256 totalWinnings, uint256 fee)",
            "event WagerDeposited(uint256 indexed duelId, address indexed player, uint256 amount)",
            
            // Functions
            "function startDuel(address opponent, uint256 wager) external payable",
            "function depositWager(uint256 duelId) external payable",
            "function getDuelInfo(uint256 duelId) external view returns (address player1, address player2, uint256 wager, uint8 status)",
            "function getPlayerStats(address player) external view returns (uint256 totalDuels, uint256 wins, uint256 totalWagered, uint256 totalProfit)"
        ],
        
        DUEL_ARENA_ESCROW: [
            // Events
            "event FundsEscrowed(uint256 indexed duelId, uint256 amount)",
            "event FundsReleased(uint256 indexed duelId, address indexed winner, uint256 amount, uint256 fee)",
            "event FeeCollected(uint256 indexed duelId, uint256 feeAmount)",
            
            // Functions
            "function escrowFunds(uint256 duelId, uint256 amount) external",
            "function releaseFunds(uint256 duelId, address winner) external",
            "function getEscrowedAmount(uint256 duelId) external view returns (uint256)",
            "function getTotalFees() external view returns (uint256)"
        ]
    },
    
    // Fee Configuration
    FEE_CONFIG: {
        PLATFORM_FEE_PERCENT: 10, // 10% fee on total winnings
        FEE_DECIMALS: 2
    },
    
    // API Configuration
    API: {
        BASE_URL: 'https://api.cambria-duel-tracker.com', // Replace with your backend API
        ENDPOINTS: {
            WALLET_STATS: '/api/wallet/',
            LEADERBOARD: '/api/leaderboard',
            STATISTICS: '/api/statistics',
            DUEL_HISTORY: '/api/duels/'
        }
    },
    
    // UI Configuration
    UI: {
        REFRESH_INTERVAL: 30000, // 30 seconds
        MAX_DUELS_DISPLAY: 50,
        CHART_UPDATE_INTERVAL: 60000 // 1 minute
    },
    
    // Error Messages
    ERRORS: {
        NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
        CONTRACT_ERROR: 'Smart contract interaction failed. Please try again.',
        WALLET_NOT_FOUND: 'Wallet address not found in duel history.',
        INVALID_ADDRESS: 'Invalid wallet address format.',
        CHAIN_NOT_SUPPORTED: 'Please switch to Abstract L2 network.'
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}