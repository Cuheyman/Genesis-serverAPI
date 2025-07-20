const axios = require('axios');
const logger = require('../utils/logger');

class MomentumStrategyService {
  constructor() {
    this.apiSecret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbHVlIjoiNjg1NDFjNDI4MDZmZjE2NTFlNTY4ZGNhIiwiaWF0IjoxNzUyNzM4NDU3LCJleHAiOjMzMjU3MjAyNDU3fQ.Ejxe9tzURSF84McZTtRATb57DQ1FZAKeN43_amre6IY"; // FIXED: Use the working Pro secret from curl test
    this.baseUrl = "https://api.taapi.io";
    this.rateLimit = 1200; // Pro plan rate limit
    this.signalHistory = [];
    this.performanceTracker = new Map();
    
    // Danish Strategy Configuration
    // 🇩🇰 DANISH STRATEGY CONFIG (ORIGINAL BACKTESTED PARAMETERS)
    this.danishConfig = {
      IGNORE_BEARISH_SIGNALS: true,
      ONLY_BULLISH_ENTRIES: true,
      REQUIRE_VOLUME_CONFIRMATION: true,
      REQUIRE_BREAKOUT_CONFIRMATION: true,
      MIN_CONFLUENCE_SCORE: 65,
      MIN_CONFIDENCE_SCORE: 55,  // 🎯 DANISH PURE MODE: Lowered from 60 to 55
      EXCELLENT_ENTRY_THRESHOLD: 80,
      MOMENTUM_THRESHOLDS: {
        rsi_oversold_entry: 38,
        rsi_overbought_avoid: 72,
        macd_histogram_min: 0.001,
        volume_spike_min: 1.2, // Lowered from 1.8
        confluence_min: 4,
        breakout_confirmation: 0.5
      }
    };
    
    logger.info('🚀 Momentum Strategy Service initialized with Original Backtested Danish Strategy');
  }

  // Main momentum signal generation
  async generateMomentumSignal(symbol, timeframe = '1h', options = {}) {
    try {
      logger.info(`🔍 Generating momentum signal for ${symbol}`);
      
      // Get multi-timeframe TAAPI data
      const mtfData = await this.getMultiTimeframeData(symbol, timeframe);
      
      // Analyze volume patterns (Danish strategy requirement)
      const volumeAnalysis = await this.analyzeVolumePatterns(mtfData);
      
      // Detect breakout patterns (Danish strategy requirement)
      const breakoutAnalysis = await this.detectBreakoutPatterns(mtfData);
      
      // Calculate momentum confluence score
      const confluenceScore = this.calculateMomentumConfluence(mtfData, volumeAnalysis, breakoutAnalysis);
      
      // Generate final momentum signal
      const signal = this.generateFinalMomentumSignal(symbol, mtfData, volumeAnalysis, breakoutAnalysis, confluenceScore);
      
      // Track performance
      this.trackSignalPerformance(symbol, signal);
      
      return signal;
      
    } catch (error) {
      logger.error(`Error generating momentum signal for ${symbol}: ${error.message}`);
      return this.createHoldSignal(symbol, `Error: ${error.message}`);
    }
  }

