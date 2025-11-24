import { WebSocketMessage, OrderStatus } from '../types';  // Import type definitions

// Use 'any' type for WebSocket since we're using Fastify's implementation
type WebSocketConnection = any;

// Manager class to handle WebSocket connections for order updates
export class WebSocketManager {
  // Map to store active WebSocket connections by orderId
  private connections: Map<string, WebSocketConnection> = new Map();  // Key: orderId, Value: WebSocket connection
  
  // Register a new WebSocket connection for an order
  registerConnection(orderId: string, socket: WebSocketConnection): void {
    console.log(`🔌 WebSocket connected for order: ${orderId}`);  // Log new connection
    this.connections.set(orderId, socket);  // Store connection in map
    
    // Set up cleanup when socket closes
    socket.on('close', () => {
      console.log(`🔌 WebSocket disconnected for order: ${orderId}`);  // Log disconnection
      this.connections.delete(orderId);  // Remove from active connections
    });
    
    // Handle socket errors
    socket.on('error', (error: any) => {
      console.error(`❌ WebSocket error for order ${orderId}:`, error);  // Log error
      this.connections.delete(orderId);  // Clean up connection
    });
  }
  
  // Send status update to connected client
  sendUpdate(orderId: string, status: OrderStatus, data?: any): void {
    const connection = this.connections.get(orderId);  // Get connection for this order
    
    if (!connection) {
      console.warn(`⚠️  No WebSocket connection found for order: ${orderId}`);  // Log if no connection
      return;  // Exit early if no connection exists
    }
    
    // Create message object with status update
    const message: WebSocketMessage = {
      orderId,  // Which order this update is for
      status,  // Current status (pending, routing, building, etc.)
      data,  // Optional additional data (txHash, error, etc.)
      timestamp: new Date()  // When this update occurred
    };
    
    try {
      // Send message as JSON string
      connection.send(JSON.stringify(message));  // Serialize and send
      console.log(`📤 Sent ${status} update for order: ${orderId}`);  // Log successful send
    } catch (error) {
      console.error(`❌ Failed to send update for order ${orderId}:`, error);  // Log send errors
      this.connections.delete(orderId);  // Remove broken connection
    }
  }
  
  // Close connection for an order (e.g., after completion)
  closeConnection(orderId: string): void {
    const connection = this.connections.get(orderId);  // Get connection
    
    if (connection) {
      connection.close();  // Close the WebSocket
      this.connections.delete(orderId);  // Remove from active connections
      console.log(`🔌 Closed WebSocket for order: ${orderId}`);  // Log closure
    }
  }
  
  // Get count of active connections (useful for monitoring)
  getActiveConnectionsCount(): number {
    return this.connections.size;  // Return number of active connections
  }
}

// Export singleton instance so all parts of app use same manager
export const wsManager = new WebSocketManager();  // Single shared instance