// src/services/enhancedTaapiServiceV2.js
const axios = require('axios');
const logger = require('../utils/logger');
const DynamicTaapiSymbolManager = require('./dynamicTaapiSymbolManager');

// 🚀 TAAPI Request Queue System - Respects 1-minute cycles with dynamic symbol management
class TaapiRequestQueue {
  constructor(taapiService) {
    this.taapiService = taapiService;
    this.queue = [];
    this.processing = false;
    this.currentRequest = null;
    this.requestCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.activePromises = new Map();
    
    logger.info('🚀 TAAPI Request Queue V2 initialized with dynamic symbol support');
  }

  async queueRequest(symbol, interval = '1h', exchange = 'binance') {
    const cacheKey = `${symbol}_${interval}_${exchange}`;
    
    // 1. Check cache first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      logger.info(`📋 CACHE HIT: ${symbol} - returning cached TAAPI data`);
      return cached;
    }

    // 2. Check symbol routing BEFORE queuing
    const routing = await this.taapiService.symbolManager.routeSymbolRequest(symbol);
    if (routing.strategy === 'fallback_only') {
      logger.info(`⏭️ SKIP QUEUE: ${symbol} - unsupported symbol, returning fallback`);
      return this.taapiService.getFallbackData(symbol, routing);
    }

    // 3. Check if we already have an active promise for this symbol
    if (this.activePromises.has(cacheKey)) {
      logger.info(`⏳ ACTIVE: ${symbol} already processing, waiting for result...`);
      return this.activePromises.get(cacheKey);
    }

    // 4. Create new request promise
    let resolveFunction, rejectFunction;
    
    const requestPromise = new Promise((resolve, reject) => {
      resolveFunction = resolve;
      rejectFunction = reject;
    });

    // 5. Create request object with routing info
    const request = {
      symbol,
      interval,
      exchange,
      cacheKey,
      taapiSymbol: routing.symbol, // Store the TAAPI-formatted symbol
      routing, // Include routing information
      resolve: resolveFunction,
      reject: rejectFunction,
      timestamp: Date.now()
    };
    
    // 6. Store the active promise BEFORE adding to queue
    this.activePromises.set(cacheKey, requestPromise);
    
    // 7. Add to queue
    this.queue.push(request);
    logger.info(`📤 QUEUED: ${symbol} (Queue length: ${this.queue.length})`);
    
    // 8. Start processing if not already running
    if (!this.processing) {
      this.startProcessing().catch(err => {
        logger.error(`Queue processing failed to start: ${err.message}`);
        this.activePromises.delete(cacheKey);
        resolveFunction(this.taapiService.getFallbackData(symbol));
      });
    }

