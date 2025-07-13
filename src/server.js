// ===============================================
// SERVER.JS - Enhanced Main Application
// ===============================================


const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const fetch = require('node-fetch'); // Add this if not already installed
require('dotenv').config();

// Import standard services
const offChainDataService = require('./services/offChainDataService');
const riskParameterService = require('./services/riskParameterService');
const signalReasoningEngine = require('./services/signalReasoningEngine');
const botIntegrationService = require('./services/botIntegrationService');

let EnhancedSignalGenerator = null;
let TaapiServiceClass = null;
let taapiService = null;


const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Claude AI
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ===============================================
// STARTUP LOGGING SYSTEM
// ===============================================

const startupLogger = {
  log: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[STARTUP] ${timestamp} - ${message}`, data);
  },
  
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[STARTUP ERROR] ${timestamp} - ${message}`, error);
  },
  
  success: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[STARTUP SUCCESS] ${timestamp} - ${message}`, data);
  }
};

// Startup logging function
const logStartupStatus = async () => {
  startupLogger.log('=== GENESIS AI TRADING BOT STARTUP ===');
  
  // Environment check
  startupLogger.log('Checking environment variables...');
  const envVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    API_KEY_SECRET: process.env.API_KEY_SECRET ? 'SET' : 'MISSING',
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? 'SET' : 'MISSING',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
    NEBULA_API_KEY: process.env.NEBULA_API_KEY ? 'SET' : 'MISSING',
    PYTHON_PATH: process.env.PYTHON_PATH || 'python',
    BINANCE_API_KEY: process.env.BINANCE_API_KEY ? 'SET' : 'MISSING',
    BINANCE_API_SECRET: process.env.BINANCE_API_SECRET ? 'SET' : 'MISSING'
  };
  startupLogger.log('Environment variables status:', envVars);
  
  // API Key validation
  if (!process.env.API_KEY_SECRET) {
    startupLogger.error('API_KEY_SECRET is missing - API authentication will fail');
  } else {
    startupLogger.success('API_KEY_SECRET is configured');
  }
  
  if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    startupLogger.error('CLAUDE_API_KEY/ANTHROPIC_API_KEY is missing - Claude AI will not work');
  } else {
    startupLogger.success('Claude API key is configured');
  }
  
  if (!process.env.NEBULA_API_KEY) {
    startupLogger.error('NEBULA_API_KEY is missing - Nebula AI will not work');
  } else {
    startupLogger.success('NEBULA_API_KEY is configured');
  }
  
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    startupLogger.error('BINANCE_API_KEY/SECRET is missing - Symbol validation may be limited');
  } else {
    startupLogger.success('Binance API credentials are configured');
  }
  
  // Python environment check
  startupLogger.log('Checking Python environment...');
  try {
    const { spawn } = require('child_process');
    const pythonProcess = spawn(process.env.PYTHON_PATH || 'python', ['--version']);
    
    pythonProcess.stdout.on('data', (data) => {
      startupLogger.success(`Python version: ${data.toString().trim()}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      startupLogger.error('Python version check failed:', data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        startupLogger.success('Python environment is available');
      } else {
        startupLogger.error('Python environment check failed');
      }
    });
  } catch (error) {
    startupLogger.error('Failed to check Python environment:', error);
  }
  
  // Dependencies check
  startupLogger.log('Checking Node.js dependencies...');
  try {
    const requiredModules = [
      'axios', 'winston', '@anthropic-ai/sdk', 
      'express', 'cors', 'helmet', 'express-rate-limit',
      'node-fetch', 'binance-api-node'
    ];
    
    for (const module of requiredModules) {
      try {
        require(module);
        startupLogger.success(`✓ ${module} is available`);
      } catch (error) {
        startupLogger.error(`✗ ${module} is missing or failed to load`);
      }
    }
  } catch (error) {
    startupLogger.error('Dependency check failed:', error);
  }
  
  // File system check
  startupLogger.log('Checking file system structure...');
  const fs = require('fs');
  const path = require('path');
  
  const requiredPaths = [
    './logs',
    './predictive-model',
    './services',
    './middleware'
  ];
  
  for (const dirPath of requiredPaths) {
    if (fs.existsSync(dirPath)) {
      startupLogger.success(`✓ Directory exists: ${dirPath}`);
    } else {
      startupLogger.error(`✗ Directory missing: ${dirPath}`);
    }
  }
  
  // Check if log files are writable
  try {
    fs.accessSync('./logs', fs.constants.W_OK);
    startupLogger.success('Log directory is writable');
  } catch (error) {
    startupLogger.error('Log directory is not writable');
  }
  
  // ML model files check
  startupLogger.log('Checking ML model files...');
  const mlFiles = [
    './predictive-model/ml_predictor.py',
    './predictive-model/__init__.py',
    './predictive-model/risk_manager.py',
    './predictive-model/portfolio_optimizer.py',
    './predictive-model/rl_agent.py',
    './predictive-model/deep_learning_model.py',
    './predictive-model/order_flow_analyzer.py'
  ];
  
  for (const file of mlFiles) {
    if (fs.existsSync(file)) {
      startupLogger.success(`✓ ML file exists: ${file}`);
    } else {
      startupLogger.error(`✗ ML file missing: ${file}`);
    }
  }
  
  // Service files check
  startupLogger.log('Checking service files...');
  const serviceFiles = [
    './services/lunarCrushService.js',
    './services/mlcService.js',
    './services/performanceMonitor.js',
    './services/realtimeService.js',
    './services/sentimentAnalyzer.js',
    './services/defiIntegration.js'
  ];
  
  for (const file of serviceFiles) {
    if (fs.existsSync(file)) {
      startupLogger.success(`✓ Service file exists: ${file}`);
    } else {
      startupLogger.error(`✗ Service file missing: ${file}`);
    }
  }
  
  // Network connectivity test
  startupLogger.log('Testing network connectivity...');
  try {
    // Test CoinGecko API
    const coinGeckoTest = axios.get('https://api.coingecko.com/api/v3/ping', { timeout: 5000 })
      .then(() => {
        startupLogger.success('✓ CoinGecko API is reachable');
      })
      .catch((error) => {
        startupLogger.error('✗ CoinGecko API is not reachable:', error.message);
      });
    
    // Test Binance API
    const binanceTest = axios.get('https://api.binance.com/api/v3/ping', { timeout: 5000 })
      .then(() => {
        startupLogger.success('✓ Binance API is reachable');
      })
      .catch((error) => {
        startupLogger.error('✗ Binance API is not reachable:', error.message);
      });
    
  } catch (error) {
    startupLogger.error('Network connectivity test failed:', error);
  }
  
  startupLogger.log('=== STARTUP LOGGING COMPLETE ===');
};

