// Cambria Duel Arena Smart Contract Configuration
// Abstract L2 Chain Integration

const CONFIG = {
// Abstract L2 Chain Configuration
CHAIN_ID: 2741,
CHAIN_NAME: 'Abstract',
RPC_URL: 'https://abstract.api.onfinality.io/public',
EXPLORER_URL: 'https://abscan.org',
// Alternative RPCs to try if primary fails:
// - https://rpc.abs.xyz
// - https://abstract.publicnode.com
// - wss://rpc.abs.xyz
    
    // Smart Contract Addresses
    CONTRACTS: {
        DUEL_ARENA_BATTLE: '0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbb',
        DUEL_ARENA_ESCROW: '0x682a307e2274c24f305d6a81682a0b5eb7612a7e'
    },
    
  // Contract ABIs (simplified for key functions)
  ABIS: {
    DUEL_ARENA_BATTLE: [
      // Events - Based on actual on-chain events from AbScan
      "event BattleInitialized(uint256 indexed battleId, address indexed playerOne, address indexed playerTwo, uint256[] assetEnum, address[] contractAddr, uint256[] amtOrTokenId)",
      "event Deposited(uint256 indexed battleId, address indexed payee, uint256[] assetEnum, address[] contractAddr, uint256[] amtOrTokenId)",
      // Legacy event names (for compatibility)
      "event DuelInitiated(uint256 indexed duelId, address indexed player1, address indexed player2, uint256 wager)",
      "event DuelJoined(uint256 indexed duelId, address indexed player2)",
      "event DuelCompleted(uint256 indexed duelId, address indexed winner, address indexed loser, uint256 totalWinnings, uint256 fee)",
      "event DuelNullified(uint256 indexed duelId, address indexed player, uint256 refundAmount)",
      "event ProceedsClaimed(uint256 indexed duelId, address indexed winner, uint256 amount, uint256 fee)",
            
            // Functions - Based on actual contract
            "function initBattle(address opponent, uint256 wager) external payable", // 10. Player1 hosts
            "function joinBattle(uint256 duelId) external payable", // 11. Player2 accepts
            "function nullifyBattle(uint256 duelId) external", // 12. Cancel and refund
            "function claimProceeds(uint256 duelId) external", // 5. Winner claims
            "function getBattle(uint256 battleId) external view returns (address player1, address player2, uint256 wager, uint8 status, uint256 createdAt)", // 6. Get battle info
            "function nextBattleId() external view returns (uint256)", // 9. Get next battle ID
            "function getDuelInfo(uint256 duelId) external view returns (address player1, address player2, uint256 wager, uint8 status, uint256 createdAt)",
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
        PLATFORM_FEE_PERCENT: 5, // 5% fee on total winnings
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
        CHART_UPDATE_INTERVAL: 60000, // 1 minute
        /** When true, live feed API includes settled duels (ProceedsClaimed) so history is visible. */
        LIVE_FEED_INCLUDE_CLAIMED: true,
        /** Duels per page on the home live feed (API + UI). */
        LIVE_FEED_PAGE_SIZE: 100
    },

    // SQLite indexer (server + npm run index)
    INDEXER: {
        /** Default DB path; override with env CAMBRIA_DB_PATH */
        DB_PATH: typeof process !== 'undefined' && process.env && process.env.CAMBRIA_DB_PATH
            ? process.env.CAMBRIA_DB_PATH
            : null,
        /** Blocks per RPC queryFilter batch */
        CHUNK_SIZE: 8000,
        /** Background sync interval when running server (ms) */
        POLL_MS: 45000,
        /** First run: scan this many blocks back from chain tip if no checkpoint */
        INITIAL_LOOKBACK: 600000,
        /** Optional fixed start block (set in env CAMBRIA_INDEXER_FROM_BLOCK as integer) */
        START_BLOCK: typeof process !== 'undefined' && process.env && process.env.CAMBRIA_INDEXER_FROM_BLOCK
            ? parseInt(process.env.CAMBRIA_INDEXER_FROM_BLOCK, 10)
            : null
    },
    
// Error Messages
ERRORS: {
NETWORK_ERROR: 'Connection issue. Some features may be limited.',
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