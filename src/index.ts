
import Fastify from 'fastify';  // Fastify web framework
import fastifyWebSocket from '@fastify/websocket';  // WebSocket plugin
import fastifyCors from '@fastify/cors';  // CORS plugin
import dotenv from 'dotenv';  // Environment variables
import { initDatabase, pool } from './db/database';  // Database initialization
import { orderRoutes } from './routes/orders';  // Order routes
import './workers/order-processor';  // Import worker to start it
dotenv.config();  // Load environment variables from .env


// Create Fastify instance with logging
const fastify = Fastify({
  logger: true  // Simple logger without prettyPrint (works in all Fastify versions)
});

// Configuration from environment variables
const PORT = parseInt(process.env.PORT || '3000');  // Server port
const HOST = process.env.HOST || '0.0.0.0';  // Server host (0.0.0.0 for all interfaces)


// Startup function
async function start() {
  try {
    console.log('🚀 Starting Order Execution Engine...\n');  // Log startup
    
    // Step 1: Initialize database
    console.log('📦 Initializing database...');  // Log database init
    await initDatabase();  // Create tables and indexes
    console.log('✅ Database initialized\n');  // Log success
    
    // Step 2: Register plugins
    console.log('🔌 Registering plugins...');  // Log plugin registration
    
    // Register CORS for cross-origin requests
    await fastify.register(fastifyCors, {
      origin: '*',  // Allow all origins (restrict in production)
      methods: ['GET', 'POST', 'PUT', 'DELETE']  // Allowed HTTP methods
    });
    
    // Register WebSocket support
    await fastify.register(fastifyWebSocket, {
      options: {
        maxPayload: 1048576,  // 1MB max message size
        clientTracking: true   // Track connected clients
      }
    });
    
    console.log('✅ Plugins registered\n');  // Log success
    
    // Step 3: Register routes
    console.log('🛣️  Registering routes...');  // Log route registration
    await fastify.register(orderRoutes);  // Register order endpoints
    console.log('✅ Routes registered\n');  // Log success
    
    // Step 4: Start server
    console.log(`🌐 Starting server on ${HOST}:${PORT}...\n`);  // Log server start
    await fastify.listen({ port: PORT, host: HOST });  // Start listening
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Order Execution Engine is running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Server: http://${HOST}:${PORT}`);
    console.log(`🏥 Health: http://${HOST}:${PORT}/api/health`);
    console.log(`📡 WebSocket: ws://${HOST}:${PORT}/api/orders/execute`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);  // Log startup error
    process.exit(1);  // Exit with error code
  }
}

// Graceful shutdown handler
async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');  // Log shutdown
  
  try {
    await fastify.close();  // Close server
    console.log('✅ Server closed');  // Log server closure
    
    await pool.end();  // Close database connections
    console.log('✅ Database connections closed');  // Log database closure
    
    process.exit(0);  // Exit successfully
  } catch (error) {
    console.error('❌ Error during shutdown:', error);  // Log shutdown error
    process.exit(1);  // Exit with error
  }
}

// Register shutdown handlers
process.on('SIGTERM', shutdown);  // Handle termination signal
process.on('SIGINT', shutdown);  // Handle interrupt signal (Ctrl+C)

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);  // Log rejection
  shutdown();  // Trigger graceful shutdown
});

// Start the application
start();  // Call startup function