// ===============================================
// MIDDLEWARE SETUP
// ===============================================

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? ['your-domain.com'] : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 3600000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // requests per window
  message: {
    error: 'Too many requests',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// ===============================================
// LOGGING SETUP
// ===============================================

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(), // Ensure Console transport is always present
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// ===============================================
// DYNAMIC SYMBOL VALIDATION SYSTEM
// ===============================================

// Cache for valid symbols
let validSymbolsCache = {
  symbols: [],
  lastUpdated: 0,
  updateInterval: 3600000, // 1 hour
  isUpdating: false,
  symbolMetadata: {}, // Store additional info about symbols
  symbolsByVolume: [], // Symbols sorted by 24h volume
  stablecoins: [] // List of stablecoin pairs
};

// Enhanced fallback symbols with high-volatility profitable crypto pairs
const FALLBACK_SYMBOLS = [
  // Major cryptocurrencies
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT',
  
  // High-volatility meme/trending coins
  'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT',
  
  // DeFi leaders with profit potential
  'AVAXUSDT', 'MATICUSDT', 'ATOMUSDT', 'NEARUSDT', 'UNIUSDT',
  
  // AI/Gaming tokens (high growth potential)
  'FETUSDT', 'RENDERUSDT', 'THETAUSDT', 'SANDUSDT',
  
  // Layer 1 blockchains
  'DOTUSDT', 'ALGOUSDT', 'XLMUSDT', 'FILUSDT',
  
  // New promising Layer 2s and chains
  'ARBUSDT', 'OPUSDT', 'APTUSDT', 'SUIUSDT',
  
  // Additional profitable pairs
  'LINKUSDT', 'LTCUSDT', 'BCHUSDT', 'ETCUSDT', 'TRXUSDT'
];

// Symbol validation statistics
const symbolStats = {
  validationAttempts: 0,
  validationFailures: 0,
  lastFailedSymbols: [],
  apiRefreshAttempts: 0,
  apiRefreshFailures: 0,
  lastError: null
};

const Binance = require('binance-api-node').default;

// Initialize Binance client (add this at the top of your file if not already there)
const binanceClient = Binance({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  test: false // Set to true for testnet
});

async function fetchValidSymbolsFromBinance() {
  try {
    logger.info('Fetching valid symbols from Binance API...');
    symbolStats.apiRefreshAttempts++;

    // Use Binance SDK instead of fetch
    const data = await binanceClient.exchangeInfo();

    // Enhanced filtering for USDT spot trading pairs
    const validSymbols = [];
    const symbolMetadata = {};
    const stablecoins = [];

    data.symbols.forEach(symbol => {
      // Basic filtering
      if (symbol.status !== 'TRADING' || 
          !symbol.symbol.endsWith('USDT') ||
          !symbol.isSpotTradingAllowed) {
        return;
      }

      // Exclude leveraged tokens and other derivatives
      const excludePatterns = ['BEAR', 'BULL', 'DOWN', 'UP', 'LONG', 'SHORT'];
      if (excludePatterns.some(pattern => symbol.symbol.includes(pattern))) {
        return;
      }

      validSymbols.push(symbol.symbol);

      // Store metadata for enhanced filtering
      symbolMetadata[symbol.symbol] = {
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
        filters: symbol.filters,
        permissions: symbol.permissions,
        orderTypes: symbol.orderTypes,
        minNotional: getMinNotionalValue(symbol.filters),
        tickSize: getTickSize(symbol.filters),
        stepSize: getStepSize(symbol.filters)
      };

      // Identify stablecoins
      const stablecoinBases = ['USDC', 'BUSD', 'TUSD', 'USDP', 'DAI', 'FRAX', 'GUSD'];
      if (stablecoinBases.includes(symbol.baseAsset)) {
        stablecoins.push(symbol.symbol);
      }
    });

    logger.info(`Successfully fetched ${validSymbols.length} valid USDT trading pairs`);
    logger.info(`Identified ${stablecoins.length} stablecoin pairs`);

    return {
      symbols: validSymbols.sort(),
      metadata: symbolMetadata,
      stablecoins: stablecoins
    };
  } catch (error) {
    symbolStats.apiRefreshFailures++;
    symbolStats.lastError = error.message;

    if (error.name === 'AbortError') {
      logger.error('Binance API request timed out');
    } else {
      logger.error('Failed to fetch symbols from Binance:', error);
    }
    throw error;
  }
}

// Helper functions (keep these if you don't already have them)
function getMinNotionalValue(filters) {
  const minNotionalFilter = filters.find(f => f.filterType === 'MIN_NOTIONAL');
  return minNotionalFilter ? parseFloat(minNotionalFilter.minNotional) : null;
}

function getTickSize(filters) {
  const priceFilter = filters.find(f => f.filterType === 'PRICE_FILTER');
  return priceFilter ? parseFloat(priceFilter.tickSize) : null;
}

function getStepSize(filters) {
  const lotSizeFilter = filters.find(f => f.filterType === 'LOT_SIZE');
  return lotSizeFilter ? parseFloat(lotSizeFilter.stepSize) : null;
}

/**
 * Get minimum notional value from symbol filters
 */
function getMinNotionalValue(filters) {
  const minNotionalFilter = filters.find(f => f.filterType === 'MIN_NOTIONAL');
  return minNotionalFilter ? parseFloat(minNotionalFilter.minNotional) : 10;
}

/**
 * Get tick size from symbol filters
 */
function getTickSize(filters) {
  const priceFilter = filters.find(f => f.filterType === 'PRICE_FILTER');
  return priceFilter ? parseFloat(priceFilter.tickSize) : 0.00000001;
}

/**
 * Get step size from symbol filters
 */
function getStepSize(filters) {
  const lotSizeFilter = filters.find(f => f.filterType === 'LOT_SIZE');
  return lotSizeFilter ? parseFloat(lotSizeFilter.stepSize) : 0.00000001;
}

/**
 * Fetch 24hr ticker data to sort symbols by volume
 */
async function fetchSymbolVolumes() {
  try {
    // Use Binance SDK to get 24hr ticker statistics
    const tickers = await binanceClient.dailyStats();
    const volumeMap = {};

    tickers.forEach(ticker => {
      if (ticker.symbol.endsWith('USDT')) {
        volumeMap[ticker.symbol] = parseFloat(ticker.quoteVolume);
      }
    });

    return volumeMap;
  } catch (error) {
    logger.error('Failed to fetch symbol volumes:', error);
    return {};
  }
}

/**
 * Update the valid symbols cache with enhanced data
 * @param {boolean} force - Force update even if cache is fresh
 */
async function updateValidSymbols(force = false) {
  const now = Date.now();
  
  // Check if update is needed
  if (!force && 
      validSymbolsCache.symbols.length > 0 && 
      (now - validSymbolsCache.lastUpdated) < validSymbolsCache.updateInterval) {
    return validSymbolsCache.symbols;
  }
  
  // Prevent multiple simultaneous updates
  if (validSymbolsCache.isUpdating) {
    return validSymbolsCache.symbols;
  }
  
  validSymbolsCache.isUpdating = true;
  
  try {
    // Fetch symbols and metadata
    const symbolData = await fetchValidSymbolsFromBinance();
    
    // Sanity check - Binance should have at least 200 USDT pairs
    if (symbolData.symbols.length < 100) {
      throw new Error(`Suspiciously low symbol count: ${symbolData.symbols.length}`);
    }
    
    // Fetch volume data for sorting
    const volumeData = await fetchSymbolVolumes();
    
    // Sort symbols by volume (high to low)
    const symbolsByVolume = symbolData.symbols.sort((a, b) => {
      const volA = volumeData[a] || 0;
      const volB = volumeData[b] || 0;
      return volB - volA;
    });
    
    // Update cache
    validSymbolsCache.symbols = symbolData.symbols;
    validSymbolsCache.symbolMetadata = symbolData.metadata;
    validSymbolsCache.stablecoins = symbolData.stablecoins;
    validSymbolsCache.symbolsByVolume = symbolsByVolume;
    validSymbolsCache.lastUpdated = now;
    
    logger.info(`Symbol cache updated with ${symbolData.symbols.length} symbols`);
    logger.info(`Top 5 by volume: ${symbolsByVolume.slice(0, 5).join(', ')}`);
    
    return symbolData.symbols;
  } catch (error) {
    logger.error('Failed to update symbol cache, using fallback or existing cache');
    
    // If we have no symbols at all, use fallback
    if (validSymbolsCache.symbols.length === 0) {
      validSymbolsCache.symbols = FALLBACK_SYMBOLS;
      logger.warn(`Using ${FALLBACK_SYMBOLS.length} fallback symbols`);
    }
    
    return validSymbolsCache.symbols;
  } finally {
    validSymbolsCache.isUpdating = false;
  }
}


/**
 * Get valid symbols (from cache or fetch if needed)
 * @returns {Promise<string[]>} Array of valid symbols
 */
async function getValidSymbols() {
  if (validSymbolsCache.symbols.length === 0) {
    // Initial load
    return await updateValidSymbols(true);
  }
  
  // Check if cache needs refresh (non-blocking)
  const now = Date.now();
  if ((now - validSymbolsCache.lastUpdated) > validSymbolsCache.updateInterval) {
    // Update in background, don't wait
    updateValidSymbols().catch(err => 
      logger.error('Background symbol update failed:', err)
    );
  }
  
  return validSymbolsCache.symbols;
}

/**
 * Check if a symbol is valid
 * @param {string} symbol - Symbol to check
 * @returns {Promise<boolean>} Whether the symbol is valid
 */
async function isValidSymbol(symbol) {
  const validSymbols = await getValidSymbols();
  return validSymbols.includes(symbol);
}

/**
 * Get symbol metadata
 * @param {string} symbol - Symbol to get metadata for
 * @returns {Object|null} Symbol metadata or null if not found
 */
function getSymbolMetadata(symbol) {
  return validSymbolsCache.symbolMetadata[symbol] || null;
}

/**
 * Get top symbols by volume
 * @param {number} count - Number of symbols to return
 * @returns {string[]} Top symbols by 24h volume
 */
function getTopSymbolsByVolume(count = 10) {
  return validSymbolsCache.symbolsByVolume.slice(0, count);
}

// ===============================================
// LUNARCRUSH SERVICE
// ===============================================

const CoinGeckoService = require('./services/lunarCrushService');
const MLCService = require('./services/mlcService');
const coinGeckoService = new CoinGeckoService();
const mlcService = new MLCService();

// Initialize signal generator (will be defined after the class)
let signalGenerator;

class EnhancedCoinGeckoService {
  constructor() {
    this.coinGecko = coinGeckoService;
  }

  async getOnChainAnalysis(symbol, walletAddress = null) {
    try {
      // Use the new reliable data source method
      return await this.getReliableOnChainData(symbol);
    } catch (error) {
      logger.error(`⚠️  CRITICAL: Failed to get reliable data for ${symbol}:`, error.message);
      
      // For live trading, we should reject trades without reliable data
      // But for now, return marked fallback data with warnings
      const fallbackData = this.getFallbackOnChainData(symbol);
      fallbackData.trading_recommendation = 'AVOID - INSUFFICIENT DATA';
      fallbackData.live_trading_safe = false;
      
      return fallbackData;
    }
  }

  getCoinIdMapping(symbol) {
    // Enhanced symbol to CoinGecko ID mapping for better data accuracy
    const symbolMap = {
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'BNBUSDT': 'binancecoin',
      'ADAUSDT': 'cardano',
      'SOLUSDT': 'solana',
      'XRPUSDT': 'ripple',
      'DOGEUSDT': 'dogecoin',
      'AVAXUSDT': 'avalanche-2',
      'DOTUSDT': 'polkadot',
      'MATICUSDT': 'matic-network',
      'LINKUSDT': 'chainlink',
      'UNIUSDT': 'uniswap',
      'ATOMUSDT': 'cosmos',
      'LTCUSDT': 'litecoin',
      'BCHUSDT': 'bitcoin-cash',
      'XLMUSDT': 'stellar',
      'ETCUSDT': 'ethereum-classic',
      'FILUSDT': 'filecoin',
      'TRXUSDT': 'tron',
      'NEARUSDT': 'near',
      'ALGOUSDT': 'algorand',
      'AAVEUSDT': 'aave',
      'SHIBUSDT': 'shiba-inu',
      'APTUSDT': 'aptos',
      'ARBUSDT': 'arbitrum',
      'OPUSDT': 'optimism',
      'SUIUSDT': 'sui',
      'PEPEUSDT': 'pepe',
      'FLOKIUSDT': 'floki',
      'FETUSDT': 'fetch-ai',
      'RENDERUSDT': 'render-token',
      'THETAUSDT': 'theta-token',
      'SANDUSDT': 'the-sandbox'
    };
    
    const baseSymbol = symbol.replace('USDT', '');
    return symbolMap[symbol] || symbolMap[baseSymbol] || null;
  }

  async getReliableOnChainData(symbol) {
    // First try CoinGecko with proper mapping
    const coinId = this.getCoinIdMapping(symbol);
    
    if (coinId) {
      try {
        const analysis = await this.coinGecko.getComprehensiveAnalysis(symbol, null, coinId);
        logger.info(`Successfully retrieved CoinGecko data for ${symbol} using coinId: ${coinId}`);
        
        return {
          whale_activity: {
            large_transfers_24h: Math.floor(analysis.whale_activity.whale_activity_score * 100),
            whale_accumulation: analysis.whale_activity.large_transactions ? 'buying' : 'neutral',
            top_holder_changes: analysis.coin_data.dominance || 15
          },
          network_metrics: {
            active_addresses: Math.floor((analysis.coin_data.volume_24h / 1000000) * 100),
            transaction_volume_24h: analysis.coin_data.volume_24h,
            gas_usage_trend: analysis.market_sentiment > 0.5 ? 'increasing' : 'stable'
          },
          defi_metrics: {
            total_locked_value: analysis.coin_data.market_cap * 0.1,
            yield_farming_apy: analysis.market_metrics.sharpe_ratio * 10,
            protocol_inflows: analysis.market_sentiment * 1000000
          },
          sentiment_indicators: {
            on_chain_sentiment: analysis.sentiment_score > 0.3 ? 'bullish' : analysis.sentiment_score < -0.3 ? 'bearish' : 'neutral',
            smart_money_flow: 'neutral',
            derivative_metrics: {
              funding_rates: analysis.market_sentiment * 0.1,
              open_interest_change: analysis.market_sentiment * 20
            }
          },
          cross_chain_analysis: {
            arbitrage_opportunities: false,
            bridge_volumes: analysis.coin_data.volume_24h * 0.05,
            chain_dominance: 'ethereum'
          },
          risk_assessment: {
            liquidity_score: analysis.confidence_score * 100,
            volatility_prediction: analysis.market_metrics.volatility,
            market_manipulation_risk: analysis.risk_indicators.overall_risk > 0.7 ? 'high' : analysis.risk_indicators.overall_risk > 0.4 ? 'medium' : 'low'
          },
          timestamp: Date.now(),
          source: 'coingecko_reliable',
          confidence: analysis.confidence_score,
          market_metrics: analysis.market_metrics,
          data_quality: 'high'
        };
      } catch (error) {
        logger.warn(`CoinGecko failed for ${symbol} (${coinId}):`, error.message);
      }
    }
    
    // If CoinGecko fails, try Binance API for basic metrics
    try {
      const ticker = await binanceClient.dailyStats({ symbol });
      const klines = await binanceClient.candles({ symbol, interval: '1d', limit: 30 });
      
      logger.info(`Using Binance API data for ${symbol} as CoinGecko alternative`);
      
      return {
        whale_activity: {
          large_transfers_24h: parseFloat(ticker.count) > 100000 ? 50 : 20,
          whale_accumulation: parseFloat(ticker.priceChangePercent) > 5 ? 'buying' : 'neutral',
          top_holder_changes: Math.abs(parseFloat(ticker.priceChangePercent))
        },
        network_metrics: {
          active_addresses: Math.floor(parseFloat(ticker.count) / 100),
          transaction_volume_24h: parseFloat(ticker.quoteVolume),
          gas_usage_trend: parseFloat(ticker.volume) > parseFloat(ticker.weightedAvgPrice) ? 'increasing' : 'stable'
        },
        defi_metrics: {
          total_locked_value: parseFloat(ticker.quoteVolume) * 10,
          yield_farming_apy: Math.abs(parseFloat(ticker.priceChangePercent)) * 2,
          protocol_inflows: parseFloat(ticker.priceChangePercent) > 0 ? parseFloat(ticker.quoteVolume) * 0.1 : 0
        },
        sentiment_indicators: {
          on_chain_sentiment: parseFloat(ticker.priceChangePercent) > 2 ? 'bullish' : parseFloat(ticker.priceChangePercent) < -2 ? 'bearish' : 'neutral',
          smart_money_flow: 'neutral',
          derivative_metrics: {
            funding_rates: parseFloat(ticker.priceChangePercent) * 0.001,
            open_interest_change: parseFloat(ticker.priceChangePercent) * 10
          }
        },
        cross_chain_analysis: {
          arbitrage_opportunities: false,
          bridge_volumes: parseFloat(ticker.quoteVolume) * 0.02,
          chain_dominance: 'binance_smart_chain'
        },
        risk_assessment: {
          liquidity_score: Math.min(100, parseFloat(ticker.quoteVolume) / 1000000),
          volatility_prediction: Math.abs(parseFloat(ticker.priceChangePercent)) * 5,
          market_manipulation_risk: parseFloat(ticker.count) < 1000 ? 'high' : parseFloat(ticker.count) < 10000 ? 'medium' : 'low'
        },
        timestamp: Date.now(),
        source: 'binance_api',
        confidence: 0.7,
        market_metrics: {
          volatility: Math.abs(parseFloat(ticker.priceChangePercent)) / 100,
          volume_ratio: parseFloat(ticker.volume) / parseFloat(ticker.weightedAvgPrice),
          price_momentum: parseFloat(ticker.priceChangePercent)
        },
        data_quality: 'medium'
      };
    } catch (error) {
      logger.error(`All data sources failed for ${symbol}:`, error.message);
      throw new Error(`No reliable data available for ${symbol} - TRADING NOT RECOMMENDED`);
    }
  }

  getFallbackOnChainData(symbol) {
    // DEPRECATED - Should not be used for live trading
    logger.error(`⚠️  CRITICAL: Using fallback data for ${symbol} - NOT SAFE FOR LIVE TRADING!`);
    
    return {
      whale_activity: {
        large_transfers_24h: 0,
        whale_accumulation: 'unknown',
        top_holder_changes: 0
      },
      network_metrics: {
        active_addresses: 0,
        transaction_volume_24h: 0,
        gas_usage_trend: 'unknown'
      },
      defi_metrics: {
        total_locked_value: 0,
        yield_farming_apy: 0,
        protocol_inflows: 0
      },
      sentiment_indicators: {
        on_chain_sentiment: 'unknown',
        smart_money_flow: 'unknown',
        derivative_metrics: {
          funding_rates: 0,
          open_interest_change: 0
        }
      },
      cross_chain_analysis: {
        arbitrage_opportunities: false,
        bridge_volumes: 0,
        chain_dominance: 'unknown'
      },
      risk_assessment: {
        liquidity_score: 0,
        volatility_prediction: 0,
        market_manipulation_risk: 'unknown'
      },
      timestamp: Date.now(),
      source: 'UNRELIABLE_FALLBACK',
      confidence: 0,
      data_quality: 'UNSAFE_FOR_TRADING',
      warning: '⚠️  FALLBACK DATA - DO NOT USE FOR LIVE TRADING'
    };
  }
}

// ===============================================
// TECHNICAL ANALYSIS (Enhanced)
// ===============================================

class TechnicalAnalysis {
  static calculateSMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  static calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  static calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;
    
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static calculateMACD(prices) {
    if (!prices || prices.length < 26) return null;
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    
    // Calculate signal line (9-period EMA of MACD)
    const macdValues = [];
    for (let i = 26; i <= prices.length; i++) {
      const slice = prices.slice(0, i);
      const ema12 = this.calculateEMA(slice, 12);
      const ema26 = this.calculateEMA(slice, 26);
      macdValues.push(ema12 - ema26);
    }
    
    const signal = this.calculateEMA(macdValues, 9);
    const histogram = macd - signal;
    
    return { macd, signal, histogram };
  }

  static calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (!prices || prices.length < period) return null;
    
    const sma = this.calculateSMA(prices, period);
    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  static calculateStochastic(prices, period = 14) {
    if (!prices || prices.length < period) return null;
    
    const slice = prices.slice(-period);
    const highest = Math.max(...slice);
    const lowest = Math.min(...slice);
    const current = prices[prices.length - 1];
    
    const k = ((current - lowest) / (highest - lowest)) * 100;
    return { k, d: k }; // Simplified - normally D is 3-period SMA of K
  }

  static calculateATR(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;
    
    let trSum = 0;
    for (let i = 1; i <= period; i++) {
      const high = prices[i] * 1.005; // Simulated high
      const low = prices[i] * 0.995;  // Simulated low
      const prevClose = prices[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }
    
    return trSum / period;
  }

  static calculateVolatility(prices, period = 20) {
    if (!prices || prices.length < period + 1) return null;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 252); // Annualized volatility
  }

  // NEW: Advanced Market Regime Detection
  static detectMarketRegime(prices, volumes, technicalData) {
    const current = prices[prices.length - 1];
    const sma20 = technicalData.sma_20;
    const sma50 = technicalData.sma_50;
    const sma200 = this.calculateSMA(prices, 200);
    const rsi = technicalData.rsi;
    const macd = technicalData.macd;
    const volatility = technicalData.volatility;
    const volumeRatio = technicalData.volume_ratio;

    // Trend Direction Analysis
    const trendDirection = this.analyzeTrendDirection(prices, sma20, sma50, sma200);
    
    // Market Phase Analysis
    const marketPhase = this.analyzeMarketPhase(prices, volumes, technicalData);
    
    // Volatility Regime
    const volatilityRegime = this.analyzeVolatilityRegime(volatility, prices);
    
    // Volume Analysis
    const volumeAnalysis = this.analyzeVolumePattern(volumes, prices);
    
    // Momentum Analysis
    const momentumAnalysis = this.analyzeMomentum(rsi, macd, prices);

    return {
      primary_trend: trendDirection.primary,
      secondary_trend: trendDirection.secondary,
      market_phase: marketPhase,
      volatility_regime: volatilityRegime,
      volume_pattern: volumeAnalysis,
      momentum_state: momentumAnalysis,
      regime_confidence: this.calculateRegimeConfidence(trendDirection, marketPhase, volatilityRegime),
      regime_strength: this.calculateRegimeStrength(prices, volumes, technicalData)
    };
  }

  static analyzeTrendDirection(prices, sma20, sma50, sma200) {
    const current = prices[prices.length - 1];
    const prev20 = prices[prices.length - 21] || current;
    const prev50 = prices[prices.length - 51] || current;
    
    // Primary trend (long-term)
    let primaryTrend = 'NEUTRAL';
    if (sma200 && current > sma200 && sma20 > sma50 && sma50 > sma200) {
      primaryTrend = 'BULLISH';
    } else if (sma200 && current < sma200 && sma20 < sma50 && sma50 < sma200) {
      primaryTrend = 'BEARISH';
    }
    
    // Secondary trend (short-term)
    let secondaryTrend = 'NEUTRAL';
    if (current > sma20 && sma20 > prev20) {
      secondaryTrend = 'BULLISH';
    } else if (current < sma20 && sma20 < prev20) {
      secondaryTrend = 'BEARISH';
    }
    
    return {
      primary: primaryTrend,
      secondary: secondaryTrend,
      alignment: primaryTrend === secondaryTrend ? 'ALIGNED' : 'DIVERGENT'
    };
  }

  static analyzeMarketPhase(prices, volumes, technicalData) {
    const current = prices[prices.length - 1];
    const priceRange = Math.max(...prices.slice(-50)) - Math.min(...prices.slice(-50));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const volatility = technicalData.volatility;
    const rsi = technicalData.rsi;
    
    // Accumulation Phase: Low volatility, increasing volume, price consolidation
    if (volatility < 0.3 && recentVolume > avgVolume * 1.1 && rsi > 30 && rsi < 70) {
      const priceStability = this.calculatePriceStability(prices.slice(-20));
      if (priceStability > 0.8) {
        return 'ACCUMULATION';
      }
    }
    
    // Distribution Phase: High volatility, decreasing volume, price topping
    if (volatility > 0.5 && recentVolume < avgVolume * 0.9 && rsi > 60) {
      const isTopping = this.detectToppingPattern(prices.slice(-20));
      if (isTopping) {
        return 'DISTRIBUTION';
      }
    }
    
    // Markup Phase: Rising prices, increasing volume, strong momentum
    if (current > prices[prices.length - 21] && recentVolume > avgVolume && rsi > 50) {
      const momentum = this.calculateMomentum(prices.slice(-10));
      if (momentum > 0.02) {
        return 'MARKUP';
      }
    }
    
    // Markdown Phase: Falling prices, high volume, weak momentum
    if (current < prices[prices.length - 21] && recentVolume > avgVolume && rsi < 50) {
      const momentum = this.calculateMomentum(prices.slice(-10));
      if (momentum < -0.02) {
        return 'MARKDOWN';
      }
    }
    
    // Consolidation Phase: Sideways price action, low volatility
    if (volatility < 0.4) {
      const priceStability = this.calculatePriceStability(prices.slice(-30));
      if (priceStability > 0.7) {
        return 'CONSOLIDATION';
      }
    }
    
    return 'TRANSITION';
  }

  static analyzeVolatilityRegime(volatility, prices) {
    const historicalVol = this.calculateHistoricalVolatility(prices, 60);
    const currentVol = volatility;
    
    if (currentVol > historicalVol * 1.5) {
      return 'HIGH_VOLATILITY';
    } else if (currentVol < historicalVol * 0.7) {
      return 'LOW_VOLATILITY';
    } else {
      return 'NORMAL_VOLATILITY';
    }
  }

  static analyzeVolumePattern(volumes, prices) {
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volumeTrend = this.calculateVolumeTrend(volumes.slice(-10));
    
    if (recentVolume > avgVolume * 1.3 && volumeTrend > 0.05) {
      return 'INCREASING_VOLUME';
    } else if (recentVolume < avgVolume * 0.7 && volumeTrend < -0.05) {
      return 'DECREASING_VOLUME';
    } else {
      return 'STABLE_VOLUME';
    }
  }

  static analyzeMomentum(rsi, macd, prices) {
    const priceChange = (prices[prices.length - 1] / prices[prices.length - 11] - 1) * 100;
    const macdMomentum = macd ? macd.histogram : 0;
    
    if (rsi > 60 && macdMomentum > 0 && priceChange > 3) {
      return 'STRONG_BULLISH';
    } else if (rsi < 40 && macdMomentum < 0 && priceChange < -3) {
      return 'STRONG_BEARISH';
    } else if (rsi > 50 && macdMomentum > 0) {
      return 'BULLISH';
    } else if (rsi < 50 && macdMomentum < 0) {
      return 'BEARISH';
    } else {
      return 'NEUTRAL';
    }
  }

  // Helper methods for market phase analysis
  static calculatePriceStability(prices) {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;
    
    return Math.max(0, 1 - coefficientOfVariation * 10); // Normalize to 0-1
  }

  static detectToppingPattern(prices) {
    const recent = prices.slice(-5);
    const earlier = prices.slice(-10, -5);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    
    return recentAvg < earlierAvg * 0.98; // 2% decline suggests topping
  }

  static calculateMomentum(prices) {
    if (prices.length < 2) return 0;
    return (prices[prices.length - 1] / prices[0] - 1);
  }

  static calculateHistoricalVolatility(prices, period) {
    if (prices.length < period) return 0.3; // Default
    
    const returns = [];
    for (let i = 1; i < Math.min(prices.length, period + 1); i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 252); // Annualized
  }

  static calculateVolumeTrend(volumes) {
    if (volumes.length < 2) return 0;
    
    const early = volumes.slice(0, Math.floor(volumes.length / 2));
    const late = volumes.slice(Math.floor(volumes.length / 2));
    
    const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
    const lateAvg = late.reduce((a, b) => a + b, 0) / late.length;
    
    return (lateAvg / earlyAvg - 1);
  }

  static calculateRegimeConfidence(trendDirection, marketPhase, volatilityRegime) {
    let confidence = 0.5;
    
    // Higher confidence when trends are aligned
    if (trendDirection.alignment === 'ALIGNED') {
      confidence += 0.2;
    }
    
    // Adjust based on market phase clarity
    if (['ACCUMULATION', 'DISTRIBUTION', 'MARKUP', 'MARKDOWN'].includes(marketPhase)) {
      confidence += 0.15;
    }
    
    // Adjust based on volatility regime
    if (volatilityRegime === 'NORMAL_VOLATILITY') {
      confidence += 0.1;
    } else if (volatilityRegime === 'HIGH_VOLATILITY') {
      confidence -= 0.1;
    }
    
    return Math.max(0.2, Math.min(0.9, confidence));
  }

  static calculateRegimeStrength(prices, volumes, technicalData) {
    const priceChange = (prices[prices.length - 1] / prices[prices.length - 21] - 1) * 100;
    const volumeStrength = technicalData.volume_ratio || 1;
    const rsi = technicalData.rsi || 50;
    
    let strength = Math.abs(priceChange) * 0.1; // Base strength from price movement
    strength += Math.abs(volumeStrength - 1) * 0.3; // Volume confirmation
    strength += Math.abs(rsi - 50) * 0.01; // RSI deviation
    
    return Math.max(0.1, Math.min(1.0, strength));
  }

  static calculateAdvancedMetrics(prices, volumes) {
    const sma_20 = this.calculateSMA(prices, 20);
    const sma_50 = this.calculateSMA(prices, 50);
    const ema_12 = this.calculateEMA(prices, 12);
    const ema_26 = this.calculateEMA(prices, 26);
    const rsi = this.calculateRSI(prices);
    const macd = this.calculateMACD(prices);
    const bollinger_bands = this.calculateBollingerBands(prices);
    const stochastic = this.calculateStochastic(prices);
    const atr = this.calculateATR(prices);
    const volatility = this.calculateVolatility(prices);
    
    // Enhanced volume analysis
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volume_ratio = recentVolume / avgVolume;
    
    // Rate of change and momentum
    const rate_of_change = prices.length > 10 ? 
      ((prices[prices.length - 1] / prices[prices.length - 11]) - 1) * 100 : 0;
    const momentum = prices.length > 10 ? 
      prices[prices.length - 1] - prices[prices.length - 11] : 0;

    const baseMetrics = {
      sma_20, sma_50, ema_12, ema_26, rsi, macd, bollinger_bands,
      stochastic, atr, volatility, volume_ratio, rate_of_change, momentum
    };

    // NEW: Advanced market regime detection
    const marketRegime = this.detectMarketRegime(prices, volumes, baseMetrics);
    
    return {
      ...baseMetrics,
      market_regime: marketRegime
    };
  }

  // Keep existing determineMarketRegime for backward compatibility
  static determineMarketRegime(prices, volumes) {
    const volatility = this.calculateVolatility(prices) || 0.02;
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const current = prices[prices.length - 1];
    
    if (volatility > 0.05) return 'high_volatility';
    if (sma20 && sma50) {
      if (current > sma20 && sma20 > sma50) return 'uptrend';
      if (current < sma20 && sma20 < sma50) return 'downtrend';
    }
    return 'sideways';
  }
}

// ===============================================
// MARKET DATA SERVICE (Enhanced)
// ===============================================

// ===============================================
// MARKET DATA SERVICE (Enhanced) - FIXED VERSION
// ===============================================

class MarketDataService {
  static generateEnhancedData(symbol, timeframe = '1h', bars = 100) {
    // Expanded base prices for more symbols
    const basePrices = {
      // Major pairs
      'BTCUSDT': 43500,
      'ETHUSDT': 2650,
      'BNBUSDT': 315,
      'ADAUSDT': 0.52,
      'SOLUSDT': 98,
      'DOTUSDT': 7.8,
      'LINKUSDT': 15.2,
      'LTCUSDT': 72,
      'XRPUSDT': 0.63,
      'MATICUSDT': 0.89,
      
      // Additional pairs from your logs
      'PENGUUSDT': 0.015,
      'PROMUSDT': 6.39,
      'HBARUSDT': 0.28,
      'LPTUSDT': 18.5,
      'ONDOUSDT': 1.25,
      'WBTCUSDT': 43500,
      'AAVEUSDT': 340,
      
      // Common altcoins
      'HFTUSDT': 0.45,
      'MAVUSDT': 0.32,
      'JTOUSDT': 3.2,
      'SUPERUSDT': 1.8,
      'SYRUPUSDT': 0.95,
      'SEIUSDT': 0.48,
      'ENAUSDT': 1.15,
      'NEIROUSDT': 0.002,
      'JUPUSDT': 1.05,
      'GPSUSDT': 0.18,
      'INITUSDT': 0.22,
      'ORDIUSDT': 42,
      '1000SATSUSDT': 0.0003,
      'TRBUSDT': 68,
      'ZKUSDT': 0.185,
      'KAITOUSDT': 0.0015,
      'ARBUSDT': 0.82,
      
      // Missing symbols from your errors
      'SAHARAUSDT': 0.0025,
      'RSRUSDT': 0.85,
      'ARKUSDT': 0.72,
      'AWEUSDT': 0.35,
      'VIRTUALUSDT': 2.8,
      'TONUSDT': 5.2,
      'PIXELUSDT': 0.25,  // Added this missing symbol
      'UNIUSDT': 8.5,     // Added this missing symbol
      'APTUSDT': 12,      // Added this missing symbol
      'HYPERUSDT': 3.25,  // Added this missing symbol
      
      // DeFi tokens
      'AVAXUSDT': 36,
      'ATOMUSDT': 7.2,
      'ALGOUSDT': 0.28,
      'FTMUSDT': 0.72,
      'SANDUSDT': 0.68,
      'MANAUSDT': 0.58,
      'AXSUSDT': 8.5,
      'GALAUSDT': 0.045,
      'CRVUSDT': 0.85,
      'LDOUSDT': 2.1,
      'IMXUSDT': 1.6,
      'GRTUSDT': 0.28,
      'COMPUSDT': 78,
      'YFIUSDT': 8500,
      'SUSHIUSDT': 1.2,
      'ZRXUSDT': 0.52,
      'JASMYUSDT': 0.035,
      'FTTUSDT': 2.8,
      'GMTUSDT': 0.18,
      'APEUSDT': 1.45,
      'ROSEUSDT': 0.085,
      'MAGICUSDT': 0.68,
      'HIGHUSDT': 2.3,
      'RDNTUSDT': 0.095,
      'INJUSDT': 24,
      'OPUSDT': 2.1,
      'CHZUSDT': 0.095,
      'ENSUSDT': 32,
      'API3USDT': 2.8,
      'MASKUSDT': 3.2,
      'MEWUSDT': 0.012,
      'ACHUSDT': 0.032,
      'MOVEUSDT': 0.88,
      'NOTUSDT': 0.0085,
      'WIFUSDT': 3.2,
      'BOMEUSDT': 0.014,
      'FLOKIUSDT': 0.00025,
      'PEOPLEUSDT': 0.065,
      'TURBOUSDT': 0.008,
      'NEOUSDT': 18,
      'EGLDUSDT': 28,
      'ZECUSDT': 45,
      'LAYERUSDT': 0.18,
      'NEARUSDT': 5.8,
      'ETCUSDT': 28,
      'ICPUSDT': 12.5,
      'VETUSDT': 0.045,
      'POLUSDT': 0.68,
      'RENDERUSDT': 7.2,
      'FILUSDT': 5.8,
      'FETUSDT': 1.6,
      'THETAUSDT': 2.1,
      'BONKUSDT': 0.000035,
      'XTZUSDT': 1.2,
      'IOTAUSDT': 0.28
    };

    const basePrice = basePrices[symbol] || 1.0; // Default fallback
    // FIXED: Pass basePrices as parameter to getVolatilityForSymbol
    const volatility = this.getVolatilityForSymbol(symbol, basePrices);
    
    // Generate realistic price and volume history
    const prices = [];
    const volumes = [];
    let currentPrice = basePrice * (0.95 + Math.random() * 0.1);
    let trend = (Math.random() - 0.5) * 0.001;
    
    for (let i = 0; i < bars; i++) {
      // Price generation with more realistic movement
      if (Math.random() < 0.1) {
        trend = (Math.random() - 0.5) * 0.001;
      }
      
      const randomChange = (Math.random() - 0.5) * volatility * currentPrice;
      const trendChange = trend * currentPrice;
      currentPrice += randomChange + trendChange;
      
      if (currentPrice < 0.000001) currentPrice = 0.000001; // Prevent negative prices
      prices.push(currentPrice);
      
      // Volume generation (correlated with price movements)
      const baseVolume = this.getBaseVolumeForSymbol(symbol);
      const volatilityMultiplier = 1 + Math.abs(randomChange / currentPrice) * 5;
      const volume = baseVolume * volatilityMultiplier * (0.5 + Math.random());
      volumes.push(volume);
    }

    const priceChange24h = ((prices[prices.length - 1] - prices[prices.length - 24]) / prices[prices.length - 24]) * 100;

    return {
      symbol,
      current_price: prices[prices.length - 1],
      prices: prices,  // Fixed: changed from price_history to prices
      volumes: volumes,  // Fixed: changed from volume_history to volumes
      price_history: prices,  // Keep for backward compatibility
      volume_history: volumes,  // Keep for backward compatibility
      volume_24h: volumes.slice(-24).reduce((a, b) => a + b, 0),
      price_change_24h: priceChange24h,
      market_cap: currentPrice * this.getCirculatingSupply(symbol),
      timestamp: Date.now(),
      timeframe,
      bars_count: bars
    };
  }

  // FIXED: Added basePrices parameter to resolve the scope issue
  static getVolatilityForSymbol(symbol, basePrices = null) {
    // Expanded volatility mapping
    const volatilities = {
      // Major pairs - lower volatility
      'BTCUSDT': 0.02,
      'ETHUSDT': 0.025,
      'BNBUSDT': 0.03,
      
      // Mid-cap altcoins
      'ADAUSDT': 0.04,
      'SOLUSDT': 0.035,
      'DOTUSDT': 0.035,
      'LINKUSDT': 0.04,
      'LTCUSDT': 0.03,
      'XRPUSDT': 0.045,
      'MATICUSDT': 0.05,
      
      // Small-cap and newer tokens - higher volatility
      'PENGUUSDT': 0.08,
      'PROMUSDT': 0.06,
      'HBARUSDT': 0.05,
      'LPTUSDT': 0.055,
      'ONDOUSDT': 0.065,
      'WBTCUSDT': 0.02,
      'AAVEUSDT': 0.05,
      'PIXELUSDT': 0.08,  // Added missing symbols
      'UNIUSDT': 0.045,
      'APTUSDT': 0.055,
      'HYPERUSDT': 0.085,  // Added missing symbol
      
      // Very small caps - highest volatility
      'NEIROUSDT': 0.12,
      '1000SATSUSDT': 0.15,
      'BONKUSDT': 0.18,
      'FLOKIUSDT': 0.15,
      'PEOPLEUSDT': 0.10,
      'SAHARAUSDT': 0.20,
      'RSRUSDT': 0.08,
      'ARKUSDT': 0.07,
      'AWEUSDT': 0.12,
      'VIRTUALUSDT': 0.09
    };
    
    // Default volatility based on symbol characteristics
    if (symbol.includes('1000') || symbol.includes('PEPE') || symbol.includes('SHIB')) {
      return 0.15; // Meme coins
    } else if (basePrices && basePrices[symbol] && basePrices[symbol] < 0.01) {
      return 0.12; // Very low price coins
    } else if (basePrices && basePrices[symbol] && basePrices[symbol] < 1) {
      return 0.08; // Low price coins
    }
    
    return volatilities[symbol] || 0.06; // Default medium volatility
  }

  static getBaseVolumeForSymbol(symbol) {
    // Expanded volume mapping based on market cap tiers
    const baseVolumes = {
      // Tier 1 - Highest volume
      'BTCUSDT': 80000000,
      'ETHUSDT': 60000000,
      'BNBUSDT': 20000000,
      
      // Tier 2 - High volume
      'ADAUSDT': 12000000,
      'SOLUSDT': 16000000,
      'XRPUSDT': 30000000,
      'DOTUSDT': 8000000,
      'LINKUSDT': 6000000,
      'LTCUSDT': 12000000,
      'MATICUSDT': 8000000,
      
      // Tier 3 - Medium volume
      'AAVEUSDT': 4000000,
      'AVAXUSDT': 6000000,
      'ATOMUSDT': 3000000,
      'INJUSDT': 5000000,
      'NEARUSDT': 4000000,
      'APTUSDT': 3500000,
      'PIXELUSDT': 2500000,  // Added missing symbols
      'UNIUSDT': 8000000,
      'HYPERUSDT': 1800000,  // Added missing symbol
      
      // Tier 4 - Lower volume
      'PENGUUSDT': 800000,
      'PROMUSDT': 600000,
      'HBARUSDT': 1500000,
      'LPTUSDT': 1200000,
      'ONDOUSDT': 800000,
      
      // Tier 5 - Lowest volume
      'NEIROUSDT': 200000,
      '1000SATSUSDT': 300000,
      'BONKUSDT': 400000,
      'FLOKIUSDT': 350000,
      'SAHARAUSDT': 150000,
      'RSRUSDT': 250000,
      'ARKUSDT': 300000,
      'AWEUSDT': 180000,
      'VIRTUALUSDT': 500000
    };
    
    return baseVolumes[symbol] || 1000000; // Default 1M volume
  }

  static getCirculatingSupply(symbol) {
    // Expanded supply data
    const supplies = {
      'BTCUSDT': 19.7e6,
      'ETHUSDT': 120e6,
      'BNBUSDT': 166e6,
      'ADAUSDT': 35e9,
      'SOLUSDT': 400e6,
      'DOTUSDT': 1.2e9,
      'LINKUSDT': 500e6,
      'LTCUSDT': 73e6,
      'XRPUSDT': 53e9,
      'MATICUSDT': 9e9,
      
      // New additions
      'PENGUUSDT': 88e12,
      'PROMUSDT': 2e6,
      'HBARUSDT': 50e9,
      'LPTUSDT': 27e6,
      'ONDOUSDT': 1e9,
      'WBTCUSDT': 160e3,
      'AAVEUSDT': 16e6,
      'PIXELUSDT': 5e9,    // Added missing symbols
      'UNIUSDT': 1e9,
      'APTUSDT': 1e9,
      'HYPERUSDT': 350e6,  // Added missing symbol
      
      // Default estimates for missing symbols
      'NEIROUSDT': 420e12,
      '1000SATSUSDT': 21e15,
      'BONKUSDT': 90e12,
      'FLOKIUSDT': 9e12,
      'SAHARAUSDT': 1e12,
      'RSRUSDT': 1e9,
      'ARKUSDT': 100e6,
      'AWEUSDT': 1e9,
      'VIRTUALUSDT': 1e9
    };
    
    return supplies[symbol] || 1e9; // Default 1B supply
  }
}
// ===============================================
// ENHANCED AI SIGNAL GENERATOR
// ===============================================

class EnhancedAISignalGenerator {
  constructor() {
    this.coinGeckoService = new EnhancedCoinGeckoService();
    this.mlcService = mlcService;
    this.offChainService = require('./services/offChainDataService');
  }

  async generateAdvancedSignal(marketData, technicalData, onChainData, requestParams) {
    try {
      // Get comprehensive off-chain data
      const offChainData = await this.offChainService.getComprehensiveOffChainData(marketData.symbol);
      
      // Detect current market regime
      const marketRegime = technicalData.market_regime;
      
      // Generate signal using market-adaptive strategy
      const adaptiveSignal = await this.generateMarketAdaptiveSignal(
        marketData, 
        technicalData, 
        onChainData, 
        offChainData, 
        requestParams
      );
      
      // Use deterministic ML data for real analysis, randomized only for fallback
      const isRealData = onChainData.source === 'coingecko' && onChainData.source !== 'coingecko_fallback';
      const mlResults = isRealData ? 
        this.mlcService.getDeterministicMLData() : 
        this.mlcService.getFallbackMLData();
      
      // Log data source information
      const dataSource = onChainData.source || 'unknown';
      const mlSource = isRealData ? 'deterministic_ml' : 'fallback_ml';
      logger.info(`Signal generation data sources: onchain=${dataSource}, ml=${mlSource}, offchain=${offChainData.data_quality.quality_score}%`, {
        symbol: requestParams.symbol,
        market_regime: marketRegime,  // Fixed: Log full regime object
        primary_trend: marketRegime.primary_trend,
        onchain_score: isRealData ? 'real_data' : 'fallback_data',
        ml_confidence: mlResults.ml_confidence
      });
      
      // Enhance with comprehensive data analysis
      const enhancedSignal = this.enhanceWithComprehensiveData(
        adaptiveSignal, 
        onChainData, 
        offChainData, 
        marketRegime
      );
      
      // Enhance with ML insights
      const finalSignal = this.mlcService.enhanceSignalWithML(enhancedSignal, mlResults);
      
      // Add market regime context and reasoning
      finalSignal.market_context = {
        regime: marketRegime,
        off_chain_quality: offChainData.data_quality,
        strategy_type: this.determineStrategyType(marketRegime, offChainData),
        risk_environment: this.assessRiskEnvironment(marketRegime, offChainData, requestParams.risk_level)
      };
      
      return finalSignal;
      
    } catch (error) {
      logger.error('Enhanced signal generation failed:', error);
      logger.info('Using fallback signal generation due to error');
      return this.generateFallbackSignal(marketData, technicalData, requestParams);
    }
  }

  async generateMarketAdaptiveSignal(marketData, technicalData, onChainData, offChainData, requestParams) {
    const marketRegime = technicalData.market_regime;
    const riskLevel = requestParams.risk_level || 'moderate';
    
    // Choose strategy based on market phase
    switch (marketRegime.market_phase) {
      case 'ACCUMULATION':
        return this.generateAccumulationStrategy(marketData, technicalData, onChainData, offChainData, riskLevel);
      
      case 'DISTRIBUTION':
        return this.generateDistributionStrategy(marketData, technicalData, onChainData, offChainData, riskLevel);
      
      case 'MARKUP':
        return this.generateMarkupStrategy(marketData, technicalData, onChainData, offChainData, riskLevel);
      
      case 'MARKDOWN':
        return this.generateMarkdownStrategy(marketData, technicalData, onChainData, offChainData, riskLevel);
      
      case 'CONSOLIDATION':
        return this.generateConsolidationStrategy(marketData, technicalData, onChainData, offChainData, riskLevel);
      
      default:
        return this.generateNeutralStrategy(marketData, technicalData, onChainData, offChainData, riskLevel);
    }
  }

  generateAccumulationStrategy(marketData, technicalData, onChainData, offChainData, riskLevel) {
    const price = marketData.current_price;
    const rsi = technicalData.rsi;
    const volatility = technicalData.volatility;
    const volumeRatio = technicalData.volume_ratio;
    const fundingRate = offChainData.funding_rates.current_funding_rate;
    const sentiment = offChainData.sentiment_indicators.long_short_ratio;
    
    // Accumulation phase: Look for gradual buying opportunities
    let signal = 'HOLD';
    let confidence = 45;
    let reasoning = 'Accumulation phase detected - monitoring for entry opportunities';
    
    // Positive signals for accumulation
    if (rsi < 45 && volumeRatio > 1.1 && fundingRate < 0.0005) {
      signal = 'BUY';
      confidence = 65;
      reasoning = 'Accumulation phase with oversold conditions and increasing volume';
    }
    
    // Risk-off signals
    if (volatility > 0.6 || sentiment > 1.5) {
      signal = 'HOLD';
      confidence = 35;
      reasoning = 'High volatility or excessive bullish sentiment - waiting for better entry';
    }
    
    // Adjust for risk level
    if (riskLevel === 'conservative') {
      confidence = Math.max(25, confidence - 10);
    } else if (riskLevel === 'aggressive') {
      confidence = Math.min(80, confidence + 10);
    }
    
    return this.buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, 'ACCUMULATION', { market_phase: 'ACCUMULATION' });
  }

  generateDistributionStrategy(marketData, technicalData, onChainData, offChainData, riskLevel) {
    const price = marketData.current_price;
    const rsi = technicalData.rsi;
    const volatility = technicalData.volatility;
    const volumeRatio = technicalData.volume_ratio;
    const fundingRate = offChainData.funding_rates.current_funding_rate;
    const sentiment = offChainData.sentiment_indicators.long_short_ratio;
    const fearGreed = offChainData.market_sentiment.fear_greed_index;
    
    // Distribution phase: Look for exit opportunities and short setups
    let signal = 'HOLD';
    let confidence = 40;
    let reasoning = 'Distribution phase detected - monitoring for exit signals';
    
    // Bearish signals for distribution
    if (rsi > 65 && volumeRatio < 0.9 && fundingRate > 0.001) {
      signal = 'SELL';
      confidence = 70;
      reasoning = 'Distribution phase with overbought conditions and decreasing volume';
    }
    
    // Extreme greed signals
    if (fearGreed > 75 && sentiment > 1.3) {
      signal = 'SELL';
      confidence = 75;
      reasoning = 'Extreme greed levels during distribution - high probability reversal';
    }
    
    // Conservative approach in distribution
    if (riskLevel === 'conservative') {
      if (signal === 'SELL') {
        signal = 'HOLD';
        confidence = 50;
        reasoning = 'Conservative approach - holding cash during distribution phase';
      }
    }
    
    return this.buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, 'DISTRIBUTION', { market_phase: 'DISTRIBUTION' });
  }

  generateMarkupStrategy(marketData, technicalData, onChainData, offChainData, riskLevel) {
    const price = marketData.current_price;
    const rsi = technicalData.rsi;
    const macd = technicalData.macd;
    const volatility = technicalData.volatility;
    const volumeRatio = technicalData.volume_ratio;
    const momentum = technicalData.momentum_state;
    
    // Markup phase: Trend following with risk management
    let signal = 'BUY';
    let confidence = 60;
    let reasoning = 'Markup phase - trend following strategy';
    
    // Strong momentum signals
    if (momentum === 'STRONG_BULLISH' && volumeRatio > 1.2 && rsi < 75) {
      signal = 'BUY';
      confidence = 80;
      reasoning = 'Strong bullish momentum in markup phase with volume confirmation';
    }
    
    // Weakening momentum
    if (momentum === 'NEUTRAL' || rsi > 80) {
      signal = 'HOLD';
      confidence = 45;
      reasoning = 'Momentum weakening in markup phase - taking profits';
    }
    
    // Risk management in markup
    if (volatility > 0.8) {
      confidence = Math.max(30, confidence - 20);
      reasoning += ' - reduced confidence due to high volatility';
    }
    
    return this.buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, 'MARKUP', { market_phase: 'MARKUP' });
  }

  generateMarkdownStrategy(marketData, technicalData, onChainData, offChainData, riskLevel) {
    const price = marketData.current_price;
    const rsi = technicalData.rsi;
    const volatility = technicalData.volatility;
    const volumeRatio = technicalData.volume_ratio;
    const momentum = technicalData.momentum_state;
    const fearGreed = offChainData.market_sentiment.fear_greed_index;
    
    // Markdown phase: Defensive positioning and short opportunities
    let signal = 'HOLD';
    let confidence = 40;
    let reasoning = 'Markdown phase - defensive positioning';
    
    // Short opportunities
    if (momentum === 'STRONG_BEARISH' && volumeRatio > 1.1 && rsi > 25) {
      signal = 'SELL';
      confidence = 75;
      reasoning = 'Strong bearish momentum in markdown phase with volume confirmation';
    }
    
    // Oversold bounce potential
    if (rsi < 25 && fearGreed < 30) {
      signal = 'BUY';
      confidence = 55;
      reasoning = 'Oversold bounce opportunity in markdown phase';
    }
    
    // Risk-off approach
    if (riskLevel === 'conservative') {
      if (signal === 'SELL') {
        signal = 'HOLD';
        confidence = 35;
        reasoning = 'Conservative approach - holding cash during markdown phase';
      }
    }
    
    return this.buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, 'MARKDOWN', { market_phase: 'MARKDOWN' });
  }

  generateConsolidationStrategy(marketData, technicalData, onChainData, offChainData, riskLevel) {
    const price = marketData.current_price;
    const rsi = technicalData.rsi;
    const bollinger = technicalData.bollinger_bands;
    const volatility = technicalData.volatility;
    const orderBookImbalance = offChainData.order_book_analysis.order_book_imbalance;
    const liquidityDepth = offChainData.order_book_analysis.liquidity_depth;
    
    // Consolidation phase: Range trading and breakout preparation
    let signal = 'HOLD';
    let confidence = 35;
    let reasoning = 'Consolidation phase - range trading strategy';
    
    // Range trading signals
    if (bollinger && price < bollinger.lower && rsi < 40) {
      signal = 'BUY';
      confidence = 60;
      reasoning = 'Range trading - buying at support level';
    } else if (bollinger && price > bollinger.upper && rsi > 60) {
      signal = 'SELL';
      confidence = 60;
      reasoning = 'Range trading - selling at resistance level';
    }
    
    // Breakout preparation
    if (volatility < 0.2 && Math.abs(orderBookImbalance) < 0.1) {
      signal = 'HOLD';
      confidence = 30;
      reasoning = 'Low volatility consolidation - waiting for breakout direction';
    }
    
    // High liquidity advantage
    if (liquidityDepth.total_depth > 500000) {
      confidence += 10;
      reasoning += ' - high liquidity supports strategy';
    }
    
    return this.buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, 'CONSOLIDATION', { market_phase: 'CONSOLIDATION' });
  }

  generateNeutralStrategy(marketData, technicalData, onChainData, offChainData, riskLevel) {
    const price = marketData.current_price;
    const rsi = technicalData.rsi;
    const volatility = technicalData.volatility;
    const sentiment = offChainData.sentiment_indicators.long_short_ratio;
    const fearGreed = offChainData.market_sentiment.fear_greed_index;
    
    // Neutral/Transition phase: Cautious approach with multiple confirmations
    let signal = 'HOLD';
    let confidence = 30;
    let reasoning = 'Market in transition - awaiting clear direction';
    
    // Multiple confirmation signals
    let bullishSignals = 0;
    let bearishSignals = 0;
    
    if (rsi < 35) bullishSignals++;
    if (rsi > 65) bearishSignals++;
    if (sentiment < 0.8) bullishSignals++;
    if (sentiment > 1.2) bearishSignals++;
    if (fearGreed < 35) bullishSignals++;
    if (fearGreed > 65) bearishSignals++;
    
    // Require multiple confirmations in neutral phase
    if (bullishSignals >= 2 && bearishSignals === 0) {
      signal = 'BUY';
      confidence = 55;
      reasoning = 'Multiple bullish confirmations in neutral market';
    } else if (bearishSignals >= 2 && bullishSignals === 0) {
      signal = 'SELL';
      confidence = 55;
      reasoning = 'Multiple bearish confirmations in neutral market';
    }
    
    // Volatility adjustment
    if (volatility > 0.5) {
      confidence = Math.max(20, confidence - 15);
      reasoning += ' - reduced confidence due to high volatility';
    }
    
    return this.buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, 'NEUTRAL', { market_phase: 'NEUTRAL' });
  }

  // New method for signal filtering and quality assessment
  assessSignalQuality(signal, confidence, volatility, marketRegime) {
    const qualityMetrics = {
      confidence_grade: this.getConfidenceGrade(confidence),
      volatility_suitability: this.getVolatilitySuitability(volatility),
      regime_alignment: this.getRegimeAlignment(signal, marketRegime),
      overall_quality: 'PENDING',
      tradeable: false,
      quality_score: 0,
      recommendations: []
    };

    // Calculate overall quality score
    let qualityScore = 0;
    
    // Confidence scoring (40% weight)
    if (confidence >= 40) qualityScore += 40;
    else if (confidence >= 35) qualityScore += 30;
    else if (confidence >= 30) qualityScore += 20;
    else if (confidence >= 25) qualityScore += 10;
    
    // Volatility scoring (30% weight)
    if (volatility > 0.02 && volatility < 0.06) qualityScore += 30;
    else if (volatility >= 0.015 && volatility <= 0.07) qualityScore += 20;
    else qualityScore += 10;
    
    // Market regime scoring (30% weight)
    if (marketRegime) {
      if ((signal.signal === 'BUY' && marketRegime.market_phase === 'MARKUP') ||
          (signal.signal === 'BUY' && marketRegime.market_phase === 'ACCUMULATION')) {
        qualityScore += 30;
      } else if ((signal.signal === 'SELL' && marketRegime.market_phase === 'DISTRIBUTION') ||
                 (signal.signal === 'SELL' && marketRegime.market_phase === 'MARKDOWN')) {
        qualityScore += 30;
      } else if (marketRegime.market_phase === 'CONSOLIDATION') {
        qualityScore += 15;
      } else {
        qualityScore += 5;
      }
    } else {
      qualityScore += 15; // Neutral if no regime data
    }

    qualityMetrics.quality_score = qualityScore;
    qualityMetrics.tradeable = qualityScore >= 50; // Minimum 50% quality score to be tradeable
    
    // Determine overall quality
    if (qualityScore >= 80) qualityMetrics.overall_quality = 'EXCELLENT';
    else if (qualityScore >= 70) qualityMetrics.overall_quality = 'GOOD';
    else if (qualityScore >= 50) qualityMetrics.overall_quality = 'FAIR';
    else qualityMetrics.overall_quality = 'POOR';

    // Generate recommendations
    if (confidence < 30) {
      qualityMetrics.recommendations.push('Consider waiting for higher confidence signals');
    }
    if (volatility > 0.06) {
      qualityMetrics.recommendations.push('High volatility - use smaller position sizes');
    }
    if (!qualityMetrics.tradeable) {
      qualityMetrics.recommendations.push('Signal quality below minimum threshold - avoid trading');
    }
    if (qualityScore >= 70) {
      qualityMetrics.recommendations.push('High quality signal suitable for active trading');
    }

    return qualityMetrics;
  }

  getConfidenceGrade(confidence) {
    if (confidence >= 45) return 'A';
    if (confidence >= 40) return 'B+';
    if (confidence >= 35) return 'B';
    if (confidence >= 30) return 'B-';
    if (confidence >= 25) return 'C';
    return 'D';
  }

  getVolatilitySuitability(volatility) {
    if (volatility < 0.015) return 'LOW_OPPORTUNITY';
    if (volatility <= 0.05) return 'SUITABLE';
    if (volatility <= 0.07) return 'HIGH_RISK';
    return 'EXTREME_RISK';
  }

  getRegimeAlignment(signal, marketRegime) {
    if (!marketRegime) return 'UNKNOWN';
    
    const phase = marketRegime.market_phase;
    
    if (signal.signal === 'BUY') {
      if (phase === 'MARKUP' || phase === 'ACCUMULATION') return 'ALIGNED';
      if (phase === 'CONSOLIDATION') return 'NEUTRAL';
      return 'MISALIGNED';
    } else if (signal.signal === 'SELL') {
      if (phase === 'DISTRIBUTION' || phase === 'MARKDOWN') return 'ALIGNED';
      if (phase === 'CONSOLIDATION') return 'NEUTRAL';
      return 'MISALIGNED';
    }
    
    return 'NEUTRAL';
  }

  buildSignalResponse(signal, confidence, reasoning, price, volatility, riskLevel, phase, marketRegime = null) {
    const stopLossDistance = price * (volatility * 1.5);
    const takeProfitDistance = stopLossDistance * 2;

    // Calculate proper stop loss and take profit based on signal
    let stopLoss, takeProfit1, takeProfit2, takeProfit3;
    
    if (signal === 'BUY') {
      stopLoss = price - stopLossDistance;
      takeProfit1 = price + takeProfitDistance * 0.6;
      takeProfit2 = price + takeProfitDistance;
      takeProfit3 = price + takeProfitDistance * 1.5;
    } else if (signal === 'SELL') {
      stopLoss = price + stopLossDistance;
      takeProfit1 = price - takeProfitDistance * 0.6;
      takeProfit2 = price - takeProfitDistance;
      takeProfit3 = price - takeProfitDistance * 1.5;
    } else {
      // HOLD signal - set reasonable levels for potential breakout
      stopLoss = price - stopLossDistance * 0.8;
      takeProfit1 = price + takeProfitDistance * 0.4;
      takeProfit2 = price + takeProfitDistance * 0.8;
      takeProfit3 = price + takeProfitDistance * 1.2;
    }

    // Enhanced position sizing with market regime consideration
    const positionSize = this.calculatePositionSize(confidence, volatility, riskLevel, marketRegime);
    const positionSizingRecommendations = this.getPositionSizingRecommendations(confidence, volatility, marketRegime, riskLevel);
    
    // Enhanced volatility analysis
    const volatilityMetrics = this.getVolatilityMetrics(volatility, price);
    
    // Short-term opportunity indicators
    const opportunityIndicators = this.getOpportunityIndicators(confidence, volatility, marketRegime, signal);
    
    // Signal quality assessment
    const signalQuality = this.assessSignalQuality({ signal }, confidence, volatility, marketRegime);

    return {
      signal,
      confidence: Math.round(confidence),
      strength: confidence > 70 ? 'STRONG' : confidence > 55 ? 'MODERATE' : 'WEAK',
      timeframe: this.mapTimeframe('1h'), // Default timeframe
      entry_price: price,
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      take_profit_3: takeProfit3,
      risk_reward_ratio: takeProfitDistance / stopLossDistance,
      
      // Enhanced position sizing
      position_size_percent: positionSize,
      position_sizing: positionSizingRecommendations,
      
      // Enhanced market analysis
      market_sentiment: signal === 'BUY' ? 'BULLISH' : signal === 'SELL' ? 'BEARISH' : 'NEUTRAL',
      volatility_rating: volatility < 0.02 ? 'LOW' : volatility < 0.04 ? 'MEDIUM' : volatility < 0.06 ? 'HIGH' : 'EXTREME',
      volatility_metrics: volatilityMetrics,
      
      // Short-term opportunity analysis
      opportunity_indicators: opportunityIndicators,
      
      // Signal quality assessment
      signal_quality: signalQuality,
      
      reasoning,
      market_phase: phase,
      strategy_type: this.getStrategyType(phase, signal),
      timestamp: Date.now()
    };
  }

  // New method for enhanced volatility metrics
  getVolatilityMetrics(volatility, price) {
    const volatilityPercent = volatility * 100;
    
    return {
      current_volatility: parseFloat(volatilityPercent.toFixed(2)),
      volatility_rank: this.getVolatilityRank(volatility),
      expected_daily_range: parseFloat((price * volatility * Math.sqrt(24)).toFixed(2)),
      profit_potential: this.getProfitPotential(volatility),
      risk_level: volatility > 0.06 ? 'VERY_HIGH' : volatility > 0.04 ? 'HIGH' : volatility > 0.02 ? 'MODERATE' : 'LOW'
    };
  }

  getVolatilityRank(volatility) {
    if (volatility < 0.015) return 'VERY_LOW';
    if (volatility < 0.025) return 'LOW';
    if (volatility < 0.04) return 'MODERATE';
    if (volatility < 0.06) return 'HIGH';
    return 'EXTREME';
  }

  getProfitPotential(volatility) {
    if (volatility > 0.05) return 'VERY_HIGH';
    if (volatility > 0.035) return 'HIGH';
    if (volatility > 0.025) return 'MODERATE';
    return 'LOW';
  }

  // New method for short-term opportunity indicators
  getOpportunityIndicators(confidence, volatility, marketRegime, signal) {
    const indicators = {
      short_term_score: this.calculateShortTermScore(confidence, volatility, marketRegime),
      scalping_suitable: volatility > 0.02 && confidence > 30,
      day_trading_suitable: volatility > 0.015 && confidence > 25,
      swing_trading_suitable: confidence > 35,
      recommended_timeframes: this.getRecommendedTimeframes(volatility, confidence),
      profit_taking_strategy: this.getProfitTakingStrategy(volatility, signal),
      risk_factors: this.getVolatilityRiskFactors(volatility, marketRegime)
    };
    
    return indicators;
  }

  calculateShortTermScore(confidence, volatility, marketRegime) {
    let score = confidence; // Base score from confidence
    
    // Volatility bonus for short-term opportunities
    if (volatility > 0.03) score += 15;
    else if (volatility > 0.02) score += 10;
    else if (volatility > 0.015) score += 5;
    
    // Market regime bonus
    if (marketRegime) {
      if (marketRegime.market_phase === 'MARKUP') score += 10;
      else if (marketRegime.market_phase === 'ACCUMULATION') score += 5;
      else if (marketRegime.market_phase === 'MARKDOWN') score -= 10;
    }
    
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  getRecommendedTimeframes(volatility, confidence) {
    const timeframes = [];
    
    if (volatility > 0.025 && confidence > 35) timeframes.push('5m', '15m');
    if (volatility > 0.02 && confidence > 30) timeframes.push('30m', '1h');
    if (confidence > 35) timeframes.push('4h');
    if (confidence > 40) timeframes.push('1d');
    
    return timeframes.length > 0 ? timeframes : ['1h'];
  }

  getProfitTakingStrategy(volatility, signal) {
    if (volatility > 0.04) {
      return 'AGGRESSIVE_SCALING'; // Take profits quickly in high volatility
    } else if (volatility > 0.025) {
      return 'MODERATE_SCALING'; // Standard profit taking
    } else {
      return 'PATIENT_HOLDING'; // Hold longer in low volatility
    }
  }

  getVolatilityRiskFactors(volatility, marketRegime) {
    const factors = [];
    
    if (volatility > 0.05) factors.push('Extreme volatility increases slippage risk');
    if (volatility > 0.035) factors.push('High volatility may cause stop loss hunting');
    if (marketRegime && marketRegime.market_phase === 'TRANSITION') {
      factors.push('Market regime transition increases uncertainty');
    }
    
    return factors;
  }

  enhanceWithComprehensiveData(signal, onChainData, offChainData, marketRegime) {
    let adjustedConfidence = signal.confidence;
    let enhancedReasoning = signal.reasoning;
    
    // On-chain data adjustments
    if (onChainData.whale_activity?.whale_accumulation === 'buying' && signal.signal === 'BUY') {
      adjustedConfidence = Math.min(100, adjustedConfidence + 8);
      enhancedReasoning += ' | Whale accumulation supports BUY signal';
    } else if (onChainData.whale_activity?.whale_accumulation === 'selling' && signal.signal === 'SELL') {
      adjustedConfidence = Math.min(100, adjustedConfidence + 8);
      enhancedReasoning += ' | Whale distribution supports SELL signal';
    }
    
    // Off-chain data adjustments
    const fundingRate = offChainData.funding_rates.current_funding_rate;
    const fearGreed = offChainData.market_sentiment.fear_greed_index;
    const liquidationRisk = offChainData.liquidation_data.liquidation_pressure;
    
    // Funding rate adjustments
    if (Math.abs(fundingRate) > 0.001) {
      if (fundingRate > 0 && signal.signal === 'SELL') {
        adjustedConfidence = Math.min(100, adjustedConfidence + 5);
        enhancedReasoning += ' | High funding rate supports short bias';
      } else if (fundingRate < 0 && signal.signal === 'BUY') {
        adjustedConfidence = Math.min(100, adjustedConfidence + 5);
        enhancedReasoning += ' | Negative funding rate supports long bias';
      }
    }
    
    // Fear & Greed adjustments
    if (fearGreed < 25 && signal.signal === 'BUY') {
      adjustedConfidence = Math.min(100, adjustedConfidence + 10);
      enhancedReasoning += ' | Extreme fear creates contrarian buy opportunity';
    } else if (fearGreed > 75 && signal.signal === 'SELL') {
      adjustedConfidence = Math.min(100, adjustedConfidence + 10);
      enhancedReasoning += ' | Extreme greed creates contrarian sell opportunity';
    }
    
    // Liquidation risk adjustments
    if (liquidationRisk > 60) {
      adjustedConfidence = Math.max(20, adjustedConfidence - 15);
      enhancedReasoning += ' | High liquidation risk reduces confidence';
    }
    
    // Market regime confidence
    if (marketRegime.regime_confidence > 0.7) {
      adjustedConfidence = Math.min(100, adjustedConfidence + 5);
      enhancedReasoning += ' | High regime confidence';
    }

    return {
      ...signal,
      confidence: Math.round(adjustedConfidence),
      reasoning: enhancedReasoning,
      data_sources: {
        on_chain: onChainData.source,
        off_chain_quality: offChainData.data_quality.quality_score,
        regime_confidence: marketRegime.regime_confidence
      }
    };
  }

  determineStrategyType(marketRegime, offChainData) {
    const phase = marketRegime.market_phase;
    const volatility = marketRegime.volatility_regime;
    const sentiment = offChainData.market_sentiment.fear_greed_index;
    
    if (phase === 'ACCUMULATION') return 'ACCUMULATION_STRATEGY';
    if (phase === 'DISTRIBUTION') return 'DISTRIBUTION_STRATEGY';
    if (phase === 'MARKUP') return 'TREND_FOLLOWING';
    if (phase === 'MARKDOWN') return 'DEFENSIVE_POSITIONING';
    if (phase === 'CONSOLIDATION') return 'RANGE_TRADING';
    
    // Fallback based on sentiment
    if (sentiment < 30) return 'CONTRARIAN_BULLISH';
    if (sentiment > 70) return 'CONTRARIAN_BEARISH';
    
    return 'MARKET_NEUTRAL';
  }

  assessRiskEnvironment(marketRegime, offChainData, riskLevel) {
    let riskScore = 50; // Base risk score
    
    // Market regime risk factors
    if (marketRegime.volatility_regime === 'HIGH_VOLATILITY') riskScore += 20;
    if (marketRegime.market_phase === 'DISTRIBUTION') riskScore += 15;
    if (marketRegime.market_phase === 'MARKDOWN') riskScore += 10;
    
    // Off-chain risk factors
    const liquidationPressure = offChainData.liquidation_data.liquidation_pressure;
    const fundingRate = Math.abs(offChainData.funding_rates.current_funding_rate);
    
    if (liquidationPressure > 60) riskScore += 15;
    if (fundingRate > 0.002) riskScore += 10;
    
    // Risk level adjustment
    if (riskLevel === 'conservative') riskScore += 10;
    else if (riskLevel === 'aggressive') riskScore -= 10;
    
    riskScore = Math.max(0, Math.min(100, riskScore));
    
    let riskEnvironment = 'MODERATE';
    if (riskScore > 70) riskEnvironment = 'HIGH_RISK';
    else if (riskScore < 30) riskEnvironment = 'LOW_RISK';
    
    return {
      risk_score: riskScore,
      risk_environment: riskEnvironment,
      risk_factors: this.identifyRiskFactors(marketRegime, offChainData)
    };
  }

  identifyRiskFactors(marketRegime, offChainData) {
    const factors = [];
    
    if (marketRegime.volatility_regime === 'HIGH_VOLATILITY') {
      factors.push('High market volatility');
    }
    
    if (marketRegime.market_phase === 'DISTRIBUTION') {
      factors.push('Distribution phase - potential top');
    }
    
    if (offChainData.liquidation_data.liquidation_pressure > 60) {
      factors.push('High liquidation pressure');
    }
    
    if (Math.abs(offChainData.funding_rates.current_funding_rate) > 0.001) {
      factors.push('Extreme funding rates');
    }
    
    if (offChainData.market_sentiment.fear_greed_index > 80) {
      factors.push('Extreme greed levels');
    }
    
    return factors;
  }

  getStrategyType(phase, signal) {
    const strategies = {
      'ACCUMULATION': {
        'BUY': 'Accumulation Entry',
        'SELL': 'Risk Management',
        'HOLD': 'Accumulation Wait'
      },
      'DISTRIBUTION': {
        'BUY': 'Contrarian Entry',
        'SELL': 'Distribution Exit',
        'HOLD': 'Distribution Wait'
      },
      'MARKUP': {
        'BUY': 'Trend Following',
        'SELL': 'Profit Taking',
        'HOLD': 'Momentum Wait'
      },
      'MARKDOWN': {
        'BUY': 'Oversold Bounce',
        'SELL': 'Trend Following',
        'HOLD': 'Defensive Hold'
      },
      'CONSOLIDATION': {
        'BUY': 'Range Support',
        'SELL': 'Range Resistance',
        'HOLD': 'Breakout Wait'
      },
      'NEUTRAL': {
        'BUY': 'Opportunistic Entry',
        'SELL': 'Opportunistic Exit',
        'HOLD': 'Market Neutral'
      }
    };
    
    return strategies[phase]?.[signal] || 'Standard Strategy';
  }

  generateFallbackSignal(marketData, technicalData, requestParams) {
    // Fallback when both AI services fail
    const price = marketData.current_price;
    const rsi = technicalData.rsi || 50;
    const macd = technicalData.macd?.macd || 0;
    const volatility = technicalData.volatility || 0.02;
    
    let signal = 'HOLD';
    let confidence = 50;
    let reasoning = 'Fallback analysis - limited data available';
    
    // Add randomization to make fallback signals more varied
    const confidenceVariation = (Math.random() - 0.5) * 20; // ±10 points variation
    
    if (rsi < 30 && macd > 0) {
      signal = 'BUY';
      confidence = 65 + confidenceVariation;
      reasoning = 'Oversold RSI with positive MACD momentum';
    } else if (rsi > 70 && macd < 0) {
      signal = 'SELL';
      confidence = 65 + confidenceVariation;
      reasoning = 'Overbought RSI with negative MACD momentum';
    } else {
      // Add some randomization to HOLD signals too
      confidence = 50 + confidenceVariation;
    }
    
    // Ensure confidence stays within reasonable bounds
    confidence = Math.max(20, Math.min(85, confidence));

    const stopLossDistance = price * (volatility * 1.5);
    const takeProfitDistance = stopLossDistance * 2; // Remove randomization, use fixed 2:1 ratio

    // Calculate proper stop loss and take profit based on signal
    let stopLoss, takeProfit1, takeProfit2, takeProfit3;
    
    if (signal === 'BUY') {
      stopLoss = price - stopLossDistance;
      takeProfit1 = price + takeProfitDistance * 0.6;
      takeProfit2 = price + takeProfitDistance;
      takeProfit3 = price + takeProfitDistance * 1.5;
    } else if (signal === 'SELL') {
      stopLoss = price + stopLossDistance;
      takeProfit1 = price - takeProfitDistance * 0.6;
      takeProfit2 = price - takeProfitDistance;
      takeProfit3 = price - takeProfitDistance * 1.5;
    } else {
      // HOLD signal - set reasonable levels for potential breakout
      stopLoss = price - stopLossDistance * 0.8;
      takeProfit1 = price + takeProfitDistance * 0.4;
      takeProfit2 = price + takeProfitDistance * 0.8;
      takeProfit3 = price + takeProfitDistance * 1.2;
    }

    return {
      signal,
      confidence: Math.round(confidence),
      strength: confidence > 70 ? 'STRONG' : confidence > 55 ? 'MODERATE' : 'WEAK',
      timeframe: this.mapTimeframe(requestParams.timeframe),
      entry_price: price,
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      take_profit_3: takeProfit3,
      risk_reward_ratio: takeProfitDistance / stopLossDistance,
      position_size_percent: this.calculatePositionSize(confidence, volatility, requestParams.risk_level),
      market_sentiment: signal === 'BUY' ? 'BULLISH' : signal === 'SELL' ? 'BEARISH' : 'NEUTRAL',
      volatility_rating: volatility < 0.02 ? 'LOW' : volatility < 0.04 ? 'MEDIUM' : volatility < 0.06 ? 'HIGH' : 'EXTREME',
      technical_score: Math.round(50 + (confidence - 50) * 0.8),
      momentum_score: Math.round(50 + (macd * 1000)),
      trend_score: Math.round(50 + ((price - technicalData.sma_20) / technicalData.sma_20) * 200),
      onchain_score: 50, // Base score for fallback analysis - no randomization
      reasoning,
      source: 'fallback_analysis',
      timestamp: Date.now()
    };
  }

  mapTimeframe(timeframe) {
    const mapping = {
      '1m': 'SCALP',
      '5m': 'SCALP',
      '15m': 'INTRADAY',
      '1h': 'INTRADAY',
      '4h': 'SWING',
      '1d': 'POSITION'
    };
    return mapping[timeframe] || 'SWING';
  }

  calculatePositionSize(confidence, volatility, riskLevel, marketRegime = null) {
    const baseSize = {
      'conservative': 2,
      'moderate': 5,
      'aggressive': 10
    };
    
    let base = baseSize[riskLevel] || 5;
    
    // Enhanced confidence scaling
    let confidenceMultiplier = 1.0;
    if (confidence >= 40) {
      confidenceMultiplier = 1.5;  // 150% for high confidence (40%+)
    } else if (confidence >= 35) {
      confidenceMultiplier = 1.25; // 125% for good confidence (35-39%)
    } else if (confidence >= 30) {
      confidenceMultiplier = 1.0;  // 100% for normal confidence (30-34%)
    } else if (confidence >= 25) {
      confidenceMultiplier = 0.75; // 75% for low confidence (25-29%)
    } else {
      return 0; // Skip signals below 25% confidence
    }
    
    // Market regime adjustments
    let regimeMultiplier = 1.0;
    if (marketRegime) {
      const regimeMultipliers = {
        'MARKUP': 1.5,      // Bullish trends - larger positions
        'ACCUMULATION': 1.3, // Building phase - moderate increase
        'CONSOLIDATION': 1.0, // Normal sizing
        'TRANSITION': 0.8,   // Uncertain - smaller positions
        'MARKDOWN': 0.5      // Bearish - very small positions
      };
      regimeMultiplier = regimeMultipliers[marketRegime.market_phase] || 1.0;
    }
    
    // Volatility adjustment - more nuanced
    let volatilityAdjustment = 1.0;
    if (volatility < 0.02) {
      volatilityAdjustment = 1.2; // Low volatility - can afford larger positions
    } else if (volatility < 0.04) {
      volatilityAdjustment = 1.0; // Normal volatility
    } else if (volatility < 0.06) {
      volatilityAdjustment = 0.8; // High volatility - reduce size
    } else {
      volatilityAdjustment = 0.6; // Extreme volatility - very small positions
    }
    
    const finalSize = base * confidenceMultiplier * regimeMultiplier * volatilityAdjustment;
    
    return Math.max(1, Math.min(25, Math.round(finalSize)));
  }

  // New method for enhanced position sizing recommendations
  getPositionSizingRecommendations(confidence, volatility, marketRegime, riskLevel) {
    const baseRecommendation = this.calculatePositionSize(confidence, volatility, riskLevel, marketRegime);
    
    const recommendations = {
      recommended_size: baseRecommendation,
      min_confidence_threshold: 25,
      confidence_tier: this.getConfidenceTier(confidence),
      market_regime_factor: this.getRegimeFactor(marketRegime),
      volatility_factor: this.getVolatilityFactor(volatility),
      scaling_rationale: this.getScalingRationale(confidence, marketRegime, volatility),
      risk_adjusted_max: Math.min(baseRecommendation * 1.5, 25),
      conservative_size: Math.max(1, Math.round(baseRecommendation * 0.7))
    };
    
    return recommendations;
  }

  getConfidenceTier(confidence) {
    if (confidence >= 40) return 'HIGH';
    if (confidence >= 35) return 'GOOD';
    if (confidence >= 30) return 'MODERATE';
    if (confidence >= 25) return 'LOW';
    return 'INSUFFICIENT';
  }

  getRegimeFactor(marketRegime) {
    if (!marketRegime) return 1.0;
    
    const factors = {
      'MARKUP': 1.5,
      'ACCUMULATION': 1.3,
      'CONSOLIDATION': 1.0,
      'TRANSITION': 0.8,
      'MARKDOWN': 0.5
    };
    
    return factors[marketRegime.market_phase] || 1.0;
  }

  getVolatilityFactor(volatility) {
    if (volatility < 0.02) return 1.2;
    if (volatility < 0.04) return 1.0;
    if (volatility < 0.06) return 0.8;
    return 0.6;
  }

  getScalingRationale(confidence, marketRegime, volatility) {
    const reasons = [];
    
    if (confidence >= 35) {
      reasons.push(`High confidence (${confidence}%) increases position size`);
    } else if (confidence < 30) {
      reasons.push(`Lower confidence (${confidence}%) reduces position size`);
    }
    
    if (marketRegime) {
      if (marketRegime.market_phase === 'MARKUP') {
        reasons.push('Bullish market regime supports larger positions');
      } else if (marketRegime.market_phase === 'MARKDOWN') {
        reasons.push('Bearish market regime requires smaller positions');
      }
    }
    
    if (volatility > 0.04) {
      reasons.push(`High volatility (${(volatility * 100).toFixed(1)}%) requires position size reduction`);
    } else if (volatility < 0.02) {
      reasons.push(`Low volatility (${(volatility * 100).toFixed(1)}%) allows larger positions`);
    }
    
    return reasons.join('; ');
  }

  // New method for short-term market outlook
  getShortTermOutlook(signal, marketRegime, volatility) {
    let outlook = 'NEUTRAL';
    let confidence = 'MODERATE';
    
    // Determine outlook based on signal and market regime
    if (signal.signal === 'BUY') {
      if (marketRegime.market_phase === 'MARKUP' || marketRegime.market_phase === 'ACCUMULATION') {
        outlook = 'BULLISH';
        confidence = 'HIGH';
      } else if (marketRegime.market_phase === 'CONSOLIDATION') {
        outlook = 'CAUTIOUSLY_BULLISH';
        confidence = 'MODERATE';
      }
    } else if (signal.signal === 'SELL') {
      if (marketRegime.market_phase === 'DISTRIBUTION' || marketRegime.market_phase === 'MARKDOWN') {
        outlook = 'BEARISH';
        confidence = 'HIGH';
      } else if (marketRegime.market_phase === 'CONSOLIDATION') {
        outlook = 'CAUTIOUSLY_BEARISH';
        confidence = 'MODERATE';
      }
    }
    
    // Adjust confidence based on volatility
    if (volatility > 0.05) {
      confidence = 'LOW'; // High volatility reduces confidence
    } else if (volatility < 0.015) {
      confidence = 'LOW'; // Very low volatility also reduces confidence for short-term
    }
    
    return {
      direction: outlook,
      confidence: confidence,
      timeframe: '1-24h',
      key_factors: this.getOutlookFactors(signal, marketRegime, volatility)
    };
  }

  getOutlookFactors(signal, marketRegime, volatility) {
    const factors = [];
    
    if (marketRegime.market_phase === 'MARKUP') {
      factors.push('Strong bullish market regime');
    } else if (marketRegime.market_phase === 'MARKDOWN') {
      factors.push('Strong bearish market regime');
    }
    
    if (volatility > 0.04) {
      factors.push('High volatility creates opportunities');
    } else if (volatility < 0.015) {
      factors.push('Low volatility may limit movements');
    }
    
    if (signal.confidence > 40) {
      factors.push('High signal confidence');
    }
    
    return factors;
  }
}

