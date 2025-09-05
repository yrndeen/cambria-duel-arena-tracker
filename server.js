// Cambria Duel Arena API Server
// Simple Express server for caching blockchain data

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const NodeCache = require('node-cache');
const CONFIG = require('./config');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize cache
const cache = new NodeCache({
    stdTTL: 300, // 5 minutes default TTL
    checkperiod: 60 // Check for expired keys every 60 seconds
});

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);

// Initialize contracts
const duelArenaBattle = new ethers.Contract(
    CONFIG.CONTRACTS.DUEL_ARENA_BATTLE,
    CONFIG.ABIS.DUEL_ARENA_BATTLE,
    provider
);

const duelArenaEscrow = new ethers.Contract(
    CONFIG.CONTRACTS.DUEL_ARENA_ESCROW,
    CONFIG.ABIS.DUEL_ARENA_ESCROW,
    provider
);

// API Routes
app.get('/api/wallet/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        // Check cache first
        const cacheKey = `wallet-${address}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached data for wallet ${address}`);
            return res.json(cachedData);
        }
        
        // Get wallet stats from contract
        const playerStats = await duelArenaBattle.getPlayerStats(address);
        
        // Calculate net profit (after 5% fee)
        const totalWagered = parseFloat(ethers.utils.formatEther(playerStats.totalWagered || 0));
        const totalProfit = parseFloat(ethers.utils.formatEther(playerStats.totalProfit || 0));
        const netProfit = totalProfit * 0.95; // Apply 5% fee deduction
        
        // Calculate total ETH won (before fees)
        const totalETHWon = totalProfit; // This is the total ETH won before fees
        
        // Get total duels and wins
        const totalDuels = playerStats.totalDuels ? playerStats.totalDuels.toNumber() : 0;
        const wins = playerStats.wins ? playerStats.wins.toNumber() : 0;
        const losses = totalDuels - wins;
        
        // Calculate win rate
        const winRate = totalDuels > 0 ? (wins / totalDuels * 100).toFixed(1) : "0.0";
        
        const result = {
            address,
            totalDuels,
            wins,
            losses,
            totalWagered,
            totalETHWon,
            totalProfit,
            netProfit,
            winRate
        };
        
        // Cache the result
        cache.set(cacheKey, result);
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching wallet stats:', error);
        res.status(500).json({ error: 'Failed to fetch wallet stats' });
    }
});

app.get('/api/duels/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const page = parseInt(req.query.page) || 1;
        
        // Check cache first
        const cacheKey = `duels-${address}-${limit}-${page}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached data for duels of wallet ${address}`);
            return res.json(cachedData);
        }
        
        // Calculate block ranges for pagination
        const blockWindow = 10000; // 10k blocks per query
        const latestBlock = await provider.getBlockNumber();
        const startBlock = Math.max(0, latestBlock - blockWindow * page);
        const endBlock = page === 1 ? latestBlock : startBlock + blockWindow;
        
        console.log(`Querying blocks ${startBlock} to ${endBlock} for wallet ${address}`);
        
        // Batch queries for better performance
        const [
            duelStartedEventsAsPlayer1,
            duelStartedEventsAsPlayer2
        ] = await Promise.all([
            // Query past DuelStarted events for this wallet as player1
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelStarted(null, address),
                startBlock,
                endBlock
            ),
            // Also check if wallet was player2
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelStarted(address, null),
                startBlock,
                endBlock
            )
        ]);
        
        // Combine and process events
        const allEvents = [...duelStartedEventsAsPlayer1, ...duelStartedEventsAsPlayer2];
        
        // If no events found, return empty array
        if (allEvents.length === 0) {
            const emptyResult = { duels: [], hasMore: false };
            cache.set(cacheKey, emptyResult);
            return res.json(emptyResult);
        }
        
        // Sort events by block number (newest first) and limit
        allEvents.sort((a, b) => b.blockNumber - a.blockNumber);
        const paginatedEvents = allEvents.slice(0, limit);
        const hasMore = allEvents.length > limit;
        
        // Prepare duel IDs for batch query
        const duelIds = paginatedEvents.map(event => event.args.duelId.toString());
        
        // Batch query for completed duels
        const completedEventsPromises = duelIds.map(duelId => 
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelCompleted(duelId)
            )
        );
        
        // Wait for all queries to complete
        const completedEventsResults = await Promise.all(completedEventsPromises);
        
        // Map completed events by duel ID for quick lookup
        const completedEventsByDuelId = {};
        completedEventsResults.forEach((events, index) => {
            if (events.length > 0) {
                completedEventsByDuelId[duelIds[index]] = events[0];
            }
        });
        
        const duels = [];
        
        for (const event of paginatedEvents) {
            const duelId = event.args.duelId.toString();
            const player1 = event.args.player1;
            const player2 = event.args.player2;
            const wager = parseFloat(ethers.utils.formatEther(event.args.wager));
            const currentPlayer = address; // Store the current player for UI display
            
            let winner = null;
            let loser = null;
            let netProfit = 0;
            let status = 'pending';
            let transactionHash = event.transactionHash;
            
            // Check if we have a completed event for this duel
            const completedEvent = completedEventsByDuelId[duelId];
            if (completedEvent) {
                winner = completedEvent.args.winner;
                loser = completedEvent.args.loser;
                status = 'completed';
                
                // Calculate net profit (after 5% fee)
                if (winner.toLowerCase() === address.toLowerCase()) {
                    netProfit = wager * 1.9; // 2 * wager - 0.1 * wager (5% fee on total winnings)
                } else {
                    netProfit = -wager; // Lost the wager
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
        cache.set(cacheKey, result);
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching duel history:', error);
        res.status(500).json({ error: 'Failed to fetch duel history' });
    }
});

