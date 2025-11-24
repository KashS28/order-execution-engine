const WebSocket = require('ws');
const fetch = require('node-fetch');

// PRODUCTION URL
const BASE_URL = 'https://order-execution-engine-mcet.onrender.com';
const WS_URL = 'wss://order-execution-engine-mcet.onrender.com';

// Function to submit a single order
function submitOrder(orderNum) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        console.log(`\n[Order ${orderNum}] 📤 Creating order...`);
        
        // Step 1: POST to create order
        const postResponse = await fetch(`${BASE_URL}/api/orders/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderType: 'market',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amountIn: orderNum, // Different amounts for each order
            slippage: 0.01
          })
        });
        
        if (!postResponse.ok) {
          const error = await postResponse.json();
          throw new Error(`Failed to create order: ${JSON.stringify(error)}`);
        }
        
        const postData = await postResponse.json();
        const orderId = postData.orderId;
        
        console.log(`[Order ${orderNum}] ✅ Created - ID: ${orderId.substring(0, 8)}...`);
        
        // Step 2: Connect to WebSocket
        const ws = new WebSocket(`${WS_URL}/api/orders/${orderId}/stream`);
        const updates = [];
        
        ws.on('open', () => {
          console.log(`[Order ${orderNum}] 🔌 WebSocket connected`);
        });
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          updates.push(message);
          
          if (message.status) {
            console.log(`[Order ${orderNum}] 📨 ${message.status.toUpperCase()}`);
            
            // Show additional data for certain statuses
            if (message.status === 'building' && message.data?.dexUsed) {
              console.log(`[Order ${orderNum}]    └─ Using ${message.data.dexUsed.toUpperCase()}`);
            }
            
            if (message.status === 'confirmed' && message.data?.txHash) {
              console.log(`[Order ${orderNum}] ✅ COMPLETED`);
              console.log(`[Order ${orderNum}]    └─ TxHash: ${message.data.txHash}`);
              console.log(`[Order ${orderNum}]    └─ Price: ${message.data.executedPrice?.toFixed(4)} USDC`);
              console.log(`[Order ${orderNum}]    └─ Amount: ${message.data.amountOut?.toFixed(4)} USDC`);
            }
          }
          
          if (message.status === 'confirmed' || message.status === 'failed') {
            setTimeout(() => {
              ws.close();
              resolve(updates);
            }, 500);
          }
        });
        
        ws.on('error', (error) => {
          console.error(`[Order ${orderNum}] ❌ WebSocket Error:`, error.message);
          reject(error);
        });
        
        ws.on('close', () => {
          console.log(`[Order ${orderNum}] 🔌 WebSocket closed`);
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          ws.close();
          reject(new Error(`Order ${orderNum} timeout`));
        }, 30000);
        
      } catch (error) {
        console.error(`[Order ${orderNum}] ❌ Error:`, error.message);
        reject(error);
      }
    })();
  });
}

// Main function to submit multiple orders concurrently
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Order Execution Engine - Concurrent Order Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Production URL: ${BASE_URL}`);
  console.log(`📊 Submitting 5 concurrent orders...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const startTime = Date.now();
  
  try {
    // Submit 5 orders concurrently
    const results = await Promise.all([
      submitOrder(1),
      submitOrder(2),
      submitOrder(3),
      submitOrder(4),
      submitOrder(5)
    ]);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Count successful vs failed
    const successful = results.filter(updates => 
      updates.some(u => u.status === 'confirmed')
    ).length;
    
    const failed = results.filter(updates => 
      updates.some(u => u.status === 'failed')
    ).length;
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL ORDERS COMPLETED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Total Time: ${duration} seconds`);
    console.log(`📊 Results:`);
    console.log(`   ✅ Successful: ${successful}/5`);
    console.log(`   ❌ Failed: ${failed}/5`);
    console.log(`   🔄 Processed concurrently with queue management`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ TEST FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }
}

// Run the test
main();