import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection } from './db.js';
import { initializeMongoDB, testMongoConnection, executeQuery, COLLECTIONS, getCollections, getCollectionStats } from './mongodb.js';
import itOperations from './operations/index.js';
import schemaAnalyzer from './schemaAnalyzer.js';
import { formatSituationDetails, formatSituationList } from './operations/situation-management/formatSituationResponse.js';
import logger from './logger.js';
import aiAutoResolution from './operations/incident-management/aiAutoResolution.js';
import predictiveAnalytics from './operations/event-alert-management/predictiveAnalytics.js';
import intelligentRouting from './operations/incident-management/intelligentRouting.js';
import sentimentAnalysis from './operations/incident-management/sentimentAnalysis.js';
import langchainService from './langchainService.js';
import sequelize, { testSequelizeConnection } from './sequelizeConfig.js';
import User from './models/User.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// ============== CORS CONFIGURATION FOR VINCI WEB ==============
// Enable CORS to allow your Vue.js frontend to access this API
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:8080',      // Vue.js dev server default
      'http://localhost:8081',      // Alternative Vue.js port  
      'http://localhost:3000',      // Alternative dev port
      'http://127.0.0.1:8080',      // Localhost alternative
      'http://172.17.7.133:8080',   // Production Vinci Web
      'http://172.17.7.133:3000',   // Production alternative
      'http://dev.thevinci.co.in',  // Your production domain
      'https://dev.thevinci.co.in'  // HTTPS production
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️  CORS request from origin:', origin);
      callback(null, true); // Allow for development - set to false in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

// HTTP request logger
app.use(morgan('combined', { stream: logger.stream }));

// Global error handler middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { 
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body 
  });
  
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Give logger time to write
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

// Azure OpenAI Configuration
const endpoint = process.env["AZURE_OPENAI_ENDPOINT"] || "https://zenvinciopenai.openai.azure.com/";
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = "2025-01-01-preview";
const deployment = "vinci-openai";

const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

// Store conversation history
// Maximum conversation history messages to keep (system + last N exchanges)
const MAX_CONVERSATION_MESSAGES = 20; // Keep last 10 user-assistant pairs + system message

// Function to manage conversation history and prevent token overflow
function trimConversationHistory(history) {
  if (history.length <= MAX_CONVERSATION_MESSAGES) {
    return history;
  }
  
  // Always keep the system message (first message) and recent conversation
  const systemMessage = history[0];
  const recentMessages = history.slice(-(MAX_CONVERSATION_MESSAGES - 1));
  
  return [systemMessage, ...recentMessages];
}

let conversationHistory = [
  { 
    role: "system", 
    content: `You are an advanced IT Operations AI Assistant for VINCI Platform with expertise in:

**Available VINCI MongoDB Collections (172.17.7.133:27017/VINCI):**

**Alerts & Situations:**
- Alerts: Active alerts and notifications
- Situations: IT situations requiring attention
- SituationsFuture: Predicted future situations

**CMDB (Configuration Management Database):**
- CMDBStore: Main configuration items repository
- CIDetails: Detailed CI information
- CI_Inventory: Hardware/software inventory
- CI_Status: Current CI status
- CI_Types: Types of configuration items
- CI_Groups, CI_Category, CI_Age, CI_Discovery, CI_Sync
- CMDBRelations, CMDBRelationTypes: CI relationships
- Topology: Infrastructure topology
- NoisyCI: High-frequency alert generators

**Incident Management:**
- IncidentHistory: All incidents with history
- IncidentCategory: Incident categorization
- IncidentPrediction: Predicted incidents
- CI_IncidentGenerator: CI-incident correlations

**Knowledge Base:**
- KBArticleDetails: Knowledge base articles
- KIDetails: Knowledge items
- KI_Statistics, KISituationStatistics, KIToolsStatistics
- KiTriggerDetails, KiDiagnosticTriggerDetails
- PredictKIDetails: Predicted knowledge items
- SituationSolutionDetails: Solutions for situations
- KnowledgeHubStats: KB usage statistics

**Service & Change Management:**
- ServiceRequest: Service requests
- ServiceRequestApproval, ServiceRequestLogs
- ChangeRequest: Change requests
- ChangeRequestLogs
- SRIncompleteData: Incomplete SR data

**Business Services:**
- BusinessService: Business services catalog
- AvailibilityMatrix: Service availability data

**Statistics & Analytics:**
- SRStatistics, SRAutomationStatistics, SRTrendStatistics, SRDailyCountStatistics
- TrendStatistics, PriorityStatistics, MttrStatistics, EvmStatistics
- VinciAppBasicTrendStats, VinciAppCurrDateAssignedUserStats
- VinciAppDailySitSrBasicTrend

**Prediction & AI:**
- Prediction: AI predictions
- PredictMetric, PredictMetricsData
- Demo_PredictMetricCurrentHrTrend

**Monitoring:**
- Vinci3_Server_Status_Data: Server health
- PolicyAllTrend, PolicyDayWiseTrend
- Suppression: Alert suppression rules
- RemediationLogs: Auto-remediation logs

**Logs & Communication:**
- BotConversation: Chat history
- MatrixLogs: System logs
- SlackData: Slack integrations

**Core Capabilities (Aisera-like AI Features):**
1. ✅ Search & query all IT operations data (Alerts, Situations, Incidents, CMDB, etc.)
2. 🤖 AI-Powered Auto-Resolution - Automatically resolve common IT issues
3. 🔮 Predictive Analytics - Proactively detect issues before they occur
4. 🎯 Intelligent Routing - Smart ticket assignment to right teams/people
5. 💬 Conversational AI - Natural language understanding with context awareness
6. 📚 Automated Knowledge Base - Auto-generate and update KB articles
7. 😊 Sentiment Analysis - Understand user satisfaction and adapt responses
8. 📊 Multi-Channel Support - Slack, Teams, Email, Web integration ready
9. 🔍 Impact Analysis - Predict service impact using CI relationships
10. 📈 Advanced Analytics - Dashboards, statistics, trends, and MTTR
11. 🏥 Service Health Monitoring - Real-time availability and performance
12. 🔗 Topology Visualization - CI relationships and dependencies

**Natural Language Examples:**
- "Show me open situations"
- "What are the top 5 noisy CIs?"
- "Find incidents related to server XYZ"
- "Show service request statistics for this month"
- "Get all critical alerts from today"
- "What is the MTTR for P1 incidents?"
- "Show me change requests pending approval"
- "Find knowledge articles about database issues"
- "Get CI details for [CI name]"
- "Show IT operations dashboard"

Always provide clear, actionable insights with relevant data from the VINCI platform.`
  }
];