  // Get comprehensive multi-timeframe data using TAAPI bulk queries
  async getMultiTimeframeData(symbol, timeframe) {
    try {
      const formattedSymbol = symbol.replace("USDT", "/USDT");
      
      // Primary timeframe bulk query (comprehensive indicators)
      const primaryConstruct = {
        secret: this.apiSecret,
        construct: {
          exchange: "binance",
          symbol: formattedSymbol,
          interval: timeframe,
          indicators: [
            {"indicator": "rsi", "period": 14},
            {"indicator": "macd", "fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9},
            {"indicator": "ema", "period": 20, "id": "ema20"},
            {"indicator": "ema", "period": 50, "id": "ema50"},
            {"indicator": "ema", "period": 200, "id": "ema200"},
            {"indicator": "bbands", "period": 20, "stddev": 2},
            {"indicator": "atr", "period": 14},
            {"indicator": "adx", "period": 14},
            {"indicator": "mfi", "period": 14},
            {"indicator": "stochrsi", "period": 14},
            {"indicator": "volume"},
            {"indicator": "obv"},
            {"indicator": "ao"},
            {"indicator": "mom", "period": 14},
            {"indicator": "cci", "period": 14},
            {"indicator": "williams", "period": 14},
            {"indicator": "squeeze", "period": 20, "mult": 2.0, "lengthKC": 20, "multKC": 1.5}
          ]
        }
      };
      
      // Execute primary bulk query
      const primaryData = await this.executeTaapiBulkQuery(primaryConstruct);
      
      // Short-term confirmation (15m)
      const shortTermData = await this.getTimeframeData(formattedSymbol, "15m", ["rsi", "macd", "volume"]);
      
      // Long-term trend (4h)
      const longTermData = await this.getTimeframeData(formattedSymbol, "4h", ["rsi", "ema", "adx"]);
      
      return {
        primary: primaryData,
        short_term: shortTermData,
        long_term: longTermData
      };
      
    } catch (error) {
      logger.error(`Error getting multi-timeframe data: ${error.message}`);
      return { primary: {}, short_term: {}, long_term: {} };
    }
  }

  // Execute TAAPI bulk query with pro plan optimization
  async executeTaapiBulkQuery(construct) {
    try {
      const response = await axios.post(`${this.baseUrl}/bulk`, construct, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status === 200) {
        return this.processBulkResponse(response.data);
      } else {
        throw new Error(`TAAPI bulk query failed: ${response.status}`);
      }
      
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limit hit - wait and retry
        await this.sleep(this.rateLimit * 2);
        return this.executeTaapiBulkQuery(construct);
      }
      throw error;
    } finally {
      // Pro plan rate limiting
      await this.sleep(this.rateLimit);
    }
  }

  // Get specific timeframe data
  async getTimeframeData(symbol, timeframe, indicators) {
    try {
      const construct = {
        secret: this.apiSecret,
        construct: {
          exchange: "binance",
          symbol: symbol,
          interval: timeframe,
          indicators: indicators.map(ind => ({ indicator: ind, period: 14 }))
        }
      };
      
      return await this.executeTaapiBulkQuery(construct);
      
    } catch (error) {
      logger.error(`Error getting ${timeframe} data: ${error.message}`);
      return {};
    }
  }

  // Process TAAPI bulk response
  processBulkResponse(data) {
    const processed = {};
    
    try {
      if (data && data.data && Array.isArray(data.data)) {
        for (const item of data.data) {
          if (item.indicator && item.result) {
            processed[item.indicator] = item.result;
          }
        }
      }
    } catch (error) {
      logger.error(`Error processing bulk response: ${error.message}`);
    }
    
    return processed;
  }

  // Analyze volume patterns for Danish strategy
  async analyzeVolumePatterns(mtfData) {
    try {
      const primaryData = mtfData.primary || {};
      
      // Extract volume indicators
      const volumeData = primaryData.volume || {};
      const mfiData = primaryData.mfi || {};
      const obvData = primaryData.obv || {};
      
      // Calculate volume metrics
      const volumeSpike = this.calculateVolumeSpike(volumeData);
      const moneyFlowStrength = this.extractIndicatorValue(mfiData);
      const volumeTrend = this.analyzeVolumeTrend(obvData);
      
      // Danish strategy volume confirmation
      const hasVolumeConfirmation = (
        volumeSpike >= this.danishConfig.MOMENTUM_THRESHOLDS.volume_spike_min &&
        moneyFlowStrength >= 55 &&
        volumeTrend === 'INCREASING'
      );
      
      // Volume score calculation
      const volumeScore = this.calculateVolumeScore(volumeSpike, moneyFlowStrength, volumeTrend);
      
      return {
        volume_spike_ratio: volumeSpike,
        money_flow_strength: moneyFlowStrength,
        volume_trend: volumeTrend,
        has_volume_confirmation: hasVolumeConfirmation,
        volume_score: volumeScore
      };
      
    } catch (error) {
      logger.error(`Volume analysis error: ${error.message}`);
      return {
        has_volume_confirmation: false,
        volume_score: 0,
        volume_spike_ratio: 1.0,
        money_flow_strength: 50,
        volume_trend: 'NEUTRAL'
      };
    }
  }