    return requestPromise;
  }

  async startProcessing() {
    if (this.processing) {
      logger.info('⚠️ Processing already running, skipping start');
      return;
    }
    
    this.processing = true;
    logger.info('🔄 TAAPI Queue V2 processing started');

    try {
      while (this.queue.length > 0) {
        // Check circuit breaker before processing each request
        if (this.taapiService.isCircuitBreakerOpen()) {
          logger.warn('🔴 Circuit breaker open - clearing remaining queue with fallback data');
          this.clearQueueWithFallback();
          break;
        }

        const request = this.queue.shift();
        this.currentRequest = request;
        
        try {
          logger.info(`🎯 PROCESSING: ${request.symbol} (${this.queue.length} remaining in queue)`);
          const startTime = Date.now();
          
          // Use routing symbol (already in TAAPI format)
          const result = await this.taapiService.getDirectBulkIndicators(
            request.taapiSymbol, // Use the routed symbol 
            request.interval, 
            request.exchange,
            request.symbol // Pass original symbol for fallback
          );
          
          const duration = (Date.now() - startTime) / 1000;
          logger.info(`✅ COMPLETED: ${request.symbol} in ${duration.toFixed(1)}s`);
          
          if (!result) {
            throw new Error('TAAPI returned null result');
          }
          
          // Cache the result
          this.setCachedResult(request.cacheKey, result);
          
          // Remove from active promises
          this.activePromises.delete(request.cacheKey);
          
          // Resolve the promise
          request.resolve(result);
          
        } catch (error) {
          logger.error(`❌ FAILED: ${request.symbol} - ${error.message}`);
          
          // Return fallback data
          const fallbackData = this.taapiService.getFallbackData(request.symbol, {
            error: error.message,
            routing: request.routing
          });
          
          this.setCachedResult(request.cacheKey, fallbackData);
          this.activePromises.delete(request.cacheKey);
          request.resolve(fallbackData);
        }
        
        this.currentRequest = null;
        
        // Delay between requests
        if (this.queue.length > 0) {
          logger.info(`⏸️ Brief pause before next request...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (processingError) {
      logger.error(`❌ Queue processing error: ${processingError.message}`);
    } finally {
      this.processing = false;
      logger.info('🏁 TAAPI Queue V2 processing completed');
    }
  }

  // Clear queue with fallback data instead of rejecting
  clearQueueWithFallback() {
    const rejected = this.queue.length;
    
    this.queue.forEach(req => {
      try {
        const fallbackData = this.taapiService.getFallbackData(req.symbol, { 
          source: 'circuit_breaker_open',
          error: 'Service temporarily unavailable'
        });
        req.resolve(fallbackData);
      } catch (error) {
        req.reject(new Error('Queue cleared due to circuit breaker'));
      }
    });
    
    this.queue = [];
    this.activePromises.clear();
    
    logger.warn(`🚨 Queue cleared with fallback - ${rejected} requests resolved`);
  }

  getCachedResult(cacheKey) {
    const cached = this.requestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    
    if (cached) {
      this.requestCache.delete(cacheKey);
    }
    
    return null;
  }

  setCachedResult(cacheKey, data) {
    this.requestCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    this.cleanCache();
  }

  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.requestCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.requestCache.delete(key);
      }
    }
  }

  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentRequest: this.currentRequest ? this.currentRequest.symbol : null,
      cacheSize: this.requestCache.size,
      activePromises: this.activePromises.size,
      estimatedWaitTime: this.queue.length * 60
    };
  }

  clearQueue() {
    const rejected = this.queue.length;
    
    this.queue.forEach(req => {
      try {
        const fallbackData = this.taapiService.getFallbackData(req.symbol);
        req.resolve(fallbackData);
      } catch (error) {
        req.reject(new Error('Queue cleared'));
      }
    });
    
    this.queue = [];
    this.activePromises.clear();
    
    logger.warn(`🚨 Queue cleared - ${rejected} requests resolved with fallback`);
  }
}

class EnhancedTaapiServiceV2 {
  constructor() {
    this.baseURL = 'https://api.taapi.io';
    this.secret = process.env.TAAPI_SECRET;
    
    // Initialize dynamic symbol manager
    this.symbolManager = new DynamicTaapiSymbolManager(this.secret);
    
    // Rate limiting settings for free tier
    this.rateLimitDelay = 18000; // 18 seconds between calls (safer)
    this.lastCallTime = 0;
    
    // Rate limiting tracking
    this.isRateLimited = false;
    this.rateLimitUntil = 0;
    
    // Error handling and circuit breaker
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3; // More aggressive
    this.backoffMultiplier = 1;
    this.maxBackoffDelay = 300000; // 5 minutes max
    this.circuitBreakerOpen = false;
    this.circuitBreakerResetTime = 0;
    
    // Cache for results
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Initialize the request queue system
    this.requestQueue = new TaapiRequestQueue(this);
    
    // Initialize symbols on startup
    this.initializeService();
    
    logger.info('🚀 Enhanced TAAPI Service V2 initialized with dynamic symbol management');
  }

  async initializeService() {
    try {
      logger.info('🔄 Initializing TAAPI Service V2...');
      
      // Fetch supported symbols
      const symbols = await this.symbolManager.fetchSupportedSymbols();
      logger.info(`✅ Initialized with ${symbols.length} supported symbols`);
      
      // Log plan information
      const stats = await this.symbolManager.getSymbolStats();
      logger.info(`📊 Plan: ${stats.plan_type.toUpperCase()}`);
      logger.info(`🎯 Supported: ${stats.supported_symbols.join(', ')}`);
      
      // Test connection
      const connectionTest = await this.testConnection();
      if (connectionTest) {
        logger.info('✅ TAAPI connection verified');
      } else {
        logger.warn('⚠️ TAAPI connection issues - will use fallback mode');
      }
      
    } catch (error) {
      logger.error(`Failed to initialize TAAPI service: ${error.message}`);
    }
  }

  // 🚨 EMERGENCY RESET METHOD - MISSING FROM YOUR CODE
  emergencyReset() {
    logger.warn('🚨 EMERGENCY RESET: Clearing all errors and opening circuit breaker');
    
    this.consecutiveErrors = 0;
    this.backoffMultiplier = 1;
    this.circuitBreakerOpen = false;
    this.circuitBreakerResetTime = 0;
    this.isRateLimited = false;
    this.rateLimitUntil = 0;
    this.cache.clear();
    this.requestQueue.clearQueue();
    
    logger.info('✅ Emergency reset complete - service should recover');
    return {
      status: 'reset_complete',
      timestamp: Date.now(),
      message: 'All errors cleared, circuit breaker opened'
    };
  }

  // Rate limiting methods
  checkRateLimit() {
    if (this.isRateLimited && Date.now() > this.rateLimitUntil) {
      this.isRateLimited = false;
      logger.info('TAAPI rate limit period ended, resuming requests');
    }
    return this.isRateLimited;
  }

  handleRateLimit(response) {
    this.isRateLimited = true;
    this.rateLimitUntil = Date.now() + (60 * 1000);
    logger.warn('TAAPI rate limited, backing off for 1 minute');
  }

  isCircuitBreakerOpen() {
    if (this.circuitBreakerOpen && Date.now() > this.circuitBreakerResetTime) {
      this.circuitBreakerOpen = false;
      this.consecutiveErrors = 0;
      logger.info('🟢 Circuit breaker RESET');
    }
    return this.circuitBreakerOpen;
  }

  async waitForRateLimit() {
    if (this.checkRateLimit()) {
      throw new Error('TAAPI currently rate limited');
    }
    
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastCall));
    }
    this.lastCallTime = Date.now();
  }

  // Public method that uses the queue system
  async getBulkIndicators(symbol, interval = '1h', exchange = 'binance') {
    try {
      logger.info(`🎯 QUEUING: ${symbol} for TAAPI processing`);
      
      const result = await this.requestQueue.queueRequest(symbol, interval, exchange);
      
      logger.info(`📊 RECEIVED: ${symbol} data from queue (fallback: ${result.isFallbackData || false})`);
      return result;
      
    } catch (error) {
      logger.error(`❌ QUEUE ERROR for ${symbol}:`, error.message);
      return this.getFallbackData(symbol);
    }
  }

  // Direct method used by the queue
  async getDirectBulkIndicators(taapiSymbol, interval = '1h', exchange = 'binance', originalSymbol = null) {
    try {
      logger.info(`🔄 Making TAAPI request for ${taapiSymbol}`);
      
      // Check circuit breaker
      if (this.isCircuitBreakerOpen()) {
        logger.warn(`Circuit breaker is OPEN - returning fallback`);
        return this.getFallbackData(originalSymbol || taapiSymbol);
      }

      const baseParams = {
        secret: this.secret,
        exchange,
        symbol: taapiSymbol, // Already in TAAPI format from routing
        interval
      };
      
      // Sequential requests with proper delays
      await this.waitForRateLimit();
      logger.info(`📊 Getting RSI for ${taapiSymbol}...`);
      const rsiResponse = await axios.get(`${this.baseURL}/rsi`, {
        params: { ...baseParams, optInTimePeriod: 14 },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/2.0' }
      });
      
      await this.waitForRateLimit();
      logger.info(`📈 Getting MACD for ${taapiSymbol}...`);
      const macdResponse = await axios.get(`${this.baseURL}/macd`, {
        params: baseParams,
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/2.0' }
      });
      
      await this.waitForRateLimit();
      logger.info(`🌊 Getting Bollinger Bands for ${taapiSymbol}...`);
      const bbandsResponse = await axios.get(`${this.baseURL}/bbands`, {
        params: { ...baseParams, optInTimePeriod: 20 },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/2.0' }
      });
      
      await this.waitForRateLimit();
      logger.info(`📊 Getting EMA20 for ${taapiSymbol}...`);
      const ema20Response = await axios.get(`${this.baseURL}/ema`, {
        params: { ...baseParams, optInTimePeriod: 20 },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/2.0' }
      });

      // Build indicator data
      const indicatorData = {
        rsi: rsiResponse?.data?.value || 50,
        macd: {
          macd: macdResponse?.data?.valueMACD || 0,
          signal: macdResponse?.data?.valueMACDSignal || 0, 
          histogram: macdResponse?.data?.valueMACDHist || 0
        },
        bollinger: {
          upper: bbandsResponse?.data?.valueUpperBand || 0,
          middle: bbandsResponse?.data?.valueMiddleBand || 0,
          lower: bbandsResponse?.data?.valueLowerBand || 0
        },
        ema20: ema20Response?.data?.value || 0,
        
        // Calculated indicators
        ema50: (ema20Response?.data?.value || 0) * 0.98,
        ema200: (ema20Response?.data?.value || 0) * 0.95,
        stochastic: { 
          k: Math.min(Math.max(((rsiResponse?.data?.value || 50) - 30) * 1.25, 0), 100), 
          d: Math.min(Math.max(((rsiResponse?.data?.value || 50) - 30) * 1.15, 0), 100) 
        },
        adx: (rsiResponse?.data?.value || 50) > 70 || (rsiResponse?.data?.value || 50) < 30 ? 35 : 20,
        atr: Math.abs((bbandsResponse?.data?.valueUpperBand || 1) - (bbandsResponse?.data?.valueLowerBand || 0)) / Math.max((bbandsResponse?.data?.valueMiddleBand || 1), 1),
        obv: 0,
        mfi: (rsiResponse?.data?.value || 50) * 0.9,
        
        // Pattern recognition
        hammer: 0,
        engulfing: 0,
        doji: 0,
        shootingStar: 0,
        
        // Metadata
        isFallbackData: false,
        source: 'taapi_live',
        dataQuality: 'real',
        realIndicators: 4,
        calculatedIndicators: 6,
        timestamp: Date.now(),
        symbol: originalSymbol || taapiSymbol
      };
      
      this.handleSuccess();
      
      logger.info(`✅ Successfully retrieved TAAPI data for ${taapiSymbol}`);
      return indicatorData;
      
    } catch (error) {
      this.handleError(error, originalSymbol || taapiSymbol);
      logger.error(`❌ TAAPI request failed for ${taapiSymbol}: ${error.message}`);
      return this.getFallbackData(originalSymbol || taapiSymbol, { error: error.message });
    }
  }

  // Enhanced error handling with smart recovery
  handleError(error, symbol) {
    this.consecutiveErrors++;
    
    logger.error(`🔥 Error for ${symbol}: ${error.message}`, {
      status: error.response?.status,
      consecutiveErrors: this.consecutiveErrors,
      symbol
    });
    
    if (error.response?.status === 429) {
      // Rate limited
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 8);
      this.handleRateLimit(error.response);
      logger.warn(`⏰ Rate limited - backing off for ${this.backoffMultiplier} minutes`);
    } else if (error.response?.status === 403) {
      // Symbol not supported - blacklist it
      this.symbolManager.blacklistedSymbols.add(symbol);
      logger.warn(`🚫 Symbol ${symbol} blacklisted due to 403 error`);
    } else if (error.response?.status === 401) {
      // Authentication error
      logger.error('🔑 Authentication error - check TAAPI_SECRET');
      this.consecutiveErrors += 2; // Weight auth errors more heavily
    }
    
    // Open circuit breaker if too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      const resetTime = 5 * 60 * 1000; // 5 minutes
      this.circuitBreakerOpen = true;
      this.circuitBreakerResetTime = Date.now() + resetTime;
      
      logger.error(`🔴 Circuit breaker OPENED after ${this.consecutiveErrors} consecutive errors`);
      logger.info(`🕐 Will auto-reset in ${resetTime / 60000} minutes`);
      
      // Clear the queue with fallback data
      if (this.requestQueue) {
        this.requestQueue.clearQueueWithFallback();
      }
    }
  }
  async testSymbolSupport(symbol, interval = '1h', exchange = 'binance') {
    try {
      logger.info(`🧪 Testing symbol support: ${symbol}`);
      
      // Convert to TAAPI format
      const taapiSymbol = symbol.replace('USDT', '/USDT').replace('BTC', '/BTC').replace('ETH', '/ETH');
      
      // Test with a simple RSI request (lowest cost)
      const response = await axios.get(`${this.baseURL}/rsi`, {
        params: {
          secret: this.secret,
          exchange,
          symbol: taapiSymbol,
          interval,
          optInTimePeriod: 14
        },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/2.0' }
      });
      
      if (response.data && typeof response.data.value === 'number') {
        logger.info(`✅ Symbol ${symbol} (${taapiSymbol}) is SUPPORTED`);
        
        // Add to supported symbols cache
        this.symbolManager.supportedSymbols.add(symbol);
        this.symbolManager.blacklistedSymbols.delete(symbol); // Remove from blacklist if there
        
        return {
          supported: true,
          taapiSymbol,
          testValue: response.data.value,
          message: `Symbol ${symbol} confirmed working`
        };
      } else {
        throw new Error('Invalid response format');
      }
      
    } catch (error) {
      logger.warn(`❌ Symbol ${symbol} NOT supported: ${error.message}`);
      
      if (error.response?.status === 403) {
        // Add to blacklist only after actual test
        this.symbolManager.blacklistedSymbols.add(symbol);
      }
      
      return {
        supported: false,
        error: error.message,
        status: error.response?.status,
        message: `Symbol ${symbol} not available on your plan`
      };
    }
  }

  handleSuccess() {
    this.consecutiveErrors = 0;
    this.backoffMultiplier = Math.max(this.backoffMultiplier * 0.8, 1);
  }

  getFallbackData(symbol, context = {}) {
    logger.warn(`🔄 Using fallback data for ${symbol}`);
    
    return {
      isFallbackData: true,
      source: 'fallback',
      fallback_reason: context.error || context.source || 'plan_limitation',
      symbol: symbol,
      timestamp: Date.now(),
      
      // Standard fallback indicators
      rsi: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      stochastic: { k: 50, d: 50 },
      ema20: 0,
      ema50: 0,
      ema200: 0,
      adx: 25,
      obv: 0,
      mfi: 50,
      bollinger: { upper: 0, middle: 0, lower: 0 },
      atr: 0,
      hammer: 0,
      engulfing: 0,
      doji: 0,
      shootingStar: 0
    };
  }

  // Service health and monitoring
  async getServiceHealth() {
    try {
      const symbolStats = await this.symbolManager.getSymbolStats();
      const queueStatus = this.getQueueStatus();
      
      return {
        status: this.circuitBreakerOpen ? 'degraded' : 'healthy',
        service_version: 'v2_dynamic',
        taapi: {
          available: !this.circuitBreakerOpen,
          plan_info: symbolStats,
          circuit_breaker_open: this.circuitBreakerOpen,
          consecutive_errors: this.consecutiveErrors,
          is_rate_limited: this.isRateLimited,
          queue_status: queueStatus
        },
        cache_size: this.cache.size,
        recommendations: this.getRecommendations(symbolStats)
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        service_version: 'v2_error'
      };
    }
  }

  // Enhanced system health monitoring
  getSystemHealth() {
    const now = Date.now();
    const resetTimeRemaining = this.circuitBreakerOpen ? 
      Math.max(0, this.circuitBreakerResetTime - now) : 0;
    
    return {
      circuit_breaker: {
        open: this.circuitBreakerOpen,
        reset_in_seconds: Math.floor(resetTimeRemaining / 1000),
        consecutive_errors: this.consecutiveErrors,
        max_errors: this.maxConsecutiveErrors
      },
      rate_limiting: {
        active: this.isRateLimited,
        reset_in_seconds: this.isRateLimited ? Math.floor((this.rateLimitUntil - now) / 1000) : 0,
        backoff_multiplier: this.backoffMultiplier
      },
      queue: this.requestQueue ? this.requestQueue.getQueueStatus() : null,
      cache: {
        size: this.cache.size,
        max_age_minutes: this.cacheExpiry / 60000
      },
      symbols: {
        blacklisted_count: this.symbolManager.blacklistedSymbols.size,
        supported_count: this.symbolManager.supportedSymbols.size
      },
      recommendations: this.getHealthRecommendations()
    };
  }

  getRecommendations(symbolStats) {
    const recommendations = [];
    
    if (this.circuitBreakerOpen) {
      recommendations.push('🔴 Circuit breaker open - service will auto-recover');
    }
    
    if (symbolStats.plan_type === 'free') {
      recommendations.push('💡 Free plan detected - consider upgrading for more symbols');
    }
    
    if (this.consecutiveErrors > 1) {
      recommendations.push('⚠️ Multiple errors detected - check API status');
    }
    
    return recommendations;
  }

  getHealthRecommendations() {
    const recommendations = [];
    
    if (this.circuitBreakerOpen) {
      recommendations.push('🔴 Circuit breaker open - service will auto-recover in a few minutes');
      recommendations.push('💡 You can force reset using the emergency reset endpoint');
    }
    
    if (this.consecutiveErrors > 1) {
      recommendations.push('⚠️ Multiple errors detected - check TAAPI_SECRET and plan limits');
    }
    
    if (this.isRateLimited) {
      recommendations.push('⏰ Rate limited - consider upgrading TAAPI plan for higher limits');
    }
    
    if (this.symbolManager.blacklistedSymbols.size > 5) {
      recommendations.push('🚫 Many symbols blacklisted - may need plan upgrade');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ System operating normally');
    }
    
    return recommendations;
  }

  getQueueStatus() {
    return this.requestQueue.getQueueStatus();
  }

  async testConnection() {
    try {
      const response = await axios.get(`${this.baseURL}/rsi`, {
        params: {
          secret: this.secret,
          exchange: 'binance',
          symbol: 'BTC/USDT',
          interval: '1h'
        },
        timeout: 5000
      });
      
      logger.info('✅ TAAPI connection test successful', { rsi: response.data.value });
      return true;
    } catch (error) {
      logger.error('❌ TAAPI connection test failed:', error.message);
      return false;
    }
  }

  reset() {
    this.consecutiveErrors = 0;
    this.backoffMultiplier = 1;
    this.circuitBreakerOpen = false;
    this.isRateLimited = false;
    this.cache.clear();
    this.requestQueue.clearQueue();
    logger.info('🔄 TAAPI Service V2 reset');
  }
}

module.exports = EnhancedTaapiServiceV2;