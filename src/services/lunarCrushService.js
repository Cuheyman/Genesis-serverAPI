const axios = require('axios');

// Use the configured logger from the main application
let logger;

// Initialize logger when the service is loaded
try {
  const winston = require('winston');
  logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'logs/lunarCrush.log' })
    ]
  });
} catch (error) {
  // Fallback to console if winston is not available
  logger = {
    info: (msg, data) => console.log(`[INFO] ${msg}`, data),
    warn: (msg, data) => console.warn(`[WARN] ${msg}`, data),
    error: (msg, data) => console.error(`[ERROR] ${msg}`, data)
  };
}

class CoinGeckoService {
  constructor() {
    this.baseURL = 'https://api.coingecko.com/api/v3';
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes cache (longer to reduce API calls)
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // 100ms between requests (minimal delay)
    this.fallbackOnly = process.env.COINGECKO_FALLBACK_ONLY === 'true';
    this.rateLimitHit = false;
    
    // Multiple API Key Support
    this.apiKeys = [
      process.env.COINGECKO_API_KEY_1,
      process.env.COINGECKO_API_KEY_2,
      process.env.COINGECKO_API_KEY_3
    ].filter(key => key && key.trim() !== ''); // Remove undefined/empty keys
    
    this.currentKeyIndex = 0;
    this.keyUsage = new Map(); // Track usage per key
    
    // Initialize key usage tracking
    this.apiKeys.forEach((key, index) => {
      this.keyUsage.set(index, {
        dailyCount: 0,
        hourlyCount: 0,
        lastDailyReset: Date.now(),
        lastHourlyReset: Date.now(),
        lastRequestTime: 0,
        rateLimitHit: false
      });
    });
    
    // Very aggressive limits - use API keys to the max
    this.maxDailyRequestsPerKey = 10000; // Use full monthly limit per day
    this.maxHourlyRequestsPerKey = 2000; // Very high hourly limit
    
    logger.info(`CoinGecko service initialized with ${this.apiKeys.length} API keys`);
  }

  // Get next available API key
  getNextAvailableKey() {
    if (this.apiKeys.length === 0) {
      logger.warn('No CoinGecko API keys configured');
      return null;
    }

    // Try each key starting from current index
    for (let i = 0; i < this.apiKeys.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      const keyStats = this.keyUsage.get(keyIndex);
      
      if (!this.isKeyAtLimit(keyIndex)) {
        this.currentKeyIndex = keyIndex;
        // logger.info(`Using API key ${keyIndex + 1} for request`); // Reduced logging
        return { key: this.apiKeys[keyIndex], index: keyIndex };
      }
    }
    
    logger.warn('All API keys are at their rate limits');
    return null;
  }

  // Check if a specific key is at its rate limit
  isKeyAtLimit(keyIndex) {
    const keyStats = this.keyUsage.get(keyIndex);
    if (!keyStats) return true;
    
    const now = Date.now();
    
    // Only check for actual rate limit hits from CoinGecko - NO OTHER LIMITS
    if (keyStats.rateLimitHit) {
      // Reset rate limit flag after 1 hour
      if (now - keyStats.lastRequestTime > 60 * 60 * 1000) {
        keyStats.rateLimitHit = false;
        logger.info(`Key ${keyIndex + 1} rate limit flag reset after 1 hour`);
        return false;
      } else {
        logger.info(`Key ${keyIndex + 1} previously hit rate limit`);
        return true;
      }
    }
    
    // NO artificial rate limiting - key is always available unless CoinGecko says no
    return false;
  }

  // Update key usage statistics
  updateKeyUsage(keyIndex, success = true) {
    const keyStats = this.keyUsage.get(keyIndex);
    if (!keyStats) return;
    
    keyStats.lastRequestTime = Date.now();
    
    if (success) {
      keyStats.dailyCount++;
      keyStats.hourlyCount++;
      // logger.info(`Key ${keyIndex + 1} usage updated: Daily ${keyStats.dailyCount}/${this.maxDailyRequestsPerKey}, Hourly ${keyStats.hourlyCount}/${this.maxHourlyRequestsPerKey}`); // Reduced logging
    } else {
      keyStats.rateLimitHit = true;
      logger.warn(`Key ${keyIndex + 1} hit rate limit, marking as unavailable`);
    }
  }

