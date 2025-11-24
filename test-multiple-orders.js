const WebSocket = require('ws');

// Function to submit a single order
function submitOrder(orderNum) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3000/api/orders/execute');
    const updates = [];
    
    ws.on('open', () => {
      console.log(`[Order ${orderNum}] ✅ Connected`);
      
      setTimeout(() => {
        const order = {
          orderType: 'market',
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amountIn: orderNum, // Different amounts for each order
          slippage: 0.01
        };
        
        console.log(`[Order ${orderNum}] 📤 Sending order with ${orderNum} SOL`);
        ws.send(JSON.stringify(order));
      }, 100);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      updates.push(message);
      
      if (message.status) {
        console.log(`[Order ${orderNum}] 📨 ${message.status.toUpperCase()}`);
      }
      
      if (message.status === 'confirmed') {
        console.log(`[Order ${orderNum}] ✅ COMPLETED - TxHash: ${message.data.txHash}`);
        setTimeout(() => {
          ws.close();
          resolve(updates);
        }, 500);
      } else if (message.status === 'failed') {
        console.log(`[Order ${orderNum}] ❌ FAILED - ${message.data.error}`);
        setTimeout(() => {
          ws.close();
          resolve(updates);
        }, 500);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`[Order ${orderNum}] ❌ Error:`, error.message);
      reject(error);
    });
    
    setTimeout(() => {
      ws.close();
      reject(new Error('Timeout'));
    }, 30000);
  });
}

// Submit 5 orders concurrently
async function main() {
  console.log('🚀 Submitting 5 concurrent orders...\n');
  
  const startTime = Date.now();
  
  try {
    const results = await Promise.all([
      submitOrder(1),
      submitOrder(2),
      submitOrder(3),
      submitOrder(4),
      submitOrder(5)
    ]);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ All 5 orders completed in ${duration} seconds`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    // Count successful orders
    const successful = results.filter(updates => 
      updates.some(u => u.status === 'confirmed')
    ).length;
    
    const failed = results.filter(updates => 
      updates.some(u => u.status === 'failed')
    ).length;
    
    console.log(`📊 Results:`);
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   🔄 Processed concurrently with queue management\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

main();