// Initialize signal generator instance
signalGenerator = new EnhancedAISignalGenerator();

// ===============================================
// AUTHENTICATION MIDDLEWARE
// ===============================================

const authenticateAPI = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization header',
      code: 'AUTH_REQUIRED'
    });
  }
  
  const token = authHeader.substring(7);
  
  if (token !== process.env.API_KEY_SECRET) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_TOKEN'
    });
  }
  
  next();
};

// ===============================================
// VALIDATION MIDDLEWARE
// ===============================================

const validateSignalRequest = async (req, res, next) => {
  const { symbol, timeframe, analysis_depth, risk_level } = req.body;
  
  const validTimeframes = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];
  const validAnalysisDepths = ['basic', 'advanced', 'comprehensive'];
  const validRiskLevels = ['conservative', 'moderate', 'aggressive'];
  
  const errors = [];
  
  // Validate symbol dynamically
  if (!symbol) {
    errors.push('Symbol is required');
  } else {
    const isValid = await isValidSymbol(symbol);
    if (!isValid) {
      errors.push(`Invalid symbol: ${symbol}. Must be an active USDT trading pair on Binance.`);
    }
  }
  
  if (!timeframe || !validTimeframes.includes(timeframe)) {
    errors.push(`Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`);
  }
  
  if (analysis_depth && !validAnalysisDepths.includes(analysis_depth)) {
    errors.push(`Invalid analysis_depth. Must be one of: ${validAnalysisDepths.join(', ')}`);
  }
  
  if (risk_level && !validRiskLevels.includes(risk_level)) {
    errors.push(`Invalid risk_level. Must be one of: ${validRiskLevels.join(', ')}`);
  }
  
  if (errors.length > 0) {
    const validSymbols = await getValidSymbols();
    symbolStats.validationAttempts++;
    symbolStats.validationFailures++;
    
    // Track failed symbols
    if (symbol && !(await isValidSymbol(symbol))) {
      symbolStats.lastFailedSymbols.push({
        symbol: symbol,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 10 failed symbols
      if (symbolStats.lastFailedSymbols.length > 10) {
        symbolStats.lastFailedSymbols.shift();
      }
    }
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      supported_symbols_count: validSymbols.length,
      note: 'Symbols are dynamically fetched from Binance. Any active USDT spot trading pair is supported.',
      hint: 'Use GET /api/v1/symbols to get the list of valid symbols'
    });
  }
  
  symbolStats.validationAttempts++;
  next();
};

