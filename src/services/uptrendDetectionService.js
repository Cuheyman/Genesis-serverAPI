const logger = require('../utils/logger');

class UptrendDetectionService {
  constructor(binanceClient) {
    this.binanceClient = binanceClient;
    this.scanInterval = 30000; // 30 seconds
    this.uptrendCache = new Map();
    this.priceHistory = new Map();
    
    // Uptrend detection thresholds
    this.thresholds = {
      // Price momentum thresholds
      momentum: {
        micro: { timeframe: 5, threshold: 0.3 },      // 5 min: 0.3%
        short: { timeframe: 15, threshold: 0.5 },     // 15 min: 0.5%
        medium: { timeframe: 60, threshold: 1.0 },     // 1 hour: 1.0%
        long: { timeframe: 240, threshold: 2.0 }       // 4 hours: 2.0%
      },
      // Volume thresholds
      volume: {
        spike: 1.5,          // 50% above average
        surge: 2.0,          // 100% above average
        explosion: 3.0       // 200% above average
      },
      // Technical thresholds
      technical: {
        rsi_oversold: 30,
        rsi_neutral: 50,
        macd_cross: 0,
        ema_cross: 0
      }
    };
    
    // Uptrend stages
    this.STAGES = {
      ACCUMULATION: 'accumulation',      // Smart money buying
      EARLY_UPTREND: 'early_uptrend',   // Initial breakout
      MOMENTUM: 'momentum',              // Strong upward movement
      PARABOLIC: 'parabolic'            // Extreme movement (caution)
    };
  }