// Cache for database schema (refresh every 5 minutes)
let schemaCache = null;
let schemaCacheTime = null;
const SCHEMA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to get database schema information
async function getDatabaseSchema() {
  // Return cached schema if still valid
  if (schemaCache && schemaCacheTime && (Date.now() - schemaCacheTime < SCHEMA_CACHE_DURATION)) {
    return schemaCache;
  }

  try {
    // Get all tables in the database
    const tables = await query('SHOW TABLES', []);
    const schema = {};

    for (const tableRow of tables) {
      const tableName = Object.values(tableRow)[0];
      
      // Get columns for each table
      const columns = await query(`DESCRIBE ${tableName}`, []);
      
      schema[tableName] = {
        columns: columns.map(col => ({
          name: col.Field,
          type: col.Type,
          nullable: col.Null === 'YES',
          key: col.Key,
          default: col.Default,
          extra: col.Extra
        }))
      };
    }

    // Cache the schema
    schemaCache = schema;
    schemaCacheTime = Date.now();
    
    return schema;
  } catch (error) {
    console.error('Error fetching database schema:', error);
    return {};
  }
}

// Function to generate SQL query using AI
async function generateSQLFromNaturalLanguage(userMessage, schema) {
  try {
    // Create a detailed schema description for the AI
    let schemaDescription = "Database Schema:\n\n";
    for (const [tableName, tableInfo] of Object.entries(schema)) {
      schemaDescription += `Table: ${tableName}\n`;
      schemaDescription += `Columns:\n`;
      tableInfo.columns.forEach(col => {
        schemaDescription += `  - ${col.name} (${col.type})${col.key === 'PRI' ? ' [PRIMARY KEY]' : ''}${col.extra ? ' [' + col.extra + ']' : ''}\n`;
      });
      schemaDescription += `\n`;
    }

    const sqlGenerationPrompt = [
      {
        role: "system",
        content: `You are an expert SQL query generator for MySQL databases. Your job is to convert natural language questions into safe, efficient SQL queries.

Rules for SELECT queries:
1. Use proper SQL syntax for MySQL
2. Always include a LIMIT clause for SELECT (default to 100 if not specified)
3. When ordering for "last", "recent", "latest", use the FIRST available column from the table (usually auto-increment or timestamp)
4. If you see columns with 'date', 'time', 'created', 'updated' in the name, prefer those for ORDER BY
5. If no obvious ordering column exists, just use the first column in the table
6. Use appropriate WHERE clauses for filtering
7. Handle singular/plural variations (login/logins, user/users, etc.)
8. ALWAYS check the available columns in the schema before using them

Rules for UPDATE queries:
1. ONLY allow UPDATE queries when the user explicitly mentions updating/changing/setting a value
2. UPDATE queries MUST have a WHERE clause with specific ID or identifier
3. Format: UPDATE table SET column = value WHERE id_column = id_value
4. NEVER use UPDATE without WHERE clause
5. Return ONLY the SQL query, nothing else

Rules for other operations:
1. NO INSERT, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE
2. If the question doesn't relate to the MySQL database, return "NO_SQL_QUERY"

${schemaDescription}

Examples:
User: "show last 5 logins"
SQL: SELECT * FROM rbac_UserLoginDetails ORDER BY [use first column or timestamp column] DESC LIMIT 5

User: "get all users"
SQL: SELECT * FROM users LIMIT 100

User: "update login id 27 set ActiveSessions to 0"
SQL: UPDATE rbac_UserLoginDetails SET ActiveSessions = 0 WHERE [id_column] = 27

User: "change ActiveSessions to 0 for id 27"
SQL: UPDATE rbac_UserLoginDetails SET ActiveSessions = 0 WHERE [id_column] = 27

User: "hello"
SQL: NO_SQL_QUERY

IMPORTANT: 
- Always examine the actual column names in the schema provided above
- Do not assume column names exist unless you see them in the schema
- This is for MySQL database only, not for MongoDB IT operations data`
      },
      {
        role: "user",
        content: userMessage
      }
    ];

    const result = await client.chat.completions.create({
      messages: sqlGenerationPrompt,
      max_tokens: 500,
      temperature: 0.1, // Low temperature for more deterministic output
      top_p: 0.95,
    });

    const generatedSQL = result.choices[0].message.content.trim();
    
    // Remove code blocks if present
    let cleanSQL = generatedSQL.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    return {
      sql: cleanSQL,
      isValidQuery: cleanSQL !== 'NO_SQL_QUERY' && !cleanSQL.includes('NO_SQL_QUERY')
    };
  } catch (error) {
    console.error('Error generating SQL:', error);
    return { sql: null, isValidQuery: false, error: error.message };
  }
}

// Function to validate generated SQL query
function validateSQL(sql) {
  const upperSQL = sql.toUpperCase().trim();
  
  // Check if it's a SELECT or UPDATE query
  const isSelect = upperSQL.startsWith('SELECT');
  const isUpdate = upperSQL.startsWith('UPDATE');
  
  if (!isSelect && !isUpdate) {
    return { valid: false, reason: 'Only SELECT and UPDATE queries are allowed' };
  }
  
  // Check for dangerous keywords
  const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
  for (const keyword of dangerousKeywords) {
    if (upperSQL.includes(keyword)) {
      return { valid: false, reason: `Dangerous keyword detected: ${keyword}` };
    }
  }
  
  // For SELECT queries, check if LIMIT is present
  if (isSelect && !upperSQL.includes('LIMIT')) {
    return { valid: false, reason: 'SELECT query must include a LIMIT clause for safety' };
  }
  
  // For UPDATE queries, MUST have WHERE clause
  if (isUpdate && !upperSQL.includes('WHERE')) {
    return { valid: false, reason: 'UPDATE query must include a WHERE clause for safety. Cannot update all records.' };
  }
  
  return { valid: true, queryType: isUpdate ? 'UPDATE' : 'SELECT' };
}

// Advanced AI-powered database query handler
async function handleDatabaseQuery(userMessage) {
  try {
    // Get database schema
    const schema = await getDatabaseSchema();
    
    if (Object.keys(schema).length === 0) {
      logger.error('Unable to retrieve database schema');
      return { 
        hasData: false, 
        error: 'Unable to retrieve database schema' 
      };
    }
    
    // Generate SQL using AI
    logger.debug(`Generating SQL for: "${userMessage}"`);
    const sqlResult = await generateSQLFromNaturalLanguage(userMessage, schema);
    
    if (!sqlResult.isValidQuery) {
      // Not a database query, let normal AI handle it
      return { hasData: false };
    }
    
    if (sqlResult.error) {
      logger.error(`SQL generation error: ${sqlResult.error}`);
      return {
        hasData: false,
        error: `AI Error: ${sqlResult.error}`
      };
    }
    
    logger.info(`Generated SQL: ${sqlResult.sql}`);
    
    // Validate the generated SQL
    const validation = validateSQL(sqlResult.sql);
    if (!validation.valid) {
      logger.warn(`SQL validation failed: ${validation.reason}`);
      return {
        hasData: false,
        error: `Query validation failed: ${validation.reason}`
      };
    }
    
    // Execute the query
    const results = await query(sqlResult.sql, []);
    
    // Handle UPDATE queries differently
    if (validation.queryType === 'UPDATE') {
      logger.info(`UPDATE query successful, affected rows: ${results.affectedRows || 0}`);
      return {
        hasData: true,
        isUpdate: true,
        data: [],
        sql: sqlResult.sql,
        affectedRows: results.affectedRows || 0,
        message: `✅ Update successful! ${results.affectedRows || 0} row(s) affected.`
      };
    }
    
    // Handle SELECT queries
    logger.info(`SELECT query successful, records found: ${results.length}`);
    return {
      hasData: true,
      data: results,
      sql: sqlResult.sql,
      message: `Query executed successfully (${results.length} records found)`
    };
    
  } catch (error) {
    logger.error('Database query error:', { message: error.message, stack: error.stack });
    return {
      hasData: false,
      error: `Database error: ${error.message}`
    };
  }
}

