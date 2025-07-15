// Dynamic TAAPI Symbol Manager with Live API Integration
// File: src/services/dynamicTaapiSymbolManager.js

const axios = require('axios');
const logger = require('../utils/logger');

class DynamicTaapiSymbolManager {
  constructor(taapiSecret) {
    this.secret = taapiSecret;
    this.baseURL = 'https://api.taapi.io';
    
    // Dynamic symbol lists - fetched from TAAPI API
    this.supportedSymbols = new Set();
    this.allAvailableSymbols = new Set();
    
    // Plan detection
    this.planType = 'unknown'; // 'free', 'demo', 'pro', etc.
    this.planLimitations = {};
    
    // 🚨 HARDCODED FREE PLAN SUPPORTED SYMBOLS
    this.FREE_PLAN_SUPPORTED = new Set([
        'BTCUSDT',
        'ETHUSDT', 
        'XRPUSDT',
        'LTCUSDT',
        'XMRUSDT'
      ]);
      
      // TAAPI format mapping
      this.TAAPI_FORMAT_MAP = {
        'BTCUSDT': 'BTC/USDT',
        'ETHUSDT': 'ETH/USDT',
        'XRPUSDT': 'XRP/USDT', 
        'LTCUSDT': 'LTC/USDT',
        'XMRUSDT': 'XMR/USDT'
      }

    // Cache settings
    this.symbolCacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this.lastSymbolFetch = 0;
    
    // Validation cache
    this.validationCache = new Map();
    this.blacklistedSymbols = new Set();
    
    // Initialize with known fallbacks
    this.initializeFallbackSymbols();
    
    logger.info('🎯 Free Plan Symbol Manager initialized with 5 supported symbols');
  }

  initializeFallbackSymbols() {
    // Known free plan symbols as fallback
    const freePlanSymbols = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'LTCUSDT', 'XMRUSDT'];
    freePlanSymbols.forEach(symbol => this.supportedSymbols.add(symbol));
    
