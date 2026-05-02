const { openDb } = require('../../lib/db');
const CONFIG = require('../../config');

exports.handler = async (event, context) => {
  const db = openDb(CONFIG);
  
  // Get wallet address from path or query parameter
  let walletAddress = event.pathParameters?.address || event.queryStringParameters?.address;
  
  if (!walletAddress) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Wallet address required' })
    };
  }
  
  walletAddress = walletAddress.toLowerCase();

  try {
    // Get all events for this wallet
    const events = db.prepare(`
      SELECT * FROM chain_events
      WHERE payload LIKE ?
      ORDER BY block_number DESC
    `).all(`%${walletAddress}%`);

    // Calculate stats
    const stats = {
      totalDuels: 0,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0,
      winRate: 0
    };

    const duelInitiated = events.filter(e => e.event_type === 'DuelInitiated' || e.event_type === 'BattleInitialized');
    const duelCompleted = events.filter(e => e.event_type === 'DuelCompleted' || e.event_type === 'ProceedsClaimed');

    stats.totalDuels = duelInitiated.length;

    duelCompleted.forEach(event => {
      const payload = JSON.parse(event.payload);
      if (payload.winner === walletAddress) {
        stats.wins++;
        stats.totalProfit += parseFloat(payload.totalWinnings || 0);
      } else if (payload.loser === walletAddress) {
        stats.losses++;
      }
    });

    stats.winRate = stats.totalDuels > 0
      ? (stats.wins / stats.totalDuels * 100).toFixed(2)
      : 0;

    return {
      statusCode: 200,
      body: JSON.stringify({ stats, events })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
