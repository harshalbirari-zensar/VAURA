import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

// Initialize Sequelize with MySQL connection
const sequelize = new Sequelize(
  process.env.DB_NAME || 'vinci',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'vinci',
  {
    host: process.env.DB_HOST || '172.17.7.133',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: (msg) => logger.debug(`Sequelize: ${msg}`),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: false, // Most Vinci tables don't use Sequelize timestamps
      freezeTableName: true // Use table name as is, don't pluralize
    }
  }
);

// Test database connection
export async function testSequelizeConnection() {
  try {
    await sequelize.authenticate();
    logger.info('✅ Sequelize connected successfully to MySQL database');
    return true;
  } catch (error) {
    logger.error('❌ Sequelize connection failed:', error.message);
    return false;
  }
}

// Sync all models (create tables if they don't exist)
export async function syncModels(options = {}) {
  try {
    await sequelize.sync(options);
    logger.info('✅ Sequelize models synchronized');
    return true;
  } catch (error) {
    logger.error('❌ Sequelize sync failed:', error.message);
    return false;
  }
}

export default sequelize;