// Batch validation middleware
const validateBatchSignalRequest = async (req, res, next) => {
  const { symbols, timeframe, analysis_depth, risk_level } = req.body;
  
  const validTimeframes = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];
  const validAnalysisDepths = ['basic', 'advanced', 'comprehensive'];
  const validRiskLevels = ['conservative', 'moderate', 'aggressive'];
  
  const errors = [];
  
  // Validate symbols array
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    errors.push('Symbols array is required');
  } else if (symbols.length > 10) {
    errors.push('Maximum 10 symbols allowed per batch request');
  } else {
    // Validate each symbol
    const validSymbolsList = await getValidSymbols();
    const invalidSymbols = symbols.filter(symbol => !validSymbolsList.includes(symbol));
    
    if (invalidSymbols.length > 0) {
      errors.push(`Invalid symbols: ${invalidSymbols.join(', ')}`);
    }
  }
  
  if (!timeframe || !validTimeframes.includes(timeframe)) {
    errors.push(`Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`);
  }
  
  if (analysis_depth && !validAnalysisDepths.includes(analysis_depth)) {
    errors.push(`Invalid analysis_depth. Must be one of: ${validAnalysisDepths.join(', ')}`);
  }
  
  if (risk_level && !validRiskLevels.includes(risk_level)) {
    errors.push(`Invalid risk_level. Must be one of: ${validRiskLevels.join(', ')}`);
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }
  
  next();
};