// Advanced IT Operations query handler using AI
async function handleITOperationsQuery(userMessage) {
  try {
    logger.debug(`Analyzing IT Operations query: "${userMessage}"`);
    
    // Use AI to understand the intent and route to appropriate IT module
    const intentAnalysis = await analyzeITOperationsIntent(userMessage);
    
    if (!intentAnalysis.isITOperation) {
      return { hasData: false };
    }
    
    logger.info(`IT Operation detected: ${intentAnalysis.module} - ${intentAnalysis.action}`);
    
    let result;
    const filters = intentAnalysis.filters || {};
    
    // Route to appropriate IT operations module
    switch (intentAnalysis.module) {
      case 'eventhub':
        result = await handleEventHubQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'cmdb':
        result = await handleCMDBQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'businessservice':
        result = await handleBusinessServiceQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'knowledgehub':
        result = await handleKnowledgeHubQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'servicecatalog':
        result = await handleServiceCatalogQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'incident':
        result = await handleIncidentQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'situation':
        result = await handleSituationQuery(intentAnalysis.action, filters, userMessage);
        break;
      
      case 'dashboard':
        result = await itOperations.getITOperationsDashboard();
        break;
      
      default:
        return { hasData: false };
    }
    
    if (result.success) {
      return {
        hasData: true,
        data: result,
        module: intentAnalysis.module,
        action: intentAnalysis.action
      };
    } else {
      return {
        hasData: false,
        error: result.error || 'Failed to execute IT operation'
      };
    }
    
  } catch (error) {
    logger.error('IT Operations query error:', { message: error.message, stack: error.stack });
    return {
      hasData: false,
      error: `IT Operations error: ${error.message}`
    };
  }
}

// Analyze user intent for IT operations
async function analyzeITOperationsIntent(userMessage) {
  try {
    const intentPrompt = [
      {
        role: "system",
        content: `You are an IT operations intent analyzer. Analyze the user's message and determine:
1. Is this an IT operations query? (EventHub, CMDB, Business Service, Knowledge Hub, Service Catalog, Incident, Situation, Dashboard)
2. Which module is being queried?
3. What action is being requested? (search, get, create, update, list, status, details, field-query, etc.)
4. Extract any filters (status, priority, date range, search terms, situationId, fieldNames, etc.)

Respond ONLY with a JSON object in this format:
{
  "isITOperation": true/false,
  "module": "eventhub|cmdb|businessservice|knowledgehub|servicecatalog|incident|situation|dashboard",
  "action": "search|get|create|update|list|status|health|details|field-query",
  "filters": {
    "status": "Open|Closed|Active",
    "priority": "High|Medium|Low",
    "search": "search terms",
    "situationId": "SID1, MID421, etc.",
    "fieldNames": ["field1", "field2"],
    "limit": 50,
    "fromDate": "date",
    "toDate": "date"
  }
}

Examples:
User: "show open events" → {"isITOperation": true, "module": "eventhub", "action": "search", "filters": {"status": "Open"}}
User: "search CMDB for servers" → {"isITOperation": true, "module": "cmdb", "action": "search", "filters": {"search": "servers"}}
User: "get service health" → {"isITOperation": true, "module": "businessservice", "action": "health", "filters": {}}
User: "find knowledge about password reset" → {"isITOperation": true, "module": "knowledgehub", "action": "search", "filters": {"search": "password reset"}}
User: "show service catalog" → {"isITOperation": true, "module": "servicecatalog", "action": "list", "filters": {}}
User: "list open incidents" → {"isITOperation": true, "module": "incident", "action": "search", "filters": {"status": "Open"}}
User: "Get situation SID107 details" → {"isITOperation": true, "module": "situation", "action": "details", "filters": {"situationId": "SID107"}}
User: "show all open situations" → {"isITOperation": true, "module": "situation", "action": "search", "filters": {"status": "Open"}}
User: "share status and severity for MID421" → {"isITOperation": true, "module": "situation", "action": "field-query", "filters": {"situationId": "MID421", "fieldNames": ["status", "severity"]}}
User: "what is entity name for SID102" → {"isITOperation": true, "module": "situation", "action": "field-query", "filters": {"situationId": "SID102", "fieldNames": ["entityName"]}}
User: "show IT dashboard" → {"isITOperation": true, "module": "dashboard", "action": "get", "filters": {}}
User: "hello" → {"isITOperation": false}`
      },
      {
        role: "user",
        content: userMessage
      }
    ];

    const result = await client.chat.completions.create({
      messages: intentPrompt,
      max_tokens: 300,
      temperature: 0.1,
      top_p: 0.95,
    });

    const response = result.choices[0].message.content.trim();
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { isITOperation: false };
  } catch (error) {
    console.error('Error analyzing IT operations intent:', error);
    return { isITOperation: false };
  }
}

// EventHub query handler
async function handleEventHubQuery(action, filters, userMessage) {
  switch (action) {
    case 'search':
    case 'list':
      return await itOperations.searchEvents(filters);
    case 'create':
      return { success: false, error: 'Please provide event details to create' };
    default:
      return await itOperations.searchEvents(filters);
  }
}

// CMDB query handler
async function handleCMDBQuery(action, filters, userMessage) {
  // Check if asking for noisy CIs
  if (userMessage && /noisy\s+ci/i.test(userMessage)) {
    const limit = filters.limit || 5;
    return await itOperations.getNoisyCIs(limit);
  }
  
  switch (action) {
    case 'search':
    case 'list':
      return await itOperations.searchCMDB(filters);
    case 'get':
    case 'details':
      if (filters.ciId) {
        return await itOperations.getCMDBItem(filters.ciId);
      }
      
      // Try to extract CI name from the message
      let ciName = null;
      if (userMessage) {
        // Look for specific CI name in message (e.g., "VINCISTACKCENTOS9")
        const ciNameMatch = userMessage.match(/\b([A-Z0-9-]+)\b/);
        if (ciNameMatch) {
          ciName = ciNameMatch[1];
        }
      }
      
      // If we found a CI name, try to get its details from NoisyCI data first
      if (ciName) {
        const noisyCIResult = await itOperations.getNoisyCIDetails(ciName);
        if (noisyCIResult.success) {
          return noisyCIResult;
        }
      }
      
      // Fall back to CMDB search
      if (ciName) {
        filters.ciName = ciName;
      }
      return await itOperations.searchCMDB(filters);
    case 'relationships':
      if (filters.ciId) {
        return await itOperations.getCMDBRelationships(filters.ciId);
      }
      return { success: false, error: 'CI ID required for relationships' };
    default:
      return await itOperations.searchCMDB(filters);
  }
}