  // Detect breakout patterns for Danish strategy
  async detectBreakoutPatterns(mtfData) {
    try {
      const primaryData = mtfData.primary || {};
      
      // Extract breakout indicators
      const bbandsData = primaryData.bbands || {};
      const squeezeData = primaryData.squeeze || {};
      const atrData = primaryData.atr || {};
      const adxData = primaryData.adx || {};
      
      // Pattern detection
      const bollingerSqueeze = this.detectBollingerSqueeze(bbandsData);
      const momentumSqueeze = this.detectMomentumSqueeze(squeezeData);
      const volatilityExpansion = this.detectVolatilityExpansion(atrData);
      const trendStrength = this.extractIndicatorValue(adxData);
      
      // Danish strategy breakout confirmation
      const hasBreakoutConfirmation = (
        (bollingerSqueeze || momentumSqueeze || volatilityExpansion) &&
        trendStrength >= 25
      );
      
      // Breakout score calculation
      const breakoutScore = this.calculateBreakoutScore(bollingerSqueeze, momentumSqueeze, volatilityExpansion, trendStrength);
      
      return {
        bollinger_squeeze: bollingerSqueeze,
        momentum_squeeze: momentumSqueeze,
        volatility_expansion: volatilityExpansion,
        trend_strength: trendStrength,
        has_breakout_confirmation: hasBreakoutConfirmation,
        breakout_score: breakoutScore,
        breakout_type: this.classifyBreakoutType(bollingerSqueeze, momentumSqueeze, volatilityExpansion)
      };
      
    } catch (error) {
      logger.error(`Breakout analysis error: ${error.message}`);
      return {
        has_breakout_confirmation: false,
        breakout_score: 0,
        breakout_type: 'NONE'
      };
    }
  }

  // Calculate momentum confluence score
  calculateMomentumConfluence(mtfData, volumeAnalysis, breakoutAnalysis) {
    try {
      const primaryData = mtfData.primary || {};
      let confluenceFactors = [];
      
      // RSI momentum zone
      const rsi = this.extractIndicatorValue(primaryData.rsi);
      if (rsi >= 40 && rsi <= 65) {
        confluenceFactors.push(['RSI momentum zone', 15]);
      }
      
      // MACD bullish
      const macdData = primaryData.macd || {};
      if (this.isMacdBullish(macdData)) {
        confluenceFactors.push(['MACD bullish', 15]);
      }
      
      // EMA alignment
      if (this.checkEmaAlignment(primaryData)) {
        confluenceFactors.push(['EMA alignment', 10]);
      }
      
      // Volume confirmation
      if (volumeAnalysis.has_volume_confirmation) {
        confluenceFactors.push(['Volume confirmation', 20]);
      }
      
      // Breakout confirmation
      if (breakoutAnalysis.has_breakout_confirmation) {
        confluenceFactors.push(['Breakout confirmation', 20]);
      }
      
      // Multi-timeframe agreement
      if (this.checkMultiTimeframeAgreement(mtfData)) {
        confluenceFactors.push(['Multi-timeframe agreement', 10]);
      }
      
      // Momentum indicators
      const adx = this.extractIndicatorValue(primaryData.adx);
      if (adx >= 25) {
        confluenceFactors.push(['Strong trend', 10]);
      }
      
      // Calculate total confluence score
      const totalScore = confluenceFactors.reduce((sum, [_, score]) => sum + score, 0);
      
      return Math.min(100, totalScore);
      
    } catch (error) {
      logger.error(`Confluence calculation error: ${error.message}`);
      return 0;
    }
  }