// ===============================================
// API ROUTES
// ===============================================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: Date.now(),
    version: '2.0.0',
    ai_services: {
      claude: process.env.CLAUDE_API_KEY ? 'configured' : 'missing',
      lunarcrush: process.env.LUNARCRUSH_API_KEY ? 'configured' : 'missing'
    },
    symbol_validation: {
      mode: 'dynamic',
      source: 'binance_api',
      cache_status: validSymbolsCache.symbols.length > 0 ? 'populated' : 'empty',
      last_updated: validSymbolsCache.lastUpdated || 'never'
    },
    uptime: process.uptime()
  });
});

// Symbol list endpoint
app.get('/api/v1/symbols', authenticateAPI, async (req, res) => {
  try {
    const symbols = await getValidSymbols();
    
    res.json({
      success: true,
      data: {
        symbols: symbols,
        count: symbols.length,
        top_by_volume: getTopSymbolsByVolume(20),
        stablecoins: validSymbolsCache.stablecoins,
        last_updated: validSymbolsCache.lastUpdated,
        update_interval: validSymbolsCache.updateInterval,
        cache_expires_in: Math.max(0, validSymbolsCache.updateInterval - (Date.now() - validSymbolsCache.lastUpdated))
      }
    });
  } catch (error) {
    logger.error('Failed to get symbols:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve symbol list'
    });
  }
});

