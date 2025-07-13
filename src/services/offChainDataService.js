const axios = require('axios');
const logger = require('../utils/logger');

class OffChainDataService {
  constructor() {
    this.binanceBaseUrl = 'https://fapi.binance.com';
    this.fearGreedUrl = 'https://api.alternative.me/fng/';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  async getComprehensiveOffChainData(symbol) {
    try {
      const cacheKey = `offchain_${symbol}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // Fetch all off-chain data sources in parallel
      const [
        fundingRates,
        volatilityData,
        sentimentData,
        orderBookData,
        liquidationData,
        marketSentiment
      ] = await Promise.allSettled([
        this.getFundingRates(symbol),
        this.getVolatilityIndexes(symbol),
        this.getSentimentIndicators(symbol),
        this.getOrderBookAnalysis(symbol),
        this.getLiquidationData(symbol),
        this.getMarketSentiment()
      ]);

      const offChainData = {
        funding_rates: fundingRates.status === 'fulfilled' ? fundingRates.value : this.getFallbackFundingRates(),
        volatility_indexes: volatilityData.status === 'fulfilled' ? volatilityData.value : this.getFallbackVolatilityData(),
        sentiment_indicators: sentimentData.status === 'fulfilled' ? sentimentData.value : this.getFallbackSentimentData(),
        order_book_analysis: orderBookData.status === 'fulfilled' ? orderBookData.value : this.getFallbackOrderBookData(),
        liquidation_data: liquidationData.status === 'fulfilled' ? liquidationData.value : this.getFallbackLiquidationData(),
        market_sentiment: marketSentiment.status === 'fulfilled' ? marketSentiment.value : this.getFallbackMarketSentiment(),
        data_quality: this.calculateDataQuality([fundingRates, volatilityData, sentimentData, orderBookData, liquidationData, marketSentiment]),
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

  async getFundingRates(symbol) {
    try {
      // Get current funding rate
      const fundingRateResponse = await axios.get(`${this.binanceBaseUrl}/fapi/v1/fundingRate`, {
        params: { symbol: symbol.replace('USDT', 'USDT'), limit: 10 },
        timeout: 5000
      });

      const fundingRates = fundingRateResponse.data;
      const currentRate = fundingRates[0]?.fundingRate || 0;
      const avgRate = fundingRates.reduce((sum, rate) => sum + parseFloat(rate.fundingRate), 0) / fundingRates.length;

      // Get premium index
      const premiumResponse = await axios.get(`${this.binanceBaseUrl}/fapi/v1/premiumIndex`, {
        params: { symbol: symbol.replace('USDT', 'USDT') },
        timeout: 5000
      });

      const premiumData = premiumResponse.data;

      return {
        current_funding_rate: parseFloat(currentRate),
        avg_funding_rate_10: avgRate,
        funding_rate_trend: this.calculateFundingRateTrend(fundingRates),
        premium_index: parseFloat(premiumData.markPrice) - parseFloat(premiumData.indexPrice),
        premium_percentage: ((parseFloat(premiumData.markPrice) / parseFloat(premiumData.indexPrice)) - 1) * 100,
        funding_rate_sentiment: this.interpretFundingRateSentiment(parseFloat(currentRate), avgRate),
        next_funding_time: fundingRates[0]?.fundingTime || Date.now() + 28800000, // 8 hours
        funding_rate_history: fundingRates.map(rate => ({
          rate: parseFloat(rate.fundingRate),
          time: rate.fundingTime
        }))
      };

    } catch (error) {
      logger.error('Error fetching funding rates:', error);
      return this.getFallbackFundingRates();
    }
  }

  async getVolatilityIndexes(symbol) {
    try {
      // Get 24h ticker data for volatility calculation
      const tickerResponse = await axios.get(`${this.binanceBaseUrl}/fapi/v1/ticker/24hr`, {
        params: { symbol: symbol.replace('USDT', 'USDT') },
        timeout: 5000
      });

      const ticker = tickerResponse.data;
      
      // Get kline data for historical volatility
      const klineResponse = await axios.get(`${this.binanceBaseUrl}/fapi/v1/klines`, {
        params: {
          symbol: symbol.replace('USDT', 'USDT'),
          interval: '1h',
          limit: 168 // 7 days
        },
        timeout: 5000
      });

      const klines = klineResponse.data;
      const closes = klines.map(k => parseFloat(k[4]));
      
      return {
        realized_volatility_24h: parseFloat(ticker.priceChangePercent) / 100,
        realized_volatility_7d: this.calculateHistoricalVolatility(closes, 168),
        volatility_rank: this.calculateVolatilityRank(closes),
        volatility_regime: this.determineVolatilityRegime(closes),
        volatility_trend: this.calculateVolatilityTrend(closes),
        price_efficiency: this.calculatePriceEfficiency(closes),
        volatility_clustering: this.detectVolatilityClustering(closes),
        volatility_forecast: this.forecastVolatility(closes)
      };

    } catch (error) {
      logger.error('Error fetching volatility data:', error);
      return this.getFallbackVolatilityData();
    }
  }

  async getSentimentIndicators(symbol) {
    try {
      // Get long/short ratio
      const longShortResponse = await axios.get(`${this.binanceBaseUrl}/futures/data/globalLongShortAccountRatio`, {
        params: {
          symbol: symbol.replace('USDT', 'USDT'),
          period: '1h',
          limit: 24
        },
        timeout: 5000
      });

      const longShortData = longShortResponse.data;
      const currentRatio = longShortData[0]?.longShortRatio || 1;
      const avgRatio = longShortData.reduce((sum, data) => sum + parseFloat(data.longShortRatio), 0) / longShortData.length;

      // Get top trader positions
      const topTraderResponse = await axios.get(`${this.binanceBaseUrl}/futures/data/topLongShortPositionRatio`, {
        params: {
          symbol: symbol.replace('USDT', 'USDT'),
          period: '1h',
          limit: 24
        },
        timeout: 5000
      });

      const topTraderData = topTraderResponse.data;
      const topTraderRatio = topTraderData[0]?.longShortRatio || 1;

      return {
        long_short_ratio: parseFloat(currentRatio),
        avg_long_short_ratio_24h: avgRatio,
        long_short_trend: this.calculateLongShortTrend(longShortData),
        top_trader_ratio: parseFloat(topTraderRatio),
        retail_vs_whale_sentiment: this.compareRetailVsWhale(parseFloat(currentRatio), parseFloat(topTraderRatio)),
        sentiment_divergence: Math.abs(parseFloat(currentRatio) - parseFloat(topTraderRatio)),
        sentiment_strength: this.calculateSentimentStrength(longShortData),
        sentiment_momentum: this.calculateSentimentMomentum(longShortData),
        contrarian_signal: this.generateContrarianSignal(parseFloat(currentRatio), avgRatio)
      };

    } catch (error) {
      logger.error('Error fetching sentiment indicators:', error);
      return this.getFallbackSentimentData();
    }
  }

  async getOrderBookAnalysis(symbol) {
    try {
      const orderBookResponse = await axios.get(`${this.binanceBaseUrl}/fapi/v1/depth`, {
        params: {
          symbol: symbol.replace('USDT', 'USDT'),
          limit: 100
        },
        timeout: 5000
      });

      const orderBook = orderBookResponse.data;
      const bids = orderBook.bids.map(bid => ({ price: parseFloat(bid[0]), quantity: parseFloat(bid[1]) }));
      const asks = orderBook.asks.map(ask => ({ price: parseFloat(ask[0]), quantity: parseFloat(ask[1]) }));

      return {
        bid_ask_spread: asks[0].price - bids[0].price,
        spread_percentage: ((asks[0].price - bids[0].price) / bids[0].price) * 100,
        order_book_imbalance: this.calculateOrderBookImbalance(bids, asks),
        liquidity_depth: this.calculateLiquidityDepth(bids, asks),
        support_resistance_levels: this.identifyOrderBookLevels(bids, asks),
        order_book_pressure: this.calculateOrderBookPressure(bids, asks),
        market_depth_score: this.calculateMarketDepthScore(bids, asks),
        liquidity_quality: this.assessLiquidityQuality(bids, asks)
      };

    } catch (error) {
      logger.error('Error fetching order book data:', error);
      return this.getFallbackOrderBookData();
    }
  }

  async getLiquidationData(symbol) {
    try {
      // This would typically require a specialized data provider
      // For now, we'll create a realistic simulation based on market conditions
      const tickerResponse = await axios.get(`${this.binanceBaseUrl}/fapi/v1/ticker/24hr`, {
        params: { symbol: symbol.replace('USDT', 'USDT') },
        timeout: 5000
      });

      const ticker = tickerResponse.data;
      const priceChange = parseFloat(ticker.priceChangePercent);
      const volume = parseFloat(ticker.volume);

      return {
        liquidation_pressure: this.estimateLiquidationPressure(priceChange, volume),
        liquidation_heatmap: this.generateLiquidationHeatmap(parseFloat(ticker.lastPrice), priceChange),
        long_liquidation_risk: this.calculateLongLiquidationRisk(priceChange),
        short_liquidation_risk: this.calculateShortLiquidationRisk(priceChange),
        liquidation_cascade_risk: this.assessLiquidationCascadeRisk(priceChange, volume),
        liquidation_support_levels: this.identifyLiquidationLevels(parseFloat(ticker.lastPrice), priceChange),
        liquidation_sentiment: this.interpretLiquidationSentiment(priceChange, volume)
      };

    } catch (error) {
      logger.error('Error fetching liquidation data:', error);
      return this.getFallbackLiquidationData();
    }
  }

  async getMarketSentiment() {
    try {
      const response = await axios.get(`${this.fearGreedUrl}?limit=10`, {
        timeout: 5000
      });

      const fearGreedData = response.data.data;
      const current = fearGreedData[0];
      const historical = fearGreedData.slice(1);

      return {
        fear_greed_index: parseInt(current.value),
        fear_greed_classification: current.value_classification,
        fear_greed_trend: this.calculateFearGreedTrend(fearGreedData),
        market_mood: this.interpretMarketMood(parseInt(current.value)),
        sentiment_momentum: this.calculateSentimentMomentum(fearGreedData),
        contrarian_opportunity: this.identifyContrarianOpportunity(parseInt(current.value)),
        sentiment_extremes: this.detectSentimentExtremes(fearGreedData)
      };

    } catch (error) {
      logger.error('Error fetching market sentiment:', error);
      return this.getFallbackMarketSentiment();
    }
  }

  // Helper methods for calculations
  calculateFundingRateTrend(fundingRates) {
    if (fundingRates.length < 2) return 'NEUTRAL';
    
    const recent = fundingRates.slice(0, 3).reduce((sum, rate) => sum + parseFloat(rate.fundingRate), 0) / 3;
    const earlier = fundingRates.slice(3, 6).reduce((sum, rate) => sum + parseFloat(rate.fundingRate), 0) / 3;
    
    if (recent > earlier * 1.1) return 'INCREASING';
    if (recent < earlier * 0.9) return 'DECREASING';
    return 'STABLE';
  }

  interpretFundingRateSentiment(current, average) {
    if (current > 0.01) return 'EXTREMELY_BULLISH';
    if (current > 0.005) return 'BULLISH';
    if (current > 0) return 'SLIGHTLY_BULLISH';
    if (current < -0.01) return 'EXTREMELY_BEARISH';
    if (current < -0.005) return 'BEARISH';
    if (current < 0) return 'SLIGHTLY_BEARISH';
    return 'NEUTRAL';
  }

  calculateHistoricalVolatility(prices, period) {
    if (prices.length < period) return 0.3;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 252); // Annualized
  }

  calculateVolatilityRank(prices) {
    const currentVol = this.calculateHistoricalVolatility(prices.slice(-24), 24);
    const historicalVols = [];
    
    for (let i = 24; i < prices.length; i++) {
      historicalVols.push(this.calculateHistoricalVolatility(prices.slice(i - 24, i), 24));
    }
    
    const rank = historicalVols.filter(vol => vol < currentVol).length / historicalVols.length;
    return Math.round(rank * 100);
  }

  determineVolatilityRegime(prices) {
    const currentVol = this.calculateHistoricalVolatility(prices.slice(-24), 24);
    const avgVol = this.calculateHistoricalVolatility(prices, Math.min(prices.length - 1, 168));
    
    if (currentVol > avgVol * 1.5) return 'HIGH_VOLATILITY';
    if (currentVol < avgVol * 0.7) return 'LOW_VOLATILITY';
    return 'NORMAL_VOLATILITY';
  }

  calculateVolatilityTrend(prices) {
    const recentVol = this.calculateHistoricalVolatility(prices.slice(-48, -24), 24);
    const currentVol = this.calculateHistoricalVolatility(prices.slice(-24), 24);
    
    if (currentVol > recentVol * 1.1) return 'INCREASING';
    if (currentVol < recentVol * 0.9) return 'DECREASING';
    return 'STABLE';
  }

  calculatePriceEfficiency(prices) {
    // Hurst exponent approximation
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    // Simplified efficiency measure
    return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 10));
  }

  detectVolatilityClustering(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.abs(Math.log(prices[i] / prices[i - 1])));
    }
    
    let clusters = 0;
    let inCluster = false;
    const threshold = returns.reduce((a, b) => a + b, 0) / returns.length * 1.5;
    
    for (const ret of returns) {
      if (ret > threshold) {
        if (!inCluster) {
          clusters++;
          inCluster = true;
        }
      } else {
        inCluster = false;
      }
    }
    
    return clusters > returns.length * 0.1 ? 'HIGH_CLUSTERING' : 'LOW_CLUSTERING';
  }

  forecastVolatility(prices) {
    const currentVol = this.calculateHistoricalVolatility(prices.slice(-24), 24);
    const trend = this.calculateVolatilityTrend(prices);
    
    let forecast = currentVol;
    if (trend === 'INCREASING') forecast *= 1.1;
    else if (trend === 'DECREASING') forecast *= 0.9;
    
    return {
      next_24h: forecast,
      confidence: 0.6,
      direction: trend
    };
  }

  calculateLongShortTrend(longShortData) {
    if (longShortData.length < 2) return 'NEUTRAL';
    
    const recent = longShortData.slice(0, 6).reduce((sum, data) => sum + parseFloat(data.longShortRatio), 0) / 6;
    const earlier = longShortData.slice(6, 12).reduce((sum, data) => sum + parseFloat(data.longShortRatio), 0) / 6;
    
    if (recent > earlier * 1.05) return 'MORE_BULLISH';
    if (recent < earlier * 0.95) return 'MORE_BEARISH';
    return 'STABLE';
  }

  compareRetailVsWhale(retailRatio, whaleRatio) {
    const difference = retailRatio - whaleRatio;
    
    if (difference > 0.2) return 'RETAIL_MORE_BULLISH';
    if (difference < -0.2) return 'WHALES_MORE_BULLISH';
    return 'ALIGNED';
  }

  calculateSentimentStrength(longShortData) {
    const ratios = longShortData.map(data => parseFloat(data.longShortRatio));
    const deviation = Math.sqrt(ratios.reduce((sum, ratio) => sum + Math.pow(ratio - 1, 2), 0) / ratios.length);
    
    if (deviation > 0.3) return 'STRONG';
    if (deviation > 0.1) return 'MODERATE';
    return 'WEAK';
  }

  calculateSentimentMomentum(data) {
    if (data.length < 3) return 'NEUTRAL';
    
    const values = data.map(d => parseFloat(d.value || d.longShortRatio || 50));
    const recent = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const earlier = values.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
    
    if (recent > earlier * 1.05) return 'INCREASING';
    if (recent < earlier * 0.95) return 'DECREASING';
    return 'STABLE';
  }

  generateContrarianSignal(currentRatio, avgRatio) {
    if (currentRatio > avgRatio * 1.3) return 'CONTRARIAN_SELL';
    if (currentRatio < avgRatio * 0.7) return 'CONTRARIAN_BUY';
    return 'NO_SIGNAL';
  }

  calculateOrderBookImbalance(bids, asks) {
    const bidVolume = bids.slice(0, 10).reduce((sum, bid) => sum + bid.quantity, 0);
    const askVolume = asks.slice(0, 10).reduce((sum, ask) => sum + ask.quantity, 0);
    
    return (bidVolume - askVolume) / (bidVolume + askVolume);
  }

  calculateLiquidityDepth(bids, asks) {
    const bidDepth = bids.slice(0, 20).reduce((sum, bid) => sum + bid.quantity * bid.price, 0);
    const askDepth = asks.slice(0, 20).reduce((sum, ask) => sum + ask.quantity * ask.price, 0);
    
    return {
      bid_depth: bidDepth,
      ask_depth: askDepth,
      total_depth: bidDepth + askDepth,
      depth_ratio: bidDepth / askDepth
    };
  }

  identifyOrderBookLevels(bids, asks) {
    // Find significant price levels based on order clustering
    const bidLevels = this.findSignificantLevels(bids);
    const askLevels = this.findSignificantLevels(asks);
    
    return {
      support_levels: bidLevels,
      resistance_levels: askLevels
    };
  }

  findSignificantLevels(orders) {
    const levels = [];
    const avgSize = orders.reduce((sum, order) => sum + order.quantity, 0) / orders.length;
    
    for (const order of orders) {
      if (order.quantity > avgSize * 2) {
        levels.push({
          price: order.price,
          size: order.quantity,
          strength: order.quantity / avgSize
        });
      }
    }
    
    return levels.slice(0, 5); // Top 5 levels
  }

  calculateOrderBookPressure(bids, asks) {
    const nearBidPressure = bids.slice(0, 5).reduce((sum, bid) => sum + bid.quantity, 0);
    const nearAskPressure = asks.slice(0, 5).reduce((sum, ask) => sum + ask.quantity, 0);
    
    return {
      buy_pressure: nearBidPressure,
      sell_pressure: nearAskPressure,
      net_pressure: nearBidPressure - nearAskPressure,
      pressure_ratio: nearBidPressure / nearAskPressure
    };
  }

  calculateMarketDepthScore(bids, asks) {
    const depth = this.calculateLiquidityDepth(bids, asks);
    const spread = asks[0].price - bids[0].price;
    const midPrice = (asks[0].price + bids[0].price) / 2;
    
    const spreadPercentage = (spread / midPrice) * 100;
    const depthScore = Math.log(depth.total_depth) / Math.log(1000000); // Normalize to millions
    
    return Math.max(0, Math.min(100, (depthScore * 50) + (50 - spreadPercentage * 100)));
  }

  assessLiquidityQuality(bids, asks) {
    const spread = asks[0].price - bids[0].price;
    const midPrice = (asks[0].price + bids[0].price) / 2;
    const spreadPercentage = (spread / midPrice) * 100;
    
    if (spreadPercentage < 0.01) return 'EXCELLENT';
    if (spreadPercentage < 0.05) return 'GOOD';
    if (spreadPercentage < 0.1) return 'FAIR';
    return 'POOR';
  }

  // Liquidation analysis methods
  estimateLiquidationPressure(priceChange, volume) {
    const volatility = Math.abs(priceChange);
    const volumeNormalized = Math.log(volume) / Math.log(1000000);
    
    return Math.min(100, (volatility * 10) + (volumeNormalized * 20));
  }

  generateLiquidationHeatmap(currentPrice, priceChange) {
    const levels = [];
    const basePrice = currentPrice;
    
    // Generate liquidation levels based on common leverage ratios
    const leverages = [5, 10, 20, 50, 100];
    
    for (const leverage of leverages) {
      const liquidationDistance = 1 / leverage;
      levels.push({
        leverage: leverage,
        long_liquidation: basePrice * (1 - liquidationDistance),
        short_liquidation: basePrice * (1 + liquidationDistance),
        estimated_volume: this.estimateLiquidationVolume(leverage, Math.abs(priceChange))
      });
    }
    
    return levels;
  }

  calculateLongLiquidationRisk(priceChange) {
    if (priceChange > 0) return 'LOW';
    if (priceChange < -5) return 'HIGH';
    if (priceChange < -2) return 'MEDIUM';
    return 'LOW';
  }

  calculateShortLiquidationRisk(priceChange) {
    if (priceChange < 0) return 'LOW';
    if (priceChange > 5) return 'HIGH';
    if (priceChange > 2) return 'MEDIUM';
    return 'LOW';
  }

  assessLiquidationCascadeRisk(priceChange, volume) {
    const volatility = Math.abs(priceChange);
    const volumeScore = Math.log(volume) / Math.log(1000000);
    
    const riskScore = (volatility * 2) + volumeScore;
    
    if (riskScore > 15) return 'HIGH';
    if (riskScore > 10) return 'MEDIUM';
    return 'LOW';
  }

  identifyLiquidationLevels(currentPrice, priceChange) {
    const direction = priceChange > 0 ? 'UP' : 'DOWN';
    const levels = [];
    
    if (direction === 'DOWN') {
      // Long liquidation levels
      levels.push({
        type: 'LONG_LIQUIDATION',
        price: currentPrice * 0.95,
        leverage: 20,
        risk: 'MEDIUM'
      });
      levels.push({
        type: 'LONG_LIQUIDATION',
        price: currentPrice * 0.9,
        leverage: 10,
        risk: 'HIGH'
      });
    } else {
      // Short liquidation levels
      levels.push({
        type: 'SHORT_LIQUIDATION',
        price: currentPrice * 1.05,
        leverage: 20,
        risk: 'MEDIUM'
      });
      levels.push({
        type: 'SHORT_LIQUIDATION',
        price: currentPrice * 1.1,
        leverage: 10,
        risk: 'HIGH'
      });
    }
    
    return levels;
  }

  estimateLiquidationVolume(leverage, priceChange) {
    // Estimate based on leverage and price movement
    const baseVolume = 1000000; // Base volume
    const leverageMultiplier = leverage / 10;
    const volatilityMultiplier = Math.abs(priceChange) / 5;
    
    return baseVolume * leverageMultiplier * volatilityMultiplier;
  }

  interpretLiquidationSentiment(priceChange, volume) {
    const liquidationPressure = this.estimateLiquidationPressure(priceChange, volume);
    
    if (liquidationPressure > 70) return 'EXTREME_PRESSURE';
    if (liquidationPressure > 50) return 'HIGH_PRESSURE';
    if (liquidationPressure > 30) return 'MODERATE_PRESSURE';
    return 'LOW_PRESSURE';
  }

  // Market sentiment methods
  calculateFearGreedTrend(fearGreedData) {
    if (fearGreedData.length < 3) return 'NEUTRAL';
    
    const recent = fearGreedData.slice(0, 3).reduce((sum, data) => sum + parseInt(data.value), 0) / 3;
    const earlier = fearGreedData.slice(3, 6).reduce((sum, data) => sum + parseInt(data.value), 0) / 3;
    
    if (recent > earlier + 5) return 'IMPROVING';
    if (recent < earlier - 5) return 'DETERIORATING';
    return 'STABLE';
  }

  interpretMarketMood(fearGreedValue) {
    if (fearGreedValue >= 75) return 'EXTREME_GREED';
    if (fearGreedValue >= 55) return 'GREED';
    if (fearGreedValue >= 45) return 'NEUTRAL';
    if (fearGreedValue >= 25) return 'FEAR';
    return 'EXTREME_FEAR';
  }

  identifyContrarianOpportunity(fearGreedValue) {
    if (fearGreedValue <= 20) return 'STRONG_BUY_OPPORTUNITY';
    if (fearGreedValue <= 30) return 'BUY_OPPORTUNITY';
    if (fearGreedValue >= 80) return 'SELL_OPPORTUNITY';
    if (fearGreedValue >= 70) return 'CAUTION_ADVISED';
    return 'NO_CLEAR_SIGNAL';
  }

  detectSentimentExtremes(fearGreedData) {
    const values = fearGreedData.map(data => parseInt(data.value));
    const extremes = values.filter(value => value <= 20 || value >= 80);
    
    return {
      extreme_count: extremes.length,
      extreme_percentage: (extremes.length / values.length) * 100,
      current_extreme: values[0] <= 20 || values[0] >= 80,
      extreme_type: values[0] <= 20 ? 'FEAR' : values[0] >= 80 ? 'GREED' : 'NONE'
    };
  }

  calculateDataQuality(results) {
    const successfulRequests = results.filter(result => result.status === 'fulfilled').length;
    const totalRequests = results.length;
    
    return {
      success_rate: (successfulRequests / totalRequests) * 100,
      data_completeness: successfulRequests / totalRequests,
      quality_score: Math.round((successfulRequests / totalRequests) * 100)
    };
  }

  // Fallback methods
  getFallbackFundingRates() {
    return {
      current_funding_rate: 0.0001,
      avg_funding_rate_10: 0.0001,
      funding_rate_trend: 'STABLE',
      premium_index: 0,
      premium_percentage: 0,
      funding_rate_sentiment: 'NEUTRAL',
      next_funding_time: Date.now() + 28800000,
      funding_rate_history: []
    };
  }

  getFallbackVolatilityData() {
    return {
      realized_volatility_24h: 0.02,
      realized_volatility_7d: 0.3,
      volatility_rank: 50,
      volatility_regime: 'NORMAL_VOLATILITY',
      volatility_trend: 'STABLE',
      price_efficiency: 0.5,
      volatility_clustering: 'LOW_CLUSTERING',
      volatility_forecast: {
        next_24h: 0.3,
        confidence: 0.5,
        direction: 'STABLE'
      }
    };
  }

  getFallbackSentimentData() {
    return {
      long_short_ratio: 1.0,
      avg_long_short_ratio_24h: 1.0,
      long_short_trend: 'STABLE',
      top_trader_ratio: 1.0,
      retail_vs_whale_sentiment: 'ALIGNED',
      sentiment_divergence: 0,
      sentiment_strength: 'MODERATE',
      sentiment_momentum: 'STABLE',
      contrarian_signal: 'NO_SIGNAL'
    };
  }

  getFallbackOrderBookData() {
    return {
      bid_ask_spread: 0.01,
      spread_percentage: 0.01,
      order_book_imbalance: 0,
      liquidity_depth: {
        bid_depth: 100000,
        ask_depth: 100000,
        total_depth: 200000,
        depth_ratio: 1.0
      },
      support_resistance_levels: {
        support_levels: [],
        resistance_levels: []
      },
      order_book_pressure: {
        buy_pressure: 1000,
        sell_pressure: 1000,
        net_pressure: 0,
        pressure_ratio: 1.0
      },
      market_depth_score: 70,
      liquidity_quality: 'GOOD'
    };
  }

  getFallbackLiquidationData() {
    return {
      liquidation_pressure: 20,
      liquidation_heatmap: [],
      long_liquidation_risk: 'LOW',
      short_liquidation_risk: 'LOW',
      liquidation_cascade_risk: 'LOW',
      liquidation_support_levels: [],
      liquidation_sentiment: 'LOW_PRESSURE'
    };
  }

  getFallbackMarketSentiment() {
    return {
      fear_greed_index: 50,
      fear_greed_classification: 'Neutral',
      fear_greed_trend: 'STABLE',
      market_mood: 'NEUTRAL',
      sentiment_momentum: 'STABLE',
      contrarian_opportunity: 'NO_CLEAR_SIGNAL',
      sentiment_extremes: {
        extreme_count: 0,
        extreme_percentage: 0,
        current_extreme: false,
        extreme_type: 'NONE'
      }
    };
  }

  getFallbackOffChainData(symbol) {
    return {
      funding_rates: this.getFallbackFundingRates(),
      volatility_indexes: this.getFallbackVolatilityData(),
      sentiment_indicators: this.getFallbackSentimentData(),
      order_book_analysis: this.getFallbackOrderBookData(),
      liquidation_data: this.getFallbackLiquidationData(),
      market_sentiment: this.getFallbackMarketSentiment(),
      data_quality: {
        success_rate: 0,
        data_completeness: 0,
        quality_score: 0
      },
      timestamp: Date.now()
    };
  }
}

module.exports = new OffChainDataService(); 