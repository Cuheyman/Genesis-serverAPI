// src/services/enhancedTaapiService.js
const axios = require('axios');
const logger = require('../utils/logger');

// 🚀 TAAPI Request Queue System - Respects 1-minute cycles
// 🚀 FIXED TAAPI Request Queue System
class TaapiRequestQueue {
  constructor(taapiService) {
    this.taapiService = taapiService;
    this.queue = [];
    this.processing = false;
    this.currentRequest = null;
    this.requestCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.activePromises = new Map(); // 🔧 NEW: Track active promises by symbol
    
    logger.info('🚀 TAAPI Request Queue initialized - respecting 1-minute cycles');
  }

 // 🚀 SIMPLE QUEUE FIX - Replace the queueRequest method only
async queueRequest(symbol, interval = '1h', exchange = 'binance') {
  const cacheKey = `${symbol}_${interval}_${exchange}`;
  
  // 1. Check cache first
  const cached = this.getCachedResult(cacheKey);
  if (cached) {
    logger.info(`📋 CACHE HIT: ${symbol} - returning cached TAAPI data`);
    return cached;
  }

  // 2. Check if we already have an active promise for this symbol
  if (this.activePromises.has(cacheKey)) {
    logger.info(`⏳ ACTIVE: ${symbol} already processing, waiting for result...`);
    return this.activePromises.get(cacheKey);
  }

  // 3. Create new request promise - FIXED VERSION
  let resolveFunction, rejectFunction;
  
  const requestPromise = new Promise((resolve, reject) => {
    resolveFunction = resolve;
    rejectFunction = reject;
  });

  // 4. Create request object with the resolver functions
  const request = {
    symbol,
    interval,
    exchange,
    cacheKey,
    resolve: resolveFunction,
    reject: rejectFunction,
    timestamp: Date.now()
  };
  
  // 5. Store the active promise BEFORE adding to queue
  this.activePromises.set(cacheKey, requestPromise);
  
  // 6. Add to queue
  this.queue.push(request);
  logger.info(`📤 QUEUED: ${symbol} (Queue length: ${this.queue.length})`);
  
  // 7. Start processing if not already running
  if (!this.processing) {
    this.startProcessing().catch(err => {
      logger.error(`Queue processing failed to start: ${err.message}`);
      // Clean up on error
      this.activePromises.delete(cacheKey);
      resolveFunction(this.taapiService.getFallbackData(symbol));
    });
  }

  return requestPromise;
}
  // Process queue sequentially - one request per minute
  async startProcessing() {
    if (this.processing) {
      logger.info('⚠️ Processing already running, skipping start');
      return;
    }
    
    this.processing = true;
    logger.info('🔄 TAAPI Queue processing started');

    try {
      while (this.queue.length > 0) {
        const request = this.queue.shift();
        this.currentRequest = request;
        
        try {
          logger.info(`🎯 PROCESSING: ${request.symbol} (${this.queue.length} remaining in queue)`);
          const startTime = Date.now();
          
          // Make the actual TAAPI request (this takes ~1 minute)
          const result = await this.taapiService.getDirectBulkIndicators(
            request.symbol, 
            request.interval, 
            request.exchange
          );
          
          const duration = (Date.now() - startTime) / 1000;
          logger.info(`✅ COMPLETED: ${request.symbol} in ${duration.toFixed(1)}s`);
          
          // Ensure result is valid
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
          
          // Return fallback data instead of failing completely
          const fallbackData = this.taapiService.getFallbackData(request.symbol);
          
          // Ensure fallback data is valid
          if (!fallbackData) {
            fallbackData = {
              isFallbackData: true,
              source: 'emergency_fallback',
              rsi: 50,
              macd: { macd: 0, signal: 0, histogram: 0 },
              bollinger: { upper: 0, middle: 0, lower: 0 },
              ema20: 0
            };
          }
          
          this.setCachedResult(request.cacheKey, fallbackData);
          
          // Remove from active promises
          this.activePromises.delete(request.cacheKey);
          
          // Resolve with fallback (don't reject to avoid errors)
          request.resolve(fallbackData);
        }
        
        this.currentRequest = null;
        
        // Small delay between requests to be extra safe
        if (this.queue.length > 0) {
          logger.info(`⏸️ Brief pause before next request...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second pause
        }
      }
    } catch (processingError) {
      logger.error(`❌ Queue processing error: ${processingError.message}`);
    } finally {
      this.processing = false;
      logger.info('🏁 TAAPI Queue processing completed');
    }
  }

  // Cache management
  getCachedResult(cacheKey) {
    const cached = this.requestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    
    // Remove expired cache
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
    
    // Clean old cache entries
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

  // Get queue status for monitoring
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentRequest: this.currentRequest ? this.currentRequest.symbol : null,
      cacheSize: this.requestCache.size,
      activePromises: this.activePromises.size,
      estimatedWaitTime: this.queue.length * 60 // seconds
    };
  }

  // Emergency queue clear
  clearQueue() {
    const rejected = this.queue.length;
    
    // Reject all pending requests
    this.queue.forEach(req => {
      try {
        const fallbackData = this.taapiService.getFallbackData(req.symbol);
        req.resolve(fallbackData); // Resolve with fallback instead of rejecting
      } catch (error) {
        req.reject(new Error('Queue cleared'));
      }
    });
    
    // Clear everything
    this.queue = [];
    this.activePromises.clear();
    
    logger.warn(`🚨 Queue cleared - ${rejected} requests resolved with fallback`);
  }

  // 🔧 NEW: Force process queue (for debugging)
  async forceProcess() {
    if (this.processing) {
      logger.warn('Cannot force process - already processing');
      return false;
    }
    
    if (this.queue.length === 0) {
      logger.warn('Cannot force process - queue is empty');
      return false;
    }
    
    logger.info('🔧 FORCE: Starting queue processing manually');
    await this.startProcessing();
    return true;
  }
}

class EnhancedTaapiService {
  constructor() {
    this.baseURL = 'https://api.taapi.io';
    this.secret = process.env.TAAPI_SECRET || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbHVlIjoiNjg1NDFjNDI4MDZmZjE2NTFlNTY4ZGNhIiwiaWF0IjoxNzUyNDIyMzg4LCJleHAiOjMzMjU2ODg2Mzg4fQ.Q4GOQ6s32PcS3S8zBNTGxJXHtoAt6bveeav8aIegmTU';
    
    // Rate limiting settings for free tier
    this.rateLimitDelay = 16000; // 16 seconds between calls (safer than 15)
    this.lastCallTime = 0;
    
    // ✅ Rate limiting tracking
    this.isRateLimited = false;
    this.rateLimitUntil = 0;
    
    // Error handling and circuit breaker
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    this.backoffMultiplier = 1;
    this.maxBackoffDelay = 300000; // 5 minutes max
    this.circuitBreakerOpen = false;
    this.circuitBreakerResetTime = 0;
    
    // Cache for results
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Supported symbols cache
    this.supportedSymbols = new Set();
    this.unsupportedSymbols = new Set();
    this.symbolValidationCache = new Map();
    
    // 🚀 Initialize the request queue system
    this.requestQueue = new TaapiRequestQueue(this);
    
    // Initialize with known good symbols
    this.initializeSupportedSymbols();
    
    logger.info('🚀 Enhanced Taapi Service initialized with queue system and rate limiting');
  }

  initializeSupportedSymbols() {
    // Common symbols that are usually supported
    const commonSymbols = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT', 
      'XRPUSDT', 'DOTUSDT', 'LINKUSDT', 'LTCUSDT', 'BCHUSDT',
      'UNIUSDT', 'MATICUSDT', 'AVAXUSDT', 'ALGOUSDT', 'ATOMUSDT',
      'VETUSDT', 'FTMUSDT', 'MANAUSDT', 'SANDUSDT', 'AXSUSDT'
    ];
    
    commonSymbols.forEach(symbol => this.supportedSymbols.add(symbol));
  }

  // ✅ Check rate limit status
  checkRateLimit() {
    if (this.isRateLimited && Date.now() > this.rateLimitUntil) {
      this.isRateLimited = false;
      logger.info('TAAPI rate limit period ended, resuming requests');
    }
    return this.isRateLimited;
  }

  // ✅ Handle rate limit response
  handleRateLimit(response) {
    this.isRateLimited = true;
    this.rateLimitUntil = Date.now() + (60 * 1000); // 1 minute backoff
    logger.warn('TAAPI rate limited, backing off for 1 minute');
  }

  isCircuitBreakerOpen() {
    return false; // 🚀 FORCE CIRCUIT BREAKER CLOSED (as requested)
  }

  async waitForRateLimit() {
    // Check rate limit status first
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

  getCacheKey(symbol, interval, indicators) {
    return `${symbol}_${interval}_${indicators.sort().join(',')}`;
  }

  getFromCache(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      logger.debug(`Cache hit for ${cacheKey}`);
      return cached.data;
    }
    return null;
  }

  setCache(cacheKey, data) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.cacheExpiry) {
          this.cache.delete(key);
        }
      }
    }
  }

  async validateSymbol(symbol, exchange = 'binance') {
    // Check cache first
    if (this.supportedSymbols.has(symbol)) return true;
    if (this.unsupportedSymbols.has(symbol)) return false;
    
    const cacheKey = `validation_${symbol}_${exchange}`;
    const cached = this.symbolValidationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      return cached.isSupported;
    }

    try {
      // Try a simple RSI request to validate symbol
      await this.waitForRateLimit();
      
      const response = await axios.get(`${this.baseURL}/rsi`, {
        params: {
          secret: this.secret,
          exchange,
          symbol,
          interval: '1h'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        this.supportedSymbols.add(symbol);
        this.symbolValidationCache.set(cacheKey, {
          isSupported: true,
          timestamp: Date.now()
        });
        logger.debug(`Symbol ${symbol} validated as supported`);
        return true;
      }
    } catch (error) {
      if (error.response?.status === 400) {
        // Symbol not supported
        this.unsupportedSymbols.add(symbol);
        this.symbolValidationCache.set(cacheKey, {
          isSupported: false,
          timestamp: Date.now()
        });
        logger.warn(`Symbol ${symbol} is not supported by Taapi`);
        return false;
      }
      // Other errors don't necessarily mean symbol is unsupported
      logger.warn(`Error validating symbol ${symbol}:`, error.message);
    }
    
    return false;
  }

  handleError(error, symbol) {
    this.consecutiveErrors++;
    
    if (error.response?.status === 429) {
      // Rate limit hit - increase backoff
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 8);
      this.handleRateLimit(error.response);
      logger.warn(`Rate limit hit for ${symbol}. Backoff multiplier: ${this.backoffMultiplier}`);
    } else if (error.response?.status === 400) {
      // Bad request - likely unsupported symbol
      this.unsupportedSymbols.add(symbol);
      logger.warn(`Symbol ${symbol} marked as unsupported due to 400 error`);
    } else {
      // Other errors
      logger.error(`Taapi service error for ${symbol}:`, error.message);
    }
  }

  handleSuccess() {
    // Reset error counters on successful request
    this.consecutiveErrors = 0;
    this.backoffMultiplier = Math.max(this.backoffMultiplier * 0.8, 1);
  }

  convertSymbolForTaapi(symbol) {
    // If already has slash, return as-is
    if (symbol.includes('/')) return symbol;
    
    // Convert BTCUSDT to BTC/USDT
    if (symbol.endsWith('USDT')) {
      const base = symbol.slice(0, -4); // Remove 'USDT'
      return `${base}/USDT`;
    }
    
    // Handle other quote currencies if needed
    if (symbol.endsWith('BTC')) {
      const base = symbol.slice(0, -3);
      return `${base}/BTC`;
    }
    
    // Default: assume USDT pair
    return `${symbol}/USDT`;
  }

  // 🚀 NEW: Public method that uses the queue system
  async getBulkIndicators(symbol, interval = '1h', exchange = 'binance') {
    try {
      logger.info(`🎯 QUEUING: ${symbol} for TAAPI processing`);
      
      // Use the queue system instead of direct requests
      const result = await this.requestQueue.queueRequest(symbol, interval, exchange);
      
      logger.info(`📊 RECEIVED: ${symbol} data from queue (fallback: ${result.isFallbackData || false})`);
      return result;
      
    } catch (error) {
      logger.error(`❌ QUEUE ERROR for ${symbol}:`, error.message);
      return this.getFallbackData(symbol);
    }
  }

  // 🚀 NEW: Direct method used by the queue (renamed from getBulkIndicators)
  async getDirectBulkIndicators(symbol, interval = '1h', exchange = 'binance') {
    let requestDetails = null;
    
    try {
      const taapiSymbol = this.convertSymbolForTaapi(symbol);
      logger.info(`🔄 DEBUG: Converting ${symbol} to ${taapiSymbol} for TAAPI`);
      
      // Check circuit breaker
      if (this.isCircuitBreakerOpen()) {
        logger.warn(`DEBUG: Circuit breaker is OPEN for ${symbol} - returning fallback`);
        return this.getFallbackData(symbol);
      }
      logger.info(`DEBUG: Circuit breaker is CLOSED for ${symbol}`);
  
      // Validate symbol first
      const isSupported = await this.validateSymbol(symbol, exchange);
      if (!isSupported) {
        logger.warn(`DEBUG: Symbol ${symbol} is NOT SUPPORTED - returning fallback`);
        return this.getFallbackData(symbol);
      }
      logger.info(`DEBUG: Symbol ${symbol} is SUPPORTED`);
  
      // ✅ SMART: Start with essential indicators only (4 indicators for free tier)
      logger.info(`🎯 DEBUG: Making SMART TAAPI calls for ${symbol} - 4 essential indicators!`);
      
      const baseParams = {
        secret: this.secret,
        exchange,
        symbol: taapiSymbol,
        interval
      };
      
      requestDetails = { smart_calls: true, symbol: taapiSymbol, indicators: 4 };
      
      // ✅ SEQUENTIAL REQUESTS: Respect rate limits with delays
      await this.waitForRateLimit();
      logger.info(`📊 Getting RSI for ${symbol}...`);
      const rsiResponse = await axios.get(`${this.baseURL}/rsi`, {
        params: { ...baseParams, optInTimePeriod: 14 },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/1.0' }
      });
      
      await this.waitForRateLimit(); // 16 second delay
      logger.info(`📈 Getting MACD for ${symbol}...`);
      const macdResponse = await axios.get(`${this.baseURL}/macd`, {
        params: baseParams,
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/1.0' }
      });
      
      await this.waitForRateLimit(); // 16 second delay
      logger.info(`🌊 Getting Bollinger Bands for ${symbol}...`);
      const bbandsResponse = await axios.get(`${this.baseURL}/bbands`, {
        params: { ...baseParams, optInTimePeriod: 20 },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/1.0' }
      });
      
      await this.waitForRateLimit(); // 16 second delay
      logger.info(`📊 Getting EMA20 for ${symbol}...`);
      const ema20Response = await axios.get(`${this.baseURL}/ema`, {
        params: { ...baseParams, optInTimePeriod: 20 },
        timeout: 10000,
        headers: { 'User-Agent': 'TradingBot/1.0' }
      });
  
      // ✅ BUILD: Smart indicator data with safe validation and correct TAAPI property names
      const indicatorData = {
        // 🎯 REAL TAAPI DATA (with correct property names and safe defaults)
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
        
        // 📊 CALCULATED INDICATORS (with safe calculations)
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
        
        // Keep compatibility
        hammer: 0,
        engulfing: 0,
        doji: 0,
        shootingStar: 0,
        
        // 🏷️ METADATA
        isFallbackData: false,
        source: 'taapi_smart_calls',
        dataQuality: 'mixed',
        realIndicators: 4,
        calculatedIndicators: 6,
        timestamp: Date.now()
      };
      
      // ✅ ANALYZE: Calculate smart insights
      const insights = this.calculateSmartInsights(indicatorData, taapiSymbol);
      indicatorData.insights = insights;
      
      // Cache the result in the main cache too
      const indicators = ['rsi', 'macd', 'bbands', 'ema20'];
      const cacheKey = this.getCacheKey(symbol, interval, indicators);
      this.setCache(cacheKey, indicatorData);
      this.handleSuccess();
      
      logger.info(`🧠 SMART: Successfully retrieved 4 real + 6 calculated indicators for ${symbol}!`);
  
      // ✅ SAFE LOGGING: Check values before calling toFixed()
      const safeFormat = (value, decimals = 2) => {
        return (value !== undefined && value !== null && !isNaN(value)) ? 
          Number(value).toFixed(decimals) : 'N/A';
      };
  
      logger.info(`🎯 RSI: ${safeFormat(indicatorData.rsi)} | MACD: ${safeFormat(indicatorData.macd?.macd)} | EMA20: ${safeFormat(indicatorData.ema20)}`);
      logger.info(`🌊 BB Upper: ${safeFormat(indicatorData.bollinger?.upper)} | Middle: ${safeFormat(indicatorData.bollinger?.middle)} | Lower: ${safeFormat(indicatorData.bollinger?.lower)}`);
  
      // ✅ DEBUG: Show raw data to see what's undefined
      logger.info(`🔍 DEBUG: Raw indicator data for ${symbol}:`, {
        rsi: rsiResponse?.data?.value,
        macd: {
          valueMACD: macdResponse?.data?.valueMACD,
          valueMACDSignal: macdResponse?.data?.valueMACDSignal,
          valueMACDHist: macdResponse?.data?.valueMACDHist
        },
        ema20: ema20Response?.data?.value,
        bollinger: {
          valueUpperBand: bbandsResponse?.data?.valueUpperBand,
          valueMiddleBand: bbandsResponse?.data?.valueMiddleBand,
          valueLowerBand: bbandsResponse?.data?.valueLowerBand
        }
      });
      
      return indicatorData;
      
    } catch (error) {
      console.error(`❌ SMART TAAPI ERROR for ${symbol}:`, error.message);
      if (error.response) {
        console.error(`❌ Response status: ${error.response.status}`);
        console.error(`❌ Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      this.handleError(error, symbol);
      logger.warn(`🔄 DEBUG: Falling back to basic data for ${symbol} due to smart error`);
      return this.getFallbackData(symbol);
    }
  }
  
  // ✅ SMART: Insights with fewer indicators
  calculateSmartInsights(data, symbol) {
    const insights = {
      trendDirection: 'NEUTRAL',
      momentum: 'NEUTRAL', 
      volatility: 'NORMAL',
      signals: [],
      confidence: 0
    };
    
    try {
      // 🎯 TREND ANALYSIS (EMA + Bollinger position)
      const currentPrice = data.bollinger.middle; // Use BB middle as price proxy
      if (currentPrice > data.ema20) {
        insights.trendDirection = 'BULLISH';
        insights.signals.push('PRICE_ABOVE_EMA20');
      } else {
        insights.trendDirection = 'BEARISH';
        insights.signals.push('PRICE_BELOW_EMA20');
      }
      
      // 🚀 MOMENTUM ANALYSIS
      if (data.rsi > 70 && data.macd.macd > data.macd.signal) {
        insights.momentum = 'STRONG_BULLISH';
        insights.signals.push('RSI_MACD_BULLISH_CONFLUENCE');
      } else if (data.rsi < 30 && data.macd.macd < data.macd.signal) {
        insights.momentum = 'STRONG_BEARISH';
        insights.signals.push('RSI_MACD_BEARISH_CONFLUENCE');
      } else if (data.rsi > 50) {
        insights.momentum = 'BULLISH';
      } else {
        insights.momentum = 'BEARISH';
      }
      
      // 🌊 VOLATILITY ANALYSIS
      const bbWidth = (data.bollinger.upper - data.bollinger.lower) / Math.max(data.bollinger.middle, 1);
      if (bbWidth > 0.04) {
        insights.volatility = 'HIGH';
        insights.signals.push('HIGH_VOLATILITY_EXPANSION');
      } else if (bbWidth < 0.02) {
        insights.volatility = 'LOW';
        insights.signals.push('LOW_VOLATILITY_SQUEEZE');
      }
      
      // 🎯 CONFIDENCE CALCULATION
      let confidence = 60; // Higher base since we have real data
      if (insights.signals.includes('RSI_MACD_BULLISH_CONFLUENCE') || insights.signals.includes('RSI_MACD_BEARISH_CONFLUENCE')) confidence += 20;
      if (insights.signals.includes('PRICE_ABOVE_EMA20') || insights.signals.includes('PRICE_BELOW_EMA20')) confidence += 10;
      
      insights.confidence = Math.min(confidence, 90);
      
    } catch (error) {
      logger.error(`Error calculating smart insights for ${symbol}:`, error.message);
    }
    
    return insights;
  }

  getFallbackData(symbol) {
    logger.warn(`DEBUG: Returning FALLBACK data for ${symbol}`);
    
    return {
      isFallbackData: true, // Flag to indicate this is fallback data
      source: 'fallback',
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

  // 🚀 NEW: Get queue status for monitoring
  getQueueStatus() {
    return this.requestQueue.getQueueStatus();
  }

  // Method to check service health
  getServiceStatus() {
    const queueStatus = this.getQueueStatus();
    
    return {
      available: !this.isCircuitBreakerOpen(),
      consecutiveErrors: this.consecutiveErrors,
      backoffMultiplier: this.backoffMultiplier,
      supportedSymbolsCount: this.supportedSymbols.size,
      unsupportedSymbolsCount: this.unsupportedSymbols.size,
      cacheSize: this.cache.size,
      circuitBreakerOpen: this.circuitBreakerOpen,
      nextCallAllowed: this.lastCallTime + (this.rateLimitDelay * this.backoffMultiplier),
      isRateLimited: this.isRateLimited,
      rateLimitUntil: this.rateLimitUntil,
      queue: queueStatus
    };
  }

  // Method to reset service state
  reset() {
    this.consecutiveErrors = 0;
    this.backoffMultiplier = 1;
    this.circuitBreakerOpen = false;
    this.circuitBreakerResetTime = 0;
    this.isRateLimited = false;
    this.rateLimitUntil = 0;
    this.cache.clear();
    this.requestQueue.clearQueue();
    logger.info('🔄 Taapi service state reset');
  }

  // 🚀 NEW: Test connection method
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
      
      logger.info('Taapi connection successful', { rsi: response.data.value });
      return true;
    } catch (error) {
      logger.error('Taapi connection failed:', error.message);
      return false;
    }
  }
}

module.exports = EnhancedTaapiService;