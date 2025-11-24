import { DexQuote, RouteResult, ExecutionResult, DexPlatform } from '../types';  // Import type definitions

// Helper function to simulate network delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));  // Returns promise that resolves after ms milliseconds

// Generate mock transaction hash for simulation
function generateMockTxHash(): string {
  const timestamp = Date.now();  // Current timestamp for uniqueness
  const random = Math.random().toString(36).substring(2, 15);  // Random alphanumeric string
  return `mock_tx_${timestamp}_${random}`;  // Combine into realistic-looking hash
}

export class MockDexRouter {
  private basePrice: number = 100;  // Base price for simulation (100 USDC per SOL example)
  
  // Wrapped SOL address on Solana (native SOL must be wrapped for DEX trading)
  private WRAPPED_SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
  
  // Get quote from Raydium DEX
  async getRaydiumQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<DexQuote> {
    console.log(`📊 Fetching Raydium quote for ${amountIn} ${tokenIn} -> ${tokenOut}`);  // Log quote request
    
    await sleep(150 + Math.random() * 100);  // Simulate 150-250ms network latency
    
    // Raydium typically has 0.3% fee and slightly better liquidity
    const priceVariance = 0.98 + Math.random() * 0.04;  // Price varies between 98-102% of base
    const price = this.basePrice * priceVariance;  // Calculate final price with variance
    const fee = 0.003;  // 0.3% trading fee
    const amountOut = amountIn * price * (1 - fee);  // Calculate output amount after fees
    
    return {
      dex: 'raydium',  // Identify this quote as from Raydium
      price,  // Price per token
      amountOut,  // Expected output amount
      fee,  // Trading fee
      estimatedGas: 0.00005  // Mock gas cost in SOL
    };
  }
  
  // Get quote from Meteora DEX
  async getMeteorQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<DexQuote> {
    console.log(`📊 Fetching Meteora quote for ${amountIn} ${tokenIn} -> ${tokenOut}`);  // Log quote request
    
    await sleep(150 + Math.random() * 100);  // Simulate 150-250ms network latency
    
    // Meteora typically has 0.2% fee but slightly less liquidity
    const priceVariance = 0.97 + Math.random() * 0.05;  // Price varies between 97-102% of base
    const price = this.basePrice * priceVariance;  // Calculate final price with variance
    const fee = 0.002;  // 0.2% trading fee
    const amountOut = amountIn * price * (1 - fee);  // Calculate output amount after fees
    
    return {
      dex: 'meteora',  // Identify this quote as from Meteora
      price,  // Price per token
      amountOut,  // Expected output amount
      fee,  // Trading fee
      estimatedGas: 0.00004  // Mock gas cost in SOL (slightly cheaper)
    };
  }
  
  // Compare quotes from both DEXs and select best route
  async getBestRoute(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<RouteResult> {
    console.log(`🔀 Routing order: ${amountIn} ${tokenIn} -> ${tokenOut}`);  // Log routing start
    
    // Handle wrapped SOL conversion for native SOL swaps
    // Solana native SOL must be wrapped to SPL token for DEX trading
    // This is a CORE REQUIREMENT from the assignment
    const actualTokenIn = tokenIn === 'SOL' 
      ? this.WRAPPED_SOL_ADDRESS  // Convert to wrapped SOL address
      : tokenIn;  // Use token address as-is
    
    const actualTokenOut = tokenOut === 'SOL'
      ? this.WRAPPED_SOL_ADDRESS  // Convert to wrapped SOL address
      : tokenOut;  // Use token address as-is
    
    if (actualTokenIn !== tokenIn || actualTokenOut !== tokenOut) {
      console.log(`💱 Wrapped SOL handling: ${tokenIn} -> ${actualTokenIn}`);  // Log conversion
      console.log(`   Native SOL converted to wrapped SOL for DEX compatibility`);
    }
    
    // Fetch quotes from both DEXs concurrently for speed
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(actualTokenIn, actualTokenOut, amountIn),  // Get Raydium quote
      this.getMeteorQuote(actualTokenIn, actualTokenOut, amountIn)    // Get Meteora quote
    ]);
    
