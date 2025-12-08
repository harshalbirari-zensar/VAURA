import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from './config/app.js';
import { setupMiddleware, errorHandler, setupProcessHandlers, setupGracefulShutdown } from './middleware/index.js';
import routes from './routes/index.js';
import { warmupAzureOpenAI, testDatabaseConnections, displayStartupInfo, displayLangChainInfo } from './utils/index.js';
import logger from './logger.js';
import continuousTrainingService from './services/continuousTraining.js';
import conversationLearningService from './services/conversationLearningService.js';
import userChatHistoryService from './services/userChatHistoryService.js';
import personaService from './services/personaService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express application
const app = express();

// Setup middleware
setupMiddleware(app);

// Setup routes
app.use(routes);

// Error handler middleware (must be last)
app.use(errorHandler);

// Setup process event handlers
setupProcessHandlers();

// Start server and initialize connections
const server = app.listen(config.port, async () => {
  logger.info(`Server starting on http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  
  // Display startup information
  displayStartupInfo(config.port);
  
  // Test database connections
  await testDatabaseConnections();
  
  // Initialize learning systems (MUST be done BEFORE handling requests)
  try {
    logger.info('Initializing learning systems...');
    
    // Initialize persona service (loads persona training data)
    await personaService.initialize();
    logger.info('✅ Persona service initialized (IT Engineer, IT Manager, CIO/CTO)');
    
    // Initialize continuous training service (loads training data from files)
    await continuousTrainingService.initialize();
    logger.info('✅ Continuous training service initialized');
    
    // Load learning memory from MongoDB
    await conversationLearningService.loadLearningMemory();
    logger.info('✅ Learning memory loaded from MongoDB');
    
    // Enable auto-save for learning data
    conversationLearningService.enableAutoSave();
    logger.info('✅ Auto-save enabled (30 minute intervals)');
    
    // Create indexes for user chat history
    await userChatHistoryService.createIndexes();
    logger.info('✅ User chat history indexes created');
    
    console.log('🧠 Learning systems initialized successfully');
  } catch (error) {
    logger.error('Error initializing learning systems:', error);
    console.error('⚠️  Warning: Learning systems failed to initialize');
    console.error('   The chatbot will work but without persisted training data');
  }
  
  // Warm up Azure OpenAI connection for faster first response
  await warmupAzureOpenAI();
  
  console.log('✅ All systems connected successfully');
  console.log('✨ Advanced IT Operations Chatbot is ready!\n');
  
  // Display additional info
  logger.info('Advanced IT Operations Chatbot is ready');
  await displayLangChainInfo(config.port);
});

// Setup graceful shutdown
setupGracefulShutdown(server);

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use`);
    console.error(`❌ Error: Port ${config.port} is already in use`);
    console.error('   Please stop the other process or use a different port');
    process.exit(1);
  } else {
    logger.error('Server error:', error);
    console.error('❌ Server error:', error.message);
    process.exit(1);
  }
});
