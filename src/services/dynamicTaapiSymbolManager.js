// Dynamic TAAPI Symbol Manager with Pro Plan Support
// File: src/services/dynamicTaapiSymbolManager.js

const axios = require('axios');
const logger = require('../utils/logger');

class DynamicTaapiSymbolManager {
  constructor(taapiSecret) {
    this.secret = taapiSecret;
    this.baseURL = 'https://api.taapi.io';
    
    // 🔥 CRITICAL FIX: Read plan mode from environment
    this.isFreePlanMode = process.env.TAAPI_FREE_PLAN_MODE === 'true';
    this.enableBulkQuery = process.env.TAAPI_BULK_QUERY_ENABLED !== 'false';
    
    // Dynamic symbol lists - fetched from TAAPI API
    this.supportedSymbols = new Set();
    this.allAvailableSymbols = new Set();
    
    // Plan detection
    this.planType = this.isFreePlanMode ? 'free' : 'pro';
    this.planLimitations = {};
    
    // 🔥 CRITICAL FIX: Only use hardcoded list if explicitly in free plan mode
    if (this.isFreePlanMode) {
      this.FREE_PLAN_SUPPORTED = new Set([
        'BTCUSDT',
        'ETHUSDT', 
        'XRPUSDT',
        'LTCUSDT',
        'XMRUSDT'
      ]);
      
      this.TAAPI_FORMAT_MAP = {
        'BTCUSDT': 'BTC/USDT',
        'ETHUSDT': 'ETH/USDT',
        'XRPUSDT': 'XRP/USDT', 
        'LTCUSDT': 'LTC/USDT',
        'XMRUSDT': 'XMR/USDT'
      };
      
      logger.info('🚨 FREE PLAN MODE: Limited to 5 symbols');
    } else {
      // Pro plan mode - no hardcoded limitations
      this.FREE_PLAN_SUPPORTED = new Set(); // Empty set for pro plan
      this.TAAPI_FORMAT_MAP = {};
      
      logger.info('🚀 PRO PLAN MODE: All symbols supported');
    }

    // Cache settings
    this.symbolCacheExpiry = this.isFreePlanMode ? 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000; // 24h for free, 4h for pro
    this.lastSymbolFetch = 0;
    
    // Validation cache
    this.validationCache = new Map();
    this.blacklistedSymbols = new Set();
    
    // Initialize
    this.initialize();
  }

  async initialize() {
    if (this.isFreePlanMode) {
      this.initializeFallbackSymbols();
      logger.info('📦 Free Plan: Initialized with 5 fallback symbols');
    } else {
      // Pro plan: Try to fetch all symbols immediately
      logger.info('🔍 Pro Plan: Fetching all supported symbols...');
      try {
        await this.fetchSupportedSymbols(true);
      } catch (error) {
        logger.warn('⚠️ Could not fetch symbols on startup, will try later:', error.message);
        // Set some common symbols as fallback for pro plan
        this.initializeProPlanFallback();
      }
    }
  }

