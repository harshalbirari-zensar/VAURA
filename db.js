import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration - ALL VALUES FROM ENVIRONMENT VARIABLES
const dbConfig = {
  host: process.env.MYSQL_HOST || process.env.DB_HOST || 'dev.thevinci.co.in',
  port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306'),
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'vinci',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 30000, // 30 seconds
  acquireTimeout: 30000, // 30 seconds
  timeout: 60000 // 60 seconds query timeout
};

// Security check: warn if no password is set
if (!dbConfig.password) {
  console.warn('⚠️  WARNING: MySQL password not set in environment variables!');
  console.warn('   Set MYSQL_PASSWORD or DB_PASSWORD in .env file');
}

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    // Log to file only, no console output
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