// Business Service query handler
async function handleBusinessServiceQuery(action, filters, userMessage) {
  switch (action) {
    case 'search':
    case 'list':
      return await itOperations.getBusinessServices(filters);
    case 'health':
    case 'status':
      if (filters.serviceId) {
        return await itOperations.getServiceHealth(filters.serviceId);
      }
      return await itOperations.getBusinessServices(filters);
    case 'get':
      if (filters.serviceId) {
        return await itOperations.getBusinessService(filters.serviceId);
      }
      return await itOperations.getBusinessServices(filters);
    default:
      return await itOperations.getBusinessServices(filters);
  }
}

// Knowledge Hub query handler
async function handleKnowledgeHubQuery(action, filters, userMessage) {
  switch (action) {
    case 'search':
      const searchTerm = filters.search || userMessage;
      return await itOperations.searchKnowledge(searchTerm, filters);
    case 'get':
      if (filters.articleId) {
        return await itOperations.getKnowledgeArticle(filters.articleId);
      }
      return await itOperations.searchKnowledge(userMessage, filters);
    default:
      return await itOperations.searchKnowledge(userMessage, filters);
  }
}

// Service Catalog query handler
async function handleServiceCatalogQuery(action, filters, userMessage) {
  switch (action) {
    case 'search':
    case 'list':
      return await itOperations.getServiceCatalog(filters);
    case 'categories':
      return await itOperations.getServiceCategories();
    case 'get':
      if (filters.itemId) {
        return await itOperations.getCatalogItem(filters.itemId);
      }
      return await itOperations.getServiceCatalog(filters);
    default:
      return await itOperations.getServiceCatalog(filters);
  }
}

// Incident query handler
async function handleIncidentQuery(action, filters, userMessage) {
  switch (action) {
    case 'search':
    case 'list':
      return await itOperations.getIncidents(filters);
    case 'create':
      return { success: false, error: 'Please provide incident details to create' };
    default:
      return await itOperations.getIncidents(filters);
  }
}

async function handleSituationQuery(action, filters, userMessage) {
  switch (action) {
    case 'search':
    case 'list':
      return await itOperations.searchSituations(filters);
    case 'get':
    case 'details':
      if (filters.situationId) {
        return await itOperations.getSituationDetails(filters.situationId);
      }
      return { success: false, error: 'Situation ID is required for details query' };
    case 'field-query':
      if (filters.situationId && filters.fieldNames && filters.fieldNames.length > 0) {
        // Get full situation details
        const situationResult = await itOperations.getSituationDetails(filters.situationId);
        
        if (!situationResult || !situationResult.success || !situationResult.situation) {
          return { 
            success: false, 
            error: situationResult?.error || `Situation ${filters.situationId} not found` 
          };
        }

        const situation = situationResult.situation;
        const summary = situationResult.summary;

        // Extract only requested fields
        const fieldMapping = {
          'status': situation.Status || summary?.status,
          'severity': situation.SeverityDetails?.Severity || summary?.severity,
          'entityname': situation.ManagedObjectDetails?.EntityName || summary?.entityName,
          'entity name': situation.ManagedObjectDetails?.EntityName || summary?.entityName,
          'incidentno': situation.IncidentDetails?.IncidentNo || summary?.incidentNo,
          'incident no': situation.IncidentDetails?.IncidentNo || summary?.incidentNo,
          'description': situation.SituationDescription || summary?.description,
          'createdtime': situation.RowCreatedTimeStamp || summary?.createdDate,
          'created time': situation.RowCreatedTimeStamp || summary?.createdDate,
          'modifiedtime': situation.RowModifiedTimeStamp || summary?.modifiedDate,
          'modified time': situation.RowModifiedTimeStamp || summary?.modifiedDate,
          'monitoringtool_id': situation.MonitoringToolDetails?.MonitoringTool_ID,
          'monitoring tool id': situation.MonitoringToolDetails?.MonitoringTool_ID
        };

        const result = {
          success: true,
          situationId: filters.situationId,
          fields: {}
        };

        for (const fieldName of filters.fieldNames) {
          const normalizedField = fieldName.toLowerCase().trim();
          result.fields[fieldName] = fieldMapping[normalizedField] || situation[fieldName] || 'N/A';
        }

        return result;
      }
      return { success: false, error: 'Situation ID and field names are required for field query' };
    default:
      return await itOperations.searchSituations(filters);
  }
}