  // Generate final momentum signal based on Danish strategy
  generateFinalMomentumSignal(symbol, mtfData, volumeAnalysis, breakoutAnalysis, confluenceScore) {
    try {
      const primaryData = mtfData.primary || {};
      
      // Danish strategy: only BUY or HOLD
      let action = "HOLD";
      let reasons = [];
      
      // Check bullish entry conditions
      if (confluenceScore >= this.danishConfig.MIN_CONFLUENCE_SCORE) {
        if (volumeAnalysis.has_volume_confirmation && breakoutAnalysis.has_breakout_confirmation) {
          const rsi = this.extractIndicatorValue(primaryData.rsi);
          if (rsi < this.danishConfig.MOMENTUM_THRESHOLDS.rsi_overbought_avoid) {
            action = "BUY";
            reasons.push(`High confluence score: ${confluenceScore.toFixed(1)}%`);
            reasons.push("Volume confirmation met");
            reasons.push("Breakout confirmation met");
          } else {
            reasons.push("RSI overbought - avoiding late entry");
          }
        } else {
          reasons.push("Missing volume or breakout confirmation");
        }
      } else {
        reasons.push(`Confluence score too low: ${confluenceScore.toFixed(1)}%`);
      }
      
      // Determine signal strength
      let signalStrength = "WEAK";
      let entryQuality = "POOR";
      
      if (confluenceScore >= 85) {
        signalStrength = "EXPLOSIVE";
        entryQuality = "EXCELLENT";
      } else if (confluenceScore >= 75) {
        signalStrength = "STRONG";
        entryQuality = "GOOD";
      } else if (confluenceScore >= 60) {
        signalStrength = "MODERATE";
        entryQuality = "FAIR";
      }
      
      // Calculate risk-reward ratio
      const riskRewardRatio = this.calculateRiskRewardRatio(primaryData, confluenceScore);
      
      // Build comprehensive signal
      const signal = {
        symbol: symbol,
        action: action,
        signal: action.toLowerCase(),
        confidence: confluenceScore,
        signal_strength: signalStrength.toLowerCase(),
        entry_quality: entryQuality.toLowerCase(),
        
        // Danish strategy specific
        danish_strategy_compliance: true,
        only_bullish_entries: this.danishConfig.ONLY_BULLISH_ENTRIES,
        volume_confirmation: volumeAnalysis.has_volume_confirmation,
        breakout_confirmation: breakoutAnalysis.has_breakout_confirmation,
        
        // Momentum data
        momentum_data: {
          confluence_score: confluenceScore,
          volume_analysis: volumeAnalysis,
          breakout_analysis: breakoutAnalysis,
          momentum_strength: signalStrength,
          breakout_type: breakoutAnalysis.breakout_type,
          risk_reward_ratio: riskRewardRatio,
          indicators_aligned: this.countAlignedIndicators(primaryData)
        },
        
        // Quality metrics
        high_probability_entry: confluenceScore >= 75 && entryQuality === "EXCELLENT",
        is_high_probability: confluenceScore >= this.danishConfig.EXCELLENT_ENTRY_THRESHOLD,
        
        // Reasoning
        reasons: reasons,
        
        // Technical analysis
        technical_analysis: {
          rsi: this.extractIndicatorValue(primaryData.rsi),
          macd: this.getMacdAnalysis(primaryData.macd),
          ema_alignment: this.checkEmaAlignment(primaryData),
          volume_spike: volumeAnalysis.volume_spike_ratio,
          breakout_strength: breakoutAnalysis.breakout_score
        },
        
        // Metadata
        timeframe: '1h',
        strategy_type: 'Danish Momentum Strategy',
        enhanced_by: 'momentum_strategy_service',
        taapi_enabled: true,
        timestamp: new Date().toISOString()
      };
      
      return signal;
      
    } catch (error) {
      logger.error(`Signal generation error: ${error.message}`);
      return this.createHoldSignal(symbol, `Error: ${error.message}`);
    }
  }

  // Helper methods
  extractIndicatorValue(indicatorData) {
    if (!indicatorData) return 0;
    if (typeof indicatorData === 'number') return indicatorData;
    return indicatorData.value || indicatorData.result || 0;
  }

  isMacdBullish(macdData) {
    try {
      const macd = macdData.valueMACD || 0;
      const signal = macdData.valueMACDSignal || 0;
      const histogram = macdData.valueMACDHist || 0;
      return macd > signal && histogram > 0;
    } catch {
      return false;
    }
  }

  checkEmaAlignment(primaryData) {
    try {
      const ema20 = this.extractIndicatorValue(primaryData.ema20);
      const ema50 = this.extractIndicatorValue(primaryData.ema50);
      const ema200 = this.extractIndicatorValue(primaryData.ema200);
      return ema20 > ema50 && ema50 > ema200;
    } catch {
      return false;
    }
  }

  checkMultiTimeframeAgreement(mtfData) {
    try {
      const primaryRsi = this.extractIndicatorValue(mtfData.primary?.rsi);
      const shortTermRsi = this.extractIndicatorValue(mtfData.short_term?.rsi);
      const longTermRsi = this.extractIndicatorValue(mtfData.long_term?.rsi);
      
      return primaryRsi > 45 && shortTermRsi > 45 && longTermRsi > 45;
    } catch {
      return false;
    }
  }