    // Log routing decisions for transparency (CORE REQUIREMENT)
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 DEX ROUTING DECISION (Transparency Log):`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`💰 Raydium: ${raydiumQuote.amountOut.toFixed(4)} ${tokenOut}`);
    console.log(`   Price: ${raydiumQuote.price.toFixed(2)}, Fee: ${(raydiumQuote.fee * 100).toFixed(2)}%`);
    console.log(`💰 Meteora: ${meteoraQuote.amountOut.toFixed(4)} ${tokenOut}`);
    console.log(`   Price: ${meteoraQuote.price.toFixed(2)}, Fee: ${(meteoraQuote.fee * 100).toFixed(2)}%`);
    
    // Select DEX with higher output amount (better deal for user)
    const selectedQuote = raydiumQuote.amountOut > meteoraQuote.amountOut 
      ? raydiumQuote  // Raydium gives more output
      : meteoraQuote;  // Meteora gives more output
    
    const difference = Math.abs(raydiumQuote.amountOut - meteoraQuote.amountOut);
    const reason = `${selectedQuote.dex.toUpperCase()} selected: ${selectedQuote.amountOut.toFixed(4)} ${tokenOut} output (${difference.toFixed(4)} better than alternative)`;
    
    console.log(`\n✅ ROUTING DECISION: ${reason}`);  // Log final routing decision
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    return {
      selectedDex: selectedQuote.dex,  // Which DEX won
      quote: selectedQuote,  // The winning quote
      reason  // Explanation of decision (logged for transparency)
    };
  }
  
  // Execute swap on selected DEX (mocked)
  async executeSwap(
    dex: DexPlatform,
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    expectedAmountOut: number,
    slippage: number
  ): Promise<ExecutionResult> {
    console.log(`⚡ Executing swap on ${dex}: ${amountIn} ${tokenIn} -> ${tokenOut}`);  // Log execution start
    
    // Handle wrapped SOL for execution
    const actualTokenIn = tokenIn === 'SOL' ? this.WRAPPED_SOL_ADDRESS : tokenIn;
    const actualTokenOut = tokenOut === 'SOL' ? this.WRAPPED_SOL_ADDRESS : tokenOut;
    
    if (actualTokenIn !== tokenIn) {
      console.log(`   Wrapping native SOL before swap...`);
    }
    
    // Simulate realistic execution time (2-3 seconds for blockchain confirmation)
    const executionTime = 2000 + Math.random() * 1000;  // 2000-3000ms
    await sleep(executionTime);  // Wait for "confirmation"
    
    // Simulate 5% chance of failure (realistic for blockchain)
    const failureChance = Math.random();  // Random number 0-1
    if (failureChance < 0.05) {  // 5% chance
      console.error(`❌ Swap failed on ${dex}`);  // Log failure
      return {
        success: false,  // Indicate failure
        error: 'Simulation: Transaction failed due to network congestion'  // Mock error message
      };
    }
    
    // Simulate successful execution with slight price slippage
    const actualSlippage = Math.random() * slippage;  // Random slippage up to max
    const actualAmountOut = expectedAmountOut * (1 - actualSlippage);  // Apply slippage to output
    const actualPrice = actualAmountOut / amountIn;  // Calculate actual execution price
    const txHash = generateMockTxHash();  // Generate mock transaction hash
    
    if (actualTokenOut !== tokenOut) {
      console.log(`   Unwrapping to native SOL after swap...`);
    }
    
    console.log(`✅ Swap executed: ${actualAmountOut.toFixed(4)} ${tokenOut} received`);  // Log success
    console.log(`📝 Transaction hash: ${txHash}`);  // Log transaction hash
    
    return {
      success: true,  // Indicate success
      txHash,  // Transaction hash
      executedPrice: actualPrice,  // Actual execution price
      amountOut: actualAmountOut  // Actual output amount
    };
  }
}