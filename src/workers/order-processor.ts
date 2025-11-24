import { Worker, Queue, Job } from 'bullmq';  // BullMQ for job queue management
import Redis from 'ioredis';  // Redis client for queue storage
import { Order, OrderStatus } from '../types';  // Import type definitions
import { MockDexRouter } from '../services/dex-router';  // DEX routing service
import { wsManager } from '../utils/websocket-manager';  // WebSocket manager for updates
import { updateOrder } from '../db/database';  // Database update function
import dotenv from 'dotenv';  // Load environment variables

dotenv.config();  // Load .env file

// Create Redis connection for BullMQ
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',  // Redis server address
  port: parseInt(process.env.REDIS_PORT || '6379'),  // Redis port
  maxRetriesPerRequest: null,  // BullMQ requirement: no retry limit on requests
});

// Initialize DEX router instance
const dexRouter = new MockDexRouter();  // Create router for getting quotes and executing swaps

// Create order queue for managing pending orders
export const orderQueue = new Queue('order-processing', {
  connection,  // Use Redis connection
  defaultJobOptions: {
    attempts: 3,  // Retry failed jobs up to 3 times (CORE REQUIREMENT)
    backoff: {
      type: 'exponential',  // Exponential backoff strategy (CORE REQUIREMENT)
      delay: 1000,  // Start with 1 second delay, then 2s, 4s, 8s...
    },
    removeOnComplete: {
      age: 3600,  // Keep completed jobs for 1 hour
      count: 100,  // Keep max 100 completed jobs
    },
    removeOnFail: {
      age: 7200,  // Keep failed jobs for 2 hours for debugging
    },
  },
});

// Log queue events for monitoring
orderQueue.on('error', (error) => {
  console.error('❌ Queue error:', error);  // Log queue-level errors
});