  /**
   * Main uptrend detection method
   */
  async detectUptrends(symbols = null) {
    try {
      // Get symbols to scan
      const scanSymbols = symbols || await this.getActiveSymbols();
      const uptrendSignals = [];
      
      // Batch process for efficiency
      const batchSize = 10;
      for (let i = 0; i < scanSymbols.length; i += batchSize) {
        const batch = scanSymbols.slice(i, i + batchSize);
        const batchPromises = batch.map(symbol => this.analyzeSymbolUptrend(symbol));
        
        const results = await Promise.allSettled(batchPromises);
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            uptrendSignals.push(result.value);
          }
        });
      }
      
      // Sort by strength and stage
      return uptrendSignals
        .filter(s => s.isUptrend)
        .sort((a, b) => b.strength - a.strength);
        
    } catch (error) {
      logger.error(`Uptrend detection error: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze individual symbol for uptrend
   */
  async analyzeSymbolUptrend(symbol) {
    try {
      // Get comprehensive market data
      const [ticker, klines1m, klines5m, klines1h, orderBook] = await Promise.all([
        this.binanceClient.ticker24hr({ symbol }),
        this.binanceClient.klines({ symbol, interval: '1m', limit: 60 }),
        this.binanceClient.klines({ symbol, interval: '5m', limit: 100 }),
        this.binanceClient.klines({ symbol, interval: '1h', limit: 48 }),
        this.binanceClient.book({ symbol, limit: 20 })
      ]);
      
      // Extract price data
      const currentPrice = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.volume) * currentPrice;
      
      // Calculate momentum scores
      const momentumScore = this.calculateMomentumScore(klines1m, klines5m, klines1h);
      
      // Analyze volume patterns
      const volumeAnalysis = this.analyzeVolumePattern(klines5m, klines1h);
      
      // Detect price patterns
      const patternAnalysis = this.detectPricePatterns(klines5m, klines1h);
      
      // Analyze order flow
      const orderFlowAnalysis = this.analyzeOrderFlow(orderBook, ticker);
      
      // Calculate technical indicators
      const technicalAnalysis = await this.calculateTechnicalIndicators(symbol, klines1h);
      
      // Determine uptrend stage and strength
      const uptrendStage = this.determineUptrendStage(
        momentumScore,
        volumeAnalysis,
        patternAnalysis,
        technicalAnalysis
      );
      
      // Calculate overall uptrend strength (0-100)
      const strength = this.calculateUptrendStrength({
        momentum: momentumScore,
        volume: volumeAnalysis,
        pattern: patternAnalysis,
        orderFlow: orderFlowAnalysis,
        technical: technicalAnalysis
      });
      
      // Generate entry timing
      const entryTiming = this.generateEntryTiming(
        momentumScore,
        volumeAnalysis,
        orderFlowAnalysis,
        uptrendStage
      );
      
      return {
        symbol,
        isUptrend: strength > 40 && uptrendStage !== null,
        stage: uptrendStage,
        strength,
        confidence: this.calculateConfidence(strength, volumeAnalysis, technicalAnalysis),
        momentum: momentumScore,
        volume: volumeAnalysis,
        patterns: patternAnalysis,
        orderFlow: orderFlowAnalysis,
        technical: technicalAnalysis,
        entryTiming,
        currentPrice,
        volume24h,
        recommendation: this.generateRecommendation(strength, uptrendStage, entryTiming),
        timestamp: Date.now()
      };
      
    } catch (error) {
      logger.error(`Symbol analysis error for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate momentum across multiple timeframes
   */
  calculateMomentumScore(klines1m, klines5m, klines1h) {
    const scores = {};
    
    // Micro momentum (1m candles)
    const microMomentum = this.calculateTimeframeMomentum(klines1m.slice(-5));
    scores.micro = {
      value: microMomentum,
      bullish: microMomentum > this.thresholds.momentum.micro.threshold,
      strength: Math.min(100, (microMomentum / this.thresholds.momentum.micro.threshold) * 50)
    };
    
    // Short-term momentum (5m candles)
    const shortMomentum = this.calculateTimeframeMomentum(klines5m.slice(-15));
    scores.short = {
      value: shortMomentum,
      bullish: shortMomentum > this.thresholds.momentum.short.threshold,
      strength: Math.min(100, (shortMomentum / this.thresholds.momentum.short.threshold) * 50)
    };
    
    // Medium-term momentum (1h candles)
    const mediumMomentum = this.calculateTimeframeMomentum(klines1h.slice(-4));
    scores.medium = {
      value: mediumMomentum,
      bullish: mediumMomentum > this.thresholds.momentum.medium.threshold,
      strength: Math.min(100, (mediumMomentum / this.thresholds.momentum.medium.threshold) * 50)
    };
    
    // Calculate momentum acceleration
    const acceleration = this.calculateMomentumAcceleration(klines5m);
    scores.acceleration = acceleration;
    
    // Overall momentum score
    scores.overall = (scores.micro.strength * 0.3 + 
                     scores.short.strength * 0.4 + 
                     scores.medium.strength * 0.3) * 
                     (1 + acceleration * 0.1);
                     
    scores.trending = scores.micro.bullish && scores.short.bullish;
    
    return scores;
  }

  /**
   * Analyze volume patterns for uptrend confirmation
   */
  analyzeVolumePattern(klines5m, klines1h) {
    const analysis = {
      isIncreasing: false,
      spike: false,
      surge: false,
      ratio: 1.0,
      trend: 'neutral'
    };
    
    try {
      // Recent vs average volume
      const recentVolumes = klines5m.slice(-12).map(k => parseFloat(k[5]));
      const olderVolumes = klines5m.slice(-60, -12).map(k => parseFloat(k[5]));
      
      const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const olderAvg = olderVolumes.reduce((a, b) => a + b, 0) / olderVolumes.length;
      
      analysis.ratio = recentAvg / olderAvg;
      analysis.spike = analysis.ratio > this.thresholds.volume.spike;
      analysis.surge = analysis.ratio > this.thresholds.volume.surge;
      
      // Volume trend
      const volumeTrend = this.calculateVolumeTrend(klines1h);
      analysis.trend = volumeTrend;
      analysis.isIncreasing = volumeTrend === 'increasing';
      
      // Volume price correlation
      analysis.priceVolumeCorrelation = this.calculatePriceVolumeCorrelation(klines5m);
      
    } catch (error) {
      logger.error(`Volume analysis error: ${error.message}`);
    }
    
    return analysis;
  }

  /**
   * Detect bullish price patterns
   */
  detectPricePatterns(klines5m, klines1h) {
    const patterns = {
      detected: [],
      strength: 0
    };
    
    try {
      // Higher highs and higher lows
      const hhhl = this.detectHigherHighsHigherLows(klines5m.slice(-20));
      if (hhhl) {
        patterns.detected.push('higher_highs_higher_lows');
        patterns.strength += 30;
      }
      
      // Breakout patterns
      const breakout = this.detectBreakoutPattern(klines5m.slice(-50));
      if (breakout) {
        patterns.detected.push(breakout.type);
        patterns.strength += breakout.strength;
      }
      
      // Support bounce
      const bounce = this.detectSupportBounce(klines1h.slice(-24));
      if (bounce) {
        patterns.detected.push('support_bounce');
        patterns.strength += 20;
      }
      
      // Flag/Pennant patterns
      const continuation = this.detectContinuationPattern(klines5m.slice(-40));
      if (continuation) {
        patterns.detected.push(continuation.type);
        patterns.strength += continuation.strength;
      }
      
    } catch (error) {
      logger.error(`Pattern detection error: ${error.message}`);
    }
    
    patterns.strength = Math.min(100, patterns.strength);
    return patterns;
  }

  /**
   * Analyze order book for buying pressure
   */
  analyzeOrderFlow(orderBook, ticker) {
    const analysis = {
      buyPressure: 50,
      imbalance: 0,
      wallDetected: false,
      accumulation: false
    };
    
    try {
      // Calculate bid/ask imbalance
      const bidVolume = orderBook.bids.slice(0, 10).reduce((sum, [p, q]) => 
        sum + parseFloat(p) * parseFloat(q), 0);
      const askVolume = orderBook.asks.slice(0, 10).reduce((sum, [p, q]) => 
        sum + parseFloat(p) * parseFloat(q), 0);
      
      analysis.imbalance = (bidVolume - askVolume) / (bidVolume + askVolume);
      analysis.buyPressure = 50 + (analysis.imbalance * 50);
      
      // Detect walls
      const bidWall = this.detectOrderWall(orderBook.bids);
      const askWall = this.detectOrderWall(orderBook.asks);
      analysis.wallDetected = bidWall || askWall;
      
      // Check for accumulation pattern
      const buyRatio = parseFloat(ticker.count) > 0 ? 
        parseFloat(ticker.buyVolume || ticker.volume) / parseFloat(ticker.count) : 0;
      analysis.accumulation = analysis.buyPressure > 60 && buyRatio > 0.55;
      
    } catch (error) {
      logger.error(`Order flow analysis error: ${error.message}`);
    }
    
    return analysis;
  }

  /**
   * Calculate technical indicators for uptrend confirmation
   */
  async calculateTechnicalIndicators(symbol, klines) {
    const indicators = {
      rsi: 50,
      emaAlignment: false,
      macdBullish: false,
      trendStrength: 0
    };
    
    try {
      // Calculate RSI
      const closes = klines.map(k => parseFloat(k[4]));
      indicators.rsi = this.calculateRSI(closes, 14);
      
      // EMA alignment (9, 21, 50)
      const ema9 = this.calculateEMA(closes, 9);
      const ema21 = this.calculateEMA(closes, 21);
      const ema50 = this.calculateEMA(closes, 50);
      
      indicators.emaAlignment = ema9 > ema21 && ema21 > ema50;
      
      // MACD
      const macd = this.calculateMACD(closes);
      indicators.macdBullish = macd.histogram > 0 && macd.trend === 'bullish';
      
      // ADX for trend strength
      indicators.trendStrength = this.calculateADX(klines);
      
    } catch (error) {
      logger.error(`Technical indicator calculation error: ${error.message}`);
    }
    
    return indicators;
  }

  /**
   * Determine current uptrend stage
   */
  determineUptrendStage(momentum, volume, patterns, technical) {
    // Early detection logic
    if (momentum.overall < 30) {
      return null; // No uptrend
    }
    
    // Accumulation phase
    if (momentum.overall < 50 && volume.ratio < 1.3 && technical.rsi < 45) {
      return this.STAGES.ACCUMULATION;
    }
    
    // Early uptrend
    if (momentum.overall < 70 && momentum.trending && volume.spike) {
      return this.STAGES.EARLY_UPTREND;
    }
    
    // Momentum phase
    if (momentum.overall >= 70 && volume.surge && patterns.strength > 50) {
      return this.STAGES.MOMENTUM;
    }
    
    // Parabolic phase (caution)
    if (momentum.overall > 90 && technical.rsi > 75) {
      return this.STAGES.PARABOLIC;
    }
    
    return this.STAGES.EARLY_UPTREND;
  }

  /**
   * Calculate overall uptrend strength
   */
  calculateUptrendStrength(components) {
    const weights = {
      momentum: 0.35,
      volume: 0.25,
      pattern: 0.20,
      orderFlow: 0.10,
      technical: 0.10
    };
    
    let strength = 0;
    
    // Momentum component
    strength += components.momentum.overall * weights.momentum;
    
    // Volume component
    const volumeScore = Math.min(100, 
      (components.volume.spike ? 40 : 0) +
      (components.volume.surge ? 30 : 0) +
      (components.volume.isIncreasing ? 30 : 0)
    );
    strength += volumeScore * weights.volume;
    
    // Pattern component
    strength += components.pattern.strength * weights.pattern;
    
    // Order flow component
    strength += components.orderFlow.buyPressure * weights.orderFlow;
    
    // Technical component
    const techScore = 
      (components.technical.emaAlignment ? 40 : 0) +
      (components.technical.macdBullish ? 30 : 0) +
      (components.technical.trendStrength > 25 ? 30 : 0);
    strength += techScore * weights.technical;
    
    return Math.round(Math.min(100, strength));
  }

  /**
   * Generate entry timing recommendation
   */
  generateEntryTiming(momentum, volume, orderFlow, stage) {
    const timing = {
      action: 'WAIT',
      urgency: 'low',
      optimalEntry: null,
      reason: ''
    };
    
    // Immediate entry conditions
    if (stage === this.STAGES.EARLY_UPTREND && 
        momentum.acceleration > 0.5 && 
        volume.spike && 
        orderFlow.buyPressure > 65) {
      timing.action = 'BUY_NOW';
      timing.urgency = 'high';
      timing.reason = 'Strong uptrend initiation with volume confirmation';
    }
    // Scale-in conditions
    else if (stage === this.STAGES.ACCUMULATION && 
             orderFlow.accumulation) {
      timing.action = 'SCALE_IN';
      timing.urgency = 'medium';
      timing.reason = 'Accumulation phase detected - gradual entry recommended';
    }
    // Wait for better entry
    else if (stage === this.STAGES.PARABOLIC) {
      timing.action = 'WAIT';
      timing.urgency = 'low';
      timing.reason = 'Parabolic move - wait for pullback';
    }
    // Monitor closely
    else if (momentum.trending && !volume.spike) {
      timing.action = 'MONITOR';
      timing.urgency = 'medium';
      timing.reason = 'Momentum building but needs volume confirmation';
    }
    
    return timing;
  }

  /**
   * Generate trading recommendation
   */
  generateRecommendation(strength, stage, timing) {
    const recommendations = {
      action: timing.action,
      positionSize: 'small',
      stopLoss: 3.0,
      targets: [],
      notes: []
    };
    
    // Position sizing based on stage and strength
    if (stage === this.STAGES.EARLY_UPTREND && strength > 60) {
      recommendations.positionSize = 'medium';
      recommendations.stopLoss = 2.5;
      recommendations.targets = [5, 10, 15]; // 5%, 10%, 15% targets
    } else if (stage === this.STAGES.MOMENTUM && strength > 70) {
      recommendations.positionSize = 'large';
      recommendations.stopLoss = 2.0;
      recommendations.targets = [10, 20, 30]; // Aggressive targets
    } else if (stage === this.STAGES.ACCUMULATION) {
      recommendations.positionSize = 'small';
      recommendations.stopLoss = 3.5;
      recommendations.targets = [3, 6, 10];
    }
    
    // Risk warnings
    if (stage === this.STAGES.PARABOLIC) {
      recommendations.notes.push('⚠️ Extreme move - high risk of reversal');
      recommendations.positionSize = 'minimal';
    }
    
    return recommendations;
  }

  // === Helper Methods ===

  calculateTimeframeMomentum(klines) {
    if (!klines || klines.length < 2) return 0;
    
    const firstClose = parseFloat(klines[0][4]);
    const lastClose = parseFloat(klines[klines.length - 1][4]);
    
    return ((lastClose - firstClose) / firstClose) * 100;
  }

  calculateMomentumAcceleration(klines) {
    if (!klines || klines.length < 20) return 0;
    
    const momentum1 = this.calculateTimeframeMomentum(klines.slice(-20, -10));
    const momentum2 = this.calculateTimeframeMomentum(klines.slice(-10));
    
    return momentum2 - momentum1;
  }

  calculateVolumeTrend(klines) {
    const volumes = klines.map(k => parseFloat(k[5]));
    const firstHalf = volumes.slice(0, Math.floor(volumes.length / 2));
    const secondHalf = volumes.slice(Math.floor(volumes.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    if (secondAvg > firstAvg * 1.2) return 'increasing';
    if (secondAvg < firstAvg * 0.8) return 'decreasing';
    return 'neutral';
  }

  calculatePriceVolumeCorrelation(klines) {
    const priceChanges = [];
    const volumeChanges = [];
    
    for (let i = 1; i < klines.length; i++) {
      const priceChange = (parseFloat(klines[i][4]) - parseFloat(klines[i-1][4])) / parseFloat(klines[i-1][4]);
      const volumeChange = (parseFloat(klines[i][5]) - parseFloat(klines[i-1][5])) / parseFloat(klines[i-1][5]);
      
      priceChanges.push(priceChange);
      volumeChanges.push(volumeChange);
    }
    
    // Simple correlation calculation
    return this.calculateCorrelation(priceChanges, volumeChanges);
  }

  detectHigherHighsHigherLows(klines) {
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    
    let higherHighs = 0;
    let higherLows = 0;
    
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] > highs[i-1]) higherHighs++;
      if (lows[i] > lows[i-1]) higherLows++;
    }
    
    return higherHighs > highs.length * 0.6 && higherLows > lows.length * 0.6;
  }

  detectBreakoutPattern(klines) {
    const closes = klines.map(k => parseFloat(k[4]));
    const resistance = Math.max(...closes.slice(0, -10));
    const currentPrice = closes[closes.length - 1];
    
    if (currentPrice > resistance * 1.02) {
      return {
        type: 'resistance_breakout',
        strength: 40
      };
    }
    
    return null;
  }

  detectSupportBounce(klines) {
    const lows = klines.map(k => parseFloat(k[3]));
    const support = Math.min(...lows.slice(0, -5));
    const currentLow = lows[lows.length - 1];
    const currentClose = parseFloat(klines[klines.length - 1][4]);
    
    return currentLow <= support * 1.01 && currentClose > support * 1.02;
  }

  detectContinuationPattern(klines) {
    // Simplified flag/pennant detection
    const volatility = this.calculateVolatility(klines);
    const trend = this.calculateTimeframeMomentum(klines);
    
    if (volatility < 0.5 && trend > 1) {
      return {
        type: 'bull_flag',
        strength: 25
      };
    }
    
    return null;
  }

  detectOrderWall(orders) {
    if (!orders || orders.length < 5) return false;
    
    const avgSize = orders.slice(1, 10).reduce((sum, [p, q]) => 
      sum + parseFloat(q), 0) / 9;
    const maxSize = Math.max(...orders.slice(0, 5).map(([p, q]) => parseFloat(q)));
    
    return maxSize > avgSize * 3;
  }

  calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i-1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateEMA(values, period) {
    if (values.length < period) return values[values.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  calculateMACD(closes) {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;
    
    // Simplified MACD signal
    const signal = this.calculateEMA([macdLine], 9);
    const histogram = macdLine - signal;
    
    return {
      macd: macdLine,
      signal: signal,
      histogram: histogram,
      trend: histogram > 0 ? 'bullish' : 'bearish'
    };
  }

  calculateADX(klines) {
    // Simplified ADX calculation
    if (klines.length < 14) return 0;
    
    let sumTR = 0;
    for (let i = 1; i < Math.min(14, klines.length); i++) {
      const high = parseFloat(klines[i][2]);
      const low = parseFloat(klines[i][3]);
      const prevClose = parseFloat(klines[i-1][4]);
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      sumTR += tr;
    }
    
    return sumTR / 13 * 10; // Simplified strength metric
  }

  calculateVolatility(klines) {
    const returns = [];
    for (let i = 1; i < klines.length; i++) {
      const ret = (parseFloat(klines[i][4]) - parseFloat(klines[i-1][4])) / parseFloat(klines[i-1][4]);
      returns.push(ret);
    }
    
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avg, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100;
  }

  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const avgX = x.reduce((a, b) => a + b, 0) / x.length;
    const avgY = y.reduce((a, b) => a + b, 0) / y.length;
    
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    
    for (let i = 0; i < x.length; i++) {
      const dx = x[i] - avgX;
      const dy = y[i] - avgY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    
    if (denomX * denomY === 0) return 0;
    
    return numerator / Math.sqrt(denomX * denomY);
  }

  calculateConfidence(strength, volume, technical) {
    let confidence = strength;
    
    // Boost confidence for strong volume
    if (volume.surge) confidence += 10;
    else if (volume.spike) confidence += 5;
    
    // Boost for technical alignment
    if (technical.emaAlignment) confidence += 5;
    if (technical.macdBullish) confidence += 5;
    
    return Math.min(100, Math.round(confidence));
  }

  /**
   * Get active trading symbols
   */
  async getActiveSymbols() {
    try {
      const tickers = await this.binanceClient.ticker24hr();
      
      return tickers
        .filter(t => 
          t.symbol.endsWith('USDT') && 
          parseFloat(t.volume) * parseFloat(t.lastPrice) > 1000000 // $1M+ volume
        )
        .sort((a, b) => parseFloat(b.count) - parseFloat(a.count))
        .slice(0, 100)
        .map(t => t.symbol);
        
    } catch (error) {
      logger.error(`Error fetching active symbols: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if recently scanned to avoid duplicates
   */
  _isRecentlyScanned(symbol) {
    const cached = this.uptrendCache.get(symbol);
    if (!cached) return false;
    
    const age = Date.now() - cached.timestamp;
    return age < this.scanInterval;
  }
}

module.exports = UptrendDetectionService; 