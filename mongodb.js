import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

// Construct MongoDB URI from environment variables or use provided URI
const MONGODB_URI = process.env.MONGODB_URI || 
  (process.env.MONGODB_USER && process.env.MONGODB_PASSWORD 
    ? `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST || '172.17.7.133'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'VINCI'}`
    : `mongodb://${process.env.MONGODB_HOST || '172.17.7.133'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'VINCI'}`
  );

// Security check: warn if using default/no authentication
if (!MONGODB_URI.includes('@') && !process.env.MONGODB_URI) {
  console.warn('⚠️  WARNING: MongoDB is configured without authentication!');
  console.warn('   Set MONGODB_URI or MONGODB_USER/MONGODB_PASSWORD in .env file');
}
const DB_NAME = 'VINCI';

let client = null;
let db = null;

// MongoDB Collections for IT Operations (Real VINCI Database Collections)
const COLLECTIONS = {
  // Core IT Operations
  ALERTS: 'Alerts',
  EVENTS: 'Events',
  SITUATIONS: 'Situations',
  SITUATIONS_FUTURE: 'SituationsFuture',
  BUSINESS_SERVICE: 'BusinessService',
  
  // CMDB Related
  CMDB_STORE: 'CMDBStore',
  CI_DETAILS: 'CIDetails',
  CI_INVENTORY: 'CI_Inventory',
  CI_STATUS: 'CI_Status',
  CI_TYPES: 'CI_Types',
  CI_GROUPS: 'CI_Groups',
  CI_CATEGORY: 'CI_Category',
  CI_AGE: 'CI_Age',
  CI_DISCOVERY: 'CI_Discovery',
  CI_SYNC: 'CI_Sync',
  CMDB_RELATIONS: 'CMDBRelations',
  CMDB_RELATION_TYPES: 'CMDBRelationTypes',
  TOPOLOGY: 'Topology',
  NOISY_CI: 'NoisyCI',
  
  // Incident Management
  INCIDENT_HISTORY: 'IncidentHistory',
  INCIDENT_CATEGORY: 'IncidentCategory',
  INCIDENT_PREDICTION: 'IncidentPrediction',
  CI_INCIDENT_GENERATOR: 'CI_IncidentGenerator',
  
  // Knowledge Base
  KB_ARTICLE_DETAILS: 'KBArticleDetails',
  KI_DETAILS: 'KIDetails',
  KI_STATISTICS: 'KIStatistics',
  KI_SITUATION_STATISTICS: 'KISituationStatistics',
  KI_TOOLS_STATISTICS: 'KIToolsStatistics',
  KI_TRIGGER_DETAILS: 'KiTriggerDetails',
  KI_DIAGNOSTIC_TRIGGER_DETAILS: 'KiDiagnosticTriggerDetails',
  PREDICT_KI_DETAILS: 'PredictKIDetails',
  SITUATION_SOLUTION_DETAILS: 'SituationSolutionDetails',
  KNOWLEDGE_HUB_STATS: 'KnowledgeHubStats',
  
  // Service Request & Change Management
  SERVICE_REQUEST: 'ServiceRequest',
  SERVICE_REQUEST_APPROVAL: 'ServiceRequestApproval',
  SERVICE_REQUEST_LOGS: 'ServiceRequestLogs',
  CHANGE_REQUEST: 'ChangeRequest',
  CHANGE_REQUEST_LOGS: 'ChangeRequestLogs',
  SR_INCOMPLETE_DATA: 'SRIncompleteData',
  
  // Statistics & Analytics
  SR_STATISTICS: 'SRStatistics',
  SR_AUTOMATION_STATISTICS: 'SRAutomationStatistics',
  SR_TREND_STATISTICS: 'SRTrendStatistics',
  SR_DAILY_COUNT_STATISTICS: 'SRDailyCountStatistics',
  TREND_STATISTICS: 'TrendStatistics',
  PRIORITY_STATISTICS: 'PriorityStatistics',
  MTTR_STATISTICS: 'MttrStatistics',
  EVM_STATISTICS: 'EvmStatistics',
  
  // Prediction & AI
  PREDICTION: 'Prediction',
  PREDICT_METRIC: 'PredictMetric',
  PREDICT_METRICS_DATA: 'PredictMetricsData',
  DEMO_PREDICT_METRIC_CURRENT_HR_TREND: 'Demo_PredictMetricCurrentHrTrend',
  
  // Monitoring & Performance
  AVAILABILITY_MATRIX: 'AvailibilityMatrix',
  VINCI3_SERVER_STATUS_DATA: 'Vinci3_Server_Status_Data',
  VINCI_APP_BASIC_TREND_STATS: 'VinciAppBasicTrendStats',
  VINCI_APP_CURR_DATE_ASSIGNED_USER_STATS: 'VinciAppCurrDateAssignedUserStats',
  VINCI_APP_DAILY_SIT_SR_BASIC_TREND: 'VinciAppDailySitSrBasicTrend',
  
  // Policy & Automation
  POLICY_ALL_TREND: 'PolicyAllTrend',
  POLICY_DAY_WISE_TREND: 'PolicyDayWiseTrend',
  SUPPRESSION: 'Suppression',
  REMEDIATION_LOGS: 'RemediationLogs',
  
  // Logs & History
  MATRIX_LOGS: 'MatrixLogs',
  BOT_CONVERSATION: 'BotConversation',
  SLACK_DATA: 'SlackData',
  
  // Configuration
  SETTINGS: 'settings',
  ICON_STORE: 'IconStore'
};