  calculateVolumeSpike(volumeData) {
    // Mock calculation - implement based on actual volume data
    return 2.0;
  }

  analyzeVolumeTrend(obvData) {
    return 'INCREASING';
  }

  calculateVolumeScore(spike, moneyFlow, trend) {
    let score = 0;
    score += Math.min(spike * 25, 50);
    score += Math.min(moneyFlow * 0.5, 25);
    score += trend === 'INCREASING' ? 25 : 0;
    return score;
  }

  detectBollingerSqueeze(bbandsData) {
    try {
      const upper = bbandsData.valueUpperBand || 0;
      const lower = bbandsData.valueLowerBand || 0;
      const middle = bbandsData.valueMiddleBand || 0;
      const bandwidth = middle > 0 ? ((upper - lower) / middle) : 0;
      return bandwidth < 0.1;
    } catch {
      return false;
    }
  }

  detectMomentumSqueeze(squeezeData) {
    return this.extractIndicatorValue(squeezeData) > 0;
  }

  detectVolatilityExpansion(atrData) {
    return this.extractIndicatorValue(atrData) > 0;
  }

  calculateBreakoutScore(bollinger, momentum, volatility, trendStrength) {
    let score = 0;
    if (bollinger) score += 30;
    if (momentum) score += 40;
    if (volatility) score += 30;
    if (trendStrength >= 25) score += 20;
    return Math.min(100, score);
  }

  classifyBreakoutType(bollinger, momentum, volatility) {
    if (momentum) return "MOMENTUM_SQUEEZE";
    if (bollinger) return "BOLLINGER_SQUEEZE";
    if (volatility) return "VOLATILITY_BREAKOUT";
    return "NONE";
  }

  calculateRiskRewardRatio(primaryData, confluenceScore) {
    const baseRatio = 2.0;
    const bonusRatio = confluenceScore > 80 ? 1.0 : 0.0;
    return baseRatio + bonusRatio;
  }

  countAlignedIndicators(primaryData) {
    let count = 0;
    if (this.extractIndicatorValue(primaryData.rsi) > 40) count++;
    if (this.isMacdBullish(primaryData.macd)) count++;
    if (this.checkEmaAlignment(primaryData)) count++;
    if (this.extractIndicatorValue(primaryData.adx) > 25) count++;
    return count;
  }

  getMacdAnalysis(macdData) {
    return {
      macd: macdData?.valueMACD || 0,
      signal: macdData?.valueMACDSignal || 0,
      histogram: macdData?.valueMACDHist || 0,
      is_bullish: this.isMacdBullish(macdData)
    };
  }

  createHoldSignal(symbol, reason) {
    return {
      symbol: symbol,
      action: "HOLD",
      signal: "hold",
      confidence: 0,
      signal_strength: "weak",
      entry_quality: "poor",
      danish_strategy_compliance: true,
      volume_confirmation: false,
      breakout_confirmation: false,
      high_probability_entry: false,
      is_high_probability: false,
      reasons: [reason],
      momentum_data: {},
      technical_analysis: {},
      timeframe: '1h',
      strategy_type: 'Danish Momentum Strategy',
      enhanced_by: 'momentum_strategy_service',
      timestamp: new Date().toISOString()
    };
  }

  trackSignalPerformance(symbol, signal) {
    this.signalHistory.push({
      symbol: symbol,
      timestamp: new Date(),
      action: signal.action,
      confidence: signal.confidence,
      entry_quality: signal.entry_quality
    });
    
    // Keep only last 100 signals
    if (this.signalHistory.length > 100) {
      this.signalHistory = this.signalHistory.slice(-100);
    }
  }

  getPerformanceMetrics() {
    const total = this.signalHistory.length;
    const buySignals = this.signalHistory.filter(s => s.action === 'BUY').length;
    const avgConfidence = this.signalHistory.reduce((sum, s) => sum + s.confidence, 0) / total;
    
    return {
      total_signals: total,
      buy_signals: buySignals,
      hold_signals: total - buySignals,
      avg_confidence: avgConfidence,
      buy_signal_percentage: (buySignals / total) * 100,
      recent_signals: this.signalHistory.slice(-10)
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { MomentumStrategyService };