// Function to validate if query is related to Vinci IT operations
async function isVinciRelatedQuery(message) {
  try {
    const vinciKeywords = [
      'vinci', 'incident', 'alert', 'situation', 'cmdb', 'ci ', 'configuration item',
      'service request', 'change request', 'knowledge', 'kb', 'article', 
      'business service', 'topology', 'noisy ci', 'mttr', 'sla', 'ticket',
      'server', 'monitoring', 'remediation', 'automation', 'prediction',
      'eventhub', 'event', 'issue', 'problem', 'dashboard', 'metric',
      'status', 'availability', 'performance', 'downtime', 'outage',
      'database', 'users', 'roles', 'permissions', 'login'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    // Check for direct keyword match
    const hasKeyword = vinciKeywords.some(keyword => lowerMessage.includes(keyword));
    if (hasKeyword) return true;
    
    // Use AI to validate scope
    const validationPrompt = [
      {
        role: "system",
        content: `You are a query classifier for Vinci IT Operations platform. 
Determine if the user's query is related to IT operations, infrastructure, services, or the Vinci platform.

Valid topics include:
- IT incidents, alerts, events, situations
- CMDB, configuration items, assets, servers
- Service requests, change requests, tickets
- Knowledge base articles, documentation
- IT monitoring, performance, availability
- Business services, SLA, metrics
- IT automation, remediation
- General questions about the Vinci platform

Invalid topics include:
- Sports scores, news, weather
- General knowledge questions unrelated to IT
- Entertainment, movies, games
- Personal advice unrelated to IT
- Math problems unrelated to IT operations

Respond with ONLY "VALID" or "INVALID".`
      },
      {
        role: "user",
        content: message
      }
    ];
    
    const result = await client.chat.completions.create({
      messages: validationPrompt,
      max_tokens: 10,
      temperature: 0.1
    });
    
    const response = result.choices[0].message.content.trim().toUpperCase();
    return response.includes('VALID');
    
  } catch (error) {
    logger.error('Query validation failed:', error);
    // On error, allow the query (fail-open for better UX)
    return true;
  }
}

// API endpoint for chat with AI enhancements
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    
    logger.info(`Received chat message: "${message}"`);
    
    if (!message) {
      logger.warn('Chat request missing message');
      return res.status(400).json({ 
        success: false,
        error: 'Message is required' 
      });
    }

    // Quick response for simple greetings - skip AI analysis
    const greetingPatterns = /^(hi|hello|hey|hola|good morning|good afternoon|good evening|greetings|howdy)[\s\!\?\.]*$/i;
    if (greetingPatterns.test(message.trim())) {
      logger.info('Quick greeting response (skipping AI analysis)');
      const greetingResponse = `Hello! 👋 I'm your Vinci IT Operations Assistant.

I can help you with:
🔧 **IT Operations:** Incidents, Alerts, Events, Situations
📊 **CMDB:** Configuration Items, Servers, Assets
🎫 **Service Management:** Service Requests, Change Requests
📚 **Knowledge Base:** Articles, Solutions, Documentation
📈 **Analytics:** Metrics, Dashboards, Trends

What would you like to know about?`;
      
      conversationHistory.push({ role: "user", content: message });
      conversationHistory.push({ role: "assistant", content: greetingResponse });
      
      return res.json({ 
        success: true,
        response: greetingResponse,
        type: 'greeting',
        quickResponse: true
      });
    }
    
    // Step 0: Validate if query is related to Vinci IT operations (only for non-greetings)
    const isValidScope = await isVinciRelatedQuery(message);
    if (!isValidScope) {
      logger.warn(`Rejected unrelated query: "${message}"`);
      const scopeMessage = `I'm Vinci IT Operations Assistant. I can only help with IT operations queries related to:

🔧 **IT Operations:**
- Incidents, Alerts, Events, and Situations
- CMDB and Asset Management
- Configuration Items and Servers

📋 **Service Management:**
- Service Requests and Tickets
- Change Requests
- Service Catalogs

📚 **Knowledge & Analytics:**
- Knowledge Base Articles
- IT Metrics and Dashboards
- Performance Monitoring

Please ask questions related to these IT operations topics. How can I help you with the Vinci platform today?`;
      
      return res.json({ 
        success: true,
        response: scopeMessage,
        type: 'scope-rejection'
      });
    }

    // Step 1: Analyze sentiment (async, don't await for simple queries)
    const sentimentPromise = sentimentAnalysis.analyzeSentiment(message, conversationHistory);
    sentimentPromise.then(sentiment => {
      logger.info(`Sentiment analysis: ${sentiment.sentiment} (${sentiment.intensity} intensity, ${sentiment.urgency} urgency)`);
    }).catch(err => {
      logger.warn('Sentiment analysis failed:', err.message);
    });

    // First, check if it's an IT operations query (MongoDB)
    const itResult = await handleITOperationsQuery(message);
    
    if (itResult.hasData) {
      logger.info(`IT operation successful: ${itResult.module} - ${itResult.action}`);
      
      // Format IT operations response
      const formattedData = JSON.stringify(itResult.data, null, 2);
      const moduleInfo = `\n\n🔧 **IT Module:** ${itResult.module.toUpperCase()}\n📊 **Action:** ${itResult.action}\n`;
      const responseMessage = `${moduleInfo}\n\`\`\`json\n${formattedData}\n\`\`\``;
      
      // Add to conversation history
      conversationHistory.push({ role: "user", content: message });
      conversationHistory.push({ role: "assistant", content: responseMessage });
      
      return res.json({ 
        success: true,
        response: responseMessage,
        data: itResult.data,
        module: itResult.module,
        action: itResult.action,
        type: 'it-operations'
      });
    } else if (itResult.error) {
      logger.error(`IT operation error: ${itResult.error}`);
      return res.status(500).json({ 
        success: false,
        error: itResult.error 
      });
    }

    // Second, check if it's a MySQL database query
    const dbResult = await handleDatabaseQuery(message);
    
    if (dbResult.hasData) {
      logger.info(`Database query successful: ${dbResult.isUpdate ? 'UPDATE' : 'SELECT'}`);
      
      // Handle UPDATE queries
      if (dbResult.isUpdate) {
        const sqlInfo = dbResult.sql ? `\n\n🔍 Generated SQL:\n\`\`\`sql\n${dbResult.sql}\n\`\`\`\n` : '';
        const responseMessage = `${dbResult.message}${sqlInfo}`;
        
        // Add to conversation history
        conversationHistory.push({ role: "user", content: message });
        conversationHistory.push({ role: "assistant", content: responseMessage });
        
        return res.json({ 
          success: true,
          response: responseMessage,
          isUpdate: true,
          affectedRows: dbResult.affectedRows,
          sql: dbResult.sql,
          type: 'mysql-update'
        });
      }
      
      // Handle SELECT queries
      const sqlInfo = dbResult.sql ? `\n\n🔍 Generated SQL:\n\`\`\`sql\n${dbResult.sql}\n\`\`\`\n` : '';
      const formattedData = JSON.stringify(dbResult.data, null, 2);
      const responseMessage = `${dbResult.message}${sqlInfo}\n\`\`\`json\n${formattedData}\n\`\`\``;
      
      // Add to conversation history
      conversationHistory.push({ role: "user", content: message });
      conversationHistory.push({ role: "assistant", content: responseMessage });
      
      return res.json({ 
        success: true,
        response: responseMessage,
        data: dbResult.data,
        sql: dbResult.sql,
        count: dbResult.data.length,
        type: 'mysql-query'
      });
    } else if (dbResult.error) {
      logger.error(`Database query error: ${dbResult.error}`);
      return res.status(500).json({ 
        success: false,
        error: dbResult.error 
      });
    }

    // If not a database or IT operations query, proceed with normal AI chat
    logger.info('Processing as general AI chat');
    
    // Add user message to history
    conversationHistory.push({ role: "user", content: message });
    
    // Trim conversation history to prevent token overflow
    const trimmedHistory = trimConversationHistory(conversationHistory);
    logger.info(`Conversation history: ${conversationHistory.length} messages, trimmed to: ${trimmedHistory.length} messages`);

    // Call Azure OpenAI with trimmed history
    const result = await client.chat.completions.create({
      messages: trimmedHistory,
      max_tokens: 800,
      temperature: 0.7,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    let assistantMessage = result.choices[0].message.content;
    
    // Step 2: Apply empathetic response if needed based on sentiment
    if (sentiment.requiresEmpathy || sentiment.urgency === 'Critical' || sentiment.sentiment === 'Frustrated') {
      assistantMessage = await sentimentAnalysis.generateEmpatheticResponse(message, sentiment, assistantMessage);
      logger.info('Applied empathetic response enhancement');
    }
    
    // Add assistant response to history
    conversationHistory.push({ role: "assistant", content: assistantMessage });

    logger.info('General chat response generated successfully');

    res.json({ 
      success: true,
      response: assistantMessage,
      usage: result.usage,
      type: 'general-chat',
      sentiment: {
        detected: sentiment.sentiment,
        urgency: sentiment.urgency,
        satisfaction: sentiment.satisfaction
      }
    });

  } catch (error) {
    logger.error('Chat endpoint error:', { 
      message: error.message, 
      stack: error.stack,
      body: req.body 
    });
    
    res.status(500).json({ 
      success: false,
      error: 'An error occurred while processing your request',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Reset conversation endpoint
app.post('/api/reset', (req, res) => {
  conversationHistory = [
    { 
      role: "system", 
      content: `You are an advanced IT Operations AI Assistant with expertise in:

**IT Service Management (ITSM) Modules:**
- EventHub: Monitor and manage IT events, alerts, and notifications
- CMDB (Configuration Management Database): Track and manage configuration items, assets, and relationships
- Business Services: Monitor service health, availability, and dependencies
- Knowledge Hub: Search and access knowledge articles, solutions, and documentation
- Service Catalogs: Browse available IT services and submit service requests
- Incident Management: Create, track, and resolve IT incidents
- Change Management: Handle change requests and approvals
- Problem Management: Identify root causes and prevent recurring issues

**Capabilities:**
1. Query and analyze data from all IT operation modules
2. Search across CMDB, EventHub, Knowledge Base, and Service Catalogs
3. Create and update incidents, events, and service requests
4. Provide service health status and impact analysis
5. Recommend knowledge articles for common issues
6. Help with service requests and catalog browsing
7. Generate IT operation reports and dashboards
8. Analyze configuration item relationships and dependencies

**Instructions:**
- Use natural language understanding to interpret IT operations requests
- Query appropriate MongoDB collections (EventHub, CMDB, BusinessService, KnowledgeHub, ServiceCatalogs)
- Provide clear, actionable responses with relevant data
- Suggest related knowledge articles when applicable
- For incidents/events, check severity and recommend actions
- Be proactive in identifying service impacts and relationships

Always be professional, helpful, and focused on IT operations excellence.`
    }
  ];
  res.json({ message: 'Conversation reset successfully' });
});

// ====== IT OPERATIONS ENDPOINTS ======

// IT Operations Dashboard
app.get('/api/it/dashboard', async (req, res) => {
  try {
    const dashboard = await itOperations.getITOperationsDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load dashboard',
      details: error.message 
    });
  }
});

// EventHub Endpoints
app.get('/api/it/eventhub', async (req, res) => {
  try {
    const filters = {
      eventType: req.query.eventType,
      severity: req.query.severity,
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50
    };
    const result = await itOperations.searchEvents(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/it/eventhub', async (req, res) => {
  try {
    const result = await itOperations.createEvent(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CMDB Endpoints
app.get('/api/it/cmdb', async (req, res) => {
  try {
    const filters = {
      ciType: req.query.ciType,
      status: req.query.status,
      owner: req.query.owner,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 50
    };
    const result = await itOperations.searchCMDB(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/it/cmdb/:ciId', async (req, res) => {
  try {
    const result = await itOperations.getCMDBItem(req.params.ciId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/it/cmdb', async (req, res) => {
  try {
    const result = await itOperations.addCMDBItem(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/it/cmdb/noisy-cis', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const result = await itOperations.getNoisyCIs(limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Business Service Endpoints
app.get('/api/it/services', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      owner: req.query.owner,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 100
    };
    const result = await itOperations.getBusinessServices(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/it/services/:serviceId/health', async (req, res) => {
  try {
    const result = await itOperations.getServiceHealth(req.params.serviceId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Knowledge Hub Endpoints
app.get('/api/it/knowledge', async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    const filters = {
      category: req.query.category,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      limit: parseInt(req.query.limit) || 20
    };
    const result = await itOperations.searchKnowledge(searchTerm, filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/it/knowledge/:articleId', async (req, res) => {
  try {
    const result = await itOperations.getKnowledgeArticle(req.params.articleId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Service Catalog Endpoints
app.get('/api/it/catalog', async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      type: req.query.type,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 100
    };
    const result = await itOperations.getServiceCatalog(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/it/catalog/categories', async (req, res) => {
  try {
    const result = await itOperations.getServiceCategories();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/it/catalog/:itemId/request', async (req, res) => {
  try {
    const result = await itOperations.requestService(req.params.itemId, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Incident Management Endpoints
app.get('/api/it/incidents', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      assignedTo: req.query.assignedTo,
      limit: parseInt(req.query.limit) || 50
    };
    const result = await itOperations.getIncidents(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/it/incidents', async (req, res) => {
  try {
    const result = await itOperations.createIncident(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====== DATABASE ENDPOINTS ======

// Example: Get all records from a table
app.get('/api/data/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const limit = req.query.limit || 100;
    
    // Sanitize table name to prevent SQL injection
    const allowedTables = ['rbac_UserLoginDetails']; // Add your table names here
    if (!allowedTables.includes(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    const results = await query(`SELECT * FROM ${tableName} LIMIT ?`, [parseInt(limit)]);
    res.json({ 
      success: true, 
      data: results,
      count: results.length 
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch data',
      details: error.message 
    });
  }
});

// Example: Execute custom query
app.post('/api/query', async (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    
    if (!sql) {
      return res.status(400).json({ error: 'SQL query is required' });
    }
    
    // For safety, only allow SELECT queries in production
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      return res.status(403).json({ error: 'Only SELECT queries are allowed' });
    }
    
    const results = await query(sql, params);
    res.json({ 
      success: true, 
      data: results,
      count: results.length 
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Query execution failed',
      details: error.message 
    });
  }
});

// Example: Insert data into a table
app.post('/api/data/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const data = req.body;
    
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Data is required' });
    }
    
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
    const result = await query(sql, values);
    
    res.json({ 
      success: true, 
      message: 'Data inserted successfully',
      insertId: result.insertId 
    });
  } catch (error) {
    console.error('Insert error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to insert data',
      details: error.message 
    });
  }
});

// Example: Update data in a table
app.put('/api/data/:tableName/:id', async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const data = req.body;
    
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Data is required' });
    }
    
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(data), id];
    
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
    const result = await query(sql, values);
    
    res.json({ 
      success: true, 
      message: 'Data updated successfully',
      affectedRows: result.affectedRows 
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update data',
      details: error.message 
    });
  }
});

// Example: Delete data from a table
app.delete('/api/data/:tableName/:id', async (req, res) => {
  try {
    const { tableName, id } = req.params;
    
    const sql = `DELETE FROM ${tableName} WHERE id = ?`;
    const result = await query(sql, [id]);
    
    res.json({ 
      success: true, 
      message: 'Data deleted successfully',
      affectedRows: result.affectedRows 
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete data',
      details: error.message 
    });
  }
});

// Database health check endpoint
app.get('/api/db/health', async (req, res) => {
  try {
    const mysqlConnected = await testConnection();
    const mongoConnected = await testMongoConnection();
    
    res.json({ 
      success: mysqlConnected && mongoConnected,
      databases: {
        mysql: {
          connected: mysqlConnected,
          message: mysqlConnected ? 'MySQL connected' : 'MySQL connection failed'
        },
        mongodb: {
          connected: mongoConnected,
          message: mongoConnected ? 'MongoDB connected' : 'MongoDB connection failed'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Health check failed',
      details: error.message 
    });
  }
});

// MongoDB specific health check
app.get('/api/mongodb/health', async (req, res) => {
  try {
    const isConnected = await testMongoConnection();
    const collections = await getCollections();
    
    res.json({ 
      success: isConnected,
      message: isConnected ? 'MongoDB is connected' : 'MongoDB connection failed',
      collectionsCount: collections.length,
      database: 'VINCI'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'MongoDB health check failed',
      details: error.message 
    });
  }
});

// Get all collections
app.get('/api/it/collections', async (req, res) => {
  try {
    const collections = await getCollections();
    res.json({ 
      success: true,
      count: collections.length,
      collections 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Analyze collection schema
app.get('/api/it/analyze/:collectionName', async (req, res) => {
  try {
    const { collectionName } = req.params;
    const sampleSize = parseInt(req.query.sampleSize) || 10;
    
    const analysis = await schemaAnalyzer.analyzeCollectionSchema(collectionName, sampleSize);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Analyze all collections
app.get('/api/it/analyze-all', async (req, res) => {
  try {
    const sampleSize = parseInt(req.query.sampleSize) || 5;
    const analysis = await schemaAnalyzer.analyzeAllCollections(sampleSize);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Generate collection documentation
app.get('/api/it/documentation', async (req, res) => {
  try {
    const docs = await schemaAnalyzer.generateCollectionDocumentation();
    
    if (docs.success) {
      res.set('Content-Type', 'text/markdown');
      res.send(docs.documentation);
    } else {
      res.status(500).json(docs);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Search collections by keyword
app.get('/api/it/search-collections/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const result = await schemaAnalyzer.findCollectionsByKeyword(keyword);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ====== AISERA-LIKE AI FEATURES ======

// AI Auto-Resolution Endpoints
app.post('/api/ai/auto-resolve/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const incident = req.body;
    
    // Analyze if incident can be auto-resolved
    const analysis = await aiAutoResolution.analyzeForAutoResolution(incident);
    
    if (analysis.canAutoResolve) {
      // Attempt auto-resolution
      const resolution = await aiAutoResolution.attemptAutoResolution(incidentId, analysis);
      res.json(resolution);
    } else {
      res.json({
        success: false,
        canAutoResolve: false,
        reason: 'Incident requires human intervention',
        analysis
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/auto-resolve/stats', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.days) || 30;
    const stats = await aiAutoResolution.getAutoResolutionStats(timeRange);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/similar-incidents', async (req, res) => {
  try {
    const { description, limit } = req.query;
    const result = await aiAutoResolution.findSimilarResolvedIncidents(
      description, 
      parseInt(limit) || 5
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Predictive Analytics Endpoints
app.get('/api/ai/predict/issues', async (req, res) => {
  try {
    const lookAheadHours = parseInt(req.query.hours) || 24;
    const predictions = await predictiveAnalytics.predictPotentialIssues(lookAheadHours);
    res.json(predictions);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/predict/incident-spikes', async (req, res) => {
  try {
    const timeWindow = parseInt(req.query.days) || 7;
    const prediction = await predictiveAnalytics.predictIncidentSpikes(timeWindow);
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/predict/service-degradation', async (req, res) => {
  try {
    const prediction = await predictiveAnalytics.predictServiceDegradation();
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/predict/dashboard', async (req, res) => {
  try {
    const dashboard = await predictiveAnalytics.getPredictiveDashboard();
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/detect/anomalies', async (req, res) => {
  try {
    const anomalies = await predictiveAnalytics.detectAnomalies();
    res.json(anomalies);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Intelligent Routing Endpoints
app.post('/api/ai/route-incident', async (req, res) => {
  try {
    const incident = req.body;
    const routing = await intelligentRouting.routeIncident(incident);
    res.json(routing);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/escalate/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { currentLevel, reason } = req.body;
    const escalation = await intelligentRouting.escalateIncident(incidentId, currentLevel, reason);
    res.json(escalation);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/check-escalation', async (req, res) => {
  try {
    const result = await intelligentRouting.checkAutoEscalation();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/routing-stats', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.days) || 30;
    const stats = await intelligentRouting.getRoutingStatistics(timeRange);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sentiment Analysis Endpoints
app.post('/api/ai/analyze-sentiment', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    const sentiment = await sentimentAnalysis.analyzeSentiment(message, conversationHistory);
    res.json({ success: true, sentiment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/satisfaction-trends', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.days) || 30;
    const trends = await sentimentAnalysis.getSatisfactionTrends(timeRange);
    res.json(trends);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/feedback', async (req, res) => {
  try {
    const { conversationId, rating, comment, metadata } = req.body;
    const result = await sentimentAnalysis.collectFeedback(conversationId, rating, comment, metadata);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/feedback-analysis', async (req, res) => {
  try {
    const timeRange = parseInt(req.query.days) || 30;
    const analysis = await sentimentAnalysis.analyzeFeedbackPatterns(timeRange);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai/sentiment-dashboard', async (req, res) => {
  try {
    const dashboard = await sentimentAnalysis.getSentimentDashboard();
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Combined AI Operations Dashboard
app.get('/api/ai/dashboard', async (req, res) => {
  try {
    const [autoResolveStats, predictiveDashboard, routingStats, sentimentDashboard] = await Promise.all([
      aiAutoResolution.getAutoResolutionStats(30),
      predictiveAnalytics.getPredictiveDashboard(),
      intelligentRouting.getRoutingStatistics(30),
      sentimentAnalysis.getSentimentDashboard()
    ]);

    res.json({
      success: true,
      timestamp: new Date(),
      aiCapabilities: {
        autoResolution: autoResolveStats,
        predictiveAnalytics: predictiveDashboard,
        intelligentRouting: routingStats,
        sentimentAnalysis: sentimentDashboard
      },
      summary: {
        totalAutoResolved: autoResolveStats.statistics?.reduce((sum, s) => sum + s.autoResolved, 0) || 0,
        predictedIssues: predictiveDashboard.summary?.totalPredictions || 0,
        routingAccuracy: routingStats.routingAccuracy || 0,
        userSatisfaction: sentimentDashboard.sentiment?.averageScore || 'N/A',
        overallHealth: 'Operational'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====== LANGCHAIN ENDPOINTS ======

// LangChain chat with memory (no tools)
app.post('/api/langchain/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false,
        error: 'Message is required' 
      });
    }

    logger.info(`[LangChain Endpoint] Chat request - Session: ${sessionId || 'default'}, Message: "${message}"`);
    
    const result = await langchainService.chatWithLangChain(message, sessionId);
    
    res.json(result);
  } catch (error) {
    logger.error('[LangChain Endpoint] Chat error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// LangChain agent chat with tools
app.post('/api/langchain/agent', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false,
        error: 'Message is required' 
      });
    }

    logger.info(`[LangChain Endpoint] Agent request - Session: ${sessionId || 'default'}, Message: "${message}"`);
    
    const result = await langchainService.chatWithAgent(message, sessionId);
    
    res.json(result);
  } catch (error) {
    logger.error('[LangChain Endpoint] Agent error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Clear LangChain conversation memory
app.post('/api/langchain/reset', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const cleared = langchainService.clearConversationMemory(sessionId || 'default');
    
    res.json({
      success: true,
      message: cleared ? 'Memory cleared successfully' : 'No memory found for this session',
      sessionId: sessionId || 'default'
    });
  } catch (error) {
    logger.error('[LangChain Endpoint] Reset error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ====== SEQUELIZE USER ENDPOINTS ======

// Get all users (Sequelize ORM)
app.get('/api/sequelize/users', async (req, res) => {
  try {
    const { status, department, limit } = req.query;
    
    let where = {};
    if (status) where.Status = status;
    if (department) where.Department = department;
    
    const users = await User.findAll({
      where,
      limit: parseInt(limit) || 50,
      order: [['LastLogin', 'DESC']]
    });
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    logger.error('[Sequelize Endpoint] Get users error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Find user by username (Sequelize ORM)
app.get('/api/sequelize/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findByUsername(username);
    
    if (user) {
      res.json({
        success: true,
        user
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
  } catch (error) {
    logger.error('[Sequelize Endpoint] Find user error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get active users (Sequelize ORM)
app.get('/api/sequelize/users/active/list', async (req, res) => {
  try {
    const users = await User.getActiveUsers();
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    logger.error('[Sequelize Endpoint] Get active users error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start server and test database connections
const server = app.listen(PORT, async () => {
  logger.info(`Server starting on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📝 Open your browser and visit: http://localhost:${PORT}`);
  console.log(`\n🤖 ======= AISERA-LIKE AI FEATURES ======= 🤖`);
  console.log(`   ✨ AI-Powered Auto-Resolution - Resolve incidents automatically`);
  console.log(`   � Predictive Analytics - Detect issues before they occur`);
  console.log(`   🎯 Intelligent Routing - Smart ticket assignment`);
  console.log(`   😊 Sentiment Analysis - Understand user satisfaction`);
  console.log(`   💬 Conversational AI - Natural language understanding`);
  console.log(`\n�🔧 IT Operations Modules Available:`);
  console.log(`   - EventHub: Monitor and manage events`);
  console.log(`   - CMDB: Configuration Management Database`);
  console.log(`   - Business Services: Service health monitoring`);
  console.log(`   - Knowledge Hub: Knowledge articles and solutions`);
  console.log(`   - Service Catalogs: Browse and request services`);
  console.log(`   - Incident Management: Create and track incidents`);
  console.log(`   - Situation Management: Track and resolve situations`);
  console.log(`\n📊 AI Dashboard: http://localhost:${PORT}/api/ai/dashboard`);
  console.log(`📖 Features Guide: See AISERA_FEATURES_GUIDE.md\n`);
  
  // Test MySQL connection
  try {
    logger.info('Testing MySQL connection...');
    const mysqlConnected = await testConnection();
    if (mysqlConnected) {
      logger.info('MySQL connection successful');
    } else {
      logger.error('MySQL connection failed');
    }
  } catch (error) {
    logger.error('MySQL connection error:', error);
  }
  
  // Test and initialize MongoDB connection
  try {
    logger.info('Testing MongoDB connection...');
    await initializeMongoDB();
    const mongoConnected = await testMongoConnection();
    if (mongoConnected) {
      logger.info('MongoDB connection successful');
    } else {
      logger.error('MongoDB connection failed');
    }
  } catch (error) {
    logger.error('MongoDB initialization failed:', error);
    console.error('⚠️  MongoDB initialization failed:', error.message);
    console.log('   IT Operations features may not be available');
  }
  
  // Test Sequelize connection
  try {
    logger.info('Testing Sequelize (MySQL ORM) connection...');
    const sequelizeConnected = await testSequelizeConnection();
    if (sequelizeConnected) {
      logger.info('Sequelize connected successfully');
      console.log('✅ Sequelize ORM connected to MySQL');
    } else {
      logger.error('Sequelize connection failed');
      console.error('⚠️  Sequelize connection failed');
    }
  } catch (error) {
    logger.error('Sequelize connection error:', error);
    console.error('⚠️  Sequelize error:', error.message);
  }
  
  // Warm up Azure OpenAI connection for faster first response
  try {
    logger.info('Warming up Azure OpenAI connection...');
    console.log('🔥 Warming up AI model for faster responses...');
    const warmupStart = Date.now();
    
    await client.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" }
      ],
      max_tokens: 10,
      temperature: 0.1
    });
    
    const warmupTime = Date.now() - warmupStart;
    logger.info(`Azure OpenAI warmup completed in ${warmupTime}ms`);
    console.log(`✅ AI model warmed up successfully (${warmupTime}ms)`);
  } catch (error) {
    logger.warn('Azure OpenAI warmup failed:', error.message);
    console.warn('⚠️  AI warmup failed - first response may be slower');
  }
  
  logger.info('Advanced IT Operations Chatbot is ready');
  console.log('\n✨ Advanced IT Operations Chatbot is ready!');
  console.log(`\n🤖 ======= LANGCHAIN FEATURES ENABLED ======= 🤖`);
  console.log(`   🧠 Conversation Memory - Context-aware chat with BufferMemory`);
  console.log(`   🛠️  AI Agent with Tools - Automatic tool selection and execution`);
  console.log(`   🗄️  Sequelize ORM - Type-safe database operations`);
  console.log(`   📊 IT Operations Tools - CMDB, Incidents, Situations, Events`);
  console.log(`\n📍 LangChain Endpoints:`);
  console.log(`   - POST /api/langchain/chat - Chat with memory (no tools)`);
  console.log(`   - POST /api/langchain/agent - AI Agent with tools`);
  console.log(`   - POST /api/langchain/reset - Clear conversation memory`);
  console.log(`\n📍 Sequelize Endpoints:`);
  console.log(`   - GET /api/sequelize/users - Get all users (ORM)`);
  console.log(`   - GET /api/sequelize/users/:username - Find user by username`);
  console.log(`   - GET /api/sequelize/users/active/list - Get active users`);
  console.log(`\n🎨 Demo Page: http://localhost:${PORT}/langchain-demo.html`);
  console.log(`📋 Logs are being written to: ${path.join(__dirname, 'logs')}\n`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
    console.error(`❌ Error: Port ${PORT} is already in use`);
    console.error('   Please stop the other process or use a different port');
    process.exit(1);
  } else {
    logger.error('Server error:', error);
    console.error('❌ Server error:', error.message);
    process.exit(1);
  }
});
