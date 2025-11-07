import mysql from 'mysql2/promise';

// Database configuration
const dbConfig = {
  host: 'dev.thevinci.co.in',
  port: 3306,
  user: 'root',
  password: '4v8HX~el1GV.70M',
  database: 'vinci',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 30000, // 30 seconds
  acquireTimeout: 30000, // 30 seconds
  timeout: 60000 // 60 seconds query timeout
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully to:', dbConfig.database);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Execute query helper function
async function query(sql, params) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Get connection from pool (for transactions)
async function getConnection() {
  try {
    return await pool.getConnection();
  } catch (error) {
    console.error('Failed to get database connection:', error);
    throw error;
  }
}

export { pool, query, getConnection, testConnection };
