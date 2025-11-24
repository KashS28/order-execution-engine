// Order types that user can submit
export type OrderType = 'market' | 'limit' | 'sniper';

// Status progression through order lifecycle
export type OrderStatus = 
  | 'pending'      // Order received and queued
  | 'routing'      // Comparing DEX prices
  | 'building'     // Creating transaction
  | 'submitted'    // Transaction sent to network
  | 'confirmed'    // Transaction successful
  | 'failed';      // If any step fails

// DEX platforms we support
export type DexPlatform = 'raydium' | 'meteora';

// Incoming order request from user
export interface OrderRequest {
  orderType: OrderType;        // Type of order (we'll use 'market')
  tokenIn: string;             // Input token address (e.g., SOL)
  tokenOut: string;            // Output token address (e.g., USDC)
  amountIn: number;            // Amount to swap
  slippage?: number;           // Optional slippage tolerance (default 0.01)
}

// Complete order with metadata
export interface Order extends OrderRequest {
  orderId: string;             // Unique identifier
  status: OrderStatus;         // Current status
  dexUsed?: DexPlatform;       // Which DEX was selected
  executedPrice?: number;      // Final execution price
  txHash?: string;             // Transaction hash
  error?: string;              // Error message if failed
  createdAt: Date;             // Timestamp
  updatedAt: Date;             // Last update timestamp
}

// Quote from a DEX
export interface DexQuote {
  dex: DexPlatform;            // Which DEX provided this quote
  price: number;               // Price per token
  amountOut: number;           // Expected output amount
  fee: number;                 // Trading fee percentage
  estimatedGas: number;        // Estimated gas cost
}

// Result of routing decision
export interface RouteResult {
  selectedDex: DexPlatform;    // Which DEX we chose
  quote: DexQuote;             // The winning quote
  reason: string;              // Why we chose this DEX
}

// Result after execution
export interface ExecutionResult {
  success: boolean;            // Whether execution succeeded
  txHash?: string;             // Transaction hash if successful
  executedPrice?: number;      // Actual execution price
  amountOut?: number;          // Actual output amount
  error?: string;              // Error message if failed
}

// WebSocket message format
export interface WebSocketMessage {
  orderId: string;             // Which order this update is for
  status: OrderStatus;         // Current status
  data?: {                     // Optional additional data
    dexUsed?: DexPlatform;
    txHash?: string;
    executedPrice?: number;
    error?: string;
  };
  timestamp: Date;             // When this update occurred
}