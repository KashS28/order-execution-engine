import { Pool } from 'pg';  // PostgreSQL client library
import dotenv from 'dotenv';  // Load environment variables

dotenv.config();  // Load .env file into process.env

// Create connection pool for efficient database connections
export const pool = new Pool({
  host: process.env.POSTGRES_HOST,      // Database server address
  port: parseInt(process.env.POSTGRES_PORT || '5432'),  // Database port
  database: process.env.POSTGRES_DB,     // Database name
  user: process.env.POSTGRES_USER,       // Database username
  password: process.env.POSTGRES_PASSWORD,  // Database password
  max: 20,  // Maximum number of connections in pool
  idleTimeoutMillis: 30000,  // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000,  // Timeout if connection takes > 2 seconds
});

// Test database connection on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');  // Log successful connection
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err);  // Log any connection errors
  process.exit(-1);  // Exit application if database fails
});

// Initialize database schema
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();  // Get a client from the pool
  
  try {
    // Create orders table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,        -- Unique order identifier
        order_type VARCHAR(50) NOT NULL,          -- market/limit/sniper
        token_in VARCHAR(255) NOT NULL,           -- Input token address
        token_out VARCHAR(255) NOT NULL,          -- Output token address
        amount_in DECIMAL(20, 8) NOT NULL,        -- Input amount
        slippage DECIMAL(5, 4) DEFAULT 0.01,      -- Slippage tolerance
        status VARCHAR(50) NOT NULL,              -- Current order status
        dex_used VARCHAR(50),                     -- raydium or meteora
        executed_price DECIMAL(20, 8),            -- Final execution price
        amount_out DECIMAL(20, 8),                -- Actual output amount
        tx_hash VARCHAR(255),                     -- Blockchain transaction hash
        error TEXT,                               -- Error message if failed
        created_at TIMESTAMP DEFAULT NOW(),       -- Order creation time
        updated_at TIMESTAMP DEFAULT NOW()        -- Last update time
      )
    `);
    
    // Create index on status for efficient queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status 
      ON orders(status)
    `);
    
    // Create index on created_at for time-based queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_created_at 
      ON orders(created_at DESC)
    `);
    
    console.log('✅ Database schema initialized');  // Log successful initialization
    
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);  // Log initialization errors
    throw error;  // Rethrow to stop application startup
  } finally {
    client.release();  // Always release client back to pool
  }
}

// Save new order to database
export async function saveOrder(order: any): Promise<void> {
  const query = `
    INSERT INTO orders (
      order_id, order_type, token_in, token_out, amount_in, 
      slippage, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
  `;
  
  const values = [
    order.orderId,      // $1 - Unique order ID
    order.orderType,    // $2 - Order type
    order.tokenIn,      // $3 - Input token
    order.tokenOut,     // $4 - Output token
    order.amountIn,     // $5 - Input amount
    order.slippage || 0.01,  // $6 - Slippage with default
    order.status        // $7 - Initial status
  ];
  
  await pool.query(query, values);  // Execute insert query
}

// Update order status and related fields
export async function updateOrder(
  orderId: string,
  updates: Partial<any>
): Promise<void> {
  const fields = [];  // Array to store SET clause parts
  const values = [];  // Array to store parameter values
  let paramCount = 1;  // Parameter counter for $1, $2, etc.
  
  // Build dynamic UPDATE query based on provided fields
  if (updates.status) {
    fields.push(`status = $${paramCount++}`);  // Add status field
    values.push(updates.status);  // Add status value
  }
  if (updates.dexUsed) {
    fields.push(`dex_used = $${paramCount++}`);  // Add dex_used field
    values.push(updates.dexUsed);  // Add dex value
  }
  if (updates.executedPrice) {
    fields.push(`executed_price = $${paramCount++}`);  // Add price field
    values.push(updates.executedPrice);  // Add price value
  }
  if (updates.amountOut) {
    fields.push(`amount_out = $${paramCount++}`);  // Add amount_out field
    values.push(updates.amountOut);  // Add amount value
  }
  if (updates.txHash) {
    fields.push(`tx_hash = $${paramCount++}`);  // Add tx_hash field
    values.push(updates.txHash);  // Add hash value
  }
  if (updates.error) {
    fields.push(`error = $${paramCount++}`);  // Add error field
    values.push(updates.error);  // Add error message
  }
  
  // Always update the updated_at timestamp
  fields.push(`updated_at = NOW()`);
  values.push(orderId);  // Last parameter is the WHERE clause orderId
  
  const query = `
    UPDATE orders 
    SET ${fields.join(', ')}  -- Join all SET clauses
    WHERE order_id = $${paramCount}  -- WHERE clause
  `;
  
  await pool.query(query, values);  // Execute update query
}

// Get order by ID
export async function getOrder(orderId: string): Promise<any | null> {
  const result = await pool.query(
    'SELECT * FROM orders WHERE order_id = $1',  // Query by order ID
    [orderId]  // Parameter value
  );
  
  return result.rows[0] || null;  // Return first row or null if not found
}