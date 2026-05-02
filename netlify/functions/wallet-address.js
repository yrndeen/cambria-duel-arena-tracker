const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  // Extract wallet address from path
  const pathParts = event.path.split('/').filter(p => p);
  const walletAddress = pathParts[pathParts.length - 1]?.toLowerCase();
  
  if (!walletAddress || walletAddress === 'wallet-address') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing wallet address' })
    };
  }

  try {
    // Try multiple possible paths for the data file
    const possiblePaths = [
      path.join(__dirname, 'api-data', 'events.json'),
      path.join(__dirname, '..', 'dist', 'api-data', 'events.json'),
      path.join(process.cwd(), 'dist', 'api-data', 'events.json'),
      path.join('/var/task', 'api-data', 'events.json'),
      path.join('/var/task', 'dist', 'api-data', 'events.json')
    ];
    
    let allEvents = [];
    let foundPath = null;
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        allEvents = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    }
    
    if (!foundPath || allEvents.length === 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Data not available',
          tried: possiblePaths
        })
      };
    }

    // Filter events for this wallet
    const walletEvents = allEvents.filter(event => {
      try {
        const payload = JSON.parse(event.payload);
        return (
          payload.player1?.toLowerCase() === walletAddress ||
          payload.player2?.toLowerCase() === walletAddress ||
          payload.winner?.toLowerCase() === walletAddress ||
          payload.loser?.toLowerCase() === walletAddress ||
          payload.payee?.toLowerCase() === walletAddress
        );
      } catch {
        return false;
      }
    });

    // Calculate stats
    const stats = {
      totalDuels: 0,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0,
      winRate: 0
    };

    const duelInitiated = walletEvents.filter(e => 
      e.event_type === 'DuelInitiated' || e.event_type === 'BattleInitialized'
    );
    const duelCompleted = walletEvents.filter(e => 
      e.event_type === 'DuelCompleted' || e.event_type === 'ProceedsClaimed'
    );

    stats.totalDuels = duelInitiated.length;

    duelCompleted.forEach(event => {
      const payload = JSON.parse(event.payload);
      const winnerAddr = payload.winner?.toLowerCase();
      const loserAddr = payload.loser?.toLowerCase();
      
      if (winnerAddr === walletAddress) {
        stats.wins++;
        stats.totalProfit += parseFloat(payload.totalWinnings || 0);
      } else if (loserAddr === walletAddress) {
        stats.losses++;
      }
    });

    // Calculate wagered amount
    duelInitiated.forEach(event => {
      const payload = JSON.parse(event.payload);
      if (payload.wager) {
        stats.totalWagered += parseFloat(payload.wager);
      }
    });

    stats.winRate = stats.totalDuels > 0
      ? (stats.wins / stats.totalDuels * 100).toFixed(2)
      : 0;

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        stats, 
        events: walletEvents.slice(0, 100), // Limit to first 100 events
        totalCount: walletEvents.length,
        address: walletAddress
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message,
        stack: error.stack
      })
    };
  }
};
