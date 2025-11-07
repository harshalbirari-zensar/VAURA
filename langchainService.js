import { AzureChatOpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import dotenv from 'dotenv';
import itOperations from './operations/index.js';
import User from './models/User.js';
import logger from './logger.js';

dotenv.config();

// ============== LANGCHAIN AZURE OPENAI CONFIGURATION ==============

const model = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiVersion: "2025-01-01-preview",
  azureOpenAIApiDeploymentName: "vinci-openai",
  azureOpenAIApiInstanceName: "zenvinciopenai",
  temperature: 0.7,
  maxTokens: 800
});

// Simple in-memory conversation store (replaces BufferMemory)
const conversationStore = new Map();

// ============== LANGCHAIN TOOLS FOR IT OPERATIONS ==============

const tools = [
  // Event Management Tool
  new DynamicTool({
    name: "search_events",
    description: "Search for IT events and alerts in EventHub. Input should be a JSON string with filters like {status, severity, limit}. Example: '{\"status\": \"Open\", \"limit\": 10}'",
    func: async (input) => {
      try {
        const filters = JSON.parse(input);
        logger.info(`[LangChain Tool] Searching events with filters:`, filters);
        const result = await itOperations.searchEvents(filters);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_events:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // CMDB Search Tool
  new DynamicTool({
    name: "search_cmdb",
    description: "Search Configuration Management Database (CMDB) for servers, devices, and configuration items. Input should be a JSON string with filters like {search, ciType, status, limit}. Example: '{\"search\": \"server\", \"limit\": 5}'",
    func: async (input) => {
      try {
        const filters = JSON.parse(input);
        logger.info(`[LangChain Tool] Searching CMDB with filters:`, filters);
        const result = await itOperations.searchCMDB(filters);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error(`[LangChain Tool] Error in search_cmdb:`, error);
        return JSON.stringify({ success: false, error: error.message });
      }
    }
  }),

  // Noisy CI Tool
  new DynamicTool({
    name: "get_noisy_cis",
    description: "Get top noisy configuration items that generate the most alerts. Input should be a number indicating how many top CIs to return (default 5). Example: '10'",
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
    description: "Search and retrieve IT incidents. Input should be a JSON string with filters like {status, priority, assignedTo, limit}. Example: '{\"status\": \"Open\", \"priority\": \"High\"}'",
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
    description: "Search IT situations that require attention. Input should be a JSON string with filters like {status, severity, limit}. Example: '{\"status\": \"Open\"}'",
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
    description: "Get detailed information about a specific situation by ID. Input should be the situation ID as a string. Example: 'SID107'",
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

  // Knowledge Base Search Tool
  new DynamicTool({
    name: "search_knowledge",
    description: "Search the knowledge base for articles, solutions, and documentation. Input should be a search term as a string. Example: 'password reset'",
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
  })
];

// ============== LANGCHAIN AGENT CREATION ==============

export async function createITOpsAgent() {
  try {
    logger.info('[LangChain] Creating IT Operations Agent with tools...');
    
    // Note: Using tool binding instead of deprecated agent executor
    const modelWithTools = model.bindTools(tools);
    
    logger.info('[LangChain] ✅ IT Operations Agent created successfully');
    return modelWithTools;
  } catch (error) {
    logger.error('[LangChain] ❌ Failed to create agent:', error);
    throw error;
  }
}

// ============== CONVERSATION MANAGEMENT ==============

// Get or create conversation history for a session
function getConversationHistory(sessionId = 'default') {
  if (!conversationStore.has(sessionId)) {
    conversationStore.set(sessionId, [
      new SystemMessage(`You are a specialized IT Operations AI Assistant EXCLUSIVELY for the Vinci Platform.

CRITICAL INSTRUCTIONS - FOLLOW STRICTLY:
1. YOU MUST ONLY answer questions about: IT Events, IT Incidents, IT Situations, CMDB, Configuration Items, Knowledge Base, IT Users, IT Operations Dashboards, Server Status, Network Issues
2. YOU MUST IMMEDIATELY REJECT any question about: stocks, gold, ETFs, cryptocurrency, weather, sports, news, cooking, travel, entertainment, general knowledge, or ANY topic not related to Vinci IT Operations
3. When you detect a non-IT question, respond with ONLY this exact short message: "I can only assist with Vinci Platform IT Operations. Please ask about events, incidents, situations, CMDB, or users."
4. DO NOT explain, DO NOT ask for clarification, DO NOT provide helpful suggestions on non-IT topics - just give the short rejection message
5. Stay focused on IT operations and system monitoring tasks only`)
    ]);
  }
  return conversationStore.get(sessionId);
}

// Add message to conversation history
function addToHistory(sessionId, message) {
  const history = getConversationHistory(sessionId);
  history.push(message);
  
  // Keep only last 20 messages (10 exchanges)
  if (history.length > 21) {  // 1 system + 20 messages
    const systemMsg = history[0];
    const recentMessages = history.slice(-20);
    conversationStore.set(sessionId, [systemMsg, ...recentMessages]);
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
    
    const modelWithTools = await createITOpsAgent();
    
    // Step 1: Send initial message to AI
    const response = await modelWithTools.invoke([
      new SystemMessage(`You are a specialized IT Operations assistant EXCLUSIVELY for the Vinci Platform. 

CRITICAL INSTRUCTIONS - FOLLOW STRICTLY:
1. YOU MUST ONLY answer questions about: IT Events, IT Incidents, IT Situations, CMDB, Configuration Items, Knowledge Base, IT Users, IT Operations Dashboards, Server Status, Network Issues
2. YOU MUST IMMEDIATELY REJECT any question about: stocks, gold, ETFs, cryptocurrency, weather, sports, news, cooking, travel, entertainment, general knowledge, or ANY topic not related to Vinci IT Operations
3. When you detect a non-IT question, respond with ONLY this exact short message: "I can only assist with Vinci Platform IT Operations. Please ask about events, incidents, situations, CMDB, or users."
4. DO NOT explain, DO NOT ask for clarification, DO NOT provide helpful suggestions on non-IT topics - just give the short rejection message
5. Always use the available tools when asked about IT operations data

Available tools: search_events, search_cmdb, get_noisy_cis, search_incidents, search_situations, get_situation_details, search_knowledge, get_users, find_user_by_username, get_it_dashboard`),
      new HumanMessage(message)
    ]);
    
    // Step 2: Check if AI wants to use tools
    const toolCalls = response.tool_calls || [];
    
    if (toolCalls.length === 0) {
      // No tools needed, return response directly
      logger.info(`[LangChain Agent] ✅ Response generated without tool usage`);
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
                   toolCall.name === 'find_user_by_username' ||
                   toolCall.name === 'search_knowledge') {
            toolInput = String(toolCall.args.input || toolCall.args.id || toolCall.args.username || toolCall.args.query || '');
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
    const finalResponse = await modelWithTools.invoke([
      new SystemMessage("You are a specialized IT Operations assistant EXCLUSIVELY for the Vinci Platform. Provide helpful, clear responses based on the tool results. Format the data in a user-friendly way."),
      new HumanMessage(message),
      response,  // The AIMessage with tool_calls
      ...toolMessages  // ToolMessage objects with results
    ]);
    
    logger.info(`[LangChain Agent] ✅ Final response generated with ${toolCalls.length} tool(s) used`);
    
    return {
      success: true,
      response: finalResponse.content,
      toolsUsed: toolCalls.map(tc => tc.name),
      toolResults: toolResults,
      sessionId: sessionId
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