// Symbol search endpoint
app.get('/api/v1/symbols/search', authenticateAPI, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 1 character'
      });
    }
    
    const symbols = await getValidSymbols();
    
    // Filter symbols that contain the query (case insensitive)
    const matches = symbols.filter(symbol => 
      symbol.toLowerCase().includes(query.toLowerCase())
    );
    
    // Sort by relevance (exact match first, then by length)
    matches.sort((a, b) => {
      const aExact = a.toLowerCase() === query.toLowerCase();
      const bExact = b.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.length - b.length;
    });
    
    res.json({
      success: true,
      data: {
        query: query,
        matches: matches.slice(0, 50), // Limit to 50 results
        count: matches.length,
        metadata: matches.slice(0, 10).reduce((acc, symbol) => {
          acc[symbol] = getSymbolMetadata(symbol);
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Symbol search failed:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Force symbol refresh endpoint (admin)
app.post('/api/v1/admin/refresh-symbols', authenticateAPI, async (req, res) => {
  try {
    logger.info('Manual symbol refresh requested');
    const symbols = await updateValidSymbols(true);
    
    res.json({
      success: true,
      message: 'Symbols refreshed successfully',
      count: symbols.length,
      new_symbols: symbols.filter(s => !validSymbolsCache.symbols.includes(s)),
      removed_symbols: validSymbolsCache.symbols.filter(s => !symbols.includes(s))
    });
  } catch (error) {
    logger.error('Manual symbol refresh failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh symbols',
      message: error.message
    });
  }
});

// Symbol statistics endpoint (admin)
app.get('/api/v1/admin/symbol-stats', authenticateAPI, async (req, res) => {
  const validSymbols = await getValidSymbols();
  
  res.json({
    success: true,
    data: {
      total_valid_symbols: validSymbols.length,
      cache_last_updated: new Date(validSymbolsCache.lastUpdated).toISOString(),
      cache_age_seconds: Math.floor((Date.now() - validSymbolsCache.lastUpdated) / 1000),
      validation_stats: symbolStats,
      top_symbols_by_volume: getTopSymbolsByVolume(10),
      stablecoin_count: validSymbolsCache.stablecoins.length,
      sample_symbols: validSymbols.slice(0, 20),
      cache_status: {
        is_updating: validSymbolsCache.isUpdating,
        update_interval_ms: validSymbolsCache.updateInterval,
        next_update_in_seconds: Math.max(0, 
          Math.floor((validSymbolsCache.updateInterval - (Date.now() - validSymbolsCache.lastUpdated)) / 1000)
        )
      }
    }
  });
});

// Enhanced signal generation endpoint
app.post('/api/v1/signal', authenticateAPI, validateSignalRequest, async (req, res) => {
  const startTime = Date.now();
  
  // Extract variables outside try block to make them available in catch block
  const {
    symbol,
    timeframe = '1h',
    risk_level = 'balanced',
    custom_risk_params = null,
    include_reasoning = true,
    include_alternatives = false
  } = req.body;
  
  try {

    logger.info(`Enhanced signal request for ${symbol}`, {
      timeframe,
      risk_level,
      custom_risk_params: !!custom_risk_params,
      include_reasoning,
      include_alternatives
    });

    // Generate comprehensive market data
    const marketData = MarketDataService.generateEnhancedData(symbol, timeframe, 100);
    const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
    
    // Get comprehensive on-chain data with reliability check
    const onChainData = await signalGenerator.coinGeckoService.getOnChainAnalysis(symbol);
    
    // CRITICAL: Check data reliability for live trading
    if (onChainData.live_trading_safe === false || onChainData.source === 'UNRELIABLE_FALLBACK') {
      logger.error(`⚠️  CRITICAL: Rejecting ${symbol} - data not reliable for live trading`);
      return res.status(400).json({
        success: false,
        error: 'Symbol not safe for live trading',
        message: `${symbol} does not have reliable data sources. Trading this symbol is not recommended.`,
        data_quality: onChainData.data_quality || 'UNSAFE',
        data_source: onChainData.source,
        recommendation: 'Use symbols with reliable data sources for live trading',
        safe_alternatives: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT'],
        timestamp: Date.now()
      });
    }
    
    // Get comprehensive off-chain data
    const offChainData = await offChainDataService.getComprehensiveOffChainData(symbol);
    
    // Get risk parameters based on user preference and market conditions
    const riskParams = custom_risk_params ? 
      riskParameterService.getCustomRiskParameters(custom_risk_params, risk_level) :
      riskParameterService.getRiskParameters(risk_level, technicalData.market_regime);
    
    // Generate market-adaptive signal
    const signal = await signalGenerator.generateAdvancedSignal(
      marketData, 
      technicalData, 
      onChainData, 
      { 
        symbol, 
      timeframe,
        risk_level,
        custom_risk_params,
        include_reasoning,
        include_alternatives 
      }
    );
    
    // Validate signal against risk parameters
    const riskValidation = riskParameterService.validateSignalAgainstRiskParameters(
      signal, 
      riskParams, 
      marketData
    );
    
    // Generate comprehensive reasoning if requested
    let reasoning = null;
    if (include_reasoning) {
      reasoning = signalReasoningEngine.generateComprehensiveReasoning(
        signal,
        technicalData,
        onChainData,
        offChainData,
        technicalData.market_regime,
        riskParams
      );
    }
    
    // Generate risk report
    const riskReport = riskParameterService.generateRiskReport(
      riskParams,
      technicalData.market_regime,
      { symbol, current_price: marketData.current_price }
    );
    
    // Build comprehensive response
    const response = {
      signal: signal.signal,
      confidence: signal.confidence,
      strength: signal.strength,
      entry_price: signal.entry_price,
      stop_loss: signal.stop_loss,
      take_profit_1: signal.take_profit_1,
      take_profit_2: signal.take_profit_2,
      take_profit_3: signal.take_profit_3,
      position_size_percent: signal.position_size_percent,
      risk_reward_ratio: signal.risk_reward_ratio,
      timeframe: signal.timeframe,
      
      // Enhanced market context
      market_context: {
        current_price: marketData.current_price,
        market_regime: technicalData.market_regime,
        strategy_type: signal.market_context?.strategy_type,
        risk_environment: signal.market_context?.risk_environment,
        regime_strength: technicalData.market_regime.regime_confidence || 0.5,
        volatility_environment: technicalData.volatility > 0.04 ? 'HIGH_VOLATILITY' : 
                               technicalData.volatility > 0.02 ? 'MODERATE_VOLATILITY' : 'LOW_VOLATILITY',
        short_term_outlook: signalGenerator.getShortTermOutlook(signal, technicalData.market_regime, technicalData.volatility),
        data_quality: {
          onchain: onChainData.source,
          offchain: offChainData.data_quality.quality_score,
          technical: 'real_time'
        }
      },
      
      // Risk management
      risk_management: {
        risk_level: risk_level,
        risk_validation: riskValidation,
        risk_report: riskReport,
        position_sizing: {
          recommended: signal.position_size_percent,
          max_allowed: riskParams.max_position_size,
          risk_per_trade: riskParams.risk_per_trade
        }
      },
      
      // Technical analysis summary
      technical_analysis: {
          rsi: technicalData.rsi,
          macd: technicalData.macd,
          volatility: technicalData.volatility,
          volume_ratio: technicalData.volume_ratio,
        trend_alignment: technicalData.market_regime.primary_trend === technicalData.market_regime.secondary_trend
      },
      
      // Key market data
      market_data: {
        symbol: symbol,
        current_price: marketData.current_price,
        volume_24h: marketData.volume_24h,
        market_cap: marketData.market_cap,
        price_change_24h: marketData.price_change_24h
      },
      
      // Reasoning and analysis
      reasoning: reasoning,
      
      // Performance metrics
      performance: {
        generation_time_ms: Date.now() - startTime,
        data_sources: {
          technical: 'real_time',
          onchain: onChainData.source,
          offchain: offChainData.data_quality.success_rate + '%'
        }
      },
      
      timestamp: Date.now()
    };
    
    // Log successful signal generation
    logger.info(`Enhanced signal generated for ${symbol}`, {
      signal: signal.signal,
      confidence: signal.confidence,
      market_regime: technicalData.market_regime,  // Fixed: Log full regime object
      risk_level: risk_level,
      generation_time: Date.now() - startTime,
      data_quality: {
        onchain: onChainData.source,
        offchain: offChainData.data_quality.quality_score
      }
    });
    
    res.json(response);
    
  } catch (error) {
    logger.error('Enhanced signal generation failed:', error);
    
    // Fallback to basic signal generation
    try {
      const marketData = MarketDataService.generateEnhancedData(symbol, timeframe, 100);
      const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
      const onChainData = await signalGenerator.coinGeckoService.getOnChainAnalysis(symbol);
      
      const fallbackSignal = await signalGenerator.generateAdvancedSignal(
        marketData, 
        technicalData, 
        onChainData, 
        { symbol, timeframe, risk_level }
      );
      
      logger.info(`Fallback signal generated for ${symbol}`, {
        signal: fallbackSignal.signal,
        confidence: fallbackSignal.confidence
      });
      
      res.json({
        signal: fallbackSignal.signal,
        confidence: fallbackSignal.confidence,
        strength: fallbackSignal.strength,
        entry_price: fallbackSignal.entry_price,
        stop_loss: fallbackSignal.stop_loss,
        take_profit_1: fallbackSignal.take_profit_1,
        take_profit_2: fallbackSignal.take_profit_2,
        take_profit_3: fallbackSignal.take_profit_3,
        position_size_percent: fallbackSignal.position_size_percent,
        risk_reward_ratio: fallbackSignal.risk_reward_ratio,
        timeframe: fallbackSignal.timeframe,
        market_context: {
          current_price: marketData.current_price,
          fallback_mode: true,
          error: 'Enhanced features unavailable'
        },
        timestamp: Date.now()
      });
      
    } catch (fallbackError) {
      logger.error('Fallback signal generation also failed:', fallbackError);
      res.status(500).json({
        error: 'Signal generation failed',
        message: 'Unable to generate signal due to system error',
        symbol: req.body.symbol,  // Fixed: Added symbol from request
        timestamp: Date.now()
      });
    }
  }
});

// New endpoint for symbol validation (LIVE TRADING SAFETY)
app.get('/api/v1/validate-symbol/:symbol', authenticateAPI, async (req, res) => {
  const { symbol } = req.params;
  const startTime = Date.now();
  
  try {
    logger.info(`Validating ${symbol} for live trading safety`);
    
    // Check if symbol exists on Binance
    const isValid = await isValidSymbol(symbol);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        safe_for_live_trading: false,
        error: 'Invalid symbol',
        message: `${symbol} is not a valid trading pair on Binance`,
        timestamp: Date.now()
      });
    }
    
    // Check data reliability
    const onChainData = await signalGenerator.coinGeckoService.getOnChainAnalysis(symbol);
    const marketData = MarketDataService.generateEnhancedData(symbol, '1h', 24);
    
    const validation = {
      symbol,
      safe_for_live_trading: true,
      data_quality: 'high',
      data_sources: [],
      risk_factors: [],
      reliability_score: 100,
      recommendations: []
    };
    
    // Evaluate data sources
    if (onChainData.source === 'coingecko_reliable') {
      validation.data_sources.push('CoinGecko API (High Quality)');
      validation.reliability_score = 100;
    } else if (onChainData.source === 'binance_api') {
      validation.data_sources.push('Binance API (Medium Quality)');
      validation.reliability_score = 75;
      validation.data_quality = 'medium';
      validation.recommendations.push('Limited on-chain data available');
    } else if (onChainData.source === 'UNRELIABLE_FALLBACK') {
      validation.safe_for_live_trading = false;
      validation.data_quality = 'UNSAFE';
      validation.reliability_score = 0;
      validation.risk_factors.push('No reliable data sources available');
      validation.recommendations.push('⚠️  DO NOT USE FOR LIVE TRADING');
    }
    
    // Check volume and liquidity
    if (marketData.volume_24h < 1000000) { // Less than $1M daily volume
      validation.reliability_score -= 25;
      validation.risk_factors.push('Low trading volume - potential liquidity issues');
      validation.recommendations.push('Consider higher volume alternatives');
    }
    
    // Check price stability
    if (Math.abs(marketData.price_change_24h) > 20) { // More than 20% daily change
      validation.reliability_score -= 15;
      validation.risk_factors.push('High price volatility - increased risk');
      validation.recommendations.push('Use smaller position sizes');
    }
    
    // Final safety determination
    if (validation.reliability_score < 50) {
      validation.safe_for_live_trading = false;
      validation.data_quality = 'RISKY';
      validation.recommendations.push('Not recommended for live trading');
    }
    
    // Add safe alternatives if symbol is not recommended
    if (!validation.safe_for_live_trading) {
      validation.safe_alternatives = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 
        'ADAUSDT', 'XRPUSDT', 'AVAXUSDT', 'DOTUSDT'
      ];
    }
    
    res.json({
      success: true,
      validation,
      performance: {
        validation_time_ms: Date.now() - startTime
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error(`Symbol validation failed for ${symbol}:`, error);
    res.status(500).json({
      success: false,
      safe_for_live_trading: false,
      error: 'Validation failed',
      message: `Unable to validate ${symbol} - assume unsafe for live trading`,
      timestamp: Date.now()
    });
  }
});

// New endpoint for high-volatility opportunities discovery
app.get('/api/v1/opportunities/high-volatility', authenticateAPI, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      min_confidence = 25, 
      min_volatility = 0.02, 
      max_pairs = 10,
      risk_level = 'moderate' 
    } = req.query;
    
    logger.info('High-volatility opportunities request', {
      min_confidence: parseFloat(min_confidence),
      min_volatility: parseFloat(min_volatility),
      max_pairs: parseInt(max_pairs),
      risk_level
    });

    // Get high-volume symbols for analysis, prioritizing reliable ones
    const symbols = await getValidSymbols();
    const reliableSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 
                            'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'ATOMUSDT',
                            'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT', 'AAVEUSDT'];
    
    // Prioritize reliable symbols but include some high-volume alternatives
    const topReliable = reliableSymbols.filter(symbol => symbols.includes(symbol)).slice(0, Math.max(5, parseInt(max_pairs)));
    const topVolume = getTopSymbolsByVolume(parseInt(max_pairs) * 2).filter(symbol => !reliableSymbols.includes(symbol)).slice(0, 5);
    const topSymbols = [...topReliable, ...topVolume].slice(0, parseInt(max_pairs) * 2);
    
    const opportunities = [];
    const validatedSymbols = [];
    
    // Analyze each symbol for volatility and profit potential (with data validation)
    for (const symbol of topSymbols) {
      try {
        const marketData = MarketDataService.generateEnhancedData(symbol, '1h', 100);
        const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
        
        // Skip if volatility is too low
        if (technicalData.volatility < parseFloat(min_volatility)) continue;
        
        // Generate quick signal with data validation
        const onChainData = await signalGenerator.coinGeckoService.getOnChainAnalysis(symbol);
        
        // CRITICAL: Validate data quality for live trading
        const isReliable = onChainData.source !== 'UNRELIABLE_FALLBACK' && 
                          onChainData.live_trading_safe !== false &&
                          onChainData.data_quality !== 'UNSAFE_FOR_TRADING';
        
        if (!isReliable) {
          logger.warn(`Skipping ${symbol} in opportunities - unreliable data (source: ${onChainData.source})`);
          continue;
        }
        
        validatedSymbols.push(symbol);
        
        const signal = await signalGenerator.generateAdvancedSignal(
          marketData, 
          technicalData, 
          onChainData, 
          { symbol, timeframe: '1h', risk_level }
        );
        
        // Filter by minimum confidence
        if (signal.confidence < parseFloat(min_confidence)) continue;
        
        // Calculate opportunity score
        const opportunityScore = signalGenerator.calculateShortTermScore(
          signal.confidence, 
          technicalData.volatility, 
          technicalData.market_regime
        );
        
        opportunities.push({
          symbol,
          signal: signal.signal,
          confidence: signal.confidence,
          volatility: parseFloat((technicalData.volatility * 100).toFixed(2)),
          opportunity_score: opportunityScore,
          current_price: marketData.current_price,
          price_change_24h: marketData.price_change_24h,
          volume_24h: marketData.volume_24h,
          market_regime: technicalData.market_regime.market_phase,
          profit_potential: signalGenerator.getProfitPotential(technicalData.volatility),
          recommended_timeframes: signalGenerator.getRecommendedTimeframes(technicalData.volatility, signal.confidence),
          position_sizing: signalGenerator.getPositionSizingRecommendations(
            signal.confidence, 
            technicalData.volatility, 
            technicalData.market_regime, 
            risk_level
          ),
          data_quality: onChainData.data_quality || 'high',
          data_source: onChainData.source,
          live_trading_safe: true
        });
      } catch (error) {
        logger.warn(`Failed to analyze ${symbol} for opportunities:`, error.message);
      }
    }
    
    // Sort by opportunity score and limit results
    opportunities.sort((a, b) => b.opportunity_score - a.opportunity_score);
    const topOpportunities = opportunities.slice(0, parseInt(max_pairs));
    
    res.json({
      success: true,
      opportunities: topOpportunities,
      analysis_summary: {
        symbols_analyzed: topSymbols.length,
        symbols_validated: validatedSymbols.length,
        symbols_rejected: topSymbols.length - validatedSymbols.length,
        opportunities_found: opportunities.length,
        top_opportunities: topOpportunities.length,
        criteria: {
          min_confidence: parseFloat(min_confidence),
          min_volatility: parseFloat(min_volatility),
          risk_level
        },
        data_quality_filter: {
          reliable_sources_only: true,
          fallback_data_excluded: true,
          live_trading_safe: true
        },
        market_overview: {
          high_volatility_count: opportunities.filter(o => o.volatility > 4).length,
          bullish_signals: topOpportunities.filter(o => o.signal === 'BUY').length,
          bearish_signals: topOpportunities.filter(o => o.signal === 'SELL').length,
          high_quality_data: topOpportunities.filter(o => o.data_quality === 'high').length,
          medium_quality_data: topOpportunities.filter(o => o.data_quality === 'medium').length
        }
      },
      performance: {
        generation_time_ms: Date.now() - startTime,
        data_sources: 'real_time'
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('High-volatility opportunities discovery failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover opportunities',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

// New endpoint for risk parameter management
app.get('/api/v1/risk-parameters/:level', authenticateAPI, async (req, res) => {
  try {
    const { level } = req.params;
    const { market_conditions } = req.query;
    
    let marketConditions = {};
    if (market_conditions) {
      try {
        marketConditions = JSON.parse(market_conditions);
      } catch (parseError) {
        logger.warn('Invalid market_conditions JSON:', parseError);
      }
    }
    
    const riskParams = riskParameterService.getRiskParameters(level, marketConditions);
    
    res.json({
      risk_level: level,
      parameters: riskParams,
      market_conditions: marketConditions,
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Risk parameter retrieval failed:', error);
    res.status(500).json({
      error: 'Risk parameter retrieval failed',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

// New endpoint for market regime analysis
app.get('/api/v1/market-regime/:symbol', authenticateAPI, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h' } = req.query;
    
    const marketData = MarketDataService.generateEnhancedData(symbol, timeframe, 100);
    const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
    
    res.json({
      symbol: symbol,
      market_regime: technicalData.market_regime,
      current_price: marketData.current_price,
      analysis_timeframe: timeframe,
      timestamp: Date.now()
    });
    
      } catch (error) {
    logger.error('Market regime analysis failed:', error);
    res.status(500).json({
      error: 'Market regime analysis failed',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

// New endpoint for comprehensive market analysis
app.get('/api/v1/market-analysis/:symbol', authenticateAPI, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h' } = req.query;
    
    const startTime = Date.now();
    
    // Get all data sources in parallel
    const [marketData, onChainData, offChainData] = await Promise.all([
      Promise.resolve(MarketDataService.generateEnhancedData(symbol, timeframe, 100)),
      signalGenerator.coinGeckoService.getOnChainAnalysis(symbol),
      offChainDataService.getComprehensiveOffChainData(symbol)
    ]);
    
    const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
  
  res.json({
      symbol: symbol,
      current_price: marketData.current_price,
      market_regime: technicalData.market_regime,
      technical_analysis: {
        rsi: technicalData.rsi,
        macd: technicalData.macd,
        bollinger_bands: technicalData.bollinger_bands,
        volatility: technicalData.volatility,
        volume_ratio: technicalData.volume_ratio
      },
      onchain_analysis: {
        source: onChainData.source,
        whale_activity: onChainData.whale_activity,
        sentiment_indicators: onChainData.sentiment_indicators,
        network_metrics: onChainData.network_metrics
      },
      offchain_analysis: {
        data_quality: offChainData.data_quality,
        funding_rates: offChainData.funding_rates,
        market_sentiment: offChainData.market_sentiment,
        volatility_indexes: offChainData.volatility_indexes,
        order_book_analysis: offChainData.order_book_analysis
      },
      analysis_performance: {
        generation_time_ms: Date.now() - startTime,
        data_completeness: calculateDataCompleteness(onChainData, offChainData)
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Comprehensive market analysis failed:', error);
    res.status(500).json({
      error: 'Market analysis failed',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

// Helper function for data completeness calculation
function calculateDataCompleteness(onChainData, offChainData) {
  let completeness = 0;
  let totalSources = 0;
  
  // On-chain data completeness
  if (onChainData.whale_activity) { completeness++; totalSources++; }
  if (onChainData.sentiment_indicators) { completeness++; totalSources++; }
  if (onChainData.network_metrics) { completeness++; totalSources++; }
  
  // Off-chain data completeness
  if (offChainData.funding_rates) { completeness++; totalSources++; }
  if (offChainData.market_sentiment) { completeness++; totalSources++; }
  if (offChainData.order_book_analysis) { completeness++; totalSources++; }
  
  return Math.round((completeness / totalSources) * 100);
}

// Load enhanced services
try {
  EnhancedSignalGenerator = require('./services/enhancedSignalGenerator');
  TaapiServiceClass = require('./services/taapiService');
  // Debug log for TAAPI_SECRET
  const taapiSecret = process.env.TAAPI_SECRET;
  if (taapiSecret) {
    console.log('TAAPI_SECRET is set:', taapiSecret.slice(0, 6) + '...' + taapiSecret.slice(-4));
  } else {
    console.warn('TAAPI_SECRET is NOT set!');
  }
  taapiService = new TaapiServiceClass();
  console.log('taapiService instance created:', !!taapiService);
  enhancedSignalGenerator = new EnhancedSignalGenerator(taapiService);
  console.log('enhancedSignalGenerator instance created:', !!enhancedSignalGenerator);
  console.log('Enhanced services loaded successfully');
} catch (error) {
  console.warn('Enhanced services not available:', error.message);
  EnhancedSignalGenerator = null;
  TaapiServiceClass = null;
  taapiService = null;
  enhancedSignalGenerator = null;
}


if (EnhancedSignalGenerator && taapiService) {
  try {
    enhancedSignalGenerator = new EnhancedSignalGenerator(taapiService);
    console.log('Enhanced Signal Generator initialized');
  } catch (error) {
    console.error('Failed to initialize Enhanced Signal Generator:', error.message);
    enhancedSignalGenerator = null;
  }
}

// ===============================================
// ENHANCED SIGNAL ENDPOINT
// ===============================================

app.post('/api/v1/enhanced-signal', authenticateAPI, async (req, res) => {
  try {
    const startTime = Date.now();
    let { 
      symbol, 
      timeframe = '1h',
      risk_level = 'balanced',
      use_taapi = true,
      avoid_bad_entries = true,
      include_reasoning = true
    } = req.body;

    logger.info(`Enhanced signal request for ${symbol}`, { 
      timeframe, 
      risk_level, 
      use_taapi,
      avoid_bad_entries 
    });

    // Validate symbol
    const isValid = await isValidSymbol(symbol);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid symbol: ${symbol}`,
        suggestion: 'Use an active USDT trading pair (e.g., BTCUSDT, ETHUSDT)',
        timestamp: Date.now()
      });
    }

    // Check if Taapi services are available
    if (use_taapi && (!enhancedSignalGenerator || !taapiService)) {
      logger.warn('Taapi services not available, falling back to base signal');
      use_taapi = true; // Fix: Changed from const to let and properly reassign
    }

    // Check if we should avoid entry (only if Taapi is active)
    let entryAvoidanceCheck = null;
    if (avoid_bad_entries && use_taapi && enhancedSignalGenerator) {
      try {
        entryAvoidanceCheck = await enhancedSignalGenerator.shouldAvoidEntry(symbol, timeframe);
        
        if (entryAvoidanceCheck.should_avoid) {
          return res.json({
            signal: 'AVOID',
            confidence: 0,
            reasoning: `Entry avoided: ${entryAvoidanceCheck.reasons.join(', ')}`,
            recommendation: entryAvoidanceCheck.recommendation,
            avoidance_factors: entryAvoidanceCheck.reasons,
            symbol,
            timeframe,
            enhanced_by: 'entry_avoidance_system',
            timestamp: Date.now(),
            processing_time_ms: Date.now() - startTime
          });
        }
      } catch (error) {
        logger.warn('Entry avoidance check failed:', error.message);
      }
    }

    // Get base market data
    const marketData = MarketDataService.generateEnhancedData(symbol, timeframe, 100);
    const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
    
    // Get on-chain and off-chain data
    const [onChainData, offChainData] = await Promise.all([
      signalGenerator.coinGeckoService.getOnChainAnalysis(symbol),
      offChainDataService.getComprehensiveOffChainData(symbol)
    ]);

    // Generate base signal with existing system
    const baseSignal = await signalGenerator.generateAdvancedSignal(
      marketData, 
      technicalData, 
      onChainData, 
      { symbol, timeframe, risk_level }
    );

    let finalSignal = baseSignal;

    // If Taapi is enabled and available, enhance the signal
    if (use_taapi && enhancedSignalGenerator) {
      try {
        finalSignal = await enhancedSignalGenerator.enhanceSignalWithTaapi(
          baseSignal,
          marketData,
          symbol,
          timeframe,
          risk_level
        );
        logger.info(`Signal enhanced with Taapi for ${symbol}`);
      } catch (error) {
        logger.warn('Taapi enhancement failed, using base signal:', error.message);
        finalSignal = baseSignal;
        finalSignal.warnings = finalSignal.warnings || [];
        finalSignal.warnings.push('Taapi enhancement unavailable - using base signal only');
        finalSignal.enhanced_by = 'fallback_mode';
      }
    } else {
      finalSignal.enhanced_by = 'base_system_only';
      if (use_taapi) {
        finalSignal.warnings = finalSignal.warnings || [];
        finalSignal.warnings.push('Taapi services not available');
      }
    }

    // Get risk parameters
    const riskParams = riskParameterService.getRiskParameters(risk_level, technicalData.market_regime);

    // Validate signal against risk parameters  
    const riskValidation = riskParameterService.validateSignalAgainstRiskParameters(
      finalSignal, 
      riskParams, 
      marketData
    );

    // Generate comprehensive reasoning
    let reasoning = null;
    if (include_reasoning) {
      reasoning = signalReasoningEngine.generateComprehensiveReasoning(
        finalSignal,
        technicalData,
        onChainData,
        offChainData,
        technicalData.market_regime,
        riskParams
      );
    }

    // Build comprehensive response
    const response = {
      // Core signal data
      signal: finalSignal.signal,
      confidence: finalSignal.confidence,
      entry_price: finalSignal.entry_price,
      stop_loss: finalSignal.stop_loss,
      take_profit_1: finalSignal.take_profit_1,
      take_profit_2: finalSignal.take_profit_2,
      take_profit_3: finalSignal.take_profit_3,
      position_size_percent: finalSignal.position_size_percent,
      
      // Enhanced analysis (only if Taapi was used)
      ...(use_taapi && finalSignal.taapi_analysis && {
        taapi_analysis: {
          bullish_signals: finalSignal.taapi_analysis.bullish_signals,
          bearish_signals: finalSignal.taapi_analysis.bearish_signals,
          neutral_signals: finalSignal.taapi_analysis.neutral_signals,
          market_strength: finalSignal.taapi_analysis.market_strength,
          trend_direction: finalSignal.taapi_analysis.trend_direction
        },
        indicator_confirmation: finalSignal.indicator_confirmation,
        signal_quality: finalSignal.signal_quality,
        risk_factors: finalSignal.risk_factors,
      }),

      // Signal validation
      ...(finalSignal.validation && {
        validation: finalSignal.validation
      }),

      // Market context
      market_context: {
        current_price: marketData.current_price,
        market_regime: technicalData.market_regime,
        volatility_environment: technicalData.volatility > 0.04 ? 'HIGH_VOLATILITY' : 
                               technicalData.volatility > 0.02 ? 'MODERATE_VOLATILITY' : 'LOW_VOLATILITY',
      },

      // Risk management
      risk_management: {
        risk_level: risk_level,
        risk_validation: riskValidation,
        max_position_size: riskParams.max_position_size,
        risk_per_trade: riskParams.risk_per_trade
      },

      // Entry quality assessment
      entry_quality: {
        should_avoid: entryAvoidanceCheck?.should_avoid || false,
        avoidance_factors: entryAvoidanceCheck?.reasons || [],
        recommendation: entryAvoidanceCheck?.recommendation || 'PROCEED',
        quality_score: finalSignal.signal_quality?.overall_score,
        quality_grade: finalSignal.signal_quality?.overall_grade
      },

      // Signal comparison (only if Taapi was used)
      ...(use_taapi && finalSignal.base_signal && {
        signal_comparison: {
          base_signal: finalSignal.base_signal,
          taapi_signal: finalSignal.taapi_signal,
          enhancement_method: finalSignal.enhanced_by
        }
      }),

      // Reasoning
      ...(reasoning && { reasoning }),

      // Warnings
      ...(finalSignal.warnings && { warnings: finalSignal.warnings }),

      // Technical summary
      technical_summary: {
        rsi: technicalData.rsi,
        macd: technicalData.macd,
        volatility: technicalData.volatility,
        volume_ratio: technicalData.volume_ratio
      },

      // Metadata
      metadata: {
        symbol,
        timeframe,
        taapi_enabled: use_taapi,
        taapi_available: !!(enhancedSignalGenerator && taapiService),
        avoidance_check_enabled: avoid_bad_entries,
        processing_time_ms: Date.now() - startTime,
        api_version: 'v1.1_enhanced',
        enhanced_by: finalSignal.enhanced_by,
        timestamp: Date.now()
      }
    };

    // Log successful enhanced signal generation
    logger.info(`Enhanced signal generated for ${symbol}`, {
      signal: finalSignal.signal,
      confidence: finalSignal.confidence,
      taapi_used: use_taapi,
      taapi_available: !!(enhancedSignalGenerator && taapiService),
      quality_score: finalSignal.signal_quality?.overall_score,
      processing_time: Date.now() - startTime
    });

    res.json(response);

  } catch (error) {
    logger.error('Enhanced signal generation failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Enhanced signal generation failed',
      message: error.message,
      fallback_suggestion: 'Try using /api/v1/signal endpoint without Taapi enhancement',
      timestamp: Date.now()
    });
  }
});

// ===============================================
// TAAPI HEALTH CHECK ENDPOINT
// ===============================================

app.get('/api/v1/taapi/health', authenticateAPI, async (req, res) => {
  try {
    if (!taapiService) {
      return res.json({
        taapi_status: 'unavailable',
        message: 'Taapi service not loaded',
        timestamp: Date.now()
      });
    }
    
    const isHealthy = await taapiService.testConnection();
    
    res.json({
      taapi_status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      message: isHealthy ? 'Taapi.io connection successful' : 'Taapi.io connection failed'
    });
    
  } catch (error) {
    res.status(500).json({
      taapi_status: 'error',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// New endpoint for bot execution instructions
app.post('/api/v1/bot-instructions', authenticateAPI, validateSignalRequest, async (req, res) => {
  try {
    const { 
      symbol, 
      timeframe = '1h', 
      risk_level = 'balanced',
      bot_type = 'python',
      custom_risk_params = null
    } = req.body;

    logger.info(`Bot instruction request for ${symbol}`, {
      timeframe,
      risk_level,
      bot_type
    });

    // Generate signal and context
    const marketData = MarketDataService.generateEnhancedData(symbol, timeframe, 100);
    const technicalData = TechnicalAnalysis.calculateAdvancedMetrics(marketData.prices, marketData.volumes);
    const onChainData = await signalGenerator.coinGeckoService.getOnChainAnalysis(symbol);
    const offChainData = await offChainDataService.getComprehensiveOffChainData(symbol);
    
    const riskParams = custom_risk_params ? 
      riskParameterService.getCustomRiskParameters(custom_risk_params, risk_level) :
      riskParameterService.getRiskParameters(risk_level, technicalData.market_regime);
    
    const signal = await signalGenerator.generateAdvancedSignal(
      marketData, 
      technicalData, 
      onChainData, 
      { symbol, timeframe, risk_level }
    );
    
    // Generate bot-specific instructions
    const botInstructions = botIntegrationService.translateSignalToBotInstructions(
      signal,
      riskParams,
      {
        symbol: symbol,
        market_regime: technicalData.market_regime,
        current_price: marketData.current_price
      }
    );

    res.json({
      symbol: symbol,
      bot_type: bot_type,
      signal_summary: {
        action: signal.signal,
        confidence: signal.confidence,
        market_phase: technicalData.market_regime.market_phase,
        strategy_type: botInstructions.trading_instruction.strategy_type
      },
      execution_instructions: botInstructions,
      implementation_guide: {
        python: botInstructions.bot_instructions.python_bot,
        ninjatrader: botInstructions.bot_instructions.ninjatrader,
        mt4_mt5: botInstructions.bot_instructions.mt4_mt5,
        custom_api: botInstructions.bot_instructions.custom_api
      },
      quick_start: {
        entry_method: botInstructions.position_management.entry_method,
        position_size: botInstructions.position_management.position_size,
        risk_management: botInstructions.risk_management,
        monitoring_points: botInstructions.monitoring.key_levels
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Bot instruction generation failed:', error);
    res.status(500).json({
      error: 'Bot instruction generation failed',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

// New endpoint for strategy validation
app.post('/api/v1/validate-strategy', authenticateAPI, async (req, res) => {
  try {
    const { 
      signal, 
      risk_params, 
      account_balance,
      existing_positions = []
    } = req.body;

    // Validate the strategy execution
    const validation = {
      signal_validation: {
        confidence_check: signal.confidence >= (risk_params.confidence_threshold || 50),
        position_size_check: signal.position_size_percent <= (risk_params.max_position_size || 5),
        risk_reward_check: signal.risk_reward_ratio >= 1.5
      },
      risk_validation: {
        account_balance_sufficient: account_balance > 0,
        position_size_appropriate: (signal.position_size_percent / 100) * account_balance < account_balance * 0.1,
        correlation_acceptable: existing_positions.length < 5 // Simplified check
      },
      execution_validation: {
        market_hours_appropriate: true, // Would check actual market hours
        liquidity_adequate: true, // Would check actual liquidity
        volatility_acceptable: signal.volatility_rating !== 'EXTREME'
      }
    };

    const overall_valid = Object.values(validation.signal_validation).every(v => v) &&
                         Object.values(validation.risk_validation).every(v => v) &&
                         Object.values(validation.execution_validation).every(v => v);

    res.json({
      valid: overall_valid,
      validation_details: validation,
      recommendations: overall_valid ? 
        ['Strategy validated - proceed with execution'] :
        ['Review failed validation points before execution'],
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error('Strategy validation failed:', error);
  res.status(500).json({
      error: 'Strategy validation failed',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

// ===============================================
// SERVER STARTUP
// ===============================================

// Initialize symbols on startup
async function initializeSymbols() {
  try {
    logger.info('Initializing symbol validation...');
    const symbols = await updateValidSymbols(true);
    logger.info(`Symbol validation initialized with ${symbols.length} valid pairs`);
  } catch (error) {
    logger.error('Failed to initialize symbols:', error);
    logger.warn('API will start with fallback symbols and retry in background');
  }
}

// Main startup function
async function startServer() {
  try {
    // Run startup diagnostics
    await logStartupStatus();
    
    // Start the server
const server = app.listen(PORT, () => {
  logger.info(`Enhanced Crypto Signal API server running on port ${PORT}`);
      logger.info(`AI Models: Claude 4 Sonnet + LunarCrush API`);
  logger.info(`Blockchain Coverage: 2,500+ EVM Networks`);
  logger.info(`Symbol Validation: Dynamic (Binance API)`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
  logger.info(`Documentation: http://localhost:${PORT}/api/docs`);
  
  // Initialize symbols after server starts
  initializeSymbols();
  
  // Set up periodic symbol updates
  setInterval(async () => {
    try {
      await updateValidSymbols();
      logger.info('Periodic symbol update completed');
    } catch (error) {
      logger.error('Periodic symbol update failed:', error);
    }
      }, 3600000); // Update every hour
});

// Graceful shutdown
process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
        logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
        logger.info('Server closed');
    process.exit(0);
  });
});
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;