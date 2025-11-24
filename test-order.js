const WebSocket = require('ws');
const fetch = require('node-fetch');

// PRODUCTION URL
const BASE_URL = 'https://order-execution-engine-mcet.onrender.com';
const WS_URL = 'wss://order-execution-engine-mcet.onrender.com';

async function testOrder() {
  console.log('🚀 Testing HTTP → WebSocket Pattern (Production)\n');
  console.log(`📡 API: ${BASE_URL}\n`);
  
  // Step 1: POST order to get orderId
  console.log('📤 Step 1: Submitting order via POST...\n');
  
  const order = {
    orderType: 'market',
    tokenIn: 'SOL',
    tokenOut: 'USDC',
    amountIn: 1,
    slippage: 0.01
  };
  
  const postResponse = await fetch(`${BASE_URL}/api/orders/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order)
  });
  
  const postData = await postResponse.json();
  
  if (!postResponse.ok) {
    console.error('❌ Failed to create order:', postData);
    process.exit(1);
  }
  
  console.log('✅ Order created!');
  console.log('📋 Order ID:', postData.orderId);
  console.log('🔗 WebSocket URL:', postData.websocketUrl, '\n');
  
  const orderId = postData.orderId;
  
  // Step 2: Connect to WebSocket to stream status
  console.log('📤 Step 2: Connecting to WebSocket for status updates...\n');
  
  const ws = new WebSocket(`${WS_URL}/api/orders/${orderId}/stream`);
  
  let hasReceivedMessages = false;
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected\n');
  });
  
  ws.on('message', (data) => {
    hasReceivedMessages = true;
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', JSON.stringify(message, null, 2), '\n');
    
    // Close after receiving 'confirmed' or 'failed'
    if (message.status === 'confirmed' || message.status === 'failed') {
      console.log('✅ Order flow completed!\n');
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 1000);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket Error:', error);
  });
  
  ws.on('close', () => {
    console.log('🔌 Connection closed');
    
    if (!hasReceivedMessages) {
      console.log('⚠️  WARNING: Connection closed without receiving any messages!');
      console.log('Check your server logs for errors.\n');
    }
    
    process.exit(hasReceivedMessages ? 0 : 1);
  });
  
  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('⏱️  Test timeout after 30 seconds');
    ws.close();
    process.exit(1);
  }, 30000);
}

testOrder().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});