app.get('/api/live-feed', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        // Check cache first
        const cacheKey = `live-feed-${limit}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log('Using cached live feed data');
            return res.json(cachedData);
        }
        
        // Get latest block number
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 10000); // Last 10k blocks for recent activity
        
        // Get recent DuelStarted events
        const duelStartedFilter = duelArenaBattle.filters.DuelStarted();
        const duelStartedEvents = await duelArenaBattle.queryFilter(duelStartedFilter, fromBlock, latestBlock);
        
        if (duelStartedEvents.length === 0) {
            cache.set(cacheKey, []);
            return res.json([]);
        }
        
        // Sort events by block number (newest first) and limit
        duelStartedEvents.sort((a, b) => b.blockNumber - a.blockNumber);
        const recentEvents = duelStartedEvents.slice(0, limit);
        
        // Prepare duel IDs for batch query
        const duelIds = recentEvents.map(event => event.args.duelId.toString());
        
        // Batch query for completed duels
        const completedEventsPromises = duelIds.map(duelId => 
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelCompleted(duelId)
            )
        );
        
        // Wait for all queries to complete
        const completedEventsResults = await Promise.all(completedEventsPromises);
        
        // Map completed events by duel ID for quick lookup
        const completedEventsByDuelId = {};
        completedEventsResults.forEach((events, index) => {
            if (events.length > 0) {
                completedEventsByDuelId[duelIds[index]] = events[0];
            }
        });
        
        const duels = [];
        
        for (const event of recentEvents) {
            const duelId = event.args.duelId.toString();
            const player1 = event.args.player1;
            const player2 = event.args.player2;
            const wager = parseFloat(ethers.utils.formatEther(event.args.wager));
            
            let winner = null;
            let loser = null;
            let status = 'pending';
            let transactionHash = event.transactionHash;
            
            // Check if we have a completed event for this duel
            const completedEvent = completedEventsByDuelId[duelId];
            if (completedEvent) {
                winner = completedEvent.args.winner;
                loser = completedEvent.args.loser;
                status = 'completed';
            }
            
            duels.push({
                id: duelId,
                player1,
                player2,
                wager,
                winner,
                loser,
                status,
                timestamp: event.blockNumber,
                transactionHash,
                blockNumber: event.blockNumber
            });
        }
        
        // Cache the result
        cache.set(cacheKey, duels);
        
        res.json(duels);
    } catch (error) {
        console.error('Error fetching live feed:', error);
        res.status(500).json({ error: 'Failed to fetch live feed' });
    }
});

app.get('/api/duel/:duelId/transactions', async (req, res) => {
    try {
        const { duelId } = req.params;
        
        // Check cache first
        const cacheKey = `duel-transactions-${duelId}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            console.log(`Using cached transactions for duel ${duelId}`);
            return res.json(cachedData);
        }
        
        // Batch all event queries in parallel
        const [
            duelStartedEvents,
            wagerDepositedEvents,
            duelCompletedEvents,
            fundsReleasedEvents
        ] = await Promise.all([
            // Get DuelStarted event
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelStarted(duelId)
            ),
            // Get WagerDeposited events
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.WagerDeposited(duelId)
            ),
            // Get DuelCompleted event
            duelArenaBattle.queryFilter(
                duelArenaBattle.filters.DuelCompleted(duelId)
            ),
            // Get FundsReleased events
            duelArenaEscrow.queryFilter(
                duelArenaEscrow.filters.FundsReleased(duelId)
            )
        ]);
        
        // Process all events into transactions array
        const transactions = [];
        
        // Process DuelStarted events
        for (const event of duelStartedEvents) {
            transactions.push({
                type: 'Duel Started',
                typeClass: 'join-battle',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                player1: event.args.player1,
                player2: event.args.player2,
                wager: parseFloat(ethers.utils.formatEther(event.args.wager)),
                duelId: event.args.duelId.toString(),
                description: 'Duel initiated between players'
            });
        }
        
        // Process WagerDeposited events
        for (const event of wagerDepositedEvents) {
            transactions.push({
                type: 'Wager Deposited',
                typeClass: 'join-battle',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                player: event.args.player,
                amount: parseFloat(ethers.utils.formatEther(event.args.amount)),
                duelId: event.args.duelId.toString(),
                description: `Player ${formatAddress(event.args.player)} deposited wager`
            });
        }
        
        // Process DuelCompleted events
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
                description: `Duel completed - Winner: ${formatAddress(event.args.winner)}`
            });
        }
        
        // Process FundsReleased events
        for (const event of fundsReleasedEvents) {
            transactions.push({
                type: 'Funds Released',
                typeClass: 'funds-released',
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                winner: event.args.winner,
                amount: parseFloat(ethers.utils.formatEther(event.args.amount)),
                fee: parseFloat(ethers.utils.formatEther(event.args.fee)),
                duelId: event.args.duelId.toString(),
                description: `Funds released to winner ${formatAddress(event.args.winner)}`
            });
        }

        // Sort transactions by block number
        transactions.sort((a, b) => a.blockNumber - b.blockNumber);
        
        // Cache the result
        cache.set(cacheKey, transactions);
        
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching duel transactions:', error);
        res.status(500).json({ error: 'Failed to fetch duel transactions' });
    }
});

// Helper function to format addresses
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Start the server
app.listen(port, () => {
    console.log(`Cambria Duel Arena API server running on port ${port}`);
    console.log(`Access the frontend at http://localhost:${port}`);
});