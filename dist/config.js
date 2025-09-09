// Cambria Duel Arena Smart Contract Configuration
// Multi-Chain Support: Abstract L2 and Ronin

const CONFIG = {
    // Current active chain
    ACTIVE_CHAIN: 'abstract', // 'abstract' or 'ronin'
    
    // Abstract L2 Chain Configuration
    ABSTRACT: {
        CHAIN_ID: 2741,
        CHAIN_NAME: 'Abstract',
        RPC_URL: 'https://api.abstract.xyz',
        EXPLORER_URL: 'https://abscan.org',
        CONTRACTS: {
            DUEL_ARENA_BATTLE: '0x5f8abf7f164fbed5c51f696ddf3c2c17bcbc8fbb',
            DUEL_ARENA_ESCROW: '0x682a307e2274c24f305d6a81682a0b5eb7612a7e'
        }
    },
    
    // Ronin Chain Configuration
    RONIN: {
        CHAIN_ID: 2020,
        CHAIN_NAME: 'Ronin',
        RPC_URL: 'https://api.roninchain.com/rpc',
        EXPLORER_URL: 'https://app.roninchain.com',
        CONTRACTS: {
            DUEL_ARENA_BATTLE: '0x0000000000000000000000000000000000000000', // TODO: Get actual Ronin contract addresses
            DUEL_ARENA_ESCROW: '0x0000000000000000000000000000000000000000'  // TODO: Get actual Ronin contract addresses
        }
    },
    
    // Get current chain config
    getCurrentChain() {
        return this[this.ACTIVE_CHAIN.toUpperCase()];
    },
    
    // Get current contracts
    getCurrentContracts() {
        return this.getCurrentChain().CONTRACTS;
    },
    
    // Switch active chain
    switchChain(chain) {
        if (chain === 'abstract' || chain === 'ronin') {
            this.ACTIVE_CHAIN = chain;
            this.updateTheme();
            return true;
        }
        return false;
    },
    
    // Update theme based on active chain
    updateTheme() {
        const theme = this.UI.THEMES[this.ACTIVE_CHAIN.toUpperCase()];
        const root = document.documentElement;
        
        if (root && theme) {
            root.style.setProperty('--primary', theme.PRIMARY);
            root.style.setProperty('--primary-light', theme.PRIMARY_LIGHT);
            root.style.setProperty('--primary-dark', theme.PRIMARY_DARK);
            root.style.setProperty('--secondary', theme.SECONDARY);
            root.style.setProperty('--secondary-light', theme.SECONDARY_LIGHT);
            root.style.setProperty('--secondary-dark', theme.SECONDARY_DARK);
        }
    },
    
    // Contract ABIs (simplified for key functions)
    ABIS: {
        DUEL_ARENA_BATTLE: [
            // Events - Based on actual contract functions
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
        
        // Theme Configuration
        THEMES: {
            ABSTRACT: {
                PRIMARY: '#6a3d9a',
                PRIMARY_LIGHT: '#8b5fb8',
                PRIMARY_DARK: '#4a2c6b',
                SECONDARY: '#00b4d8',
                SECONDARY_LIGHT: '#33c4e0',
                SECONDARY_DARK: '#0099b8'
            },
            RONIN: {
                PRIMARY: '#1e40af',
                PRIMARY_LIGHT: '#3b82f6',
                PRIMARY_DARK: '#1e3a8a',
                SECONDARY: '#0ea5e9',
                SECONDARY_LIGHT: '#38bdf8',
                SECONDARY_DARK: '#0284c7'
            }
        }
    },
    
    // Error Messages
    ERRORS: {
        NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
        CONTRACT_ERROR: 'Smart contract interaction failed. Please try again.',
        WALLET_NOT_FOUND: 'Wallet address not found in duel history.',
        INVALID_ADDRESS: 'Invalid wallet address format.',
        CHAIN_NOT_SUPPORTED: 'Please switch to a supported network (Abstract L2 or Ronin).',
        CONTRACT_NOT_DEPLOYED: 'Duel Arena contracts not yet deployed on this chain.'
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}