import { AzureChatOpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import dotenv from 'dotenv';
import itOperations from './operations/index.js';
import { handleITOperationsQuery } from './services/itOperationsService.js';
import User from './models/User.js';
import logger from './logger.js';
import conversationContext from './services/conversationContext.js';
import learningService from './services/conversationLearningService.js';
import { arrayToTableData } from './utils/tableFormatter.js';
import kiSolutionService from './services/kiSolutionService.js';
import historicalAnalysisService from './services/historicalAnalysisService.js';
import { convertSuggestionsToChips } from './utils/navigationHelper.js';
import knowledgeBaseService from './services/knowledgeBaseService.js';
import personaService from './services/personaService.js';

dotenv.config();

// ============== LANGCHAIN AZURE OPENAI CONFIGURATION ==============

const model = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiVersion: "2025-01-01-preview",
  azureOpenAIApiDeploymentName: "vinci-openai",
  azureOpenAIApiInstanceName: "zenvinciopenai",
  temperature: 0.1, // Very low temperature for strict instruction following (was 0.5)
  maxTokens: 600,   // Reduced from 800 to speed up generation
  streaming: true   // Enable streaming for faster perceived response
});

// Simple in-memory conversation store (replaces BufferMemory)
const conversationStore = new Map();

// NOTE: Learning system is now initialized in server.js on startup
// This ensures all learning data is loaded BEFORE handling any requests

// ============== LANGCHAIN TOOLS FOR IT OPERATIONS ==============

// ============== PERFORMANCE OPTIMIZATION - CACHING ==============
const toolResultCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(toolName, input) {
  return `${toolName}:${JSON.stringify(input)}`;
}

function getCachedResult(toolName, input) {
  const key = getCacheKey(toolName, input);
  const cached = toolResultCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`[Cache Hit] ${toolName} - ${input.substring(0, 50)}`);
    return cached.result;
  }
  return null;
}

function setCachedResult(toolName, input, result) {
  const key = getCacheKey(toolName, input);
  toolResultCache.set(key, { result, timestamp: Date.now() });
  // Clean old cache entries (max 100 items)
  if (toolResultCache.size > 100) {
    const firstKey = toolResultCache.keys().next().value;
    toolResultCache.delete(firstKey);
  }
}

