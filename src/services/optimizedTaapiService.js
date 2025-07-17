// Enhanced TaapiService - Pro Plan Bulk Query Optimization
// File: src/services/optimizedTaapiService.js

const axios = require('axios');
const logger = require('../utils/logger');

class OptimizedTaapiService {
  constructor() {
    this.baseURL = 'https://api.taapi.io';
    this.secret = process.env.TAAPI_SECRET;
    
    // Pro Plan Settings
    this.isProPlan = process.env.TAAPI_FREE_PLAN_MODE !== 'true';
    this.bulkEnabled = process.env.TAAPI_BULK_QUERY_ENABLED !== 'false';
    this.maxRequestsPerMinute = this.isProPlan ? 120 : 4;
    this.rateDelay = this.isProPlan ? 2000 : 65000; // 2s for pro, 65s for free
    
    // Bulk Query Optimization
    this.symbolBatchSize = this.isProPlan ? 20 : 1; // Batch 20 symbols for pro plan
    this.pendingRequests = new Map(); // Cache pending requests
    this.batchQueue = []; // Queue for batching symbols
    this.processingBatch = false;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.rateLimitWindow = 60000; // 1 minute
    
    logger.info(`🚀 TAAPI Service initialized: ${this.isProPlan ? 'PRO' : 'FREE'} plan mode`);
    logger.info(`📊 Batch size: ${this.symbolBatchSize} symbols per request`);
  }

  /**
   * 🔥 OPTIMIZED: Get indicators for multiple symbols efficiently
   */
  async getBulkIndicatorsOptimized(symbols, timeframe = '1h', exchange = 'binance') {
    if (!this.isProPlan || !this.bulkEnabled) {
      // Fallback to individual requests for free plan
      return this.getBulkIndicatorsLegacy(symbols[0], timeframe, exchange);
    }

    // For Pro Plan: Batch multiple symbols together
    const results = {};
    
    // Split symbols into batches
    const batches = this.createBatches(symbols, this.symbolBatchSize);
    
    for (const batch of batches) {
      try {
        await this.waitForRateLimit();
        
        const batchResults = await this.executeMultiSymbolBulkQuery(batch, timeframe, exchange);
        Object.assign(results, batchResults);
        
        logger.info(`✅ Processed batch of ${batch.length} symbols in single request`);
        
      } catch (error) {
        logger.error(`❌ Batch failed for ${batch.length} symbols: ${error.message}`);
        
        // Fallback: Process individually
        for (const symbol of batch) {
          try {
            results[symbol] = await this.getSingleSymbolIndicators(symbol, timeframe, exchange);
          } catch (fallbackError) {
            logger.error(`❌ Individual fallback failed for ${symbol}: ${fallbackError.message}`);
            results[symbol] = this.getFallbackData(symbol);
          }
        }
      }
    }
    
    return results;
  }