/**
 * Initialize MongoDB connection
 */
async function initializeMongoDB() {
  try {
    if (client && db) {
      return db;
    }

    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 30000, // 30 seconds (increased from 5)
      socketTimeoutMS: 60000, // 60 seconds (increased from 45)
      connectTimeoutMS: 30000, // 30 seconds
    });

    await client.connect();
    db = client.db(DB_NAME);
    
    // Log to file only, no console output
    
    // Create indexes for better performance
    await createIndexes();
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Create indexes for collections
 */
async function createIndexes() {
  try {
    // Alerts indexes
    await db.collection(COLLECTIONS.ALERTS).createIndex({ severity: 1, status: 1 });
    await db.collection(COLLECTIONS.ALERTS).createIndex({ timestamp: -1 });
    
    // Situations indexes
    await db.collection(COLLECTIONS.SITUATIONS).createIndex({ status: 1, priority: 1 });
    await db.collection(COLLECTIONS.SITUATIONS).createIndex({ createdDate: -1 });
    
    // CMDB indexes
    await db.collection(COLLECTIONS.CMDB_STORE).createIndex({ ciType: 1, status: 1 });
    await db.collection(COLLECTIONS.CI_DETAILS).createIndex({ ciName: 1 });
    
    // Incident indexes
    await db.collection(COLLECTIONS.INCIDENT_HISTORY).createIndex({ incidentId: 1 });
    await db.collection(COLLECTIONS.INCIDENT_HISTORY).createIndex({ status: 1, priority: 1 });
    
    // Knowledge Base indexes
    await db.collection(COLLECTIONS.KB_ARTICLE_DETAILS).createIndex({ category: 1, tags: 1 });
    
    // Service Request indexes
    await db.collection(COLLECTIONS.SERVICE_REQUEST).createIndex({ status: 1, priority: 1 });
    await db.collection(COLLECTIONS.SERVICE_REQUEST).createIndex({ createdDate: -1 });
    
    // Change Request indexes
    await db.collection(COLLECTIONS.CHANGE_REQUEST).createIndex({ status: 1, priority: 1 });
    
    // Log to file only, no console output
  } catch (error) {
    console.error('Index creation warning:', error.message);
  }
}

/**
 * Get MongoDB database instance
 */
async function getDatabase() {
  if (!db) {
    await initializeMongoDB();
  }
  return db;
}

/**
 * Get a collection
 */
async function getCollection(collectionName) {
  const database = await getDatabase();
  return database.collection(collectionName);
}

/**
 * Execute a MongoDB query
 */
async function executeQuery(collectionName, operation, query = {}, options = {}) {
  try {
    const collection = await getCollection(collectionName);
    
    switch (operation.toLowerCase()) {
      case 'find':
        return await collection.find(query, options).toArray();
      
      case 'findone':
        return await collection.findOne(query, options);
      
      case 'insert':
      case 'insertone':
        return await collection.insertOne(query);
      
      case 'insertmany':
        return await collection.insertMany(query);
      
      case 'update':
      case 'updateone':
        return await collection.updateOne(query, options);
      
      case 'updatemany':
        return await collection.updateMany(query, options);
      
      case 'delete':
      case 'deleteone':
        return await collection.deleteOne(query);
      
      case 'deletemany':
        return await collection.deleteMany(query);
      
      case 'aggregate':
        return await collection.aggregate(query).toArray();
      
      case 'count':
        return await collection.countDocuments(query);
      
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  } catch (error) {
    console.error(`MongoDB query error in ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Test MongoDB connection
 */
async function testMongoConnection() {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    // Log to file only, no console output
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error.message);
    return false;
  }
}

/**
 * Close MongoDB connection
 */
async function closeMongoDB() {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      console.log('MongoDB connection closed');
    }
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
}

/**
 * Get all collection names
 */
async function getCollections() {
  try {
    const database = await getDatabase();
    const collections = await database.listCollections().toArray();
    return collections.map(col => col.name);
  } catch (error) {
    console.error('Error getting collections:', error);
    throw error;
  }
}

/**
 * Get collection statistics
 */
async function getCollectionStats(collectionName) {
  try {
    const database = await getDatabase();
    return await database.command({ collStats: collectionName });
  } catch (error) {
    console.error('Error getting collection stats:', error);
    throw error;
  }
}

// Get database instance
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeMongoDB() first.');
  }
  return db;
}

export {
  initializeMongoDB,
  getDatabase,
  getCollection,
  executeQuery,
  testMongoConnection,
  closeMongoDB,
  getCollections,
  getCollectionStats,
  COLLECTIONS,
  getDb
};