    logger.info(`📦 Initialized with ${freePlanSymbols.length} fallback symbols`);
  }

  /**
   * Fetch supported symbols from TAAPI API
   */
  async fetchSupportedSymbols(force = false) {
    const now = Date.now();
    
    // Check if we need to refresh
    if (!force && (now - this.lastSymbolFetch) < this.symbolCacheExpiry && this.supportedSymbols.size > 0) {
      logger.debug('Using cached symbol list');
      return Array.from(this.supportedSymbols);
    }

    try {
      logger.info('🔍 Fetching supported symbols from TAAPI API...');
      
      const response = await axios.get(`${this.baseURL}/exchange-symbols`, {
        params: {
          secret: this.secret,
          exchange: 'binance'
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data) {
        const symbols = response.data;
        logger.info(`📡 TAAPI API returned ${symbols.length} symbols`);
        
        // Update our sets
        this.allAvailableSymbols.clear();
        this.supportedSymbols.clear();
        
        symbols.forEach(symbol => {
          // Convert to standard format (remove slash)
          const standardSymbol = symbol.replace('/', '');
          this.allAvailableSymbols.add(symbol); // Keep original format
          this.supportedSymbols.add(standardSymbol); // Standard format
        });
        
        this.lastSymbolFetch = now;
        this.detectPlanType(symbols.length);
        
        logger.info(`✅ Updated symbol list: ${this.supportedSymbols.size} symbols supported`);
        return Array.from(this.supportedSymbols);
      }
      
    } catch (error) {
      logger.error(`❌ Failed to fetch symbols from TAAPI: ${error.message}`);
      
      // If it's a 403, we know it's likely a free plan
      if (error.response?.status === 403) {
        this.handleFreePlanDetection(error);
      }
      
      // Return current symbols (fallback)
      return Array.from(this.supportedSymbols);
    }
  }

  /**
   * Handle free plan detection from API response
   */
  handleFreePlanDetection(error) {
    const errorMessage = error.response?.data?.error || error.response?.data?.errors?.[0] || '';
    
    if (errorMessage.includes('Free plans only permits')) {
      this.planType = 'free';
      
      // Extract allowed symbols from error message
      const symbolMatch = errorMessage.match(/\[(.*?)\]/);
      if (symbolMatch) {
        const allowedSymbols = symbolMatch[1].split(',').map(s => s.trim());
        
        this.supportedSymbols.clear();
        allowedSymbols.forEach(symbol => {
          const standardSymbol = symbol.replace('/', '');
          this.supportedSymbols.add(standardSymbol);
        });
        
        logger.warn(`🚫 Free plan detected - limited to ${this.supportedSymbols.size} symbols`);
        logger.info(`✅ Free plan symbols: ${Array.from(this.supportedSymbols).join(', ')}`);
      }
    }
  }

  /**
   * Detect plan type based on symbol count
   */
  detectPlanType(symbolCount) {
    if (symbolCount <= 5) {
      this.planType = 'free';
      this.planLimitations = {
        symbols: 5,
        requests_per_minute: 4,
        requests_per_month: 1000
      };
    } else if (symbolCount <= 100) {
      this.planType = 'starter';
      this.planLimitations = {
        symbols: 100,
        requests_per_minute: 30,
        requests_per_month: 10000
      };
    } else {
      this.planType = 'pro';
      this.planLimitations = {
        symbols: 'unlimited',
        requests_per_minute: 120,
        requests_per_month: 'unlimited'
      };
    }
    
    logger.info(`📊 Plan detected: ${this.planType.toUpperCase()} (${symbolCount} symbols)`);
  }

  /**
   * Smart symbol validation with live testing
   */
  async validateSymbolLive(symbol) {
    const cacheKey = `validate_${symbol}`;
    const cached = this.validationCache.get(cacheKey);
    
    // Check cache first (valid for 1 hour)
    if (cached && (Date.now() - cached.timestamp) < 3600000) {
      return cached.result;
    }

    // Check blacklist
    if (this.blacklistedSymbols.has(symbol)) {
      return { supported: false, reason: 'blacklisted', source: 'cache' };
    }

    try {
      const taapiSymbol = this.convertToTaapiFormat(symbol);
      
      // Try a simple RSI request to test symbol
      const response = await axios.get(`${this.baseURL}/rsi`, {
        params: {
          secret: this.secret,
          exchange: 'binance',
          symbol: taapiSymbol,
          interval: '1h'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        const result = { supported: true, reason: 'live_validated', source: 'api_test' };
        this.supportedSymbols.add(symbol);
        this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }
      
    } catch (error) {
      let result;
      
      if (error.response?.status === 403) {
        // Symbol not supported or plan limitation
        result = { 
          supported: false, 
          reason: 'plan_limitation', 
          source: 'api_error',
          message: error.response?.data?.errors?.[0] || 'Access denied'
        };
        this.blacklistedSymbols.add(symbol);
      } else if (error.response?.status === 400) {
        // Bad symbol format
        result = { 
          supported: false, 
          reason: 'invalid_symbol', 
          source: 'api_error',
          message: 'Symbol not available on exchange'
        };
        this.blacklistedSymbols.add(symbol);
      } else {
        // Other error - don't cache, might be temporary
        result = { 
          supported: false, 
          reason: 'api_error', 
          source: 'temporary_error',
          message: error.message
        };
      }
      
      if (result.reason !== 'api_error') {
        this.validationCache.set(cacheKey, { result, timestamp: Date.now() });
      }
      
      return result;
    }
  }

  /**
   * Smart symbol routing with comprehensive checking
   */
  async routeSymbolRequest(symbol) {
    try {
      // 🚨 STEP 1: Check if symbol is in free plan whitelist
      if (this.FREE_PLAN_SUPPORTED.has(symbol)) {
        logger.info(`✅ Symbol ${symbol} is FREE PLAN SUPPORTED - using TAAPI`);
        
        return {
          strategy: 'taapi_direct',
          symbol: this.TAAPI_FORMAT_MAP[symbol],
          source: 'free_plan_whitelist',
          message: `${symbol} supported on free plan`,
          supported: true
        };
      } else {
        // 🎯 STEP 2: Symbol not supported - use fallback but still deliver analysis
        logger.info(`⏭️ Symbol ${symbol} NOT in free plan (${Array.from(this.FREE_PLAN_SUPPORTED).join(', ')}) - using fallback analysis`);
        
        return {
          strategy: 'fallback_only',
          symbol: symbol,
          source: 'free_plan_limitation',
          message: `${symbol} not included in free plan - delivering enhanced fallback analysis`,
          supported: false,
          reason: 'Free plan only supports: BTC/USDT, ETH/USDT, XRP/USDT, LTC/USDT, XMR/USDT'
        };
      }
      
    } catch (error) {
      logger.error(`Routing error for ${symbol}:`, error.message);
      return {
        strategy: 'fallback_only',
        symbol: symbol,
        source: 'routing_error',
        message: 'Error during symbol routing - using fallback analysis',
        supported: false
      };
    }
  }

  isSymbolSupported(symbol) {
    return this.FREE_PLAN_SUPPORTED.has(symbol);
  }

  getSupportedSymbols() {
    return Array.from(this.FREE_PLAN_SUPPORTED);
  }

  // Get symbol stats for the free plan
  async getSymbolStats() {
    const supported = Array.from(this.FREE_PLAN_SUPPORTED);
    const blacklisted = Array.from(this.blacklistedSymbols);
    
    return {
      plan_type: 'free',
      plan_limitations: {
        symbols: '5 major pairs only',
        requests_per_minute: 1,
        requests_per_month: 'limited'
      },
      supported_symbols_count: supported.length,
      supported_symbols: supported,
      blacklisted_count: blacklisted.length,
      blacklisted_symbols: blacklisted,
      total_available_symbols: 5,
      cache_entries: 0,
      last_update: new Date().toISOString(),
      recommendations: [
        '💡 Free plan supports 5 symbols: BTC, ETH, XRP, LTC, XMR',
        '🚀 Upgrade for access to 1400+ symbols',
        '⭐ All other symbols receive enhanced fallback analysis'
      ]
    };
  }


  /**
   * Get comprehensive symbol statistics
   */
  async getSymbolStats() {
    // Refresh symbols if needed
    await this.fetchSupportedSymbols();
    
    return {
      plan_type: this.planType,
      plan_limitations: this.planLimitations,
      supported_symbols_count: this.supportedSymbols.size,
      supported_symbols: Array.from(this.supportedSymbols).slice(0, 20), // First 20
      blacklisted_count: this.blacklistedSymbols.size,
      cache_entries: this.validationCache.size,
      last_update: new Date(this.lastSymbolFetch).toISOString(),
      recommendations: this.getRecommendations()
    };
  }

  getRecommendations() {
    const recommendations = [];
    
    if (this.planType === 'free') {
      recommendations.push('💡 Free plan detected - consider upgrading for more symbols');
      recommendations.push(`🎯 Focus trading on: ${Array.from(this.supportedSymbols).join(', ')}`);
    }
    
    if (this.blacklistedSymbols.size > 10) {
      recommendations.push('⚠️ Many symbols unsupported - optimize symbol selection');
    }
    
    if (this.supportedSymbols.size < 10) {
      recommendations.push('🔄 Limited symbol coverage - refresh symbol list or upgrade plan');
    }
    
    return recommendations;
  }

  /**
   * Utility methods
   */
  normalizeSymbol(symbol) {
    return symbol.toUpperCase().replace('/', '');
  }

  convertToTaapiFormat(symbol) {
    const normalized = this.normalizeSymbol(symbol);
    if (normalized.endsWith('USDT')) {
      const base = normalized.replace('USDT', '');
      return `${base}/USDT`;
    }
    return symbol;
  }

  /**
   * Emergency refresh of all symbols
   */
  async refreshSymbols() {
    logger.info('🔄 Force refreshing symbol list...');
    this.validationCache.clear();
    this.blacklistedSymbols.clear();
    return await this.fetchSupportedSymbols(true);
  }

  /**
   * Get plan upgrade suggestions
   */
  getPlanUpgradeInfo() {
    return {
      current_plan: this.planType,
      current_symbols: this.supportedSymbols.size,
      upgrade_benefits: {
        starter: {
          symbols: '100+',
          requests: '30/min',
          cost: 'Check TAAPI pricing'
        },
        pro: {
          symbols: 'All 1460+',
          requests: '120/min', 
          cost: 'Check TAAPI pricing'
        }
      },
      recommendation: this.planType === 'free' 
        ? 'Consider upgrading for better symbol coverage'
        : 'Current plan provides good symbol coverage'
    };
  }
}

module.exports = DynamicTaapiSymbolManager;