  initializeFallbackSymbols() {
    // Known free plan symbols as fallback
    const freePlanSymbols = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'LTCUSDT', 'XMRUSDT'];
    freePlanSymbols.forEach(symbol => this.supportedSymbols.add(symbol));
  }

  initializeProPlanFallback() {
    // Common symbols as fallback for pro plan
    const commonSymbols = [
      'BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'LTCUSDT', 'XMRUSDT',
      'BNBUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT',
      'AVAXUSDT', 'LINKUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT',
      'SOLUSDT', 'ORDIUSDT', 'SUIUSDT', 'AAVEUSDT', 'MKRUSDT'
    ];
    commonSymbols.forEach(symbol => this.supportedSymbols.add(symbol));
    logger.info(`📦 Pro Plan Fallback: Initialized with ${commonSymbols.length} common symbols`);
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

    // Skip API fetch if in free plan mode (use hardcoded list)
    if (this.isFreePlanMode) {
      logger.debug('Free plan mode: Using hardcoded symbol list');
      return Array.from(this.FREE_PLAN_SUPPORTED);
    }

    try {
      logger.info('🔍 Fetching supported symbols from TAAPI API (Pro Plan)...');
      
      const response = await axios.get(`${this.baseURL}/exchange-symbols`, {
        params: {
          secret: this.secret,
          exchange: 'binance'
        },
        timeout: 15000
      });

      if (response.status === 200 && response.data) {
        const symbols = response.data;
        logger.info(`📡 TAAPI API returned ${symbols.length} symbols (Pro Plan)`);
        
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
        
        logger.info(`✅ Pro Plan: Updated symbol list with ${this.supportedSymbols.size} symbols`);
        return Array.from(this.supportedSymbols);
      }
      
    } catch (error) {
      logger.error(`❌ Failed to fetch symbols from TAAPI: ${error.message}`);
      
      // If it's a 403, might be a plan limitation
      if (error.response?.status === 403) {
        logger.warn('🚨 TAAPI returned 403 - check your plan status');
        this.handleApiError(error);
      }
      
      // Return current symbols (fallback)
      return Array.from(this.supportedSymbols);
    }
  }

  /**
   * Handle API errors and plan detection
   */
  handleApiError(error) {
    const errorMessage = error.response?.data?.error || error.response?.data?.errors?.[0] || '';
    
    if (errorMessage.includes('Free plans only permits')) {
      logger.warn('🚨 API indicates free plan limitations despite pro plan configuration');
      logger.warn('Check your TAAPI plan status at taapi.io');
      
      // Don't automatically switch to free plan mode - log warning instead
      logger.warn('⚠️ Continuing with pro plan configuration as requested');
    }
  }

  /**
   * Detect plan type based on symbol count
   */
  detectPlanType(symbolCount) {
    if (this.isFreePlanMode) {
      this.planType = 'free';
      this.planLimitations = {
        symbols: 5,
        requests_per_minute: 4,
        requests_per_month: 1000
      };
    } else if (symbolCount <= 100) {
      this.planType = 'starter';
      this.planLimitations = {
        symbols: symbolCount,
        requests_per_minute: 30,
        requests_per_month: 10000
      };
    } else {
      this.planType = 'pro';
      this.planLimitations = {
        symbols: symbolCount,
        requests_per_minute: 120,
        requests_per_month: 'unlimited'
      };
    }
    
    logger.info(`📊 Plan detected: ${this.planType.toUpperCase()} (${symbolCount} symbols)`);
  }

  /**
   * Smart symbol routing with pro plan support
   */
  async routeSymbolRequest(symbol) {
    try {
      // 🔥 CRITICAL FIX: Handle pro plan mode
      if (!this.isFreePlanMode) {
        // Pro plan mode - check if symbol is in our supported list
        if (this.supportedSymbols.size === 0) {
          // Try to fetch symbols if we don't have any
          await this.fetchSupportedSymbols();
        }
        
        // For pro plan, assume symbol is supported unless proven otherwise
        if (this.supportedSymbols.has(symbol) || this.supportedSymbols.size === 0) {
          logger.info(`✅ PRO PLAN: Symbol ${symbol} supported - using TAAPI`);
          
          return {
            strategy: 'taapi_direct',
            symbol: this.convertToTaapiFormat(symbol),
            source: 'pro_plan',
            message: `${symbol} supported on pro plan`,
            supported: true
          };
        } else {
          // Symbol not in list but pro plan - might be new symbol
          logger.info(`⚠️ PRO PLAN: Symbol ${symbol} not in cached list - attempting TAAPI anyway`);
          
          return {
            strategy: 'taapi_direct',
            symbol: this.convertToTaapiFormat(symbol),
            source: 'pro_plan_uncached',
            message: `${symbol} attempting on pro plan`,
            supported: true
          };
        }
      }
      
      // Free plan mode - use original logic
      if (this.FREE_PLAN_SUPPORTED.has(symbol)) {
        logger.info(`✅ FREE PLAN: Symbol ${symbol} supported - using TAAPI`);
        
        return {
          strategy: 'taapi_direct',
          symbol: this.TAAPI_FORMAT_MAP[symbol],
          source: 'free_plan_whitelist',
          message: `${symbol} supported on free plan`,
          supported: true
        };
      } else {
        logger.info(`⏭️ FREE PLAN: Symbol ${symbol} NOT in free plan (${Array.from(this.FREE_PLAN_SUPPORTED).join(', ')}) - using fallback analysis`);
        
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
    if (!this.isFreePlanMode) {
      // Pro plan - check against fetched symbols or assume supported
      return this.supportedSymbols.has(symbol) || this.supportedSymbols.size === 0;
    }
    return this.FREE_PLAN_SUPPORTED.has(symbol);
  }

  getSupportedSymbols() {
    if (!this.isFreePlanMode) {
      return Array.from(this.supportedSymbols);
    }
    return Array.from(this.FREE_PLAN_SUPPORTED);
  }

  async getSymbolStats() {
    if (!this.isFreePlanMode) {
      // Refresh symbols if needed for pro plan
      await this.fetchSupportedSymbols();
    }
    
    const supported = this.getSupportedSymbols();
    const blacklisted = Array.from(this.blacklistedSymbols);
    
    return {
      plan_type: this.planType,
      plan_mode: this.isFreePlanMode ? 'free' : 'pro',
      plan_limitations: this.planLimitations,
      supported_symbols_count: supported.length,
      supported_symbols: supported.slice(0, 20), // First 20 for display
      blacklisted_count: blacklisted.length,
      blacklisted_symbols: blacklisted,
      cache_entries: this.validationCache.size,
      last_update: new Date(this.lastSymbolFetch).toISOString(),
      recommendations: this.getRecommendations()
    };
  }

  getRecommendations() {
    const recommendations = [];
    
    if (this.isFreePlanMode) {
      recommendations.push('💡 Free plan mode active - only 5 symbols supported');
      recommendations.push('🚀 Set TAAPI_FREE_PLAN_MODE=false for pro plan features');
    } else {
      recommendations.push('🚀 Pro plan mode active - all symbols supported');
      recommendations.push(`🎯 ${this.supportedSymbols.size} symbols available`);
    }
    
    if (this.blacklistedSymbols.size > 10) {
      recommendations.push('⚠️ Many symbols unsupported - check symbol names');
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
    
    // Check if we have a specific mapping (free plan)
    if (this.TAAPI_FORMAT_MAP[normalized]) {
      return this.TAAPI_FORMAT_MAP[normalized];
    }
    
    // Default conversion for pro plan
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
   * Get plan configuration info
   */
  getPlanInfo() {
    return {
      current_plan: this.planType,
      plan_mode: this.isFreePlanMode ? 'free' : 'pro',
      environment_setting: process.env.TAAPI_FREE_PLAN_MODE,
      current_symbols: this.supportedSymbols.size,
      hardcoded_limitations: this.isFreePlanMode,
      bulk_query_enabled: this.enableBulkQuery,
      configuration_status: this.isFreePlanMode 
        ? '🚨 FREE PLAN MODE - Limited functionality'
        : '🚀 PRO PLAN MODE - Full functionality'
    };
  }
}

module.exports = DynamicTaapiSymbolManager;