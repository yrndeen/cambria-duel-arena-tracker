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
            liveFeed: new Map(),
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
this.useStaticData = false; // Set to true to use static JSON export
        
        // Check if API server is available (await waitForApiServerCheck() before first reads if needed)
        this._apiServerCheckPromise = this.checkApiServer();
    }

    async waitForApiServerCheck(timeoutMs = 10000) {
        try {
            await Promise.race([
                this._apiServerCheckPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('api_check_timeout')), timeoutMs)
                )
            ]);
        } catch {
            /* useApiServer reflects last checkApiServer outcome */
        }
    }
    
// Check if API server is available
async checkApiServer() {
try {
const response = await fetch(`${this.apiBaseUrl}/live-feed?page=1&limit=1&includeClaimed=1`, {
method: 'GET',
headers: {
'Content-Type': 'application/json'
}
});

if (response.ok) {
console.log('✅ API server detected');
this.useApiServer = true;
return;
}
} catch (error) {
// API server not available
}

// Try fetching static JSON data
try {
const staticResponse = await fetch('/api/live-feed.json');
if (staticResponse.ok) {
const data = await staticResponse.json();
console.log('✅ Using static data:', data.events?.length || 0, 'events');
this.useApiServer = false;
this.staticData = data;
return;
}
} catch (error) {
// No static data
}

console.log('⚠️ No API server or static data - using direct RPC');
this.useApiServer = false;
this.staticData = null;
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
console.warn('Web3 initialization failed (read-only mode only):', error.message);
// Don't show error on initial load - only needed for wallet interactions
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
                        this.contracts.duelArenaBattle.filters.DuelInitiated(null, walletAddress, null),
                        startBlock,
                        endBlock
                    ),
                    // Query DuelInitiated events for this wallet as player2
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelInitiated(null, null, walletAddress),
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

    // Get leaderboard data (indexer API when available; otherwise empty — no fabricated rows)
    async getLeaderboardData(sortBy = 'profit') {
        try {
            if (this.useApiServer) {
                try {
                    const response = await fetch(
                        `${this.apiBaseUrl}/leaderboard?sort=${encodeURIComponent(sortBy)}&limit=50`,
                        {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    if (response.ok) {
                        const result = await response.json();
                        return Array.isArray(result) ? result : [];
                    }
                } catch (apiErr) {
                    console.log('Leaderboard API error:', apiErr);
                }
            }

            if (!this.isConnected) {
                return [];
            }

            return [];
        } catch (error) {
            console.error('Error fetching leaderboard data:', error);
            return [];
        }
    }

    emptyStatisticsPayload() {
        return {
            totalDuels: 0,
            activePlayers: 0,
            totalVolume: 0,
            totalETHWon: 0,
            averageDuelSize: 0,
            mostCommonDuelAmount: 0,
            mostCommonPct: 0,
            largestSingleDuel: 0,
            largestDuelId: null,
            totalFees: 0,
            averageWinRate: null,
            winRateDistribution: { '40-50%': 0, '50-60%': 0, '60-70%': 0, '70-80%': 0, '80%+': 0 },
            volumeHistory: Array(10).fill(0),
            topPerformerWinRate: null,
            topPerformerAddr: null,
            source: 'unavailable'
        };
    }

    // Get ecosystem statistics (indexer API first; escrow totals only as partial fallback)
    async getEcosystemStats() {
        try {
            if (this.useApiServer) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/statistics`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (response.ok) {
                        return await response.json();
                    }
                } catch (apiErr) {
                    console.log('Statistics API error:', apiErr);
                }
            }

            if (!this.isConnected) {
                return this.emptyStatisticsPayload();
            }

            const totalFees = await this.contracts.duelArenaEscrow.getTotalFees();
            const base = this.emptyStatisticsPayload();
            base.totalFees = parseFloat(ethers.utils.formatEther(totalFees));
            base.source = 'escrow_only';
            return base;
        } catch (error) {
            console.error('Error fetching ecosystem stats:', error);
            return this.emptyStatisticsPayload();
        }
    }

    /** Map API duel-tx payload to modal-friendly types (server uses slightly different labels). */
    normalizeDuelTransactionsFromApi(transactions) {
        if (!Array.isArray(transactions)) return [];
        return transactions.map((tx) => {
            if (tx.type === 'Duel Started') {
                return {
                    ...tx,
                    type: 'Duel Initiation',
                    typeClass: 'duel-initiated',
                    status: 'Pending',
                    functionName: 'initBattle',
                    duelId: String(tx.duelId || tx.duel_id || '')
                };
            }
            if (tx.type === 'Duel Joined') {
                return {
                    ...tx,
                    type: 'Duel Joining',
                    typeClass: 'duel-joined',
                    status: 'Active',
                    functionName: 'joinBattle',
                    player2: tx.player2 || tx.player,
                    wager: tx.wager != null && !Number.isNaN(tx.wager) ? tx.wager : 0,
                    duelId: String(tx.duelId || tx.duel_id || '')
                };
            }
            if (tx.type === 'Duel Completed') {
                return {
                    ...tx,
                    type: 'Duel Completion',
                    typeClass: 'duel-completed',
                    status: 'Completed',
                    functionName: 'claimProceeds',
                    duelId: String(tx.duelId || tx.duel_id || '')
                };
            }
            if (tx.type === 'Duel Nullified') {
                return {
                    ...tx,
                    type: 'Duel Cancellation',
                    typeClass: 'duel-nullified',
                    status: 'Cancelled',
                    functionName: 'nullifyBattle',
                    duelId: String(tx.duelId || tx.duel_id || '')
                };
            }
            return tx;
        });
    }

    /**
     * Remove duels that already have ProceedsClaimed on-chain (recent window), so the feed
     * matches the “open queue” behavior: show work still pending claim, not settled payouts.
     */
    async excludeProceedsClaimedDuels(duels) {
        if (!duels.length) return [];
        try {
            const latestBlock = await this.provider.getBlockNumber();
            const fromBlock = Math.max(0, latestBlock - 100000);
            const claimedEvents = await this.contracts.duelArenaBattle.queryFilter(
                this.contracts.duelArenaBattle.filters.ProceedsClaimed(),
                fromBlock,
                latestBlock
            );
            const claimedIds = new Set(claimedEvents.map((e) => e.args.duelId.toString()));
            return duels.filter((d) => !claimedIds.has(String(d.id)));
        } catch (e) {
            console.warn('excludeProceedsClaimedDuels: could not filter, returning full list', e);
            return duels;
        }
    }

    // Get recent duel activity using contract's getBattle method
    async getRecentDuelActivityFromContract(limit = 20) {
        try {
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            // Get the next battle ID to know how many battles exist
            const nextBattleId = await this.getNextBattleId();
            const totalBattles = parseInt(nextBattleId) - 1; // nextBattleId is 1-indexed
            
            if (totalBattles <= 0) {
                return []; // No battles exist yet
            }

            // Get recent battles starting from the latest
            const startId = Math.max(1, totalBattles - limit + 1);
            const endId = totalBattles;
            
            const duels = [];
            
            // Fetch battles in parallel
            const battlePromises = [];
            for (let i = startId; i <= endId; i++) {
                battlePromises.push(this.getBattle(i));
            }
            
            const battles = await Promise.all(battlePromises);
            
            // Process each battle
            for (const battle of battles) {
                if (battle && battle.player1 !== '0x0000000000000000000000000000000000000000') {
                    duels.push({
                        id: battle.battleId,
                        player1: battle.player1,
                        player2: battle.player2,
                        wager: battle.wager,
                        status: battle.status,
                        createdAt: battle.createdAt,
                        winner: null,
                        loser: null,
                        netProfit: 0
                    });
                }
            }
            
            const includeClaimed =
                typeof CONFIG !== 'undefined' &&
                CONFIG.UI &&
                CONFIG.UI.LIVE_FEED_INCLUDE_CLAIMED !== false;
            // Sort by creation time (newest first), optionally drop claimed payouts
            duels.sort((a, b) => parseInt(b.createdAt, 10) - parseInt(a.createdAt, 10));
            let out = duels;
            if (!includeClaimed) {
                out = await this.excludeProceedsClaimedDuels(duels);
            }
            return out.slice(0, limit);
            
        } catch (error) {
            console.error('Error fetching recent duel activity from contract:', error);
            return [];
        }
    }

    emptyLiveFeedPage(page, pageSize, total = 0) {
        const pg = Math.max(1, page);
        const ps = Math.max(1, pageSize);
        const totalPages = total > 0 ? Math.ceil(total / ps) : 0;
        return {
            total,
            page: pg,
            pageSize: ps,
            totalPages,
            hasNext: false,
            hasPrevious: pg > 1,
            duels: []
        };
    }

    normalizeLiveFeedPageResponse(body, pageFallback, pageSizeFallback) {
        if (Array.isArray(body)) {
            const duels = body;
            return {
                total: duels.length,
                page: 1,
                pageSize: duels.length || pageSizeFallback,
                totalPages: duels.length ? 1 : 0,
                hasNext: false,
                hasPrevious: false,
                duels
            };
        }
        const total = body.total != null ? Number(body.total) : 0;
        const page = Math.max(1, Number(body.page) || pageFallback);
        const pageSize = Math.max(1, Number(body.pageSize) || pageSizeFallback);
        const totalPages =
            body.totalPages != null
                ? Number(body.totalPages)
                : total > 0
                  ? Math.ceil(total / pageSize)
                  : 0;
        return {
            total,
            page,
            pageSize,
            totalPages,
            hasNext: Boolean(body.hasNext != null ? body.hasNext : page * pageSize < total),
            hasPrevious: Boolean(body.hasPrevious != null ? body.hasPrevious : page > 1),
            duels: Array.isArray(body.duels) ? body.duels : []
        };
    }

    /**
     * Paginated live feed from chain (newest battle id first). Mirrors server RPC helper.
     */
    async getLiveFeedPageFromChain({ page, pageSize, includeClaimed }) {
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const size = Math.min(200, Math.max(1, parseInt(String(pageSize), 10) || 100));
        const offset = (pageNum - 1) * size;

        const nextIdBn = await this.contracts.duelArenaBattle.nextBattleId();
        const totalBattles = Math.max(0, nextIdBn.toNumber() - 1);

        const ids = [];
        for (let k = 0; k < size; k++) {
            const id = totalBattles - offset - k;
            if (id >= 1) ids.push(id);
        }

        if (!ids.length) {
            const totalPagesEmpty = totalBattles > 0 ? Math.ceil(totalBattles / size) : 0;
            return {
                total: totalBattles,
                page: pageNum,
                pageSize: size,
                totalPages: totalPagesEmpty,
                hasNext: pageNum * size < totalBattles,
                hasPrevious: pageNum > 1,
                duels: []
            };
        }

        const latestBlock = await this.provider.getBlockNumber();
        const battles = await Promise.all(ids.map((id) => this.contracts.duelArenaBattle.getBattle(id)));
        const completedLists = await Promise.all(
            ids.map((id) =>
                this.contracts.duelArenaBattle.queryFilter(this.contracts.duelArenaBattle.filters.DuelCompleted(id))
            )
        );

        let claimedIds = null;
        if (!includeClaimed) {
            const claimed = await this.contracts.duelArenaBattle.queryFilter(
                this.contracts.duelArenaBattle.filters.ProceedsClaimed(),
                Math.max(0, latestBlock - 500000),
                latestBlock
            );
            claimedIds = new Set(claimed.map((e) => e.args.duelId.toString()));
        }

        const statusLabels = ['pending', 'active', 'completed', 'cancelled'];
        const duels = [];

        for (let i = 0; i < ids.length; i++) {
            const duelId = String(ids[i]);
            if (claimedIds && claimedIds.has(duelId)) {
                continue;
            }

            const b = battles[i];
            if (!b || b.player1 === ethers.constants.AddressZero) {
                continue;
            }

            const statusNum =
                typeof b.status === 'number'
                    ? b.status
                    : b.status != null && typeof b.status.toNumber === 'function'
                      ? b.status.toNumber()
                      : Number(b.status);
            let status = statusLabels[statusNum] || 'unknown';
            let winner = null;
            let loser = null;
            const cev = completedLists[i][0];
            if (cev) {
                winner = cev.args.winner;
                loser = cev.args.loser;
                status = 'completed';
            }

            const createdAt = b.createdAt ? b.createdAt.toNumber() : 0;

            duels.push({
                id: duelId,
                player1: b.player1,
                player2: b.player2,
                wager: parseFloat(ethers.utils.formatEther(b.wager)),
                winner,
                loser,
                status,
                timestamp: createdAt,
                transactionHash: cev ? cev.transactionHash : null,
                blockNumber: createdAt
            });
        }

        const totalPages = totalBattles > 0 ? Math.ceil(totalBattles / size) : 0;
        return {
            total: totalBattles,
            page: pageNum,
            pageSize: size,
            totalPages,
            hasNext: offset + ids.length < totalBattles,
            hasPrevious: pageNum > 1,
            duels
        };
    }

    /**
     * Paginated duel activity (newest first). Prefer API; else RPC by battle id.
     * @returns {{ total, page, pageSize, totalPages, hasNext, hasPrevious, duels }}
     */
    async getLiveFeedPage({ page = 1, pageSize } = {}) {
        try {
            const includeClaimed =
                typeof CONFIG !== 'undefined' &&
                CONFIG.UI &&
                CONFIG.UI.LIVE_FEED_INCLUDE_CLAIMED !== false;
            const ps =
                pageSize ||
                (typeof CONFIG !== 'undefined' && CONFIG.UI && CONFIG.UI.LIVE_FEED_PAGE_SIZE) ||
                100;
            const pg = Math.max(1, parseInt(String(page), 10) || 1);

            if (!(this.cache.liveFeed instanceof Map)) {
                this.cache.liveFeed = new Map();
            }

            const cacheKey = `liveFeed-p${pg}-s${ps}-${includeClaimed ? 'all' : 'open'}`;
            const cached = this.getCachedData('liveFeed', cacheKey);
            if (cached && Array.isArray(cached.duels)) {
                console.log('Using cached live feed page');
                return cached;
            }

// Use static data if available
if (this.staticData && this.staticData.events) {
const ps = pageSize || 100;
const pg = page || 1;
const offset = (pg - 1) * ps;
const paginatedEvents = this.staticData.events.slice(offset, offset + ps);

return {
total: this.staticData.events.length,
page: pg,
pageSize: ps,
totalPages: Math.ceil(this.staticData.events.length / ps),
hasNext: offset + ps < this.staticData.events.length,
hasPrevious: pg > 1,
duels: paginatedEvents
};
}

if (this.useApiServer) {
try {
const q = `page=${pg}&limit=${ps}&includeClaimed=${includeClaimed ? '1' : '0'}`;
const response = await fetch(`${this.apiBaseUrl}/live-feed?${q}`, {
method: 'GET',
headers: { 'Content-Type': 'application/json' }
});
                    if (response.ok) {
                        const body = await response.json();
                        const normalized = this.normalizeLiveFeedPageResponse(body, pg, ps);
                        this.setCachedData('liveFeed', cacheKey, normalized);
                        return normalized;
                    }
                    console.log('Live feed API error, falling back to chain');
                } catch (apiError) {
                    console.log('Live feed API error:', apiError);
                }
            }

            if (!this.isConnected) {
                return this.emptyLiveFeedPage(pg, ps);
            }

            const fromChain = await this.getLiveFeedPageFromChain({
                page: pg,
                pageSize: ps,
                includeClaimed
            });
            this.setCachedData('liveFeed', cacheKey, fromChain);
            return fromChain;
        } catch (error) {
            console.error('Error fetching live feed page:', error);
            const ps =
                pageSize ||
                (typeof CONFIG !== 'undefined' && CONFIG.UI && CONFIG.UI.LIVE_FEED_PAGE_SIZE) ||
                100;
            return this.emptyLiveFeedPage(page, ps);
        }
    }

    /** @deprecated Prefer getLiveFeedPage; returns duels array only (page 1). */
    async getRecentDuelActivity(limit = 20) {
        const r = await this.getLiveFeedPage({ page: 1, pageSize: limit });
        return r.duels || [];
    }

    // Generate transaction link for Abstract L2
    generateTransactionLink(txHash) {
        return `${CONFIG.EXPLORER_URL}/tx/${txHash}`;
    }

    // Generate wallet link for Abstract L2
    generateWalletLink(walletAddress) {
        return `${CONFIG.EXPLORER_URL}/address/${walletAddress}`;
    }

    // Get battle information by ID
    async getBattle(battleId) {
        try {
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            const battleInfo = await this.contracts.duelArenaBattle.getBattle(battleId);
            
            return {
                battleId: battleId.toString(),
                player1: battleInfo.player1,
                player2: battleInfo.player2,
                wager: parseFloat(ethers.utils.formatEther(battleInfo.wager)),
                status: this.getStatusFromNumber(battleInfo.status),
                createdAt: battleInfo.createdAt.toString()
            };
        } catch (error) {
            console.error('Error fetching battle info:', error);
            throw error;
        }
    }

    // Get next battle ID
    async getNextBattleId() {
        try {
            if (!this.isConnected) {
                throw new Error('Web3 not connected');
            }

            const nextId = await this.contracts.duelArenaBattle.nextBattleId();
            return nextId.toString();
        } catch (error) {
            console.error('Error fetching next battle ID:', error);
            throw error;
        }
    }

    // Convert status number to string
    getStatusFromNumber(statusNumber) {
        switch (statusNumber) {
            case 0: return 'pending';
            case 1: return 'active';
            case 2: return 'completed';
            case 3: return 'cancelled';
            default: return 'unknown';
        }
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
            
            // Load live feed cache (Map of cacheKey -> { data, timestamp })
            const liveFeedCache = localStorage.getItem('cambriaLiveFeedCache');
            this.cache.liveFeed = new Map();
            if (liveFeedCache) {
                try {
                    const parsed = JSON.parse(liveFeedCache);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        Object.entries(parsed).forEach(([key, entry]) => {
                            if (entry && entry.data !== undefined) {
                                this.cache.liveFeed.set(key, entry);
                            }
                        });
                    }
                } catch {
                    /* ignore legacy shape */
                }
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
            if (this.cache.liveFeed instanceof Map && this.cache.liveFeed.size > 0) {
                const liveFeedObj = {};
                this.cache.liveFeed.forEach((value, key) => {
                    liveFeedObj[key] = value;
                });
                localStorage.setItem('cambriaLiveFeedCache', JSON.stringify(liveFeedObj));
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
                        const normalized = this.normalizeDuelTransactionsFromApi(result);
                        
                        // Cache the result
                        this.setCachedData('duelTransactions', duelId, normalized);
                        
                        return normalized;
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
                // Query only the 3 specific transaction types for the modal
                const [
                    duelInitiatedEvents,
                    duelJoinedEvents,
                    duelCompletedEvents,
                    duelNullifiedEvents
                ] = await Promise.all([
                    // 1. DuelInitiated event (initBattle function) → Status: Pending
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelInitiated(duelId)
                    ),
                    // 2. DuelJoined event (joinBattle function) → Status: Active
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelJoined(duelId)
                    ),
                    // 3a. DuelCompleted event (claimProceeds function) → Status: Completed
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelCompleted(duelId)
                    ),
                    // 3b. DuelNullified event (nullifyBattle function) → Status: Cancelled
                    this.contracts.duelArenaBattle.queryFilter(
                        this.contracts.duelArenaBattle.filters.DuelNullified(duelId)
                    )
                ]);
                
                // Process events into exactly 3 transaction boxes
                const transactions = [];
                
                // Box 1: Duel Initiation (initBattle) → Status: Pending
                for (const event of duelInitiatedEvents) {
                    transactions.push({
                        type: 'Duel Initiation',
                        typeClass: 'duel-initiated',
                        status: 'Pending',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        player1: event.args.player1,
                        player2: event.args.player2,
                        wager: parseFloat(ethers.utils.formatEther(event.args.wager)),
                        duelId: event.args.duelId.toString(),
                        description: `Player ${this.formatAddress(event.args.player1)} initiated duel with ${this.formatAddress(event.args.player2)}`,
                        functionName: 'initBattle'
                    });
                }
                
                // Box 2: Duel Joining (joinBattle) → Status: Active
                for (const event of duelJoinedEvents) {
                    // Get wager info from the battle data
                    let wager = 0;
                    try {
                        const battleInfo = await this.getBattle(event.args.duelId);
                        wager = battleInfo.wager;
                    } catch (error) {
                        console.log('Could not fetch wager for duel joining event:', error);
                    }

                    transactions.push({
                        type: 'Duel Joining',
                        typeClass: 'duel-joined',
                        status: 'Active',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        player2: event.args.player2,
                        wager: wager,
                        duelId: event.args.duelId.toString(),
                        description: `Player ${this.formatAddress(event.args.player2)} joined the duel`,
                        functionName: 'joinBattle'
                    });
                }
                
                // Box 3a: Duel Completion (claimProceeds) → Status: Completed
                for (const event of duelCompletedEvents) {
                    transactions.push({
                        type: 'Duel Completion',
                        typeClass: 'duel-completed',
                        status: 'Completed',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        winner: event.args.winner,
                        loser: event.args.loser,
                        totalWinnings: parseFloat(ethers.utils.formatEther(event.args.totalWinnings)),
                        fee: parseFloat(ethers.utils.formatEther(event.args.fee)),
                        duelId: event.args.duelId.toString(),
                        description: `Duel completed - Winner: ${this.formatAddress(event.args.winner)}`,
                        functionName: 'claimProceeds'
                    });
                }
                
                // Box 3b: Duel Cancellation (nullifyBattle) → Status: Cancelled
                for (const event of duelNullifiedEvents) {
                    transactions.push({
                        type: 'Duel Cancellation',
                        typeClass: 'duel-nullified',
                        status: 'Cancelled',
                        transactionHash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        player: event.args.player,
                        refundAmount: parseFloat(ethers.utils.formatEther(event.args.refundAmount)),
                        duelId: event.args.duelId.toString(),
                        description: `Duel cancelled by ${this.formatAddress(event.args.player)} - Refund: ${parseFloat(ethers.utils.formatEther(event.args.refundAmount)).toFixed(4)} ETH`,
                        functionName: 'nullifyBattle'
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
                this.cache.liveFeed = new Map();
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