  /**
   * 🚀 CORE: Execute multi-symbol bulk query (Pro Plan Feature)
   */
  async executeMultiSymbolBulkQuery(symbols, timeframe, exchange) {
    const construct = [];
    
    // Build bulk request for multiple symbols
    symbols.forEach(symbol => {
      const taapiSymbol = this.convertToTaapiFormat(symbol);
      
      // Essential indicators for each symbol
      const baseIndicators = [
        { indicator: 'rsi', period: 14, id: `${symbol}_rsi` },
        { indicator: 'macd', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, id: `${symbol}_macd` },
        { indicator: 'ema', period: 20, id: `${symbol}_ema20` },
        { indicator: 'ema', period: 50, id: `${symbol}_ema50` },
        { indicator: 'ema', period: 200, id: `${symbol}_ema200` },
        { indicator: 'bbands', period: 20, stddev: 2, id: `${symbol}_bbands` },
        { indicator: 'adx', period: 14, id: `${symbol}_adx` },
        { indicator: 'atr', period: 14, id: `${symbol}_atr` },
        { indicator: 'mfi', period: 14, id: `${symbol}_mfi` },
        { indicator: 'stochrsi', period: 14, id: `${symbol}_stochrsi` }
      ];
      
      // Add each indicator to construct
      baseIndicators.forEach(indicator => {
        construct.push({
          ...indicator,
          exchange: exchange,
          symbol: taapiSymbol,
          interval: timeframe
        });
      });
    });

    logger.info(`🚀 Executing MULTI-SYMBOL bulk query: ${symbols.length} symbols, ${construct.length} total indicators`);

    const bulkRequest = {
      secret: this.secret,
      construct: construct
    };

    const response = await axios.post(`${this.baseURL}/bulk`, bulkRequest, {
      timeout: 30000, // 30 second timeout for large bulk requests
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Parse multi-symbol response
    return this.parseMultiSymbolBulkResponse(response.data, symbols);
  }

  /**
   * Parse bulk response for multiple symbols
   */
  parseMultiSymbolBulkResponse(response, symbols) {
    const results = {};
    
    // Initialize results for each symbol
    symbols.forEach(symbol => {
      results[symbol] = {
        symbol: symbol,
        source: 'taapi_live',
        isFallbackData: false,
        realIndicators: 0,
        timestamp: Date.now()
      };
    });

    // Process each indicator result
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach(item => {
        if (item.id && item.result) {
          const [symbol, indicator] = item.id.split('_');
          
          if (results[symbol]) {
            results[symbol][indicator] = item.result;
            results[symbol].realIndicators++;
          }
        }
      });
    }

    // Validate results
    symbols.forEach(symbol => {
      if (results[symbol].realIndicators === 0) {
        logger.warn(`⚠️ No indicators received for ${symbol}, using fallback`);
        results[symbol] = this.getFallbackData(symbol);
      } else {
        logger.info(`✅ ${symbol}: ${results[symbol].realIndicators} indicators received`);
      }
    });

    return results;
  }

  /**
   * Create batches of symbols for optimal bulk requests
   */
  createBatches(symbols, batchSize) {
    const batches = [];
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Rate limiting for Pro Plan (120 requests/minute)
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateDelay) {
      const waitTime = this.rateDelay - timeSinceLastRequest;
      logger.info(`⏳ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Convert symbol to TAAPI format
   */
  convertToTaapiFormat(symbol) {
    // Convert BTCUSDT -> BTC/USDT
    if (symbol.includes('/')) return symbol;
    
    if (symbol.endsWith('USDT')) {
      const base = symbol.replace('USDT', '');
      return `${base}/USDT`;
    }
    
    return symbol;
  }

  /**
   * Legacy single-symbol bulk query (fallback)
   */
  async getBulkIndicatorsLegacy(symbol, timeframe, exchange) {
    // Your existing single-symbol bulk query logic
    const taapiSymbol = this.convertToTaapiFormat(symbol);
    
    const construct = [
      { indicator: 'rsi', exchange, symbol: taapiSymbol, interval: timeframe, optInTimePeriod: 14 },
      { indicator: 'macd', exchange, symbol: taapiSymbol, interval: timeframe },
      { indicator: 'ema', exchange, symbol: taapiSymbol, interval: timeframe, optInTimePeriod: 20 },
      { indicator: 'ema', exchange, symbol: taapiSymbol, interval: timeframe, optInTimePeriod: 50 },
      { indicator: 'ema', exchange, symbol: taapiSymbol, interval: timeframe, optInTimePeriod: 200 },
      { indicator: 'bbands', exchange, symbol: taapiSymbol, interval: timeframe },
      { indicator: 'adx', exchange, symbol: taapiSymbol, interval: timeframe },
      { indicator: 'atr', exchange, symbol: taapiSymbol, interval: timeframe },
      { indicator: 'mfi', exchange, symbol: taapiSymbol, interval: timeframe }
    ];

    await this.waitForRateLimit();

    const response = await axios.post(`${this.baseURL}/bulk`, {
      secret: this.secret,
      construct: construct
    }, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    return this.parseSingleSymbolResponse(response.data, symbol);
  }

  /**
   * Parse single symbol response
   */
  parseSingleSymbolResponse(response, symbol) {
    const result = {
      symbol: symbol,
      source: 'taapi_live',
      isFallbackData: false,
      realIndicators: 0,
      timestamp: Date.now()
    };

    if (response.data && Array.isArray(response.data)) {
      response.data.forEach(item => {
        if (item.indicator && item.result !== undefined) {
          result[item.indicator] = item.result;
          result.realIndicators++;
        }
      });
    }

    return result;
  }

  /**
   * Get fallback data when TAAPI fails
   */
  getFallbackData(symbol) {
    return {
      symbol: symbol,
      source: 'fallback',
      isFallbackData: true,
      realIndicators: 0,
      rsi: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      ema20: 0,
      ema50: 0,
      ema200: 0,
      bbands: { upper: 0, middle: 0, lower: 0 },
      adx: 20,
      atr: 0,
      mfi: 50,
      timestamp: Date.now()
    };
  }

  /**
   * Health check and diagnostics
   */
  getServiceStats() {
    return {
      plan_type: this.isProPlan ? 'pro' : 'free',
      bulk_enabled: this.bulkEnabled,
      batch_size: this.symbolBatchSize,
      rate_delay: this.rateDelay,
      max_requests_per_minute: this.maxRequestsPerMinute,
      pending_requests: this.pendingRequests.size,
      queue_length: this.batchQueue.length,
      last_request: new Date(this.lastRequestTime).toISOString()
    };
  }
}

module.exports = OptimizedTaapiService;

//Yes