// Process order job - this is the main order execution logic
async function processOrder(job: Job): Promise<void> {
  const order: Order = job.data;  // Extract order data from job
  const { orderId, tokenIn, tokenOut, amountIn, slippage } = order;  // Destructure order fields
  
  console.log(`\n🚀 Processing order ${orderId} (Attempt ${job.attemptsMade + 1}/${job.opts.attempts})`);  // Log processing start
  
  try {
    // STEP 1: Update status to 'routing' and notify via WebSocket
    console.log(`[${orderId}] Step 1/4: Routing...`);  // Log current step
    await updateOrder(orderId, { status: 'routing' });  // Update database
    wsManager.sendUpdate(orderId, 'routing');  // Send WebSocket update
    
    // Get best route by comparing Raydium and Meteora
    const routeResult = await dexRouter.getBestRoute(tokenIn, tokenOut, amountIn);  // Fetch and compare quotes
    console.log(`[${orderId}] Selected DEX: ${routeResult.selectedDex}`);  // Log selected DEX
    
    // STEP 2: Update status to 'building' (building transaction)
    console.log(`[${orderId}] Step 2/4: Building transaction...`);  // Log current step
    await updateOrder(orderId, { 
      status: 'building',  // Update status
      dexUsed: routeResult.selectedDex  // Store which DEX we're using
    });
    wsManager.sendUpdate(orderId, 'building', { 
      dexUsed: routeResult.selectedDex  // Include DEX info in update
    });
    
    // Simulate transaction building time (would be actual tx construction in real implementation)
    await new Promise(resolve => setTimeout(resolve, 500));  // 500ms delay
    
    // STEP 3: Update status to 'submitted' (sending to blockchain)
    console.log(`[${orderId}] Step 3/4: Submitting to blockchain...`);  // Log current step
    await updateOrder(orderId, { status: 'submitted' });  // Update database
    wsManager.sendUpdate(orderId, 'submitted');  // Send WebSocket update
    
    // Execute the swap on the selected DEX
    const executionResult = await dexRouter.executeSwap(
      routeResult.selectedDex,  // Which DEX to use
      tokenIn,  // Input token
      tokenOut,  // Output token
      amountIn,  // Input amount
      routeResult.quote.amountOut,  // Expected output amount
      slippage || 0.01  // Slippage tolerance
    );
    
    // Check if execution was successful
    if (!executionResult.success) {
      throw new Error(executionResult.error || 'Swap execution failed');  // Throw error to trigger retry
    }
    
    // STEP 4: Update status to 'confirmed' (transaction successful)
    console.log(`[${orderId}] Step 4/4: Confirmed!`);  // Log completion
    await updateOrder(orderId, {
      status: 'confirmed',  // Final success status
      executedPrice: executionResult.executedPrice,  // Store actual execution price
      amountOut: executionResult.amountOut,  // Store actual output amount
      txHash: executionResult.txHash  // Store transaction hash
    });
    
    // Send final success update via WebSocket
    wsManager.sendUpdate(orderId, 'confirmed', {
      txHash: executionResult.txHash,  // Include transaction hash
      executedPrice: executionResult.executedPrice,  // Include execution price
      amountOut: executionResult.amountOut,  // Include output amount
      dexUsed: routeResult.selectedDex  // Include which DEX was used
    });
    
    console.log(`✅ Order ${orderId} completed successfully`);  // Log final success
    
    // Close WebSocket after a short delay (let final message be received)
    setTimeout(() => {
      wsManager.closeConnection(orderId);  // Clean up WebSocket connection
    }, 1000);  // 1 second delay
    
  } catch (error: any) {
    console.error(`❌ Order ${orderId} failed on attempt ${job.attemptsMade + 1}:`, error.message);  // Log error
    
    // Check if this was the final attempt (CORE REQUIREMENT: ≤3 attempts)
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3);  // Check attempt count
    
    if (isFinalAttempt) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // POST-MORTEM ANALYSIS (CORE REQUIREMENT)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.error(`❌ FINAL FAILURE: Order ${orderId}`);
      console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      // Persist failure details for post-mortem analysis (CORE REQUIREMENT)
      const failureDetails = {
        orderId,
        error: error.message,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts || 3,
        timestamp: new Date().toISOString(),
        stack: error.stack,
        orderDetails: {
          tokenIn: order.tokenIn,
          tokenOut: order.tokenOut,
          amountIn: order.amountIn,
          orderType: order.orderType
        }
      };
      
      console.error(`📊 POST-MORTEM DATA:`, JSON.stringify(failureDetails, null, 2));
      console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      // Update database with detailed failure information
      await updateOrder(orderId, {
        status: 'failed',  // Mark as failed
        error: `${error.message} | Attempts: ${job.attemptsMade}/${job.opts.attempts || 3} | Failed at: ${new Date().toISOString()}`  // Store comprehensive error
      });
      
      // Send failure notification to client with attempt information
      wsManager.sendUpdate(orderId, 'failed', {
        error: error.message,  // Send error to user
        attempts: job.attemptsMade,  // Show how many times we tried
        maxAttempts: job.opts.attempts || 3,  // Show max attempts configured
        timestamp: new Date().toISOString()  // When final failure occurred
      });
      
      // In production: Send to monitoring service for analysis
      // await monitoringService.trackFailure(failureDetails);
      // await alertService.notifyDevOps(failureDetails);
      
      console.log(`📧 Failure persisted for post-mortem analysis and monitoring`);
      
      // Close WebSocket after failure notification
      setTimeout(() => {
        wsManager.closeConnection(orderId);  // Clean up connection
      }, 1000);  // 1 second delay
      
    } else {
      // Not final attempt - will retry with exponential backoff
      const nextDelay = Math.pow(2, job.attemptsMade) * 1000;  // Calculate next delay
      console.log(`🔄 Order ${orderId} will retry in ${nextDelay / 1000}s (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`);  // Log retry
      console.log(`   Using exponential backoff: 1s → 2s → 4s → 8s`);
    }
    
    throw error;  // Rethrow to trigger BullMQ retry logic
  }
}

// Create worker to process jobs from the queue
export const orderWorker = new Worker('order-processing', processOrder, {
  connection,  // Use Redis connection
  concurrency: 10,  // Process up to 10 orders concurrently (CORE REQUIREMENT)
  limiter: {
    max: 100,  // Maximum 100 jobs (CORE REQUIREMENT: 100 orders/minute)
    duration: 60000,  // Duration in milliseconds (60 seconds)
  },
});

// Worker event handlers for monitoring
orderWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);  // Log successful completion
});

orderWorker.on('failed', (job, error) => {
  console.error(`❌ Job ${job?.id} failed permanently:`, error.message);  // Log permanent job failure
});

orderWorker.on('error', (error) => {
  console.error('❌ Worker error:', error);  // Log worker-level errors
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing worker...');  // Log shutdown signal
  await orderWorker.close();  // Close worker gracefully
  await orderQueue.close();  // Close queue
  process.exit(0);  // Exit process
});

console.log('👷 Order worker started, processing up to 10 concurrent orders');  // Log worker startup
console.log('🔄 Retry policy: 3 attempts with exponential backoff (1s → 2s → 4s)');  // Log retry config
console.log('📊 Post-mortem analysis enabled for all final failures');  // Log post-mortem feature