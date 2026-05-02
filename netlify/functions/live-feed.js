const { openDb, getEventCount } = require('../../lib/db');
const CONFIG = require('../../config');

exports.handler = async (event, context) => {
  const db = openDb(CONFIG);
  
  const page = parseInt(event.queryStringParameters.page || '1');
  const limit = parseInt(event.queryStringParameters.limit || '20');
  const includeClaimed = event.queryStringParameters.includeClaimed === '1';
  
  const offset = (page - 1) * limit;
  
  try {
    let query = `
      SELECT * FROM chain_events 
      ORDER BY block_number DESC, log_index DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const events = db.prepare(query).all();
    const total = getEventCount(db);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        events,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