// Create tools with session context
function createToolsWithSession(sessionId) {
  return [
  // Event Management Tool
  new DynamicTool({
    name: "search_events",
    description: "Search EventHub for events/alerts by ID (EV12345, AL456) or filters. Use for Event ID queries, field queries (status, severity), or event searches. Examples: 'EV14686', 'show open events', 'what is status for EV123'",
    func: async (input) => {
      try {
        // Check cache first
        const cached = getCachedResult('search_events', input);
        if (cached) return cached;
        
        logger.info(`[LangChain Tool] Processing event query: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        const jsonResult = JSON.stringify(result, null, 2);
        
        // Cache result
        setCachedResult('search_events', input, jsonResult);
        return jsonResult;
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_events:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Business Service Management Tool
  new DynamicTool({
    name: "search_business_services",
    description: "Search Business Services (NOT Configuration Items). Use for: 1) Listing all business services ('show all BS', 'list services'), 2) Getting business service DETAILS by name ('show details of test1234', 'get info on a-15/1/25'), 3) Service health queries ('which service has warning'). IMPORTANT: If user asks for 'details of [name]' where name was shown in a previous business service list, use this tool! Examples: 'Show all business services', 'show details of test1234', 'get info on a-15/1/25', 'details of test12345'. Input: EXACT user message",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Searching Business Services: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        
        // CRITICAL: Determine the actual count from the response structure
        let actualCount = 0;
        let servicesData = null;
        let isDetailQuery = false;
        
        // Check if this is a detail query (single service) or list query (multiple services)
        if (result.data) {
          actualCount = result.data.count || (result.data.services ? result.data.services.length : 0);
          servicesData = result.data.services;
          isDetailQuery = result.data.type === 'detail' || actualCount === 1;
        } else if (result.count !== undefined) {
          actualCount = result.count;
          servicesData = result.services;
          isDetailQuery = actualCount === 1;
        }
        
        // Log the actual data for debugging
        logger.info(`[LangChain Tool] Business Services Result: count=${actualCount}, hasServices=${!!servicesData}, servicesLength=${servicesData?.length || 0}, isDetailQuery=${isDetailQuery}`);
        
        // Remove any pre-formatted response to force AI to read raw data
        const cleanedResult = {
          success: result.success,
          data: result.data,
          module: result.module,
          action: result.action,
          type: result.type
        };
        
        // Add metadata at the TOP level to make it more visible to AI
        const enhancedResult = {
          ACTUAL_COUNT: actualCount,
          QUERY_TYPE: isDetailQuery ? 'BUSINESS_SERVICE_DETAILS' : 'BUSINESS_SERVICES_LIST',
          SERVICE_NAMES: servicesData ? servicesData.map(s => s.DisplayName || s.serviceName).filter(Boolean) : [],
          ...cleanedResult,
          _metadata: {
            queryType: isDetailQuery ? 'BUSINESS_SERVICE_DETAILS' : 'BUSINESS_SERVICES_LIST',
            count: actualCount,
            isDetailQuery: isDetailQuery,
            serviceNames: servicesData ? servicesData.map(s => s.DisplayName || s.serviceName).filter(Boolean) : []
          }
        };
        
        logger.info(`[LangChain Tool] Returning enhanced result with ACTUAL_COUNT=${actualCount}`);
        return JSON.stringify(enhancedResult, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_business_services:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // CMDB Search Tool
  new DynamicTool({
    name: "search_cmdb",
    description: "Search CMDB for Configuration Items (CIs) ONLY - servers, devices, network equipment, hardware. DO NOT use for Business Services! DO NOT use if user is asking about a name that was previously shown in a business service list! Business Services have names like 'test1234', 'a-15/1/25', etc. CIs have technical names like 'SERVER-01', 'DB-PROD-01', IP addresses. Input: JSON with filters {search, ciType, status, limit}",
    func: async (input) => {
      try {
        const filters = JSON.parse(input);
        logger.info(`[LangChain Tool] Searching CMDB with filters:`, filters);
        const result = await itOperations.searchCMDB(filters);
        
        // Add metadata
        const enhancedResult = {
          ...result,
          _metadata: {
            queryType: 'CONFIGURATION_ITEMS'
          }
        };
        
        return JSON.stringify(enhancedResult, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_cmdb:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Noisy CI Tool
  new DynamicTool({
    name: "get_noisy_cis",
    description: "Get top noisy CIs generating most alerts. Input: number (default 5)",
    func: async (input) => {
      try {
        const limit = parseInt(input) || 5;
        logger.info(`[LangChain Tool] Getting top ${limit} noisy CIs`);
        const result = await itOperations.getNoisyCIs(limit);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_noisy_cis:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Incident Management Tool
  new DynamicTool({
    name: "search_incidents",
    description: "Search incidents. Input: JSON {status, priority, assignedTo, limit}",
    func: async (input) => {
      try {
        const filters = JSON.parse(input);
        logger.info(`[LangChain Tool] Searching incidents with filters:`, filters);
        const result = await itOperations.getIncidents(filters);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_incidents:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Situation Management Tool
  new DynamicTool({
    name: "search_situations",
    description: "Search situations. Input: JSON {status, severity, limit}",
    func: async (input) => {
      try {
        const filters = JSON.parse(input);
        logger.info(`[LangChain Tool] Searching situations with filters:`, filters);
        const result = await itOperations.searchSituations(filters);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_situations:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Situation Details Tool
  new DynamicTool({
    name: "get_situation_details",
    description: "Get situation details by ID. Input: situation ID (e.g., 'SID107')",
    func: async (input) => {
      try {
        const situationId = input.trim();
        logger.info(`[LangChain Tool] Getting details for situation: ${situationId}`);
        const result = await itOperations.getSituationDetails(situationId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_situation_details:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Situation Worklog Tool
  new DynamicTool({
    name: "get_situation_worklog",
    description: "Get situation worklog/history/timeline. Use for 'worklog', 'work log', 'history'. Input: situation ID",
    func: async (input) => {
      try {
        const situationId = input.trim();
        logger.info(`[LangChain Tool] Getting worklog for situation: ${situationId}`);
        const result = await itOperations.getSituationWorklog(situationId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_situation_worklog:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Knowledge Base Search Tool
  new DynamicTool({
    name: "search_knowledge",
    description: "Search knowledge base for articles/solutions. Input: search term",
    func: async (input) => {
      try {
        const searchTerm = input.trim();
        logger.info(`[LangChain Tool] Searching knowledge base for: ${searchTerm}`);
        const result = await itOperations.searchKnowledge(searchTerm);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_knowledge:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // KI Solution Search Tool
  new DynamicTool({
    name: "search_ki_solutions",
    description: "Search KIDetails for solutions to situations/alerts/events. Use for 'solution', 'how to fix', 'resolution steps'. Input: EXACT user message or situation ID",
    func: async (input) => {
      try {
        const searchTerm = input.trim();
        logger.info(`[LangChain Tool] Searching KI solutions for: ${searchTerm}`);
        const result = await kiSolutionService.searchKISolutions(searchTerm);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_ki_solutions:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Knowledge Base Hub Search Tool (NEW)
  new DynamicTool({
    name: "search_knowledge_base_hub",
    description: "Search Knowledge Base Hub for articles, documentation, FAQs, and detailed guides. Use for 'KB articles', 'knowledge base', 'documentation', 'KB search', 'find KB article', 'knowledge hub', 'show me articles', 'available solutions'. Returns comprehensive articles with categories, tags, attachments from YOUR database. ALWAYS use this tool when user asks about KB articles or solutions in database. Input: search term or query",
    func: async (input) => {
      try {
        const searchTerm = input.trim();
        logger.info(`[LangChain Tool] Searching Knowledge Base Hub for: ${searchTerm}`);
        
        // Search knowledge base using the service method
        const result = await knowledgeBaseService.searchKnowledge(searchTerm, {
          limit: 20,
          state: 'Published'
        });
        
        // Format response with metadata
        const formattedResult = {
          success: result.success,
          module: 'knowledge-base-hub',
          action: 'search',
          data: {
            count: result.total || result.data?.length || 0,
            total: result.total || 0,
            articles: result.data || [],
            searchTerm: searchTerm
          },
          _metadata: {
            queryType: 'KNOWLEDGE_BASE_HUB_SEARCH',
            searchTerm: searchTerm,
            source: 'Knowledge Base Hub Database (MySQL + MongoDB)',
            instruction: 'If count > 0, list the articles found. If count = 0, say no articles found in database.'
          }
        };
        
        logger.info(`[LangChain Tool] Found ${formattedResult.data.count} KB Hub articles for "${searchTerm}"`);
        return JSON.stringify(formattedResult, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_knowledge_base_hub:`, error);
        return JSON.stringify({ 
          success: false, 
          error: error.message,
          module: 'knowledge-base-hub',
          message: 'Error searching Knowledge Base database'
        });
      }
    }
  }),

  // Historical Ticket Analysis Tool
  new DynamicTool({
    name: "get_historical_context",
    description: "Find similar past situations and solutions based on IssueTags. Shows how similar tickets were closed before. Use for 'show similar situations', 'past tickets', 'historical data'. Input: situation ID (e.g., 'SID3229')",
    func: async (input) => {
      try {
        const situationId = input.trim();
        logger.info(`[LangChain Tool] Getting historical context for: ${situationId}`);
        const result = await historicalAnalysisService.getHistoricalContext(situationId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_historical_context:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // User Management Tool (Sequelize)
  new DynamicTool({
    name: "get_users",
    description: "Get user information from the database using Sequelize ORM. Input should be a JSON string with filters like {status, department, limit} or 'all' for all users. Example: '{\"status\": \"Active\", \"limit\": 10}'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool - Sequelize] Getting users with filter: ${input}`);
        
        if (input.trim().toLowerCase() === 'all') {
          const users = await User.findAll({ limit: 50 });
          return JSON.stringify({ success: true, count: users.length, users }, null, 2);
        }
        
        const filters = JSON.parse(input);
        let where = {};
        
        if (filters.status) {
          where.Status = filters.status;
        }
        if (filters.department) {
          where.Department = filters.department;
        }
        
        const users = await User.findAll({ 
          where,
          limit: filters.limit || 50,
          order: [['LastLogin', 'DESC']]
        });
        
        return JSON.stringify({ success: true, count: users.length, users }, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool - Sequelize] Error in get_users:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // User by Username Tool (Sequelize)
  new DynamicTool({
    name: "find_user_by_username",
    description: "Find a specific user by username using Sequelize ORM. Input should be the username as a string. Example: 'john.doe'",
    func: async (input) => {
      try {
        const username = input.trim();
        logger.info(`[LangChain Tool - Sequelize] Finding user: ${username}`);
        const user = await User.findByUsername(username);
        
        if (user) {
          return JSON.stringify({ success: true, user }, null, 2);
        } else {
          return JSON.stringify({ success: false, error: 'User not found' });
        }
      } catch (error) {
        logger.error(`[LangChain Tool - Sequelize] Error in find_user_by_username:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // IT Dashboard Tool
  new DynamicTool({
    name: "get_it_dashboard",
    description: "Get comprehensive IT operations dashboard with statistics and metrics. No input required, just call with empty string ''",
    func: async () => {
      try {
        logger.info(`[LangChain Tool] Getting IT operations dashboard`);
        const result = await itOperations.getITOperationsDashboard();
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_it_dashboard:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Statistics Tool - for time-based queries
  new DynamicTool({
    name: "get_statistics",
    description: "Get statistics and counts for Events, Alerts, Situations, or Incidents with optional time-based filtering. Supports queries like 'last 2 weeks', 'last 5 months', 'last 3 days', specific dates, or years. Input should be the EXACT user message to properly parse time periods. Examples: 'last 2 weeks Total Events', 'last 5 months total alerts', 'incidents in 2023', 'active incidents', 'latest statistics'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Getting statistics for query: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_statistics:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Advanced Analytics Tool
  new DynamicTool({
    name: "get_analytics",
    description: "Get advanced analytics including: Events by Source, Incidents by State/Priority, Situations vs Incidents comparison, Category with Active Incidents, Resolved Incidents, MTTR Statistics, Top Noisy CIs, Weekly Trends, Events/Alerts Trends, Events Stream. Input should be the EXACT user message. Examples: 'Events by Source', 'Incidents by State', 'Situations vs Incidents last 10 weeks', 'Top 10 Noisy CI', 'MTTR Statistics', 'Events-Situations-Incidents Weekly Trend'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Getting analytics for query: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_analytics:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Alert Management Tool
  new DynamicTool({
    name: "manage_alerts",
    description: "Manage IT alerts - acknowledge, escalate, suppress, close alerts, or get active alerts. Input should be the EXACT user message. Examples: 'acknowledge alert AL123', 'escalate alert AL456 to John', 'suppress this alert for 2 hours', 'close alert AL789', 'who acknowledged alert AL123', 'show active alerts', 'list critical alerts'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Managing alert: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in manage_alerts:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Enhanced Incident Management Tool
  new DynamicTool({
    name: "manage_incidents",
    description: "Manage IT incidents - create, assign, update, resolve, close incidents, or get incident status. Supports context references like 'this incident', 'that incident'. Input should be the EXACT user message. Examples: 'assign incident INC001 to Harshal', 'what is the status of incident INC002', 'resolve incident INC003', 'close this incident', 'create incident for server down', 'assign this incident to John'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Managing incident: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in manage_incidents:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Automation Actions Tool
  new DynamicTool({
    name: "automation_actions",
    description: "Perform automation actions on servers and services - restart service/server, run diagnostics, clear disk space, check health, get remediation logs, trigger remediation. Input should be the EXACT user message. Examples: 'restart Apache service on server01', 'restart server prod-web-01', 'run diagnostics on db-server', 'clear disk space on app-server', 'check health of server01', 'show remediation logs', 'trigger remediation for high CPU on server01'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Executing automation: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in automation_actions:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Analytics: Situations vs Incidents Tool
  new DynamicTool({
    name: "get_analytics",
    description: "Get comprehensive analytics comparing situations vs incidents with charts, trends, and insights. Supports queries like 'Situations vs Incidents', 'last 20 weeks data', 'compare situations and incidents', etc. Input should be the EXACT user message for proper time period parsing. Examples: 'Situations vs Incidents last 20 weeks', 'compare situations and incidents last 6 months', 'show me situations vs incidents'",
    func: async (input) => {
      try {
        logger.info(`[LangChain Tool] Getting analytics for query: "${input}" for session: ${sessionId}`);
        const result = await handleITOperationsQuery(input, sessionId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in get_analytics:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  })
];
}

// Default tools (for backward compatibility)
const tools = createToolsWithSession('default');

// ============== LANGCHAIN AGENT CREATION ==============

export async function createITOpsAgent(sessionId = 'default') {
  try {
    logger.info(`[LangChain] Creating IT Operations Agent with tools for session: ${sessionId}...`);
    
    // Create tools with session context
    const sessionTools = createToolsWithSession(sessionId);
    
    // Note: Using tool binding instead of deprecated agent executor
    const modelWithTools = model.bindTools(sessionTools);
    
    logger.info('[LangChain] ✅ IT Operations Agent created successfully');
    return modelWithTools;
  } catch (error) {
    logger.error('[LangChain] ❌ Failed to create agent:', error);
    throw error;
  }
}

// ============== CONVERSATION MANAGEMENT ==============

// Get or create conversation history for a session
function getConversationHistory(sessionId = 'default', userPersona = 'IT_ENGINEER') {
  if (!conversationStore.has(sessionId)) {
    // Get persona-specific system prompt
    const personaPrompt = personaService.getSystemPrompt(userPersona);
    
    // Base system instructions (common to all personas)
    const baseInstructions = `

**SCOPE:** ONLY answer questions about: Events, Incidents, Situations, CMDB, CIs, Knowledge Base, Dashboards, Analytics, Alerts, Automation, Server Management.

**REJECT:** Non-IT topics (stocks, weather, sports, news, etc.) with: "I can't provide that information. I'm designed to assist with IT Operations tasks."

**CRITICAL RULES:**
1. ALWAYS READ TOOL OUTPUT: After calling a tool, parse the JSON response and use the actual data values
2. When user provides Event/Alert/Situation/Incident IDs (EV12345, AL456, SID123, INC001), IMMEDIATELY use appropriate tool
3. NEVER hallucinate data - use ONLY exact database responses from tool output
4. If database returns SituationID: "SID3229", use "SID3229" exactly - never invent IDs
5. If tool returns data.count = 10, say "10 business services" - NEVER say 0
6. For follow-up questions about previous responses, provide explanations

**TOOL SELECTION - CRITICAL:**
- Business Service queries (show business services, list BS, service health) → USE search_business_services tool
- Business Service DETAILS queries (show details of test1234, get info on a-15/1/25) → USE search_business_services tool
- Configuration Item queries (show CIs, CMDB search, server search) → USE search_cmdb tool  
- NEVER use search_cmdb for Business Service queries
- NEVER use search_business_services for CI/CMDB queries
- IF a name was shown in a previous business service list response, and user asks for "details of [name]", use search_business_services!

**CONTEXT TRACKING (ENHANCED):**
- Remember "this incident", "that alert", "this server" references across up to 20 messages
- Remember names from previous responses (e.g., if "test1234" was shown as a Business Service, it stays a Business Service)
- If user asks "show details of X" where X was in a previous Business Service list, X is a Business Service (NOT a CI!)
- Link current queries to recent context
- Maintain awareness of discussed entities and their types
- Track conversation flow and user intent patterns

**SOLUTION HANDLING:**
- For "solution"/"how to fix" queries, search KIDetails collection FIRST
- Present documented solutions before generic advice

**BUSINESS SERVICE RESPONSES - READ THE DATA FIRST:**
STEP 1: Read the tool output JSON. Look for data.count or data.services.length
STEP 2: Use the EXACT count from the data, never assume 0
STEP 3: Format response with accurate numbers

CRITICAL: The tool returns JSON with structure:
{
  "data": {
    "count": 10,  <--- USE THIS NUMBER
    "services": [ array of 10 business services ]
  }
}

- When you receive business service data with services array, you are showing BUSINESS SERVICES, NOT Configuration Items
- Each item in the services array IS a Business Service with fields: DisplayName, BusinessServiceID, Type, Priority, Status, Owner
- DO NOT confuse Business Services with CIs - they are completely different entities

**SITUATION HANDLING:**
- After showing event with "Related Situations: X", remember the situation ID
- When user asks "show situation", use specific situation ID from context
- Never list ALL situations when user asks about a specific one

IT Flow: CI → Event → Alert → Situation → Solution → Incident`;

    conversationStore.set(sessionId, [
      new SystemMessage(personaPrompt + baseInstructions)
    ]);
  }
  return conversationStore.get(sessionId);
}

// Add message to conversation history
function addToHistory(sessionId, message, userPersona = 'IT_ENGINEER') {
  const history = getConversationHistory(sessionId, userPersona);
  history.push(message);
  
  // ENHANCED: Keep last 20 messages (10 exchanges) for better context tracking
  // This fixes the issue where context is lost after 10-12 messages
  if (history.length > 21) {  // 1 system + 20 messages
    const systemMsg = history[0];
    const recentMessages = history.slice(-20);
    conversationStore.set(sessionId, [systemMsg, ...recentMessages]);
    logger.info(`[Context] Trimmed history to 20 messages for session: ${sessionId}`);
  }
}

// Clear memory for a session
export function clearConversationMemory(sessionId = 'default') {
  if (conversationStore.has(sessionId)) {
    conversationStore.delete(sessionId);
    logger.info(`[LangChain] Cleared conversation memory for session: ${sessionId}`);
    return true;
  }
  return false;
}

// ============== LANGCHAIN DIRECT CHAT (WITH MEMORY) ==============

export async function chatWithLangChain(message, sessionId = 'default') {
  try {
    logger.info(`[LangChain Chat] Processing message for session ${sessionId}: "${message}"`);
    
    // Get conversation history
    const history = getConversationHistory(sessionId);
    
    // Add user message
    addToHistory(sessionId, new HumanMessage(message));
    
    // Get response from AI
    const response = await model.invoke(getConversationHistory(sessionId));
    
    // Add AI response to history
    addToHistory(sessionId, response);
    
    logger.info(`[LangChain Chat] ✅ Response generated successfully`);
    
    return {
      success: true,
      response: response.content,
      sessionId: sessionId,
      historyLength: getConversationHistory(sessionId).length
    };
  } catch (error) {
    logger.error('[LangChain Chat] ❌ Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============== LANGCHAIN AGENT CHAT (WITH TOOLS) ==============

export async function chatWithAgent(message, sessionId = 'default') {
  try {
    logger.info(`[LangChain Agent] Processing message for session ${sessionId}: "${message}"`);
    
    // STEP 1: Detect user persona
    const history = getConversationHistory(sessionId);
    const personaInfo = personaService.detectPersona(sessionId, message, history);
    logger.info(`[Persona] Detected: ${personaInfo.personaName} (${personaInfo.confidence}% confidence)`);
    
    // STEP 2: Check if user is asking about a previously learned entity
    const learnedEntity = conversationContext.hasLearnedEntity(sessionId, message);
    if (learnedEntity) {
      logger.info(`[Learning] Found learned entity: ${learnedEntity.entityName} (${learnedEntity.entityType})`);
      
      // Get past conversation context about this entity
      const pastContext = conversationContext.getEntityContext(sessionId, message);
      if (pastContext.length > 0) {
        logger.info(`[Learning] Found ${pastContext.length} past conversations about this entity`);
        // Add context to message
        message = `[Context: User previously asked about "${learnedEntity.entityName}" which is a ${learnedEntity.entityType}]\n\nCurrent question: ${message}`;
      }
    }
    
    const modelWithTools = await createITOpsAgent(sessionId);
    
    // Step 1: Send initial message to AI
    const response = await modelWithTools.invoke([
      new SystemMessage(`You are a specialized IT Operations assistant EXCLUSIVELY for the Vinci Platform. 

🚨🚨🚨 **ABSOLUTE CRITICAL RULES - VIOLATION IS PROHIBITED!** 🚨🚨🚨

**RULE #1: ALWAYS USE TOOLS TO SEARCH DATABASE**
- When user asks about "KB articles", "solutions", "knowledge base", "documentation"
- YOU MUST call search_knowledge_base_hub tool to search the actual database
- ⛔ NEVER answer with generic/global knowledge without checking database first
- ✅ ALWAYS show what you found in the database
- ✅ If database has 0 results, then you can provide general guidance

**RULE #2: CRITICAL DATA READING**

When you receive tool output JSON, you MUST:
1. READ the "ACTUAL_COUNT" field (this is at the TOP of JSON)
2. READ the "data.count" field
3. COUNT the items in "data.services" array
4. USE this count in your response
5. NEVER say "0 services" or "no data" if any of these numbers > 0

EXAMPLE: If you see {"ACTUAL_COUNT": 7, "data": {"count": 7, "services": [7 items]}}
YOU MUST SAY: "I found **7 business services**..." (NOT "0 business services")

⛔ **PROHIBITED RESPONSES WHEN DATA EXISTS:**
- ❌ "no business services found"
- ❌ "0 business services"
- ❌ "currently no business services"
- ❌ "there are no services"

✅ **REQUIRED WHEN data.count > 0:**
- ✅ "I found **[count] business services**"
- ✅ Use the EXACT number from the data

CRITICAL INSTRUCTIONS - FOLLOW STRICTLY:

**MANDATORY COPILOT-STYLE RESPONSE FORMAT FOR ALL QUERIES:**

You MUST structure EVERY response with these EXACT section headers:

**Section Headers to Use:**
- **📢 Summary** - For the conversational introduction
- **📊 Key Statistics** or **📊 Key Information** - For the data points
- **🔍 Service Details** or **🔍 Details** - For detailed item lists
- **✅ What You Can Ask Next** - For suggested follow-up questions

**Response Structure:**

**1. 📢 Summary Section** (2-4 sentences)
   - Start with "I found..." or "I checked..." 
   - Use bold for numbers: "I found **7 business services**"
   - Explain what the data represents and why it matters
   - Mention overall status/health overview
   - Keep tone conversational and friendly

**2. 📊 Key Statistics Section** (bullet list with emojis)
   - Use bold labels: • **Total Business Services:** 7
   - Add relevant emojis:
     - Status: 🟢 Operational, 🟡 Maintenance, 🔴 Non-Operational, 🟣 DR
     - Priority: 🔴 High, 🟡 Medium, 🟢 Low
     - Criticality: 🔥 Most Critical, ⚠️ Less Critical, 🟠 Somewhat Critical
   - Group related stats together
   - Show counts and breakdowns

**3. � Details Section** (formatted list)
   - For business services: • **[Name]** – [Priority] | [Status emoji] [Status] | [Environment] | Owner: [Name] | [Criticality emoji] [Criticality]
   - For other items: Use similar pipe-separated format
   - Use bold for item names
   - Include relevant emojis for quick scanning

**4. ✅ What You Can Ask Next** (actionable questions)
   - Each question starts with ❓
   - Wrap in quotes: ❓ "Show details of [item]"
   - Make questions specific to the current context
   - Provide 5-7 relevant suggestions

**EXAMPLE COPILOT-STYLE RESPONSE:**

User: "Show me situation SID3229"

Your Response:

**📢 Summary**

I found situation **SID3229** in the system. It's a critical issue affecting your production MySQL database server that started about 2 hours ago. The database is experiencing high CPU utilization and slow response times, which is impacting application performance. This has already been escalated to the DBA team and linked to incident INC0015824.

**📊 Key Information**

• **Situation ID:** SID3229
• **Status:** 🔴 Open (Active)
• **Severity:** ⚠️ Critical
• **Component:** prod-db-01 (MySQL Database Server)
• **Issue:** High CPU utilization, slow queries
• **Related Incident:** INC0015824
• **Assigned To:** DBA Team (John Doe)
• **Created:** 2 hours ago

**✅ What You Can Ask Next**

❓ "Show me the full details and timeline"
❓ "What solutions are available for this?"
❓ "Show similar past situations"
❓ "What's the current worklog?"
❓ "Show related incident INC0015824"
• **Created:** 2 hours ago

� **What You Can Ask Next:**
❓ "Show me the complete details and worklog"
❓ "What solutions are recommended for this issue?"
❓ "Show me similar situations from the past"
❓ "What's the current status of incident INC0015824?"
❓ "Get the latest metrics for prod-db-01"
"

**CRITICAL RULES:**

**RESPONSE EXAMPLES - FOLLOW THESE PATTERNS:**

EXAMPLE 1 - Situation Query:
When user asks "Show me situation SID3229", respond with the 3-part structure with explanation, key fields, and clickable suggestions.

EXAMPLE 2 - Business Service Details:
When user asks "Show details of test1234" (where test1234 is a Business Service), respond like:

"📋 **Business Service: test1234**

I found the business service 'test1234' in your CMDB. This is a Business Service currently marked as Non-Operational. The service has 4 Configuration Items connected to it, with 3 of them currently online. It's classified as High priority, which means it requires immediate attention and close monitoring.

📊 **Service Details**
• **Service Name:** test1234  
• **Service ID:** BS1
• **Type:** Business Service
• **Operational Status:** 🔴 Non-Operational
• **Priority:** 🔴 High
• **Criticality:** Most Critical
• **Owner:** Hemant Gautam

📦 **Related Configuration Items Summary**
• **Total CIs:** 4 (4 Technical, 0 Business)
• **Online:** 3 🟢 | **Offline:** 1 🔴
• **Health:** 4 Normal
• **Key CIs:** /Canonical/UbuntuServer/14.04.5-LTS/latest, VINCIAPPDEMOAIR_Ethernet_Adapter, Vinci3DomCI

💡 **What You Can Ask Next:**
❓ "Show all CIs under test1234"
❓ "Get detailed health metrics for test1234"
❓ "Show incidents related to test1234"
❓ "Why is test1234 non-operational?"
❓ "Show test1234 change history"
"

**VINCI DATA ONLY - NO HALLUCINATION:**
- YOU MUST ONLY use data from Vinci MongoDB database and Vinci MySQL database
- NEVER make up or hallucinate data, IDs, dates, statuses, or any information
- If data is not in the tool response, say "Not available" - NEVER invent values
- ALL responses MUST be based EXCLUSIVELY on real-world Vinci data from:
  * MongoDB Collections: Situations, Events, Alerts, Incidents, KIDetails, BusinessService, CMDBStore, etc.
  * MySQL Tables: soldetails, users, rbac tables, etc.

**HISTORICAL CONTEXT:**
- When showing situations, ALWAYS mention if similar past situations exist
- Reference solutions from soldetails table that match IssueTags
- Example: "Based on historical data, this type of issue was resolved 5 times using MySQL Restart solution"

**SCOPE RESTRICTIONS:**
- YOU MUST ONLY answer questions about: IT Events, IT Incidents, IT Situations, CMDB, Configuration Items, Knowledge Base, IT Users, IT Operations Dashboards, Server Status, Network Issues
- YOU MUST IMMEDIATELY REJECT any question about: stocks, gold, ETFs, cryptocurrency, weather, sports, news, cooking, travel, entertainment, general knowledge, jokes, cricket scores, live scores, or ANY topic not related to Vinci IT Operations

**5. ID RECOGNITION & TOOL USAGE:**
When user mentions ANY of these patterns, you MUST immediately use the appropriate search tool:
- "Event ID EV12345" or "EV12345" → Use search_events tool
- "Alert ID AL12345" or "AL12345" → Use manage_alerts tool  
- "Situation ID SID12345", "SID12345", "MID12345", or "MID12345" → Use get_situation_details tool
- "Incident INC12345" or "INC12345" → Use manage_incidents tool

**NEVER** say "I don't have access" when user provides an ID.
**ALWAYS** search the Vinci database FIRST using the appropriate tool.

**6. EXACT DATA USAGE:**
- You MUST ONLY use data from the database tool responses
- NEVER invent IDs, timestamps, statuses, or details
- If database returns SituationID: "SID3229", use "SID3229" EXACTLY
- If a field is missing, say "Not available" - DO NOT invent a value
- Database truth is ABSOLUTE

**7. CONTEXT-AWARE FOLLOW-UPS:**
Remember previous context:
- "show me the situation" → Extract situation ID from previous response
- "what solutions?" → Use situation ID from current conversation
- Call specific tools (get_situation_details), NOT generic searches

**8. OUT-OF-SCOPE HANDLING:**
For non-IT questions, respond:
"I can't provide that information. I'm designed to assist with IT Operations tasks like server management, monitoring, and automation."

**9. TOOL USAGE:**
- Time-based queries → use get_statistics with EXACT user message
- Analytics queries → use get_analytics with EXACT user message  
- Solution requests → use search_ki_solutions FIRST
- Historical analysis → use get_historical_context for similar situations
- Knowledge Base articles/documentation → use search_knowledge_base_hub (NEW - comprehensive KB Hub with detailed guides)
- Legacy KB → use search_knowledge (old system)
- Be tolerant of spelling mistakes

**10. KNOWLEDGE BASE DISTINCTION - CRITICAL USAGE RULES:**

🚨 **WHEN USER ASKS ABOUT KB/ARTICLES/SOLUTIONS, YOU MUST USE THESE TOOLS:**

**search_knowledge_base_hub** → **REQUIRED FOR:**
- "KB articles" or "knowledge base"
- "show me articles"
- "available solutions" or "how many solutions"
- "find documentation"
- "search KB for [topic]"
- ANY question about articles in database
- **YOU MUST search the actual database FIRST before answering**

**search_ki_solutions** → Use for:
- "how to fix [situation]"
- "solution for SID123"
- "resolution steps"
- Technical fixes for specific situations/alerts

**search_knowledge** → Legacy KB (rarely used)

**CRITICAL RULE:**
- ⛔ NEVER answer KB/article questions with generic knowledge
- ✅ ALWAYS call search_knowledge_base_hub tool when user asks about KB articles
- ✅ ALWAYS show actual count from database
- ✅ If database returns 0 results, ONLY THEN provide general guidance
- ✅ Tell user "I found [X] articles in the database" (use actual number)

Available tools: search_events, search_cmdb, get_noisy_cis, search_incidents, search_situations, get_situation_details, get_situation_worklog, search_knowledge, search_ki_solutions, search_knowledge_base_hub, get_historical_context, get_users, find_user_by_username, get_it_dashboard, get_statistics, get_analytics`),
      new HumanMessage(message)
    ]);
    
    // Step 2: Check if AI wants to use tools
    const toolCalls = response.tool_calls || [];
    
    if (toolCalls.length === 0) {
      // No tools needed, return response directly
      logger.info(`[LangChain Agent] ✅ Response generated without tool usage`);
      
      // Save conversation for learning (without entity extraction)
      await learningService.saveConversation(sessionId, message, response.content, {});
      
      return {
        success: true,
        response: response.content,
        toolsUsed: [],
        sessionId: sessionId
      };
    }
    
    // Step 3: Execute all tool calls
    logger.info(`[LangChain Agent] AI requested ${toolCalls.length} tool calls`);
    
    const toolMessages = [];
    const toolResults = [];
    
    for (const toolCall of toolCalls) {
      const tool = tools.find(t => t.name === toolCall.name);
      
      if (!tool) {
        logger.error(`[LangChain Agent] Tool not found: ${toolCall.name}`);
        toolMessages.push(
          new ToolMessage({
            content: JSON.stringify({ success: false, error: `Tool ${toolCall.name} not found` }),
            tool_call_id: toolCall.id
          })
        );
        continue;
      }
      
      try {
        // Execute the tool
        logger.info(`[LangChain Agent] Executing tool: ${toolCall.name} with args:`, toolCall.args);
        
        // Convert args to string format expected by DynamicTool
        let toolInput = '';
        if (typeof toolCall.args === 'object') {
          // For tools expecting JSON string
          if (toolCall.name === 'search_events' || 
              toolCall.name === 'search_cmdb' || 
              toolCall.name === 'search_incidents' || 
              toolCall.name === 'search_situations' ||
              toolCall.name === 'get_users') {
            toolInput = JSON.stringify(toolCall.args);
          } 
          // For tools expecting simple string/number
          else if (toolCall.name === 'get_noisy_cis') {
            toolInput = String(toolCall.args.limit || toolCall.args.input || 5);
          }
          else if (toolCall.name === 'get_situation_details' || 
                   toolCall.name === 'get_situation_worklog' ||
                   toolCall.name === 'find_user_by_username' ||
                   toolCall.name === 'search_knowledge' ||
                   toolCall.name === 'search_business_services' ||
                   toolCall.name === 'get_statistics' ||
                   toolCall.name === 'get_analytics') {
            toolInput = String(toolCall.args.input || toolCall.args.id || toolCall.args.username || toolCall.args.query || toolCall.args.message || '');
          }
          else if (toolCall.name === 'get_it_dashboard') {
            toolInput = '';
          }
        } else {
          toolInput = String(toolCall.args);
        }
        
        const result = await tool.func(toolInput);
        
        // Create ToolMessage with matching tool_call_id
        toolMessages.push(
          new ToolMessage({
            content: result,
            tool_call_id: toolCall.id
          })
        );
        
        toolResults.push({ 
          tool: toolCall.name, 
          args: toolCall.args,
          result: JSON.parse(result) 
        });
        
        logger.info(`[LangChain Agent] ✅ Tool ${toolCall.name} executed successfully`);
      } catch (error) {
        logger.error(`[LangChain Agent] ❌ Tool ${toolCall.name} failed:`, error);
        
        toolMessages.push(
          new ToolMessage({
            content: JSON.stringify({ success: false, error: error.message }),
            tool_call_id: toolCall.id
          })
        );
        
        toolResults.push({ 
          tool: toolCall.name, 
          error: error.message 
        });
      }
    }
    
    // Step 4: Send tool results back to AI for final response
    // IMPORTANT: Must use the SAME modelWithTools to continue the conversation
    
    const systemPrompt = `You are a specialized IT Operations assistant for the Vinci Platform.

**🚨🚨🚨 ABSOLUTE CRITICAL RULES - VIOLATING IS FORBIDDEN 🚨🚨🚨**

**RULE #1: REPORT DATABASE SEARCH RESULTS ACCURATELY**
⛔ **YOU ARE ABSOLUTELY PROHIBITED FROM SAYING "0" OR "NO DATA" WHEN DATA EXISTS!**
✅ **YOU MUST report the EXACT count from tool results**

**RULE #2: KNOWLEDGE BASE RESPONSES**
When tool is "search_knowledge_base_hub":
- ✅ ALWAYS say "I searched the Knowledge Base database"
- ✅ ALWAYS report the count: "I found [X] articles" (use actual count from data.count or data.total)
- ✅ If count > 0: List the article titles, categories, and summaries
- ✅ If count = 0: Say "I found 0 articles in the database for '[search term]'. Here's some general guidance..."
- ⛔ NEVER skip checking the database
- ⛔ NEVER provide generic answers before showing database results

📊 **DATA READING PROTOCOL - FOLLOW EXACTLY:**
STEP 1: When you receive tool output, IMMEDIATELY look at the JSON structure
STEP 2: Find and READ the field named "ACTUAL_COUNT" (it's at the TOP of the JSON)
STEP 3: Find and READ the field named "data.count" 
STEP 4: Find and READ the field named "data.services" array
STEP 5: COUNT the items in "data.services" array yourself
STEP 6: USE the ACTUAL_COUNT or data.count in your response

🔥 **EXAMPLE - IF YOU SEE THIS:**
{
  "ACTUAL_COUNT": 7,
  "data": {
    "count": 7,
    "services": [7 items array]
  }
}

✅ **YOU MUST SAY:** "I found **7 business services** in your CMDB..."
❌ **YOU MUST NOT SAY:** "no business services" or "0 business services"

⚠️ **MANDATORY FIRST STEP - DO THIS BEFORE ANYTHING ELSE:**
1. Look for ACTUAL_COUNT field at the TOP of the JSON response
2. Look for QUERY_TYPE field at the TOP of the JSON response
3. Look for SERVICE_NAMES field at the TOP of the JSON response
4. Look at data.count field
5. Count the items in data.services array
6. The ACTUAL_COUNT is the TRUE count - USE THIS NUMBER in your response
7. IGNORE any "response" field that may exist in the data
8. NEVER say "0" or "no data" if ACTUAL_COUNT > 0 OR if data.services array has items

**EXAMPLE - IF YOU SEE THIS IN TOOL OUTPUT:**
\`\`\`json
{
  "ACTUAL_COUNT": 7,
  "QUERY_TYPE": "BUSINESS_SERVICES_LIST",
  "SERVICE_NAMES": ["SaaS Applications", "Healthcare", "HR Systems"],
  "data": { "count": 7, "services": [...] }
}
\`\`\`

**YOU MUST SAY:** "I found **7 business services** in your CMDB..." (NOT 0!)

**STEP-BY-STEP RESPONSE GENERATION:**
1. READ the ACTUAL_COUNT field (this is at the top level of JSON)
2. READ the QUERY_TYPE field (this tells you what kind of query it was)
3. CHECK QUERY_TYPE:
   - If "BUSINESS_SERVICE_DETAILS" → Format as single service details
   - If "BUSINESS_SERVICES_LIST" → Format as list of services
4. USE the EXACT ACTUAL_COUNT in your response - this is the TRUTH

**DATA STRUCTURE YOU WILL RECEIVE:**
\`\`\`json
{
  "ACTUAL_COUNT": <NUMBER>,
  "QUERY_TYPE": "BUSINESS_SERVICE_DETAILS" or "BUSINESS_SERVICES_LIST",
  "SERVICE_NAMES": ["service1", "service2"],
  "data": { ... actual data ... },
  "_metadata": { ... backup metadata ... }
}
\`\`\`

**📝 VERIFICATION STEP (THINK BEFORE YOU RESPOND):**
Before generating your response, you must internally verify:
- "I see ACTUAL_COUNT = [number]" 
- "I see data.count = [number]"
- "I see data.services array has [number] items"
- "I will say 'I found [number] business services'"

**MANDATORY COPILOT-STYLE FORMAT FOR BUSINESS SERVICES LIST:**

Structure your response with these EXACT sections and headers:

**Section 1: 📢 Summary** (conversational paragraph)
- Start with "I found **[X] business services** in your CMDB."
- Add 2-3 sentences explaining what these services represent
- Mention overall health/status overview
- Keep tone friendly and informative

**Section 2: 📊 Key Statistics** (bullet points with emojis)
- **Total Business Services:** [count from ACTUAL_COUNT]
- **Status:** Use emojis: 🟢 Operational, 🟡 Maintenance, 🔴 Non-Operational, 🟣 DR
- **Priority:** Use emojis: 🔴 High, 🟡 Medium, 🟢 Low
- **Criticality:** Use emojis: 🔥 Most Critical, ⚠️ Less Critical, 🟠 Somewhat Critical
- **Environments:** List counts (Production, Demo, QA, etc.)
- **Owners:** List unique owner names

**Section 3: 🔍 Service Details** (formatted list with pipes)
Format EACH service as:
• **[DisplayName]** – [Priority] Priority | [Status emoji + text] | [Environment] | Owner: [Owner] | [Criticality emoji + text]

Status emojis:
- 🟢 for "Operational"
- 🟡 for "Maintenance"
- 🔴 for "Non-Operational"
- 🟣 for "DR"

Criticality emojis:
- 🔥 for "Most Critical"
- ⚠️ for "Less Critical"
- 🟠 for "Somewhat Critical"

**Section 4: ✅ What You Can Ask Next** (suggested questions)
- List 5-7 actionable questions
- Each starts with ❓ emoji
- Wrap in quotes: ❓ "Show details of [ServiceName]"
- One question per service shown in details section

**EXAMPLE 1 - IF YOU SEE data.count = 7 and data.services has 7 items:**

**YOUR RESPONSE MUST BE IN THIS EXACT FORMAT:**

**📢 Summary**

I found **7 business services** in your CMDB. These services represent key business and technical capabilities actively monitored for health, performance, and operational status. Each service has its own owner, priority, and deployment environment, helping you track business impact and manage incidents effectively.

The majority are operational, with one in maintenance, spanning Production, Demo, and QA environments.

**📊 Key Statistics**

• **Total Business Services:** 7
• **Status:** 🟢 Operational (6), 🟡 Maintenance (1)
• **Priority:** 🔴 High (5), 🟡 Medium (2)
• **Criticality:** 🔥 Most Critical (3), ⚠️ Less Critical (2), 🟠 Somewhat Critical (2)
• **Environments:** Production (2), Demo (3), QA (2)
• **Owners:** Sumit P, Ravindrasinh Vaghela, vamshi Machavarapu

**🔍 Service Details**

• **SaaS Applications** – High Priority | 🟢 Operational | Production | Owner: Sumit P | ⚠️ Less Critical
• **Healthcare** – High Priority | 🟡 Maintenance | Demo | Owner: Sumit P | ⚠️ Less Critical
• **HR Systems** – High Priority | 🟢 Operational | QA | Owner: Sumit P | 🔥 Most Critical
• **Konakart_Ecommerce** – High Priority | 🟢 Operational | Production | Owner: Sumit P | 🔥 Most Critical
• **Employee Directory** – High Priority | 🟢 Operational | Demo | Owner: Ravindrasinh Vaghela | 🔥 Most Critical
• **NetSuite** – Medium Priority | 🟢 Operational | QA | Owner: vamshi Machavarapu | 🟠 Somewhat Critical
• **Hospital Management System** – Medium Priority | 🟢 Operational | Demo | Owner: Sumit P | 🟠 Somewhat Critical

**✅ What You Can Ask Next**

❓ "Show details of SaaS Applications"
❓ "Show details of Healthcare"
❓ "Show details of HR Systems"
❓ "Show details of Konakart_Ecommerce"
❓ "Show details of Employee Directory"
❓ "Show details of NetSuite"
❓ "Show details of Hospital Management System"

**EXAMPLE 2 - IF YOU SEE ACTUAL_COUNT = 0 OR data.services = []:**

**ONLY THEN** you can say:

I checked your CMDB for business services, but there are currently no business services registered in your system...

**❌ IGNORE PRE-FORMATTED RESPONSES - CRITICAL RULE:**
- If the tool output contains a "response" field with text, **COMPLETELY IGNORE IT**
- NEVER copy or reuse any text from a "response" field
- ONLY read raw data from: ACTUAL_COUNT, QUERY_TYPE, SERVICE_NAMES, data object
- Generate your OWN response using the 3-part format above
- Use ACTUAL_COUNT for all count references (this is the TRUTH!)

**BUSINESS SERVICE DATA READING - STEP BY STEP:**
Tool returns JSON with this structure:
\`\`\`json
{
  "ACTUAL_COUNT": 7,                    ← USE THIS NUMBER!
  "QUERY_TYPE": "BUSINESS_SERVICES_LIST",  ← USE THIS TO DETERMINE FORMAT!
  "SERVICE_NAMES": ["Service1", "Service2"],  ← USE THESE NAMES!
  "data": {
    "count": 7,
    "services": [...],
    "statistics": {...}
  }
}
\`\`\`

**YOUR RESPONSE GENERATION STEPS:**
1. ✅ READ ACTUAL_COUNT → This is 7, so say "I found **7 business services**"
2. ✅ READ QUERY_TYPE → This is "BUSINESS_SERVICES_LIST", so format as a list
3. ✅ READ data.statistics → Use this for the statistics section
4. ✅ READ SERVICE_NAMES → Use these for examples and suggestions
5. ❌ NEVER say "0 services" or "no services" when ACTUAL_COUNT > 0
- Use _metadata.serviceNames for service name suggestions

**BUSINESS SERVICE DETAILS FORMAT (when showing ONE service):**

**1. 📋 EXPLANATION / OVERVIEW** (3-5 sentences)
Start with a clear, conversational explanation of the business service:
- What the service is and what it does
- Current operational status and health
- Why it matters (criticality, business impact)
- Any immediate concerns or highlights

Example: "I found the business service 'test1234' in your CMDB. This is a [Type] service currently marked as [Status]. The service has 4 Configuration Items connected to it, with 3 of them currently online. It's classified as [Criticality] priority, which means it requires [level] of monitoring and attention."

**2. 📊 KEY SERVICE DETAILS** (Main Information)
Show the core service attributes:
• **Service Name:** [DisplayName]
• **Service ID:** [BusinessServiceID]
• **Type:** [Type] (Business Service / Technical Service)
• **Operational Status:** [OperationalStatus with emoji: 🟢 Operational / 🔴 Non-Operational / 🟡 DR]
• **Priority:** [Priority with emoji: 🔴 High / 🟡 Medium / 🟢 Low]
• **Criticality:** [Criticality]
• **Owner:** [Owner]
• **Health Score:** [if available, otherwise "Not available"]

**3. 📦 RELATED CONFIGURATION ITEMS** (CI Summary)
Provide a summary of CIs under this service:
• **Total CIs:** [count]
• **Technical CIs:** [count]
• **Business CIs:** [count]
• **Online:** [count] 🟢
• **Offline:** [count] 🔴
• **Health Status:** [X Normal, Y Warning, Z Critical]

If there are CIs, mention: "This service depends on [X] Configuration Items including [list first 2-3 CI names]..."

**4. 💡 WHAT YOU CAN ASK NEXT** (Interactive Suggestions)
Provide 4-6 clickable action items:
❓ "Show all CIs under [ServiceName]"
❓ "Get detailed health metrics for [ServiceName]"
❓ "Show incidents related to [ServiceName]"
❓ "Who is the owner of [ServiceName]?"
❓ "Check [ServiceName] dependencies"
❓ "Show [ServiceName] change history"

Note: These suggestions should be formatted as clickable options in the frontend

**READING PRIORITY:**
1. FIRST: Read aiContext.queryType from the JSON response
2. SECOND: Read aiContext.totalCount OR count field for the actual count
3. THIRD: Read the services array from data.services for service details
4. FOURTH: Read statistics from aiContext.statistics OR statistics field
5. VERIFY: If queryType = "business_service_detail", format as single service details
6. VERIFY: If queryType = "business_service_list", format as multiple services list

**CRITICAL DATA FIELDS TO READ:**
- aiContext.totalCount = The number of services found
- data.services = Array of service objects with details
- aiContext.statistics = Breakdown by status, priority, criticality, environment
- count = Alternative field for total count if aiContext not present

**NEVER SHOW RAW JSON OR ARRAYS:**
- DO NOT display raw aiContext or _metadata objects
- DO NOT display raw data structures or arrays
- Extract important fields and format them conversationally
- ALWAYS use the count from aiContext.totalCount or count field
- Present in the 3-part structure only`;

    const finalResponse = await modelWithTools.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
      response,  // The AIMessage with tool_calls
      ...toolMessages  // ToolMessage objects with results
    ]);
    
    logger.info(`[LangChain Agent] ✅ Final response generated with ${toolCalls.length} tool(s) used`);
    
    // Extract entities from tool results for learning
    const extractedEntities = {};
    for (const toolResult of toolResults) {
      if (toolResult.result && toolResult.result.success) {
        // Extract CI names
        if (toolResult.tool === 'search_cmdb' && toolResult.result.configurationItems) {
          const ciNames = toolResult.result.configurationItems.map(ci => 
            ci.ciName || ci.CIName || ci.EntityName
          ).filter(Boolean);
          if (ciNames.length > 0) {
            extractedEntities.ci = ciNames[0]; // Store first CI
          }
        }
        
        // Extract server names
        if (toolResult.result.data && toolResult.result.data.serverName) {
          extractedEntities.server = toolResult.result.data.serverName;
        }
        
        // Extract incident numbers
        if (toolResult.result.data && toolResult.result.data.incidentNumber) {
          extractedEntities.incident = toolResult.result.data.incidentNumber;
        }
        
        // Extract alert IDs
        if (toolResult.result.data && toolResult.result.data.alertId) {
          extractedEntities.alert = toolResult.result.data.alertId;
        }
      }
    }
    
    // Save conversation for learning
    await learningService.saveConversation(sessionId, message, finalResponse.content, extractedEntities);
    
    // Learn from past conversations periodically
    if (Math.random() < 0.1) { // 10% chance to trigger learning
      learningService.learnFromPastConversations(sessionId).catch(err => 
        logger.error('[Learning] Error during background learning:', err)
      );
    }
    
    // Format any table data in tool results for frontend consumption
    const formattedToolResults = toolResults.map(result => {
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        return {
          ...result,
          tableData: arrayToTableData(result.data)
        };
      }
      return result;
    });
    
    // 🚨 CRITICAL DATA VALIDATION FIX 🚨
    // Check if AI incorrectly said "0" when data shows a different count
    let correctedResponse = finalResponse.content;
    
    for (const toolResult of toolResults) {
      if (toolResult.result && toolResult.result.success) {
        // Extract actual count from multiple possible locations
        let actualCount = 0;
        let services = [];
        let stats = {};
        
        // Check result.data structure
        if (toolResult.result.data) {
          actualCount = toolResult.result.data.count || (toolResult.result.data.services ? toolResult.result.data.services.length : 0);
          services = toolResult.result.data.services || toolResult.result.services || [];
          stats = toolResult.result.statistics || toolResult.result.data.statistics || {};
        } 
        // Check result structure directly
        else if (toolResult.result.count !== undefined) {
          actualCount = toolResult.result.count;
          services = toolResult.result.services || [];
          stats = toolResult.result.statistics || {};
        }
        
        // If tool returned data with count > 0 but AI response says "0" or "none" or "no data"
        if (actualCount > 0 && services.length > 0) {
          const responseHasZero = /Total.*?:\s*0|:\s*0\s*[•\n]|no\s+business\s+services|none\s+listed|currently\s+none|did\s+not\s+find\s+any/i.test(correctedResponse);
          
          if (responseHasZero) {
            logger.warn(`[LangChain Agent] ⚠️  DATA MISMATCH DETECTED: AI said "0" but tool returned count=${actualCount}. Regenerating response...`);
            
            const topServices = services.slice(0, 5).map(s => s.DisplayName || s.name).filter(Boolean).join(', ');
            
            const statusBreakdown = stats.byStatus ? Object.entries(stats.byStatus).map(([k,v]) => `${v} ${k}`).join(', ') : 'Not available';
            const priorityBreakdown = stats.byPriority ? Object.entries(stats.byPriority).map(([k,v]) => `${v} ${k}`).join(', ') : 'Not available';
            const criticalCount = stats.byCriticality ? (stats.byCriticality['Most Critical'] || 0) : 'Not available';
            
            correctedResponse = `📋 **Business Services Found**

I found **${actualCount} business service${actualCount > 1 ? 's' : ''}** registered in your CMDB. ${actualCount > 5 ? `These are critical business capabilities that need monitoring and management.` : `Here ${actualCount > 1 ? 'are all the services' : 'is the service'} currently tracked.`}

📊 **Key Statistics**
• **Total Business Services:** ${actualCount} ✅
• **Operational Status:** ${statusBreakdown}
• **Priority Breakdown:** ${priorityBreakdown}
• **Critical Services:** ${criticalCount}
• **Example Services:** ${topServices || services.map(s => s.DisplayName).slice(0, 3).join(', ')}

💡 **What You Can Ask Next:**
❓ "Show details of ${services[0]?.DisplayName || 'test1234'}"
❓ "List non-operational business services"
❓ "Get CIs under ${services[0]?.DisplayName || 'a specific service'}"
❓ "Who owns these business services?"
❓ "Show business service health scores"`;
            
            logger.info(`[LangChain Agent] ✅ Response corrected with actual count: ${actualCount}`);
          }
        }
      }
    }
    
    // 🎯 Convert plain text suggestions to interactive HTML chips
    const responseWithChips = convertSuggestionsToChips(correctedResponse);
    
    return {
      success: true,
      response: responseWithChips,
      toolsUsed: toolCalls.map(tc => tc.name),
      toolResults: formattedToolResults,
      sessionId: sessionId,
      learnedEntities: Object.keys(extractedEntities).length > 0 ? extractedEntities : undefined
    };
    
  } catch (error) {
    logger.error('[LangChain Agent] ❌ Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============== EXPORTS ==============

export default {
  model,
  tools,
  createITOpsAgent,
  getConversationHistory,
  clearConversationMemory,
  chatWithLangChain,
  chatWithAgent
};
