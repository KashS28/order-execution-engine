import { FastifyInstance, FastifyRequest } from 'fastify';  // Fastify types
import { v4 as uuidv4 } from 'uuid';  // Generate unique IDs
import { OrderRequest, Order } from '../types';  // Import type definitions
import { orderQueue } from '../workers/order-processor';  // Queue for job submission
import { wsManager } from '../utils/websocket-manager';  // WebSocket manager
import { saveOrder, getOrder } from '../db/database';  // Database functions

// Define request body schema for validation
interface OrderRequestBody {
  orderType: string;  // Order type: market, limit, sniper
  tokenIn: string;  // Input token address
  tokenOut: string;  // Output token address
  amountIn: number;  // Amount to swap
  slippage?: number;  // Optional slippage tolerance
}

// Register order routes with Fastify
export async function orderRoutes(fastify: FastifyInstance) {
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HTTP → WebSocket Pattern (CORE REQUIREMENT #3)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: POST to create order and receive orderId
  // Step 2: Connect to WebSocket with orderId to stream status
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  // POST /api/orders/execute - Create order and return orderId
  fastify.post('/api/orders/execute', async (request: FastifyRequest<{ Body: OrderRequestBody }>, reply) => {
    try {
      console.log('\n📨 New order received via POST');  // Log incoming order
      
      // Extract and validate order data from request body
      const orderRequest = request.body;
      
      // Validate required fields
      if (!orderRequest.tokenIn || !orderRequest.tokenOut || !orderRequest.amountIn) {
        return reply.status(400).send({
          error: 'Missing required fields: tokenIn, tokenOut, amountIn'
        });
      }
      
      // Validate order type (we only support market orders)
      if (orderRequest.orderType !== 'market') {
        return reply.status(400).send({
          error: 'Only market orders are supported in this implementation'
        });
      }
      
      // Validate amount is positive
      if (orderRequest.amountIn <= 0) {
        return reply.status(400).send({
          error: 'Amount must be greater than 0'
        });
      }
      
      // Generate unique order ID
      const orderId = uuidv4();
      console.log(`📝 Generated order ID: ${orderId}`);
      
      // Create complete order object
      const order: Order = {
        orderId,
        orderType: orderRequest.orderType as any,
        tokenIn: orderRequest.tokenIn,
        tokenOut: orderRequest.tokenOut,
        amountIn: orderRequest.amountIn,
        slippage: orderRequest.slippage || 0.01,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Save order to database
      await saveOrder(order);
      console.log(`💾 Order ${orderId} saved to database`);
      
      // Add order to processing queue
      await orderQueue.add('process-order', order, {
        jobId: orderId,
      });
      console.log(`📋 Order ${orderId} added to processing queue`);
      
      // Return orderId immediately (HTTP response)
      return reply.status(201).send({
        orderId,
        message: 'Order created successfully',
        websocketUrl: `/api/orders/${orderId}/stream`,
        instructions: 'Connect to WebSocket URL to receive real-time status updates'
      });
      
    } catch (error: any) {
      console.error('❌ Error creating order:', error);
      return reply.status(500).send({
        error: 'Failed to create order',
        details: error.message
      });
    }
  });
  
  // GET /api/orders/:orderId/stream - WebSocket endpoint for status updates
  fastify.get('/api/orders/:orderId/stream', { websocket: true }, async (connection, request) => {
    const { orderId } = request.params as { orderId: string };
    
    console.log(`\n🔌 WebSocket connection established for order: ${orderId}`);
    
    try {
      // Verify order exists
      const order = await getOrder(orderId);
      
      if (!order) {
        connection.socket.send(JSON.stringify({
          error: 'Order not found',
          orderId
        }));
        connection.socket.close();
        return;
      }
      
      // Register WebSocket connection for this order
      wsManager.registerConnection(orderId, connection.socket);
      console.log(`🔌 WebSocket registered for order ${orderId}`);
      
      // Send current status immediately
      connection.socket.send(JSON.stringify({
        orderId,
        status: order.status,
        message: 'Connected - streaming status updates',
        timestamp: new Date()
      }));
      
      // If order is already completed or failed, send final status
      if (order.status === 'confirmed') {
        wsManager.sendUpdate(orderId, 'confirmed', {
          txHash: order.tx_hash,
          executedPrice: parseFloat(order.executed_price),
          amountOut: parseFloat(order.amount_out),
          dexUsed: order.dex_used
        });
        
        setTimeout(() => {
          wsManager.closeConnection(orderId);
        }, 1000);
      } else if (order.status === 'failed') {
        wsManager.sendUpdate(orderId, 'failed', {
          error: order.error
        });
        
        setTimeout(() => {
          wsManager.closeConnection(orderId);
        }, 1000);
      }
      
      // WebSocket will receive updates as order progresses through worker
      
    } catch (error: any) {
      console.error(`❌ WebSocket error for order ${orderId}:`, error);
      connection.socket.send(JSON.stringify({
        error: 'Failed to establish WebSocket connection',
        details: error.message
      }));
      connection.socket.close();
    }
  });
  
  // GET /api/orders/:orderId - Get order status by ID
  fastify.get('/api/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    console.log(`🔍 Fetching order: ${orderId}`);
    
    try {
      const order = await getOrder(orderId);
      
      if (!order) {
        return reply.status(404).send({
          error: 'Order not found',
          orderId
        });
      }
      
      return reply.send(order);
      
    } catch (error: any) {
      console.error(`❌ Error fetching order ${orderId}:`, error);
      return reply.status(500).send({
        error: 'Failed to fetch order',
        details: error.message
      });
    }
  });
  
  // GET /api/health - Health check endpoint
  fastify.get('/api/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date(),
      queue: {
        activeConnections: wsManager.getActiveConnectionsCount()
      }
    });
  });
}