  // Queue system for rate limiting
  async queueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      logger.info(`Request queued. Queue length: ${this.requestQueue.length}`);
      this.processQueue();
    });
  }

  // Check if we should use fallback based on rate limits
  shouldUseFallback() {
    // If no API keys configured, use fallback
    if (this.apiKeys.length === 0) {
      logger.info('No API keys configured, using fallback');
      return true;
    }
    
    // If fallback mode is enabled, use fallback
    if (this.fallbackOnly) {
      logger.info('Fallback-only mode enabled, using fallback');
      return true;
    }
    
    // Check if any API key is available
    const availableKey = this.getNextAvailableKey();
    if (!availableKey) {
      logger.info('All API keys are at their limits, using fallback');
      return true;
    }
    
    return false;
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    logger.info(`Processing queue. Items in queue: ${this.requestQueue.length}`);

    while (this.requestQueue.length > 0) {
      const { requestFn, resolve, reject } = this.requestQueue.shift();
      let keyInfo = null;
      
      try {
        // Check if we should use fallback
        if (this.shouldUseFallback()) {
          logger.info('Using fallback due to rate limits');
          resolve(await this.getFallbackData());
          continue;
        }

        // Get next available API key
        keyInfo = this.getNextAvailableKey();
        if (!keyInfo) {
          logger.info('No available API keys, using fallback');
          resolve(await this.getFallbackData());
          continue;
        }

        // NO artificial delays - send requests immediately
        
        logger.info(`Making CoinGecko request with key ${keyInfo.index + 1}. Queue remaining: ${this.requestQueue.length}`);
        
        // Execute the request with the selected API key
        const result = await requestFn(keyInfo.key);
        
        // Update key usage on success
        this.updateKeyUsage(keyInfo.index, true);
        logger.info(`CoinGecko request successful with key ${keyInfo.index + 1}. Queue remaining: ${this.requestQueue.length}`);
        resolve(result);
      } catch (error) {
        logger.error(`CoinGecko request failed:`, error.message);
        
        // If we have key info and it's a rate limit error, mark the key as hit
        if (error.response?.status === 429 && keyInfo) {
          this.updateKeyUsage(keyInfo.index, false);
        }
        
        reject(error);
      }
    }

    this.isProcessing = false;
    logger.info('Queue processing complete');
  }

  // Helper method to get fallback data
  async getFallbackData() {
    return {
      source: 'fallback',
      timestamp: new Date().toISOString(),
      data: this.getFallbackMarketData(),
      reason: 'daily_limit_reached'
    };
  }

  async getCoinData(symbol) {
    // Check if we should use fallback
    if (this.shouldUseFallback()) {
      logger.info(`Using fallback data for ${symbol} (rate limiting)`);
      return this.getFallbackCoinData(symbol);
    }

    return this.queueRequest(async (apiKey) => {
      const cacheKey = `coin_${symbol}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }
      try {
        // CoinGecko uses ids like 'bitcoin', 'ethereum', etc.
        const id = this.symbolToId(symbol);
        if (!id) {
          logger.warn(`No CoinGecko ID found for symbol: ${symbol}`);
          return this.getFallbackCoinData(symbol);
        }
        
        const url = `${this.baseURL}/coins/${id}`;
        const headers = {
          'Accept': 'application/json',
          'User-Agent': 'GenesisAI-TradingBot/1.0'
        };
        
        // Add API key to headers if available
        if (apiKey) {
          headers['x-cg-demo-api-key'] = apiKey;
        }
        
        const response = await axios.get(url, { 
          timeout: 10000,
          headers: headers
        });
        
        if (response.status === 429) {
          logger.warn('CoinGecko rate limit hit, switching to fallback mode');
          throw new Error('Rate limit exceeded');
        }
        
        console.log('CoinGecko getCoinData raw response:', response.data ? 'Data received' : 'Empty response');
        const data = this.parseCoinData(response.data);
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        if (error.response?.status === 429) {
          logger.warn('CoinGecko rate limit exceeded');
          throw error;
        } else {
          logger.error('CoinGecko coin data request failed:', error?.response?.data || error?.message || error);
        }
        return this.getFallbackCoinData(symbol);
      }
    });
  }

  async getMarketMetrics(symbol) {
    // Check if we should use fallback
    if (this.shouldUseFallback()) {
      logger.info(`Using fallback market data for ${symbol} (rate limiting)`);
      return this.getFallbackMarketData();
    }

    return this.queueRequest(async (apiKey) => {
      try {
        const coinId = this.symbolToId(symbol);
        if (!coinId) {
          logger.warn(`No CoinGecko ID found for symbol: ${symbol}`);
          return this.getFallbackMarketData();
        }

        const url = `https://api.coingecko.com/api/v3/coins/${coinId}`;
        const headers = {
          'Accept': 'application/json',
          'User-Agent': 'GenesisAI-TradingBot/1.0'
        };
        
        // Add API key to headers if available
        if (apiKey) {
          headers['x-cg-demo-api-key'] = apiKey;
        }
        
        const response = await axios.get(url, {
          timeout: 10000,
          headers: headers
        });

        if (response.status === 429) {
          logger.warn('CoinGecko rate limit hit');
          throw new Error('Rate limit exceeded');
        }

        const data = response.data;
        
        // Log the raw response for debugging
        console.log(`CoinGecko getMarketMetrics raw response:`, data ? 'Data received' : 'Empty response');
        
        if (!data || !data.market_data) {
          logger.warn(`Invalid CoinGecko response for ${symbol}`);
          return this.getFallbackMarketData();
        }

        return {
          current_price: data.market_data.current_price?.usd || 0,
          market_cap: data.market_data.market_cap?.usd || 0,
          volume_24h: data.market_data.total_volume?.usd || 0,
          price_change_24h: data.market_data.price_change_24h || 0,
          price_change_percentage_24h: data.market_data.price_change_percentage_24h || 0,
          circulating_supply: data.market_data.circulating_supply || 0,
          total_supply: data.market_data.total_supply || 0,
          max_supply: data.market_data.max_supply || 0,
          ath: data.market_data.ath?.usd || 0,
          ath_change_percentage: data.market_data.ath_change_percentage?.usd || 0,
          atl: data.market_data.atl?.usd || 0,
          atl_change_percentage: data.market_data.atl_change_percentage?.usd || 0,
          last_updated: data.last_updated,
          source: 'coingecko'
        };
      } catch (error) {
        if (error.response?.status === 429) {
          logger.warn('CoinGecko rate limit exceeded');
          throw error;
        } else {
          logger.error('CoinGecko market metrics request failed:', error.response?.data || error.message);
        }
        return this.getFallbackMarketData();
      }
    });
  }

  async getComprehensiveAnalysis(symbol, walletAddress = null) {
    try {
      // Use sequential requests instead of Promise.all to respect rate limiting
      const coinData = await this.getCoinData(symbol);
      const marketData = await this.getMarketMetrics(symbol);
      
      return {
        source: 'coingecko',
        timestamp: new Date().toISOString(),
        symbol: symbol,
        coin_data: coinData,
        market_metrics: marketData,
        sentiment_score: 0, // CoinGecko does not provide social sentiment
        market_sentiment: this.calculateMarketSentiment(marketData),
        whale_activity: {}, // Not available from CoinGecko
        social_velocity: {}, // Not available from CoinGecko
        risk_indicators: this.calculateRiskIndicators(coinData, {}, marketData),
        confidence_score: this.calculateConfidenceScore(coinData, {}, marketData)
      };
    } catch (error) {
      logger.error('Comprehensive CoinGecko analysis failed:', error?.response?.data || error?.message || error);
      return this.getFallbackComprehensiveData(symbol);
    }
  }

  symbolToId(symbol) {
    // Map common symbols to CoinGecko ids
    const map = {
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'ADAUSDT': 'cardano',
      'SOLUSDT': 'solana',
      'XRPUSDT': 'ripple',
      'BNBUSDT': 'binancecoin',
      'DOGEUSDT': 'dogecoin',
      'MATICUSDT': 'matic-network',
      'DOTUSDT': 'polkadot',
      'LTCUSDT': 'litecoin',
      'USDCUSDT': 'usd-coin',
      'BCHUSDT': 'bitcoin-cash',
      'LINKUSDT': 'chainlink',
      'TRXUSDT': 'tron',
      'AVAXUSDT': 'avalanche-2',
      'SHIBUSDT': 'shiba-inu',
      'WBTCUSDT': 'wrapped-bitcoin',
      'UNIUSDT': 'uniswap',
      'XLMUSDT': 'stellar',
      'ATOMUSDT': 'cosmos',
      'ETCUSDT': 'ethereum-classic',
      'FILUSDT': 'filecoin',
      'APTUSDT': 'aptos',
      'ARBUSDT': 'arbitrum',
      'OPUSDT': 'optimism',
      'SUIUSDT': 'sui',
      'PEPEUSDT': 'pepe',
      'TUSDUSDT': 'true-usd',
      'DAIUSDT': 'dai',
      'FDUSDUSDT': 'first-digital-usd',
      'RNDRUSDT': 'render-token',
      'INJUSDT': 'injective-protocol',
      'BUSDUSDT': 'binance-usd',
      'AAVEUSDT': 'aave',
      'STETHUSDT': 'staked-ether',
      'LDOUSDT': 'lido-dao',
      'MKRUSDT': 'maker',
      'QNTUSDT': 'quant-network',
      'NEARUSDT': 'near',
      'GRTUSDT': 'the-graph',
      'ALGOUSDT': 'algorand',
      'EGLDUSDT': 'elrond-erd-2',
      'CRVUSDT': 'curve-dao-token',
      'SANDUSDT': 'the-sandbox',
      'AXSUSDT': 'axie-infinity',
      'IMXUSDT': 'immutable-x',
      'MANAUSDT': 'decentraland',
      'FTMUSDT': 'fantom',
      'XMRUSDT': 'monero',
      'HBARUSDT': 'hedera-hashgraph',
      'KAVAUSDT': 'kava',
      'RUNEUSDT': 'thorchain',
      'CROUSDT': 'crypto-com-chain',
      'MINAUSDT': 'mina-protocol',
      'GMXUSDT': 'gmx',
      'DYDXUSDT': 'dydx',
      'LUNCUSDT': 'terra-luna',
      'LUNAUSDT': 'terra-luna-2',
      'ONEUSDT': 'harmony',
      'ZECUSDT': 'zcash',
      'XEMUSDT': 'nem',
      'ONTUSDT': 'ontology',
      'ICXUSDT': 'icon',
      'QTUMUSDT': 'qtum',
      'ZENUSDT': 'horizen',
      'DASHUSDT': 'dash',
      'ENJUSDT': 'enjincoin',
      'YFIUSDT': 'yearn-finance',
      'COMPUSDT': 'compound-governance-token',
      'BATUSDT': 'basic-attention-token',
      'ZRXUSDT': '0x',
      'OMGUSDT': 'omisego',
      'BNTUSDT': 'bancor',
      'BALUSDT': 'balancer',
      'SRMUSDT': 'serum',
      'SUSHIUSDT': 'sushi',
      'RENUSDT': 'ren',
      'CVCUSDT': 'civic',
      'ANKRUSDT': 'ankr',
      'OCEANUSDT': 'ocean-protocol',
      'STMXUSDT': 'stormx',
      'CHRUSDT': 'chromia',
      'BANDUSDT': 'band-protocol',
      'ALICEUSDT': 'my-neighbor-alice',
      'CTSIUSDT': 'cartesi',
      'DGBUSDT': 'digibyte',
      'NKNUSDT': 'nkn',
      'DOCKUSDT': 'dock',
      'TWTUSDT': 'trust-wallet-token',
      'API3USDT': 'api3',
      'FETUSDT': 'fetch-ai',
      'AGIXUSDT': 'singularitynet',
      'GALAUSDT': 'gala',
      'SXPUSDT': 'solar',
      'BICOUSDT': 'biconomy',
      'IDUSDT': 'space-id',
      'JOEUSDT': 'joe',
      'LITUSDT': 'litentry',
      'MOVRUSDT': 'moonriver',
      'GLMRUSDT': 'moonbeam',
      'ASTRUSDT': 'astar',
      'ACAUSDT': 'acala',
      'KSMUSDT': 'kusama',
      'PHAUSDT': 'pha',
      'CFGUSDT': 'centrifuge',
      'BONDUSDT': 'barnbridge',
      'RAYUSDT': 'raydium',
      'PORTOUSDT': 'porto',
      'CITYUSDT': 'manchester-city-fan-token',
      'PSGUSDT': 'paris-saint-germain-fan-token',
      'JUVUSDT': 'juventus-fan-token',
      'ATMUSDT': 'atletico-madrid-fan-token',
      'ASRUSDT': 'as-roma-fan-token',
      'BARUSDT': 'fc-barcelona-fan-token',
      'OGUSDT': 'og-fan-token',
      'NMRUSDT': 'numeraire',
      'FORTHUSDT': 'ampleforth-governance-token',
      'MLNUSDT': 'melon',
      'RLCUSDT': 'iexec-rlc',
      'PAXGUSDT': 'pax-gold',
      'USDTUSDT': 'tether',
    };
    return map[symbol] || symbol.replace('USDT', '').toLowerCase();
  }

  parseCoinData(data) {
    if (!data || !data.market_data) return this.getFallbackCoinData();
    return {
      price: data.market_data.current_price.usd || 0,
      price_change_24h: data.market_data.price_change_percentage_24h || 0,
      volume_24h: data.market_data.total_volume.usd || 0,
      market_cap: data.market_data.market_cap.usd || 0,
      circulating_supply: data.market_data.circulating_supply || 0,
      max_supply: data.market_data.max_supply || 0,
      dominance: data.market_cap_rank || 0,
      rank: data.market_cap_rank || 0,
      volatility: 0 // Not available from CoinGecko
    };
  }

  parseMarketData(data) {
    if (!data) return this.getFallbackMarketData();
    return {
      price: data.current_price || 0,
      volume_24h: data.total_volume || 0,
      market_cap: data.market_cap || 0,
      liquidity: 0, // Not available
      bid_ask_spread: 0, // Not available
      volatility: 0, // Not available
      sharpe_ratio: 0, // Not available
      sortino_ratio: 0, // Not available
      max_drawdown: 0, // Not available
      value_at_risk: 0 // Not available
    };
  }

  calculateMarketSentiment(marketData) {
    const {
      price_change_24h = 0,
      volume_24h = 0,
      volatility = 0
    } = marketData;

    // Positive sentiment for price increases and high volume
    let sentiment = 0;
    
    if (price_change_24h > 0) {
      sentiment += Math.min(price_change_24h / 10, 0.5);
    } else {
      sentiment -= Math.min(Math.abs(price_change_24h) / 10, 0.5);
    }

    // Volume impact
    if (volume_24h > 1000000) {
      sentiment += 0.2;
    }

    // Volatility penalty
    if (volatility > 50) {
      sentiment -= 0.1;
    }

    return Math.max(-1, Math.min(1, sentiment));
  }

  calculateRiskIndicators(coinData, socialData, marketData) {
    const {
      volatility = 0,
      max_drawdown = 0,
      value_at_risk = 0
    } = marketData;

    const {
      social_score = 0
    } = socialData;

    return {
      volatility_risk: Math.min(volatility / 100, 1),
      drawdown_risk: Math.min(max_drawdown / 50, 1),
      var_risk: Math.min(value_at_risk / 20, 1),
      social_risk: social_score < -50 ? 0.5 : 0,
      overall_risk: Math.min((volatility + max_drawdown + value_at_risk) / 150, 1)
    };
  }

  calculateConfidenceScore(coinData, socialData, marketData) {
    const {
      volume_24h = 0,
      market_cap = 0
    } = coinData;

    const {
      social_volume = 0,
      social_contributors = 0
    } = socialData;

    const {
      liquidity = 0
    } = marketData;

    // Higher confidence for higher volume, market cap, and social activity
    let confidence = 0.5; // Base confidence

    if (volume_24h > 1000000) confidence += 0.2;
    if (market_cap > 100000000) confidence += 0.1;
    if (social_volume > 1000) confidence += 0.1;
    if (social_contributors > 100) confidence += 0.1;
    if (liquidity > 100000) confidence += 0.1;

    return Math.min(confidence, 1);
  }

  // Fallback data methods
  getFallbackCoinData(symbol = 'BTC') {
    return {
      price: 45000,
      price_change_24h: 2.5,
      volume_24h: 2500000000,
      market_cap: 850000000000,
      circulating_supply: 19500000,
      max_supply: 21000000,
      dominance: 45.2,
      rank: 1,
      volatility: 35.5
    };
  }

  getFallbackMarketData(symbol = 'BTC') {
    return {
      price: 45000,
      volume_24h: 2500000000,
      market_cap: 850000000000,
      liquidity: 500000000,
      bid_ask_spread: 0.1,
      volatility: 35.5,
      sharpe_ratio: 1.2,
      sortino_ratio: 1.8,
      max_drawdown: 15.5,
      value_at_risk: 8.5
    };
  }

  getFallbackComprehensiveData(symbol) {
    return {
      source: 'coingecko_fallback',
      timestamp: new Date().toISOString(),
      symbol: symbol,
      coin_data: this.getFallbackCoinData(symbol),
      market_metrics: this.getFallbackMarketData(symbol),
      sentiment_score: 0.3,
      market_sentiment: 0.4,
      risk_indicators: {
        volatility_risk: 0.3,
        drawdown_risk: 0.2,
        var_risk: 0.4,
        social_risk: 0,
        overall_risk: 0.3
      },
      confidence_score: 0.6
    };
  }

  // Add delay utility function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CoinGeckoService; 