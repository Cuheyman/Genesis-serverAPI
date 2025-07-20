const axios = require('axios');
const logger = require('../utils/logger');

class OffChainDataService {
  constructor() {
    // 🔥 CRITICAL FIX: Use SPOT API instead of FUTURES
    this.binanceBaseUrl = 'https://api.binance.com';
    this.fearGreedUrl = 'https://api.alternative.me/fng/';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.validSpotSymbols = new Set(); // Cache for valid spot symbols
    this.lastSymbolCheck = 0;
    this.symbolCheckInterval = 3600000; // 1 hour
  }

  // 🔥 NEW: Validate if symbol exists on Binance SPOT
  async ensureValidSpotSymbol(symbol) {
    const now = Date.now();
    
    // Refresh spot symbols cache periodically
    if (this.validSpotSymbols.size === 0 || (now - this.lastSymbolCheck) > this.symbolCheckInterval) {
      await this.updateSpotSymbols();
    }
    
    return this.validSpotSymbols.has(symbol);
  }

  // 🔥 NEW: Fetch valid spot symbols
  async updateSpotSymbols() {
    try {
      logger.info('Updating valid spot symbols...');
      
      const response = await axios.get(`${this.binanceBaseUrl}/api/v3/exchangeInfo`, {
        timeout: 10000
      });

      this.validSpotSymbols.clear();
      
      if (response.data && response.data.symbols) {
        response.data.symbols.forEach(symbolInfo => {
          if (symbolInfo.status === 'TRADING' && 
              symbolInfo.symbol.endsWith('USDT') &&
              symbolInfo.permissions.includes('SPOT')) {
            this.validSpotSymbols.add(symbolInfo.symbol);
          }
        });
      }
      
      this.lastSymbolCheck = Date.now();
      logger.info(`Updated spot symbols cache with ${this.validSpotSymbols.size} symbols`);
      
    } catch (error) {
      logger.error('Failed to update spot symbols:', error.message);
      
      // Fallback to basic USDT symbols if API fails
      const fallbackSymbols = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'SOLUSDT',
        'DOGEUSDT', 'MATICUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'UNIUSDT',
        'LTCUSDT', 'BCHUSDT', 'FILUSDT', 'TRXUSDT', 'ATOMUSDT', 'NEARUSDT',
        'PEPEUSDT', 'SHIBUSDT', 'FLOKIUSDT', 'BONKUSDT' // These exist on spot
      ];
      
      fallbackSymbols.forEach(symbol => this.validSpotSymbols.add(symbol));
      logger.warn(`Using fallback symbols: ${fallbackSymbols.length} symbols`);
    }
  }

  async getComprehensiveOffChainData(symbol) {
    try {
      // 🔥 CRITICAL FIX: Validate symbol first
      const isValid = await this.ensureValidSpotSymbol(symbol);
      if (!isValid) {
        logger.warn(`Symbol ${symbol} not available on spot, using fallback data`);
        return this.getFallbackOffChainData(symbol);
      }

      const cacheKey = `offchain_${symbol}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // 🔥 SPOT-SPECIFIC: Fetch spot market data instead of futures data
      const dataPromises = [
        this.getSpotTradingData(symbol).catch(err => {
          logger.error(`Spot trading data failed for ${symbol}:`, err.message);
          return this.getFallbackTradingData();
        }),
        this.getVolatilityIndexes(symbol).catch(err => {
          logger.error(`Volatility data failed for ${symbol}:`, err.message);
          return this.getFallbackVolatilityData();
        }),
        this.getOrderBookAnalysis(symbol).catch(err => {
          logger.error(`Order book failed for ${symbol}:`, err.message);
          return this.getFallbackOrderBookData();
        }),
        this.getPriceAnalysis(symbol).catch(err => {
          logger.error(`Price analysis failed for ${symbol}:`, err.message);
          return this.getFallbackPriceAnalysis();
        }),
        this.getVolumeAnalysis(symbol).catch(err => {
          logger.error(`Volume analysis failed for ${symbol}:`, err.message);
          return this.getFallbackVolumeAnalysis();
        }),
        this.getMarketSentiment().catch(err => {
          logger.error('Market sentiment failed:', err.message);
          return this.getFallbackMarketSentiment();
        })
      ];

      const [
        tradingData,
        volatilityData,
        orderBookData,
        priceAnalysis,
        volumeAnalysis,
        marketSentiment
      ] = await Promise.all(dataPromises);

      const offChainData = {
        trading_data: tradingData,
        volatility_indexes: volatilityData,
        order_book_analysis: orderBookData,
        price_analysis: priceAnalysis,
        volume_analysis: volumeAnalysis,
        market_sentiment: marketSentiment,
        data_quality: this.calculateDataQuality([tradingData, volatilityData, orderBookData, priceAnalysis, volumeAnalysis, marketSentiment]),
        timestamp: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: offChainData,
        timestamp: Date.now()
      });

      return offChainData;

    } catch (error) {
      logger.error('Error fetching off-chain data:', error);
      return this.getFallbackOffChainData(symbol);
    }
  }

  // 🔥 NEW: Spot trading data (replaces funding rates)
  async getSpotTradingData(symbol) {
    try {
      const requestConfig = {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)'
        }
      };

      // Get 24hr ticker statistics
      const tickerResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/ticker/24hr`,
        { symbol: symbol },
        requestConfig
      );

      const ticker = tickerResponse.data;

      // Get recent trades for momentum analysis
      const tradesResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/trades`,
        { symbol: symbol, limit: 100 },
        requestConfig
      );

      const trades = tradesResponse.data;

      return {
        price_change_24h: parseFloat(ticker.priceChangePercent),
        volume_24h: parseFloat(ticker.volume),
        quote_volume_24h: parseFloat(ticker.quoteVolume),
        high_24h: parseFloat(ticker.highPrice),
        low_24h: parseFloat(ticker.lowPrice),
        open_24h: parseFloat(ticker.openPrice),
        current_price: parseFloat(ticker.lastPrice),
        bid_price: parseFloat(ticker.bidPrice),
        ask_price: parseFloat(ticker.askPrice),
        spread_percentage: ((parseFloat(ticker.askPrice) - parseFloat(ticker.bidPrice)) / parseFloat(ticker.bidPrice)) * 100,
        trade_count_24h: parseInt(ticker.count),
        weighted_avg_price: parseFloat(ticker.weightedAvgPrice),
        price_momentum: this.calculatePriceMomentum(trades),
        trading_intensity: this.calculateTradingIntensity(ticker),
        price_efficiency: this.calculateSpotPriceEfficiency(ticker)
      };

    } catch (error) {
      logger.error('Error fetching spot trading data:', error.message);
      throw error;
    }
  }

  async getVolatilityIndexes(symbol) {
    try {
      const requestConfig = {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)'
        }
      };

      // Get 24h ticker for basic volatility
      const tickerResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/ticker/24hr`,
        { symbol: symbol },
        requestConfig
      );

      const ticker = tickerResponse.data;
      
      // Get kline data for historical volatility
      const klineResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/klines`,
        {
          symbol: symbol,
          interval: '1h',
          limit: 168 // 7 days
        },
        requestConfig
      );

      const klines = klineResponse.data;
      const closes = klines.map(k => parseFloat(k[4]));
      const highs = klines.map(k => parseFloat(k[2]));
      const lows = klines.map(k => parseFloat(k[3]));
      
      return {
        realized_volatility_24h: parseFloat(ticker.priceChangePercent) / 100,
        realized_volatility_7d: this.calculateHistoricalVolatility(closes, 168),
        high_low_range_24h: ((parseFloat(ticker.highPrice) - parseFloat(ticker.lowPrice)) / parseFloat(ticker.lowPrice)) * 100,
        volatility_rank: this.calculateVolatilityRank(closes),
        volatility_regime: this.determineVolatilityRegime(closes),
        volatility_trend: this.calculateVolatilityTrend(closes),
        price_efficiency: this.calculatePriceEfficiency(closes),
        true_range_avg: this.calculateAverageTrueRange(highs, lows, closes),
        volatility_clustering: this.detectVolatilityClustering(closes),
        volatility_forecast: this.forecastVolatility(closes)
      };

    } catch (error) {
      logger.error('Error fetching volatility data:', error.message);
      throw error;
    }
  }

  async getOrderBookAnalysis(symbol) {
    try {
      const requestConfig = {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)'
        }
      };

      const orderBookResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/depth`,
        {
          symbol: symbol,
          limit: 100
        },
        requestConfig
      );

      const orderBook = orderBookResponse.data;
      const bids = orderBook.bids.map(bid => ({ price: parseFloat(bid[0]), quantity: parseFloat(bid[1]) }));
      const asks = orderBook.asks.map(ask => ({ price: parseFloat(ask[0]), quantity: parseFloat(ask[1]) }));

      return {
        bid_ask_spread: asks[0].price - bids[0].price,
        spread_percentage: ((asks[0].price - bids[0].price) / bids[0].price) * 100,
        order_book_imbalance: this.calculateOrderBookImbalance(bids, asks),
        liquidity_depth: this.calculateLiquidityDepth(bids, asks),
        market_depth_ratio: this.calculateMarketDepthRatio(bids, asks),
        resistance_levels: this.identifyResistanceLevels(asks),
        support_levels: this.identifySupportLevels(bids),
        order_flow_prediction: this.predictOrderFlow(bids, asks),
        bid_volume_total: bids.reduce((sum, bid) => sum + bid.quantity, 0),
        ask_volume_total: asks.reduce((sum, ask) => sum + ask.quantity, 0),
        liquidity_score: this.calculateLiquidityScore(bids, asks)
      };

    } catch (error) {
      logger.error('Error fetching order book data:', error.message);
      throw error;
    }
  }

  // 🔥 NEW: Price analysis for spot trading
  async getPriceAnalysis(symbol) {
    try {
      const requestConfig = {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)'
        }
      };

      // Get kline data for price analysis
      const klineResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/klines`,
        {
          symbol: symbol,
          interval: '5m',
          limit: 100
        },
        requestConfig
      );

      const klines = klineResponse.data;
      const prices = klines.map(k => ({
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        timestamp: k[0]
      }));

      return {
        price_trend_short: this.calculatePriceTrend(prices.slice(-20)),
        price_trend_medium: this.calculatePriceTrend(prices.slice(-50)),
        support_resistance: this.identifySupportResistance(prices),
        momentum_indicators: this.calculateMomentumIndicators(prices),
        price_patterns: this.identifyPricePatterns(prices),
        breakout_probability: this.calculateBreakoutProbability(prices),
        price_targets: this.calculatePriceTargets(prices)
      };

    } catch (error) {
      logger.error('Error fetching price analysis:', error.message);
      throw error;
    }
  }

  // 🔥 NEW: Volume analysis for spot trading
  async getVolumeAnalysis(symbol) {
    try {
      const requestConfig = {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)'
        }
      };

      // Get 24hr ticker for volume data
      const tickerResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/ticker/24hr`,
        { symbol: symbol },
        requestConfig
      );

      const ticker = tickerResponse.data;

      // Get kline data for volume trend analysis
      const klineResponse = await this.makeRequestWithRetry(
        `${this.binanceBaseUrl}/api/v3/klines`,
        {
          symbol: symbol,
          interval: '1h',
          limit: 24
        },
        requestConfig
      );

      const klines = klineResponse.data;
      const volumes = klines.map(k => parseFloat(k[5]));

      return {
        volume_24h: parseFloat(ticker.volume),
        volume_trend: this.calculateVolumeTrend(volumes),
        volume_momentum: this.calculateVolumeMomentum(volumes),
        volume_distribution: this.analyzeVolumeDistribution(klines),
        unusual_volume: this.detectUnusualVolume(volumes),
        volume_weighted_price: this.calculateVWAP(klines),
        volume_profile: this.createVolumeProfile(klines)
      };

    } catch (error) {
      logger.error('Error fetching volume analysis:', error.message);
      throw error;
    }
  }

  // 🔥 NEW: Request retry mechanism
  async makeRequestWithRetry(url, params, config, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          ...config,
          params: params
        });
        
        return response;
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  async getMarketSentiment() {
    try {
      const response = await axios.get(this.fearGreedUrl, { timeout: 5000 });
      const data = response.data.data[0];
      
      return {
        fear_greed_index: parseInt(data.value),
        classification: data.value_classification,
        timestamp: data.timestamp,
        sentiment_trend: this.calculateSentimentTrend(response.data.data.slice(0, 7))
      };
    } catch (error) {
      logger.error('Error fetching market sentiment:', error.message);
      return this.getFallbackMarketSentiment();
    }
  }

  // Helper calculation methods
  calculateHistoricalVolatility(closes, periods) {
    if (closes.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i-1]));
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 365); // Annualized volatility
  }

  calculatePriceMomentum(trades) {
    if (!trades || trades.length < 10) return 0;
    
    const recentTrades = trades.slice(-20);
    const buyVolume = recentTrades.filter(trade => !trade.isBuyerMaker).reduce((sum, trade) => sum + parseFloat(trade.qty), 0);
    const sellVolume = recentTrades.filter(trade => trade.isBuyerMaker).reduce((sum, trade) => sum + parseFloat(trade.qty), 0);
    
    return (buyVolume - sellVolume) / (buyVolume + sellVolume);
  }

  calculateTradingIntensity(ticker) {
    const volumeRatio = parseFloat(ticker.volume) / parseFloat(ticker.count);
    const priceVolatility = Math.abs(parseFloat(ticker.priceChangePercent));
    
    return volumeRatio * (1 + priceVolatility / 100);
  }

  calculateSpotPriceEfficiency(ticker) {
    const highLowRange = parseFloat(ticker.highPrice) - parseFloat(ticker.lowPrice);
    const openCloseRange = Math.abs(parseFloat(ticker.lastPrice) - parseFloat(ticker.openPrice));
    
    if (highLowRange === 0) return 1;
    return openCloseRange / highLowRange;
  }

  calculateAverageTrueRange(highs, lows, closes) {
    if (highs.length < 2) return 0;
    
    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i-1]);
      const tr3 = Math.abs(lows[i] - closes[i-1]);
      
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    return trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
  }

  calculateOrderBookImbalance(bids, asks) {
    const bidVolume = bids.slice(0, 10).reduce((sum, bid) => sum + bid.quantity, 0);
    const askVolume = asks.slice(0, 10).reduce((sum, ask) => sum + ask.quantity, 0);
    
    return (bidVolume - askVolume) / (bidVolume + askVolume);
  }

  calculateLiquidityDepth(bids, asks) {
    const bidDepth = bids.slice(0, 20).reduce((sum, bid) => sum + (bid.price * bid.quantity), 0);
    const askDepth = asks.slice(0, 20).reduce((sum, ask) => sum + (ask.price * ask.quantity), 0);
    
    return (bidDepth + askDepth) / 2;
  }

  calculateLiquidityScore(bids, asks) {
    const spread = asks[0].price - bids[0].price;
    const midPrice = (asks[0].price + bids[0].price) / 2;
    const spreadPercent = (spread / midPrice) * 100;
    
    const depth = this.calculateLiquidityDepth(bids, asks);
    
    // Lower spread and higher depth = higher liquidity score
    return Math.max(0, 100 - (spreadPercent * 10)) * (Math.log(depth + 1) / 10);
  }

  // Fallback data methods
  getFallbackTradingData() {
    return {
      price_change_24h: 0,
      volume_24h: 0,
      quote_volume_24h: 0,
      spread_percentage: 0.1,
      trade_count_24h: 0,
      price_momentum: 0,
      trading_intensity: 0.5,
      price_efficiency: 0.5
    };
  }

  getFallbackVolatilityData() {
    return {
      realized_volatility_24h: 0.02,
      realized_volatility_7d: 0.15,
      volatility_rank: 'MEDIUM',
      volatility_regime: 'NORMAL_VOLATILITY',
      volatility_trend: 'STABLE',
      price_efficiency: 0.5,
      volatility_clustering: 2,
      volatility_forecast: 0.15
    };
  }

  getFallbackOrderBookData() {
    return {
      bid_ask_spread: 0.01,
      spread_percentage: 0.1,
      order_book_imbalance: 0,
      liquidity_depth: 1000,
      market_depth_ratio: 1.0,
      liquidity_score: 50
    };
  }

  getFallbackPriceAnalysis() {
    return {
      price_trend_short: 'NEUTRAL',
      price_trend_medium: 'NEUTRAL',
      momentum_indicators: { rsi: 50, macd: 0 },
      breakout_probability: 0.3
    };
  }

  getFallbackVolumeAnalysis() {
    return {
      volume_24h: 0,
      volume_trend: 'STABLE',
      volume_momentum: 0,
      unusual_volume: false
    };
  }

  getFallbackMarketSentiment() {
    return {
      fear_greed_index: 50,
      classification: 'Neutral',
      timestamp: Date.now(),
      sentiment_trend: 'STABLE'
    };
  }

  getFallbackOffChainData(symbol) {
    return {
      trading_data: this.getFallbackTradingData(),
      volatility_indexes: this.getFallbackVolatilityData(),
      order_book_analysis: this.getFallbackOrderBookData(),
      price_analysis: this.getFallbackPriceAnalysis(),
      volume_analysis: this.getFallbackVolumeAnalysis(),
      market_sentiment: this.getFallbackMarketSentiment(),
      data_quality: 25, // Low quality due to fallback
      timestamp: Date.now()
    };
  }

  calculateDataQuality(dataArray) {
    const successfulFetches = dataArray.filter(result => result !== null && typeof result === 'object').length;
    return (successfulFetches / dataArray.length) * 100;
  }

  // Additional helper methods (simplified implementations)
  calculateVolatilityRank(closes) {
    const volatility = this.calculateHistoricalVolatility(closes, closes.length);
    if (volatility > 1.0) return 'HIGH';
    if (volatility > 0.5) return 'MEDIUM';
    return 'LOW';
  }

  determineVolatilityRegime(closes) {
    const shortVol = this.calculateHistoricalVolatility(closes.slice(-24), 24);
    const longVol = this.calculateHistoricalVolatility(closes, closes.length);
    
    if (shortVol > longVol * 1.5) return 'HIGH_VOLATILITY';
    if (shortVol < longVol * 0.7) return 'LOW_VOLATILITY';
    return 'NORMAL_VOLATILITY';
  }

  calculateVolatilityTrend(closes) {
    const recent = this.calculateHistoricalVolatility(closes.slice(-48), 48);
    const previous = this.calculateHistoricalVolatility(closes.slice(-96, -48), 48);
    
    if (recent > previous * 1.1) return 'INCREASING';
    if (recent < previous * 0.9) return 'DECREASING';
    return 'STABLE';
  }

  calculatePriceEfficiency(closes) {
    if (closes.length < 10) return 0.5;
    
    const directPath = Math.abs(closes[closes.length - 1] - closes[0]);
    const actualPath = closes.reduce((sum, price, index) => {
      if (index === 0) return 0;
      return sum + Math.abs(price - closes[index - 1]);
    }, 0);
    
    return actualPath > 0 ? directPath / actualPath : 0.5;
  }

  detectVolatilityClustering(closes) {
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.abs(Math.log(closes[i] / closes[i-1])));
    }
    
    let clusters = 0;
    let inCluster = false;
    const threshold = returns.reduce((sum, ret) => sum + ret, 0) / returns.length * 1.5;
    
    returns.forEach(ret => {
      if (ret > threshold) {
        if (!inCluster) {
          clusters++;
          inCluster = true;
        }
      } else {
        inCluster = false;
      }
    });
    
    return clusters;
  }

  forecastVolatility(closes) {
    const recentVol = this.calculateHistoricalVolatility(closes.slice(-24), 24);
    const trend = this.calculateVolatilityTrend(closes);
    
    let forecast = recentVol;
    if (trend === 'INCREASING') forecast *= 1.1;
    if (trend === 'DECREASING') forecast *= 0.9;
    
    return forecast;
  }

  calculateMarketDepthRatio(bids, asks) {
    const bidDepth = bids.slice(0, 10).reduce((sum, bid) => sum + bid.quantity, 0);
    const askDepth = asks.slice(0, 10).reduce((sum, ask) => sum + ask.quantity, 0);
    
    return askDepth > 0 ? bidDepth / askDepth : 1;
  }

  identifyResistanceLevels(asks) {
    return asks.slice(0, 5).map(ask => ask.price);
  }

  identifySupportLevels(bids) {
    return bids.slice(0, 5).map(bid => bid.price);
  }

  predictOrderFlow(bids, asks) {
    const imbalance = this.calculateOrderBookImbalance(bids, asks);
    if (imbalance > 0.2) return 'BULLISH';
    if (imbalance < -0.2) return 'BEARISH';
    return 'NEUTRAL';
  }

  calculateSentimentTrend(data) {
    if (data.length < 3) return 'STABLE';
    
    const recent = data.slice(0, 3).map(d => parseInt(d.value));
    const trend = recent[0] - recent[2];
    
    if (trend > 10) return 'IMPROVING';
    if (trend < -10) return 'DECLINING';
    return 'STABLE';
  }

  // Additional placeholder methods for comprehensive functionality
  calculatePriceTrend(prices) { return 'NEUTRAL'; }
  identifySupportResistance(prices) { return { support: [], resistance: [] }; }
  calculateMomentumIndicators(prices) { return { rsi: 50, macd: 0 }; }
  identifyPricePatterns(prices) { return []; }
  calculateBreakoutProbability(prices) { return 0.3; }
  calculatePriceTargets(prices) { return { upside: 0, downside: 0 }; }
  calculateVolumeTrend(volumes) { return 'STABLE'; }
  calculateVolumeMomentum(volumes) { return 0; }
  analyzeVolumeDistribution(klines) { return { distribution: 'NORMAL' }; }
  detectUnusualVolume(volumes) { return false; }
  calculateVWAP(klines) { return 0; }
  createVolumeProfile(klines) { return {}; }
}

module.exports = OffChainDataService;