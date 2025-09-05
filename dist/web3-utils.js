// Web3 Utilities for Cambria Duel Arena Integration
// Handles blockchain connections, contract interactions, and data processing

class CambriaWeb3 {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        this.isConnected = false;
        this.eventListeners = new Map();
        this.cache = {
            walletStats: new Map(),
            duelHistory: new Map(),
            liveFeed: null,
            duelTransactions: new Map()
        };
        this.cacheExpiry = {
            walletStats: 5 * 60 * 1000, // 5 minutes
            duelHistory: 2 * 60 * 1000, // 2 minutes
            liveFeed: 30 * 1000, // 30 seconds
            duelTransactions: 10 * 60 * 1000 // 10 minutes
        };
        this.loadCacheFromLocalStorage();
        
        // API server configuration
        this.useApiServer = false;
        this.apiBaseUrl = 'http://localhost:3000/api';
        
        // Check if API server is available
        this.checkApiServer();
    }
    
    // Check if API server is available
    async checkApiServer() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/live-feed?limit=1`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                console.log('API server is available, using it for data fetching');
                this.useApiServer = true;
            }
        } catch (error) {
            console.log('API server not available, using direct blockchain queries');
            this.useApiServer = false;
        }
    }

    // Initialize Web3 connection (read-only mode)
    async initialize() {
        try {
            // Use public RPC endpoint for read-only access
            this.provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
            
            // Initialize contracts
            await this.initializeContracts();
            
            this.isConnected = true;
            console.log('Web3 initialized successfully (read-only mode)');
            return true;
        } catch (error) {
            console.error('Web3 initialization failed:', error);
            this.showError(CONFIG.ERRORS.NETWORK_ERROR);
            return false;
        }
    }

    // Check if we're on Abstract L2 network
    async checkNetwork() {
        const chainId = await this.provider.request({ method: 'eth_chainId' });
        const expectedChainId = '0x' + CONFIG.CHAIN_ID.toString(16);
        
        if (chainId !== expectedChainId) {
            try {
                await this.provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: expectedChainId }],
                });
            } catch (switchError) {
                // If the network doesn't exist, add it
                if (switchError.code === 4902) {
                    await this.addAbstractNetwork();
                } else {
                    throw new Error(CONFIG.ERRORS.CHAIN_NOT_SUPPORTED);
                }
            }
        }
    }

    // Add Abstract L2 network to MetaMask
    async addAbstractNetwork() {
        await this.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: '0x' + CONFIG.CHAIN_ID.toString(16),
                chainName: CONFIG.CHAIN_NAME,
                rpcUrls: [CONFIG.RPC_URL],
                blockExplorerUrls: [CONFIG.EXPLORER_URL],
                nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18
                }
            }]
        });
    }

    // Initialize smart contracts
    async initializeContracts() {
        try {
            // Create contract instances
            this.contracts.duelArenaBattle = new ethers.Contract(
                CONFIG.CONTRACTS.DUEL_ARENA_BATTLE,
                CONFIG.ABIS.DUEL_ARENA_BATTLE,
                this.provider
            );

            this.contracts.duelArenaEscrow = new ethers.Contract(
                CONFIG.CONTRACTS.DUEL_ARENA_ESCROW,
                CONFIG.ABIS.DUEL_ARENA_ESCROW,
                this.provider
            );

            console.log('Contracts initialized successfully');
        } catch (error) {
            console.error('Contract initialization failed:', error);
            throw error;
        }
    }

    // Get wallet statistics from API server or smart contracts
    async getWalletStats(walletAddress) {
        try {
            // Check cache first
            const cachedStats = this.getCachedData('walletStats', walletAddress);
            if (cachedStats) {
                console.log(`Using cached wallet stats for ${walletAddress}`);
                return cachedStats;
            }
            
            // Try API server first if available
            if (this.useApiServer) {
                try {
                    console.log(`Fetching wallet stats for ${walletAddress} from API server`);
                    const response = await fetch(`${this.apiBaseUrl}/wallet/${walletAddress}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        
                        // Cache the result
                        this.setCachedData('walletStats', walletAddress, result);
                        
                        return result;
                    } else {
                        console.log('API server error, falling back to direct contract call');
                    }
                } catch (apiError) {
                    console.log('API server error, falling back to direct contract call:', apiError);
                }
            }
            
            // Fall back to direct contract call if API server is not available or fails
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            try {
                // Get player stats from the battle contract
                const playerStats = await this.contracts.duelArenaBattle.getPlayerStats(walletAddress);
                
                // Calculate net profit (after 5% fee)
                const totalWagered = parseFloat(ethers.utils.formatEther(playerStats.totalWagered || 0));
                const totalProfit = parseFloat(ethers.utils.formatEther(playerStats.totalProfit || 0));
                const netProfit = totalProfit * 0.95; // Apply 5% fee deduction
                
                // Calculate total ETH won (before fees)
                const totalETHWon = totalProfit; // This is the total ETH won before fees
                
                // Get total duels and wins (safely handle potential undefined values)
                const totalDuels = playerStats.totalDuels ? playerStats.totalDuels.toNumber() : 0;
                const wins = playerStats.wins ? playerStats.wins.toNumber() : 0;
                const losses = totalDuels - wins;
                
                // Calculate win rate
                const winRate = totalDuels > 0 ? (wins / totalDuels * 100).toFixed(1) : "0.0";

                const result = {
                    address: walletAddress,
                    totalDuels: totalDuels,
                    wins: wins,
                    losses: losses,
                    totalWagered: totalWagered,
                    totalETHWon: totalETHWon,
                    totalProfit: totalProfit,
                    netProfit: netProfit,
                    winRate: winRate
                };
                
                // Cache the result
                this.setCachedData('walletStats', walletAddress, result);
                
                return result;
            } catch (contractError) {
                console.log('No stats found for wallet or contract error:', contractError);
                
                // Return zeroed stats for wallet with no history
                const zeroStats = {
                    address: walletAddress,
                    totalDuels: 0,
                    wins: 0,
                    losses: 0,
                    totalWagered: 0,
                    totalETHWon: 0,
                    totalProfit: 0,
                    netProfit: 0,
                    winRate: "0.0"
                };
                
                // Cache the zero stats too to prevent repeated failed lookups
                this.setCachedData('walletStats', walletAddress, zeroStats);
                
                return zeroStats;
            }
        } catch (error) {
            console.error('Error fetching wallet stats:', error);
            throw error;
        }
    }

    // Get duel history for a wallet with pagination from API server or blockchain
    async getDuelHistory(walletAddress, limit = 50, page = 1) {
        try {
            // Check cache first
            const cacheKey = `${walletAddress}-${limit}-${page}`;
            const cachedHistory = this.getCachedData('duelHistory', cacheKey);
            if (cachedHistory) {
                console.log(`Using cached duel history for ${walletAddress} (page ${page})`);
                return cachedHistory;
            }
            
            // Try API server first if available
            if (this.useApiServer) {
                try {
                    console.log(`Fetching duel history for ${walletAddress} from API server (page ${page})`);
                    const response = await fetch(`${this.apiBaseUrl}/duels/${walletAddress}?limit=${limit}&page=${page}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        
                        // Cache the result
                        this.setCachedData('duelHistory', cacheKey, result);
                        
                        return result;
                    } else {
                        console.log('API server error, falling back to direct contract call');
                    }
                } catch (apiError) {
                    console.log('API server error, falling back to direct contract call:', apiError);
                }
            }
            
            // Fall back to direct contract call if API server is not available or fails
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            try {
                // Calculate block ranges for pagination
                // We'll use a sliding window approach to avoid missing events
                const blockWindow = 10000; // 10k blocks per query
                const latestBlock = await this.provider.getBlockNumber();
                const startBlock = Math.max(0, latestBlock - blockWindow * page);
                const endBlock = page === 1 ? latestBlock : startBlock + blockWindow;
                
                console.log(`Querying blocks ${startBlock} to ${endBlock} for wallet ${walletAddress}`);
                
                // Query all relevant events for this wallet
                const [
                    duelInitiatedAsPlayer1,
                    duelInitiatedAsPlayer2,
                    duelJoinedEvents,
                    duelCompletedEvents,
                    duelNullifiedEvents,
                    proceedsClaimedEvents
                ] = await Promise.all([
                    // Query DuelInitiated events for this wallet as player1
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelInitiated(null, walletAddress),
                        startBlock,
                        endBlock
                    ),
                    // Query DuelInitiated events for this wallet as player2
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelInitiated(walletAddress, null),
                        startBlock,
                        endBlock
                    ),
                    // Query DuelJoined events
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelJoined(),
                        startBlock,
                        endBlock
                    ),
                    // Query DuelCompleted events
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelCompleted(),
                        startBlock,
                        endBlock
                    ),
                    // Query DuelNullified events
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelNullified(),
                        startBlock,
                        endBlock
                    ),
                    // Query ProceedsClaimed events
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.ProceedsClaimed(),
                        startBlock,
                        endBlock
                    )
                ]);
                
                // Combine all initiated duels
                const allInitiatedEvents = [...duelInitiatedAsPlayer1, ...duelInitiatedAsPlayer2];
                
                // If no events found, return empty array
                if (allInitiatedEvents.length === 0) {
                    // Cache the empty result too
                    this.setCachedData('duelHistory', cacheKey, { duels: [], hasMore: false });
                    return { duels: [], hasMore: false };
                }
                
                // Create maps for quick lookup
                const joinedByDuelId = {};
                const completedByDuelId = {};
                const nullifiedByDuelId = {};
                const claimedByDuelId = {};
                
                duelJoinedEvents.forEach(event => {
                    joinedByDuelId[event.args.duelId.toString()] = event;
                });
                
                duelCompletedEvents.forEach(event => {
                    completedByDuelId[event.args.duelId.toString()] = event;
                });
                
                duelNullifiedEvents.forEach(event => {
                    nullifiedByDuelId[event.args.duelId.toString()] = event;
                });
                
                proceedsClaimedEvents.forEach(event => {
                    claimedByDuelId[event.args.duelId.toString()] = event;
                });
                
                // Sort events by block number (newest first) and limit
                allInitiatedEvents.sort((a, b) => b.blockNumber - a.blockNumber);
                const paginatedEvents = allInitiatedEvents.slice(0, limit);
                const hasMore = allInitiatedEvents.length > limit;
                
                const duels = [];
                
                for (const event of paginatedEvents) {
                    const duelId = event.args.duelId.toString();
                    const player1 = event.args.player1;
                    const player2 = event.args.player2;
                    const wager = parseFloat(ethers.utils.formatEther(event.args.wager));
                    const currentPlayer = walletAddress; // Store the current player for UI display
                    
                    let winner = null;
                    let loser = null;
                    let netProfit = 0;
                    let status = 'pending'; // Default status after initBattle
                    let transactionHash = event.transactionHash;
                    
                    // Check duel progression
                    if (nullifiedByDuelId[duelId]) {
                        // Duel was nullified (cancelled)
                        status = 'cancelled';
                        const nullifyEvent = nullifiedByDuelId[duelId];
                        transactionHash = nullifyEvent.transactionHash;
                    } else if (joinedByDuelId[duelId]) {
                        // Duel was joined (active)
                        status = 'active';
                        const joinEvent = joinedByDuelId[duelId];
                        transactionHash = joinEvent.transactionHash;
                        
                        // Check if completed
                        if (completedByDuelId[duelId]) {
                            status = 'completed';
                            const completedEvent = completedByDuelId[duelId];
                            winner = completedEvent.args.winner;
                            loser = completedEvent.args.loser;
                            transactionHash = completedEvent.transactionHash;
                            
                            // Calculate net profit (after 5% fee)
                            if (winner.toLowerCase() === walletAddress.toLowerCase()) {
                                netProfit = wager * 1.9; // 2 * wager - 0.1 * wager (5% fee on total winnings)
                            } else {
                                netProfit = -wager; // Lost the wager
                            }
                        }
                    }
                    
                    duels.push({
                        id: duelId,
                        player1,
                        player2,
                        wager,
                        winner,
                        loser,
                        currentPlayer,
                        netProfit,
                        status,
                        timestamp: event.blockNumber,
                        transactionHash,
                        blockNumber: event.blockNumber
                    });
                }
                
                const result = { duels, hasMore };
                
                // Cache the result
                this.setCachedData('duelHistory', cacheKey, result);
                
                return result;
            } catch (contractError) {
                console.log('Error fetching duel history or no history found:', contractError);
                const emptyResult = { duels: [], hasMore: false };
                // Cache the empty result too
                this.setCachedData('duelHistory', cacheKey, emptyResult);
                return emptyResult; // Return empty result for wallets with no history
            }
        } catch (error) {
            console.error('Error fetching duel history:', error);
            throw error;
        }
    }

    // Get leaderboard data
    async getLeaderboardData(sortBy = 'profit') {
        try {
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            // This would require aggregating data from multiple events
            // For now, return placeholder data
            return [];
        } catch (error) {
            console.error('Error fetching leaderboard data:', error);
            throw error;
        }
    }

    // Get ecosystem statistics
    async getEcosystemStats() {
        try {
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            // Get total fees collected
            const totalFees = await this.contracts.duelArenaEscrow.getTotalFees();
            
            return {
                totalFees: parseFloat(ethers.utils.formatEther(totalFees)),
                // Additional stats would be calculated from event data
            };
        } catch (error) {
            console.error('Error fetching ecosystem stats:', error);
            throw error;
        }
    }

    // Get recent duel activity (live feed) with correct duel flow tracking
    async getRecentDuelActivity(limit = 20) {
        try {
            // Check cache first
            const cacheKey = `liveFeed-${limit}`;
            const cachedLiveFeed = this.getCachedData('liveFeed', cacheKey);
            if (cachedLiveFeed) {
                console.log('Using cached live feed data');
                return cachedLiveFeed;
            }
            
            // Try API server first if available
            if (this.useApiServer) {
                try {
                    console.log(`Fetching live feed from API server (limit ${limit})`);
                    const response = await fetch(`${this.apiBaseUrl}/live-feed?limit=${limit}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        
                        // Cache the result
                        this.setCachedData('liveFeed', cacheKey, result);
                        
                        return result;
                    } else {
                        console.log('API server error, falling back to direct contract call');
                    }
                } catch (apiError) {
                    console.log('API server error, falling back to direct contract call:', apiError);
                }
            }
            
            // Fall back to direct contract call if API server is not available or fails
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            try {
                // Get latest block number
                const latestBlock = await this.provider.getBlockNumber();
                const fromBlock = Math.max(0, latestBlock - 10000); // Last 10k blocks for recent activity
                
                // Get all relevant events in parallel
                const [
                    duelInitiatedEvents,
                    duelJoinedEvents,
                    duelCompletedEvents,
                    duelNullifiedEvents,
                    proceedsClaimedEvents
                ] = await Promise.all([
                    // 1. DuelInitiated events (initBattle function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelInitiated(),
                        fromBlock,
                        latestBlock
                    ),
                    // 2. DuelJoined events (joinBattle function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelJoined(),
                        fromBlock,
                        latestBlock
                    ),
                    // 3. DuelCompleted events (claimProceeds function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelCompleted(),
                        fromBlock,
                        latestBlock
                    ),
                    // 4. DuelNullified events (nullifyBattle function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelNullified(),
                        fromBlock,
                        latestBlock
                    ),
                    // 5. ProceedsClaimed events (claimProceeds function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.ProceedsClaimed(),
                        fromBlock,
                        latestBlock
                    )
                ]);
                
                // Create maps for quick lookup
                const joinedByDuelId = {};
                const completedByDuelId = {};
                const nullifiedByDuelId = {};
                const claimedByDuelId = {};
                
                duelJoinedEvents.forEach(event => {
                    joinedByDuelId[event.args.duelId.toString()] = event;
                });
                
                duelCompletedEvents.forEach(event => {
                    completedByDuelId[event.args.duelId.toString()] = event;
                });
                
                duelNullifiedEvents.forEach(event => {
                    nullifiedByDuelId[event.args.duelId.toString()] = event;
                });
                
                claimedByDuelId.forEach(event => {
                    claimedByDuelId[event.args.duelId.toString()] = event;
                });
                
                // Process all initiated duels
                const duels = [];
                
                for (const event of duelInitiatedEvents) {
                    const duelId = event.args.duelId.toString();
                    const player1 = event.args.player1;
                    const player2 = event.args.player2;
                    const wager = parseFloat(ethers.utils.formatEther(event.args.wager));
                    
                    let status = 'pending'; // Default status after initBattle
                    let winner = null;
                    let loser = null;
                    let netProfit = 0;
                    let transactionHash = event.transactionHash;
                    
                    // Check duel progression
                    if (nullifiedByDuelId[duelId]) {
                        // Duel was nullified (cancelled)
                        status = 'cancelled';
                        const nullifyEvent = nullifiedByDuelId[duelId];
                        transactionHash = nullifyEvent.transactionHash;
                    } else if (joinedByDuelId[duelId]) {
                        // Duel was joined (active)
                        status = 'active';
                        const joinEvent = joinedByDuelId[duelId];
                        transactionHash = joinEvent.transactionHash;
                        
                        // Check if completed
                        if (completedByDuelId[duelId]) {
                            status = 'completed';
                            const completedEvent = completedByDuelId[duelId];
                            winner = completedEvent.args.winner;
                            loser = completedEvent.args.loser;
                            transactionHash = completedEvent.transactionHash;
                            
                            // Calculate net profit (after 5% fee)
                            if (winner.toLowerCase() === player1.toLowerCase()) {
                                netProfit = wager * 1.9; // 2 * wager - 0.1 * wager (5% fee on total winnings)
                            } else if (winner.toLowerCase() === player2.toLowerCase()) {
                                netProfit = wager * 1.9; // 2 * wager - 0.1 * wager (5% fee on total winnings)
                            }
                        }
                    }
                    
                    duels.push({
                        id: duelId,
                        player1,
                        player2,
                        wager,
                        winner,
                        loser,
                        status,
                        netProfit,
                        timestamp: event.blockNumber,
                        transactionHash,
                        blockNumber: event.blockNumber
                    });
                }
                
                // Sort by block number (newest first) and limit
                duels.sort((a, b) => b.blockNumber - a.blockNumber);
                const recentDuels = duels.slice(0, limit);
                
                // Cache the result
                this.setCachedData('liveFeed', cacheKey, recentDuels);
                
                return recentDuels;
            } catch (contractError) {
                console.error('Error fetching duel activity from contract:', contractError);
                return []; // Return empty array if there's an error
            }
        } catch (error) {
            console.error('Error fetching recent duel activity:', error);
            throw error;
        }
    }

    // Generate transaction link for Abstract L2
    generateTransactionLink(txHash) {
        return `${CONFIG.EXPLORER_URL}/tx/${txHash}`;
    }

    // Generate wallet link for Abstract L2
    generateWalletLink(walletAddress) {
        return `${CONFIG.EXPLORER_URL}/address/${walletAddress}`;
    }
    
    // Cache management methods
    loadCacheFromLocalStorage() {
        try {
            // Load wallet stats cache
            const walletStatsCache = localStorage.getItem('cambriaWalletStatsCache');
            if (walletStatsCache) {
                const parsed = JSON.parse(walletStatsCache);
                Object.entries(parsed).forEach(([address, entry]) => {
                    this.cache.walletStats.set(address, {
                        data: entry.data,
                        timestamp: entry.timestamp
                    });
                });
            }
            
            // Load duel history cache
            const duelHistoryCache = localStorage.getItem('cambriaDuelHistoryCache');
            if (duelHistoryCache) {
                const parsed = JSON.parse(duelHistoryCache);
                Object.entries(parsed).forEach(([address, entry]) => {
                    this.cache.duelHistory.set(address, {
                        data: entry.data,
                        timestamp: entry.timestamp
                    });
                });
            }
            
            // Load live feed cache
            const liveFeedCache = localStorage.getItem('cambriaLiveFeedCache');
            if (liveFeedCache) {
                this.cache.liveFeed = JSON.parse(liveFeedCache);
            }
            
            // Load duel transactions cache
            const duelTransactionsCache = localStorage.getItem('cambriaDuelTransactionsCache');
            if (duelTransactionsCache) {
                const parsed = JSON.parse(duelTransactionsCache);
                Object.entries(parsed).forEach(([duelId, entry]) => {
                    this.cache.duelTransactions.set(duelId, {
                        data: entry.data,
                        timestamp: entry.timestamp
                    });
                });
            }
            
            console.log('Cache loaded from localStorage');
        } catch (error) {
            console.error('Error loading cache from localStorage:', error);
            // If there's an error, clear the cache to prevent issues
            localStorage.removeItem('cambriaWalletStatsCache');
            localStorage.removeItem('cambriaDuelHistoryCache');
            localStorage.removeItem('cambriaLiveFeedCache');
            localStorage.removeItem('cambriaDuelTransactionsCache');
        }
    }
    
    saveCacheToLocalStorage() {
        try {
            // Save wallet stats cache
            const walletStatsCache = {};
            this.cache.walletStats.forEach((value, key) => {
                walletStatsCache[key] = value;
            });
            localStorage.setItem('cambriaWalletStatsCache', JSON.stringify(walletStatsCache));
            
            // Save duel history cache
            const duelHistoryCache = {};
            this.cache.duelHistory.forEach((value, key) => {
                duelHistoryCache[key] = value;
            });
            localStorage.setItem('cambriaDuelHistoryCache', JSON.stringify(duelHistoryCache));
            
            // Save live feed cache
            if (this.cache.liveFeed) {
                localStorage.setItem('cambriaLiveFeedCache', JSON.stringify(this.cache.liveFeed));
            }
            
            // Save duel transactions cache
            const duelTransactionsCache = {};
            this.cache.duelTransactions.forEach((value, key) => {
                duelTransactionsCache[key] = value;
            });
            localStorage.setItem('cambriaDuelTransactionsCache', JSON.stringify(duelTransactionsCache));
            
            console.log('Cache saved to localStorage');
        } catch (error) {
            console.error('Error saving cache to localStorage:', error);
        }
    }
    
    isCacheValid(type, key) {
        const cacheEntry = this.cache[type].get(key);
        if (!cacheEntry) return false;
        
        const now = Date.now();
        const expiryTime = this.cacheExpiry[type];
        return (now - cacheEntry.timestamp) < expiryTime;
    }
    
    getCachedData(type, key) {
        if (this.isCacheValid(type, key)) {
            return this.cache[type].get(key).data;
        }
        return null;
    }
    
    setCachedData(type, key, data) {
        this.cache[type].set(key, {
            data: data,
            timestamp: Date.now()
        });
        
        // Save to localStorage after updating cache
        setTimeout(() => this.saveCacheToLocalStorage(), 100);
    }

    // Get all transactions related to a specific duel with optimized batching from API server or blockchain
    async getDuelTransactions(duelId) {
        try {
            // Check cache first
            const cachedTransactions = this.getCachedData('duelTransactions', duelId);
            if (cachedTransactions) {
                console.log(`Using cached transactions for duel ${duelId}`);
                return cachedTransactions;
            }
            
            // Try API server first if available
            if (this.useApiServer) {
                try {
                    console.log(`Fetching transactions for duel ${duelId} from API server`);
                    const response = await fetch(`${this.apiBaseUrl}/duel/${duelId}/transactions`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        
                        // Cache the result
                        this.setCachedData('duelTransactions', duelId, result);
                        
                        return result;
                    } else {
                        console.log('API server error, falling back to direct contract call');
                    }
                } catch (apiError) {
                    console.log('API server error, falling back to direct contract call:', apiError);
                }
            }
            
            // Fall back to direct contract call if API server is not available or fails
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            try {
                // Batch all event queries in parallel for correct duel flow
                const [
                    duelInitiatedEvents,
                    duelJoinedEvents,
                    duelCompletedEvents,
                    duelNullifiedEvents,
                    proceedsClaimedEvents
                ] = await Promise.all([
                    // Get DuelInitiated event (initBattle function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelInitiated(duelId)
                    ),
                    // Get DuelJoined event (joinBattle function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelJoined(duelId)
                    ),
                    // Get DuelCompleted event (claimProceeds function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelCompleted(duelId)
                    ),
                    // Get DuelNullified event (nullifyBattle function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelNullified(duelId)
                    ),
                    // Get ProceedsClaimed event (claimProceeds function)
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.ProceedsClaimed(duelId)
                    )
                ]);
                
                // Process all events into transactions array
                const transactions = [];
                
                // Process DuelInitiated events (initBattle)
                for (const event of duelInitiatedEvents) {
                    transactions.push({
                        type: 'Duel Initiated',
                        typeClass: 'duel-initiated',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        player1: event.args.player1,
                        player2: event.args.player2,
                        wager: parseFloat(ethers.utils.formatEther(event.args.wager)),
                        duelId: event.args.duelId.toString(),
                        description: `Player ${this.formatAddress(event.args.player1)} initiated duel with ${this.formatAddress(event.args.player2)} (initBattle)`
                    });
                }
                
                // Process DuelJoined events (joinBattle)
                for (const event of duelJoinedEvents) {
                    transactions.push({
                        type: 'Duel Joined',
                        typeClass: 'duel-joined',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        player2: event.args.player2,
                        duelId: event.args.duelId.toString(),
                        description: `Player ${this.formatAddress(event.args.player2)} joined the duel (joinBattle)`
                    });
                }
                
                // Process DuelCompleted events (claimProceeds)
                for (const event of duelCompletedEvents) {
                    transactions.push({
                        type: 'Duel Completed',
                        typeClass: 'duel-completed',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        winner: event.args.winner,
                        loser: event.args.loser,
                        totalWinnings: parseFloat(ethers.utils.formatEther(event.args.totalWinnings)),
                        fee: parseFloat(ethers.utils.formatEther(event.args.fee)),
                        duelId: event.args.duelId.toString(),
                        description: `Duel completed - Winner: ${this.formatAddress(event.args.winner)} (claimProceeds)`
                    });
                }
                
                // Process DuelNullified events (nullifyBattle)
                for (const event of duelNullifiedEvents) {
                    transactions.push({
                        type: 'Duel Nullified',
                        typeClass: 'duel-nullified',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        player: event.args.player,
                        refundAmount: parseFloat(ethers.utils.formatEther(event.args.refundAmount)),
                        duelId: event.args.duelId.toString(),
                        description: `Duel nullified by ${this.formatAddress(event.args.player)} - Refund: ${parseFloat(ethers.utils.formatEther(event.args.refundAmount)).toFixed(4)} ETH (nullifyBattle)`
                    });
                }
                
                // Process ProceedsClaimed events (claimProceeds)
                for (const event of proceedsClaimedEvents) {
                    transactions.push({
                        type: 'Proceeds Claimed',
                        typeClass: 'proceeds-claimed',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        winner: event.args.winner,
                        amount: parseFloat(ethers.utils.formatEther(event.args.amount)),
                        fee: parseFloat(ethers.utils.formatEther(event.args.fee)),
                        duelId: event.args.duelId.toString(),
                        description: `Proceeds claimed by winner ${this.formatAddress(event.args.winner)} - Amount: ${parseFloat(ethers.utils.formatEther(event.args.amount)).toFixed(4)} ETH, Fee: ${parseFloat(ethers.utils.formatEther(event.args.fee)).toFixed(4)} ETH`
                    });
                }

                // Sort transactions by block number
                transactions.sort((a, b) => a.blockNumber - b.blockNumber);
                
                // Cache the result
                this.setCachedData('duelTransactions', duelId, transactions);

                return transactions;
            } catch (contractError) {
                console.error('Error fetching duel transactions from contract:', contractError);
                return []; // Return empty array if there's an error with the contract
            }
        } catch (error) {
            console.error('Error fetching duel transactions:', error);
            throw error;
        }
    }

    // Listen for new duel events
    startEventListening() {
        if (!this.isConnected) return;

        // Listen for duel initiated events (initBattle)
        this.contracts.duelArenaBattle.on('DuelInitiated', (duelId, player1, player2, wager) => {
            this.handleDuelInitiated(duelId, player1, player2, wager);
        });

        // Listen for duel joined events (joinBattle)
        this.contracts.duelArenaBattle.on('DuelJoined', (duelId, player2) => {
            this.handleDuelJoined(duelId, player2);
        });

        // Listen for completed duels (claimProceeds)
        this.contracts.duelArenaBattle.on('DuelCompleted', (duelId, winner, loser, totalWinnings, fee) => {
            this.handleDuelCompleted(duelId, winner, loser, totalWinnings, fee);
        });

        // Listen for nullified duels (nullifyBattle)
        this.contracts.duelArenaBattle.on('DuelNullified', (duelId, player, refundAmount) => {
            this.handleDuelNullified(duelId, player, refundAmount);
        });

        // Listen for proceeds claimed (claimProceeds)
        this.contracts.duelArenaBattle.on('ProceedsClaimed', (duelId, winner, amount, fee) => {
            this.handleProceedsClaimed(duelId, winner, amount, fee);
        });
    }

    // Stop event listening
    stopEventListening() {
        if (this.contracts.duelArenaBattle) {
            this.contracts.duelArenaBattle.removeAllListeners();
        }
    }

    // Handle duel initiated event (initBattle)
    handleDuelInitiated(duelId, player1, player2, wager) {
        console.log('Duel initiated:', { duelId, player1, player2, wager });
        
        // Invalidate relevant caches
        this.invalidateCache('liveFeed');
        this.invalidateCache('duelHistory', player1);
        this.invalidateCache('duelHistory', player2);
        
        // Trigger UI updates
        this.dispatchEvent('duelInitiated', {
            duelId: duelId.toString(),
            player1,
            player2,
            wager: parseFloat(ethers.utils.formatEther(wager)),
            status: 'pending'
        });
    }

    // Handle duel joined event (joinBattle)
    handleDuelJoined(duelId, player2) {
        console.log('Duel joined:', { duelId, player2 });
        
        // Invalidate relevant caches
        this.invalidateCache('liveFeed');
        
        // Trigger UI updates
        this.dispatchEvent('duelJoined', {
            duelId: duelId.toString(),
            player2,
            status: 'active'
        });
    }

    // Handle duel completion event (claimProceeds)
    handleDuelCompleted(duelId, winner, loser, totalWinnings, fee) {
        console.log('Duel completed:', { duelId, winner, loser, totalWinnings, fee });
        
        // Calculate net profit (after 5% fee)
        const netProfit = parseFloat(ethers.utils.formatEther(totalWinnings)) * 0.95;
        
        // Invalidate relevant caches
        this.invalidateCache('liveFeed');
        this.invalidateCache('duelHistory', winner);
        this.invalidateCache('duelHistory', loser);
        this.invalidateCache('walletStats', winner);
        this.invalidateCache('walletStats', loser);
        this.invalidateCache('duelTransactions', duelId.toString());
        
        // Trigger UI updates
        this.dispatchEvent('duelCompleted', {
            duelId: duelId.toString(),
            winner,
            loser,
            totalWinnings: parseFloat(ethers.utils.formatEther(totalWinnings)),
            fee: parseFloat(ethers.utils.formatEther(fee)),
            netProfit
        });
    }

    // Handle duel nullified event (nullifyBattle)
    handleDuelNullified(duelId, player, refundAmount) {
        console.log('Duel nullified:', { duelId, player, refundAmount });
        
        // Invalidate relevant caches
        this.invalidateCache('liveFeed');
        this.invalidateCache('duelTransactions', duelId.toString());
        
        // Trigger UI updates
        this.dispatchEvent('duelNullified', {
            duelId: duelId.toString(),
            player,
            refundAmount: parseFloat(ethers.utils.formatEther(refundAmount)),
            status: 'cancelled'
        });
    }

    // Handle proceeds claimed event (claimProceeds)
    handleProceedsClaimed(duelId, winner, amount, fee) {
        console.log('Proceeds claimed:', { duelId, winner, amount, fee });
        
        // Invalidate relevant caches
        this.invalidateCache('liveFeed');
        this.invalidateCache('duelHistory', winner);
        this.invalidateCache('walletStats', winner);
        this.invalidateCache('duelTransactions', duelId.toString());
        
        // Trigger UI updates
        this.dispatchEvent('proceedsClaimed', {
            duelId: duelId.toString(),
            winner,
            amount: parseFloat(ethers.utils.formatEther(amount)),
            fee: parseFloat(ethers.utils.formatEther(fee))
        });
    }
    
    // Invalidate cache entries
    invalidateCache(type, key = null) {
        if (key) {
            // Remove specific cache entry
            if (this.cache[type].has(key)) {
                this.cache[type].delete(key);
                console.log(`Cache invalidated: ${type} - ${key}`);
            }
            
            // Also check for compound keys (like walletAddress-limit)
            if (type === 'duelHistory') {
                for (const cacheKey of this.cache[type].keys()) {
                    if (cacheKey.startsWith(key)) {
                        this.cache[type].delete(cacheKey);
                        console.log(`Cache invalidated: ${type} - ${cacheKey}`);
                    }
                }
            }
        } else {
            // Clear all entries of this type
            if (type === 'liveFeed') {
                this.cache.liveFeed = null;
                console.log(`Cache invalidated: ${type}`);
            } else {
                this.cache[type].clear();
                console.log(`All ${type} cache entries invalidated`);
            }
        }
        
        // Update localStorage
        this.saveCacheToLocalStorage();
    }

    // Event system for UI updates
    addEventListener(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    removeEventListener(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    dispatchEvent(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in event listener:', error);
                }
            });
        }
    }

    // Utility functions
    formatETH(weiAmount) {
        return parseFloat(ethers.utils.formatEther(weiAmount)).toFixed(3);
    }

    formatAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    // Error handling
    showError(message) {
        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-notification';
        errorDiv.innerHTML = `
            <div class="error-content">
                <span class="error-icon">⚠️</span>
                <span class="error-message">${message}</span>
                <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add styles
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4d4d;
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        // Create success notification
        const successDiv = document.createElement('div');
        successDiv.className = 'success-notification';
        successDiv.innerHTML = `
            <div class="success-content">
                <span class="success-icon">✅</span>
                <span class="success-message">${message}</span>
                <button class="success-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add styles
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #00cc66;
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(successDiv);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (successDiv.parentElement) {
                successDiv.remove();
            }
        }, 3000);
    }
}

// Global instance
window.cambriaWeb3 = new CambriaWeb3();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CambriaWeb3;
}