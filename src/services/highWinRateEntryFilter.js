const logger = require('../utils/logger');

/**
 * Entry Signal Strength Levels for high win rate strategy
 */
const EntrySignalStrength = {
  AVOID: "AVOID",           // Don't trade - bearish or unclear
  WEAK: "WEAK",             // Low probability - wait for better setup
  MODERATE: "MODERATE",     // Decent setup - smaller position
  STRONG: "STRONG",         // Good setup - normal position
  EXCELLENT: "EXCELLENT"    // Exceptional setup - larger position
};

/**
 * Volume Pattern Types for momentum confirmation
 */
const VolumePattern = {
  ACCUMULATION: "ACCUMULATION",     // Steady volume increase
  SPIKE: "SPIKE",                   // Sudden volume surge
  BREAKOUT: "BREAKOUT",            // Volume on price breakout
  CLIMAX: "CLIMAX",                // Exhaustion volume
  WEAK: "WEAK"                     // Below average volume
};

/**
 * Entry Quality Metrics for comprehensive assessment
 */
class EntryQualityMetrics {
  constructor({
    overallScore = 0,
    signalStrength = EntrySignalStrength.AVOID,
    confidenceLevel = 0,
    riskRewardRatio = 1.0,
    momentumScore = 0,
    volumeScore = 0,
    technicalScore = 0,
    breakoutScore = 0,
    timeframeAlignmentScore = 0,
    isHighProbability = false,
    hasVolumeConfirmation = false,
    hasMomentumConfirmation = false,
    hasBreakoutConfirmation = false,
    riskFactors = [],
    warningFlags = [],
    entryTiming = "UNKNOWN",
    marketPhaseFit = "UNKNOWN"
  } = {}) {
    this.overallScore = overallScore;
    this.signalStrength = signalStrength;
    this.confidenceLevel = confidenceLevel;
    this.riskRewardRatio = riskRewardRatio;
    
    // Component scores
    this.momentumScore = momentumScore;
    this.volumeScore = volumeScore;
    this.technicalScore = technicalScore;
    this.breakoutScore = breakoutScore;
    this.timeframeAlignmentScore = timeframeAlignmentScore;
    
    // Quality flags
    this.isHighProbability = isHighProbability;
    this.hasVolumeConfirmation = hasVolumeConfirmation;
    this.hasMomentumConfirmation = hasMomentumConfirmation;
    this.hasBreakoutConfirmation = hasBreakoutConfirmation;
    
    // Risk assessment
    this.riskFactors = riskFactors;
    this.warningFlags = warningFlags;
    
    // Timing and market fit
    this.entryTiming = entryTiming;
    this.marketPhaseFit = marketPhaseFit;
  }
}

/**
 * High Win Rate Entry Filter System
 * Implements the Danish momentum strategy: only bullish entries with volume/breakout confirmation
 * Designed for 75-90% win rate through selective, high-quality entries
 */
class HighWinRateEntryFilter {
  constructor(config = {}) {
    this.config = {
      // Danish strategy requirements
      ONLY_BULLISH_ENTRIES: true,
      REQUIRE_VOLUME_CONFIRMATION: true,
      REQUIRE_BREAKOUT_CONFIRMATION: true,
      MIN_CONFIDENCE_THRESHOLD: 60,  // 🎯 DANISH PURE MODE: Lowered from 70 to 60
      HIGH_PROBABILITY_THRESHOLD: 75,
      EXCELLENT_ENTRY_THRESHOLD: 85,
      
      // 🔄 ADAPTIVE MARKET REGIME THRESHOLDS
      MARKET_REGIME_ADAPTATION: true,
      TRENDING_MARKET_THRESHOLDS: {
        MIN_CONFIDENCE: 60,  // 🎯 DANISH PURE MODE: Lowered from 70 to 60
        HIGH_PROBABILITY: 75,
        EXCELLENT_ENTRY: 85
      },
      SIDEWAYS_MARKET_THRESHOLDS: {
        MIN_CONFIDENCE: 50,    // More lenient during choppy markets
        HIGH_PROBABILITY: 60,   // Lower bar for sideways markets
        EXCELLENT_ENTRY: 75     // Achievable during ranging conditions
      },
      BEAR_MARKET_THRESHOLDS: {
        MIN_CONFIDENCE: 80,     // Much higher bar during bear markets
        HIGH_PROBABILITY: 85,
        EXCELLENT_ENTRY: 90
      },
      
      // Momentum thresholds for high win rate
      MOMENTUM_THRESHOLDS: {
        rsi_oversold_entry: 35,      // More conservative than 30
        rsi_momentum_min: 45,        // Must show upward momentum
        rsi_overbought_avoid: 75,    // Avoid late entries
        macd_histogram_min: 0.001,   // Positive histogram required
        volume_spike_min: 1.8,       // 80% volume increase minimum
        price_momentum_min: 0.8,     // 0.8% price increase in timeframe
        breakout_confirmation: 0.5,   // 0.5% above resistance
        confluence_min: 4            // Minimum indicators agreeing
      },
      
      ...config
    };
    
    this.signalHistory = [];
    this.performanceMetrics = {
      totalSignals: 0,
      excellentSignals: 0,
      strongSignals: 0,
      winRateByStrength: {},
      avgRrrByStrength: {}
    };
    
    // 🔄 Market regime tracking
    this.marketRegime = 'SIDEWAYS'; // Default to sideways
    this.lastRegimeCheck = 0;
    this.regimeCheckInterval = 5 * 60 * 1000; // Check every 5 minutes
    
    logger.info('🎯 High Win Rate Entry Filter initialized for Danish strategy');
  }

  /**
   * Comprehensive entry quality evaluation for high win rate strategy
   */
  async evaluateEntryQuality(symbol, taapiData, marketData = {}) {
    try {
      logger.info(`📊 Evaluating entry quality for ${symbol}`);
      
      // 📊 Technical data availability check
      const primaryIndicators = taapiData.primary ? Object.keys(taapiData.primary).length : 0;
      const shortTermIndicators = taapiData.short_term ? Object.keys(taapiData.short_term).length : 0;
      logger.info(`📊 Available indicators: Primary=${primaryIndicators}, Short-term=${shortTermIndicators}`);
      
      // 🔄 Update market regime if needed
      if (this.config.MARKET_REGIME_ADAPTATION) {
        await this._updateMarketRegime(taapiData, marketData);
      }

      // Initialize component scores
      const momentumScore = await this._evaluateMomentumQuality(taapiData, marketData);
      const volumeScore = await this._evaluateVolumeQuality(taapiData, marketData);
      const technicalScore = await this._evaluateTechnicalSetup(taapiData, marketData);
      const breakoutScore = await this._evaluateBreakoutQuality(taapiData, marketData);
      const timeframeScore = await this._evaluateTimeframeAlignment(taapiData, marketData);
      
      // 🔍 DEBUG: Log all component scores
      logger.info(`🔍 [DEBUG] Component Scores for ${symbol}:`);
      logger.info(`🔍 [DEBUG] - Momentum Score: ${momentumScore.toFixed(1)}/100`);
      logger.info(`🔍 [DEBUG] - Volume Score: ${volumeScore.toFixed(1)}/100`);
      logger.info(`🔍 [DEBUG] - Technical Score: ${technicalScore.toFixed(1)}/100`);
      logger.info(`🔍 [DEBUG] - Breakout Score: ${breakoutScore.toFixed(1)}/100`);
      logger.info(`🔍 [DEBUG] - Timeframe Score: ${timeframeScore.toFixed(1)}/100`);

      // Calculate overall score with weighted components
      const overallScore = this._calculateWeightedScore(
        momentumScore, volumeScore, technicalScore, 
        breakoutScore, timeframeScore
      );
      
      // 🔍 DEBUG: Log weighted calculation
      logger.info(`🔍 [DEBUG] Weighted Overall Score for ${symbol}: ${overallScore.toFixed(1)}/100`);

      // Determine signal strength
      const signalStrength = this._determineSignalStrength(overallScore, {
        momentum: momentumScore,
        volume: volumeScore,
        technical: technicalScore,
        breakout: breakoutScore,
        timeframe: timeframeScore
      });

      // Assess confirmations
      const confirmations = this._assessConfirmations(taapiData, marketData);
      
      // Identify risk factors and warnings
      const { riskFactors, warningFlags } = await this._identifyRiskFactors(taapiData, marketData);
      
      // 🔍 DEBUG: Log confirmations and risk factors
      logger.info(`🔍 [DEBUG] Confirmations for ${symbol}: volume=${confirmations.volume}, momentum=${confirmations.momentum}, breakout=${confirmations.breakout}`);
      logger.info(`🔍 [DEBUG] Risk factors count: ${riskFactors.length}`);

      // Assess entry timing
      const entryTiming = this._assessEntryTiming(taapiData, marketData, overallScore);
      
      // Assess market phase fit
      const marketPhaseFit = this._assessMarketPhaseFit(taapiData, marketData);

      // Calculate risk-reward ratio
      const riskRewardRatio = this._calculateRiskRewardRatio(taapiData, marketData, signalStrength);

      // 🔄 Determine if this is high probability using ADAPTIVE thresholds
      const isHighProbability = this._isHighProbabilityEntryAdaptive(
        overallScore, signalStrength, confirmations, riskFactors
      );

      // 🔄 Calculate confidence with market regime awareness
      const confidenceLevel = this._calculateAdaptiveConfidence(overallScore, confirmations, riskFactors);
      
      // 🔍 DEBUG: Log confidence calculation details
      logger.info(`🔍 [DEBUG] Confidence Calculation for ${symbol}:`);
      logger.info(`🔍 [DEBUG] - Base confidence (overallScore * 1.1): ${(overallScore * 1.1).toFixed(1)}`);
      logger.info(`🔍 [DEBUG] - Volume bonus: ${confirmations.volume ? '+5' : '0'}`);
      logger.info(`🔍 [DEBUG] - Breakout bonus: ${confirmations.breakout ? '+5' : '0'}`);
      logger.info(`🔍 [DEBUG] - Risk factor penalty: -${riskFactors.length * 3}`);
      logger.info(`🔍 [DEBUG] - Market regime: ${this.marketRegime || 'Unknown'}`);
      logger.info(`🔍 [DEBUG] - Final confidence: ${confidenceLevel.toFixed(1)}%`);

      // Create metrics object
      const metrics = new EntryQualityMetrics({
        overallScore,
        signalStrength,
        confidenceLevel,
        riskRewardRatio,
        momentumScore,
        volumeScore,
        technicalScore,
        breakoutScore,
        timeframeAlignmentScore: timeframeScore,
        isHighProbability,
        hasVolumeConfirmation: confirmations.volume,
        hasMomentumConfirmation: confirmations.momentum,
        hasBreakoutConfirmation: confirmations.breakout,
        riskFactors,
        warningFlags,
        entryTiming,
        marketPhaseFit
      });

      // Log for performance tracking
      this._logEntryEvaluation(symbol, metrics);

      return metrics;

    } catch (error) {
      logger.error(`Error evaluating entry quality for ${symbol}: ${error.message}`);
      return this._createErrorMetrics(error.message);
    }
  }

  /**
   * 🔄 Update market regime based on current conditions
   */
  async _updateMarketRegime(taapiData, marketData) {
    const now = Date.now();
    if (now - this.lastRegimeCheck < this.regimeCheckInterval) {
      return; // Skip if checked recently
    }
    
    this.lastRegimeCheck = now;
    
    try {
      // Get primary trend indicators
      const adx = this._getIndicatorValue(taapiData, 'primary', 'adx');
      const ema20 = this._getIndicatorValue(taapiData, 'primary', 'ema20');
      const ema50 = this._getIndicatorValue(taapiData, 'primary', 'ema50');
      const atr = this._getIndicatorValue(taapiData, 'primary', 'atr');
      const currentPrice = marketData.currentPrice || 45000;
      
      let regime = 'SIDEWAYS'; // Default
      
      // Trending market detection
      if (adx && adx > 25) {
        if (ema20 && ema50) {
          const emaSeparation = Math.abs(ema20 - ema50) / ema50;
          if (emaSeparation > 0.02) { // 2% separation
            if (ema20 > ema50) {
              regime = 'TRENDING_UP';
            } else {
              regime = 'TRENDING_DOWN';
            }
          }
        }
      }
      
      // Bear market detection (major downtrend)
      if (adx && adx > 35 && ema20 && ema50 && ema20 < ema50 * 0.95) {
        regime = 'BEAR_MARKET';
      }
      
      // Volatility check for sideways confirmation
      if (atr && currentPrice) {
        const atrPercent = (atr / currentPrice) * 100;
        if (atrPercent < 2.0 && adx && adx < 20) {
          regime = 'SIDEWAYS_LOW_VOL';
        }
      }
      
      if (this.marketRegime !== regime) {
        logger.info(`🔄 Market regime changed: ${this.marketRegime} → ${regime}`);
        this.marketRegime = regime;
      }
      
    } catch (error) {
      logger.warning(`Error updating market regime: ${error.message}`);
    }
  }

  /**
   * 📊 Calculate pure data-driven confidence (NO artificial boosts)
   */
  _calculateAdaptiveConfidence(overallScore, confirmations, riskFactors) {
    // 📊 PURE DATA-DRIVEN: Base confidence directly reflects technical analysis
    let confidence = overallScore;
    
    logger.info(`📊 [PURE-CONFIDENCE] Starting with technical score: ${overallScore.toFixed(1)}`);
    
    // ✅ REAL CONFIRMATIONS: Only add confidence for actual technical confirmations
    let confirmationBonus = 0;
    if (confirmations.volume) {
      confirmationBonus += 8; // Strong volume confirmation
      logger.info(`📊 [PURE-CONFIDENCE] Volume confirmation: +8%`);
    }
    if (confirmations.breakout) {
      confirmationBonus += 6; // Breakout confirmation  
      logger.info(`📊 [PURE-CONFIDENCE] Breakout confirmation: +6%`);
    }
    if (confirmations.momentum) {
      confirmationBonus += 4; // Momentum confirmation
      logger.info(`📊 [PURE-CONFIDENCE] Momentum confirmation: +4%`);
    }
    
    confidence += confirmationBonus;
    
    // ⚠️ REAL RISK PENALTIES: Subtract confidence for actual technical risk factors
    const riskPenalty = riskFactors.length * 4; // Each risk factor reduces confidence by 4%
    confidence -= riskPenalty;
    
    if (riskPenalty > 0) {
      logger.info(`📊 [PURE-CONFIDENCE] Risk penalty: -${riskPenalty}% (${riskFactors.length} factors)`);
    }
    
    // 🎯 MARKET REGIME: Subtle adjustments based on actual market conditions (not artificial boosts)
    let regimeAdjustment = 0;
    if (this.marketRegime === 'BEAR_MARKET') {
      // Reduce confidence in bear markets (higher failure rate)
      regimeAdjustment = -8;
      logger.info(`📊 [PURE-CONFIDENCE] Bear market adjustment: -8%`);
    } else if (this.marketRegime === 'BULL_MARKET') {
      // Slight boost in strong bull markets 
      regimeAdjustment = +3;
      logger.info(`📊 [PURE-CONFIDENCE] Bull market adjustment: +3%`);
    }
    // Sideways markets: no adjustment (neutral)
    
    confidence += regimeAdjustment;
    
    // 🎯 FINAL BOUNDS: Ensure confidence stays within realistic technical analysis range
    const finalConfidence = Math.min(95, Math.max(0, confidence));
    
    logger.info(`📊 [PURE-CONFIDENCE] Final calculation: ${overallScore.toFixed(1)} + ${confirmationBonus} - ${riskPenalty} + ${regimeAdjustment} = ${finalConfidence.toFixed(1)}%`);
    
    // 🎯 NO ARTIFICIAL BOOSTS: If confidence is low, it means technical setup is genuinely weak
    if (finalConfidence < 15) {
      logger.warn(`📊 [PURE-CONFIDENCE] Low confidence ${finalConfidence.toFixed(1)}% indicates weak technical setup - no artificial boost applied`);
    }
    
    return finalConfidence;
  }
  


  /**
   * 🔄 Determine high probability entry using adaptive thresholds
   */
  _isHighProbabilityEntryAdaptive(overallScore, signalStrength, confirmations, riskFactors) {
    // Get regime-specific thresholds
    let thresholds = this.config.TRENDING_MARKET_THRESHOLDS; // Default
    
    if (this.marketRegime === 'SIDEWAYS' || this.marketRegime === 'SIDEWAYS_LOW_VOL') {
      thresholds = this.config.SIDEWAYS_MARKET_THRESHOLDS;
    } else if (this.marketRegime === 'BEAR_MARKET') {
      thresholds = this.config.BEAR_MARKET_THRESHOLDS;
    }
    
    // Minimum score requirement (adaptive)
    if (overallScore < thresholds.HIGH_PROBABILITY) {
      return false;
    }
    
    // Signal strength requirement (more lenient in sideways)
    const requiredStrengths = this.marketRegime.includes('SIDEWAYS') 
      ? [EntrySignalStrength.MODERATE, EntrySignalStrength.STRONG, EntrySignalStrength.EXCELLENT]
      : [EntrySignalStrength.STRONG, EntrySignalStrength.EXCELLENT];
      
    if (!requiredStrengths.includes(signalStrength)) {
      return false;
    }
    
    // Confirmation requirements (adaptive)
    const requiredConfirmations = this.marketRegime.includes('SIDEWAYS') 
      ? ['volume'] // Only volume required in sideways
      : ['volume', 'breakout']; // Both required in trending
      
    for (const conf of requiredConfirmations) {
      if (!confirmations[conf]) {
        return false;
      }
    }
    
    // Risk factor tolerance (adaptive)
    const maxRiskFactors = this.marketRegime === 'BEAR_MARKET' ? 0 : 1;
    if (riskFactors.length > maxRiskFactors) {
      return false;
    }
    
    return true;
  }

  /**
   * 📊 Evaluate momentum quality based on pure technical analysis (0-100 score)
   */
  async _evaluateMomentumQuality(taapiData, marketData) {
    let score = 0.0;
    const maxScore = 100.0;
    
    try {
      logger.info(`📊 [MOMENTUM] Evaluating momentum indicators...`);
      
      // RSI momentum analysis (30 points max)
      const rsi1h = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      const rsi15m = this._getIndicatorValue(taapiData, 'short_term', 'rsi');
      
      if (rsi1h) {
        let rsiScore = 0;
        
        // Optimal RSI ranges for momentum trading
        if (rsi1h >= 45 && rsi1h <= 65) {
          rsiScore = 25; // Perfect momentum zone
        } else if (rsi1h >= 40 && rsi1h <= 70) {
          rsiScore = 18; // Good momentum zone
        } else if (rsi1h >= 35 && rsi1h <= 75) {
          rsiScore = 12; // Acceptable zone
        } else if (rsi1h > 75) {
          rsiScore = 5; // Overbought but might continue
        } else if (rsi1h < 35) {
          rsiScore = 8; // Oversold recovery potential
        }
        
        // RSI momentum direction (5 points bonus)
        if (rsi15m && rsi15m > rsi1h * 1.03) {
          rsiScore += 5; // Strong rising momentum
        } else if (rsi15m && rsi15m > rsi1h * 1.01) {
          rsiScore += 2; // Mild rising momentum
        }
        
        score += Math.min(30, rsiScore);
        logger.info(`📊 [MOMENTUM] RSI Score: ${Math.min(30, rsiScore)}/30 (RSI: ${rsi1h.toFixed(1)})`);
      }
      
      // MACD momentum analysis (35 points max)
      const macd1h = this._getIndicatorValue(taapiData, 'primary', 'macd');
      
      if (macd1h) {
        let macdScore = 0;
        const macd = macd1h.valueMACD || macd1h.macd || macd1h.value || 0;
        const signal = macd1h.valueMACDSignal || macd1h.signal || 0;
        const histogram = macd1h.valueMACDHist || macd1h.histogram || 0;
        
        // MACD signal strength analysis
        if (macd > signal && histogram > 0) {
          // Perfect bullish setup
          const momentum = Math.abs(histogram);
          if (momentum > Math.abs(macd) * 0.1) {
            macdScore = 35; // Strong bullish momentum
          } else {
            macdScore = 25; // Moderate bullish momentum
          }
        } else if (macd > signal) {
          macdScore = 18; // Bullish crossover but weak momentum
        } else if (histogram > 0 && histogram > Math.abs(macd) * 0.05) {
          macdScore = 12; // Positive momentum building
        } else if (macd > 0) {
          macdScore = 8; // Above zero line
        }
        
        score += macdScore;
        logger.info(`📊 [MOMENTUM] MACD Score: ${macdScore}/35 (MACD: ${macd.toFixed(4)}, Signal: ${signal.toFixed(4)})`);
      }
      
      // ADX trend strength (25 points max)
      const adx = this._getIndicatorValue(taapiData, 'primary', 'adx');
      
      if (adx) {
        let adxScore = 0;
        const adxValue = adx.valueADX || adx.adx || adx.value || adx;
        const plusDI = adx.valuePlusDI || adx.pdi || 0;
        const minusDI = adx.valueMinusDI || adx.mdi || 0;
        
        if (adxValue > 25 && plusDI > minusDI) {
          if (adxValue > 50) {
            adxScore = 25; // Extremely strong bullish trend
          } else if (adxValue > 40) {
            adxScore = 20; // Very strong bullish trend
          } else if (adxValue > 30) {
            adxScore = 15; // Strong bullish trend
          } else {
            adxScore = 10; // Moderate bullish trend
          }
        } else if (adxValue > 20) {
          adxScore = 5; // Weak trend forming
        }
        
        score += adxScore;
        logger.info(`📊 [MOMENTUM] ADX Score: ${adxScore}/25 (ADX: ${adxValue.toFixed(1)})`);
      }
      
      // Price momentum confirmation (10 points max)
      const mom = this._getIndicatorValue(taapiData, 'primary', 'mom');
      
      if (mom) {
        let momScore = 0;
        const momValue = mom.value || mom;
        
        if (momValue > 0) {
          if (momValue > 200) {
            momScore = 10; // Strong positive momentum
          } else if (momValue > 50) {
            momScore = 7; // Good positive momentum
          } else {
            momScore = 4; // Mild positive momentum
          }
        }
        
        score += momScore;
        logger.info(`📊 [MOMENTUM] Price Momentum Score: ${momScore}/10 (Mom: ${momValue.toFixed(2)})`);
      }
      
      const finalScore = Math.min(maxScore, Math.max(0, score));
      logger.info(`📊 [MOMENTUM] Final momentum score: ${finalScore.toFixed(1)}/100`);
      
      return finalScore;
      
    } catch (error) {
      logger.error(`🔍 [DEBUG-MOMENTUM] Error in momentum evaluation: ${error.message}`);
      return 0.0;
    }
  }

  /**
   * Evaluate volume confirmation quality (0-100 score)
   */
  async _evaluateVolumeQuality(taapiData, marketData) {
    let score = 0.0;
    const maxScore = 100.0;
    
    try {
      // Money Flow Index (30 points)
      const mfi = this._getIndicatorValue(taapiData, 'primary', 'mfi');
      if (mfi) {
        if (mfi > 60) {
          score += 30; // Strong money flow
        } else if (mfi > 50) {
          score += 20; // Positive money flow
        } else if (mfi > 40) {
          score += 10; // Neutral money flow
        }
      }
      
      // On Balance Volume trend (25 points)
      const obv = this._getIndicatorValue(taapiData, 'primary', 'obv');
      if (obv) {
        // In real implementation, compare with previous OBV values
        // For now, assume positive if OBV exists
        score += 20;
      }
      
      // Volume Profile analysis (25 points)
      const volumeProfile = this._getIndicatorValue(taapiData, 'primary', 'volume_profile');
      if (volumeProfile) {
        score += 20; // Volume profile shows institutional activity
      }
      
      // Volume spike detection (20 points)
      if (marketData.volumeAnalysis) {
        const volData = marketData.volumeAnalysis;
        const volumeSpikeRatio = volData.volumeSpikeRatio || 1.0;
        
        if (volumeSpikeRatio > 2.0) {
          score += 20; // Strong volume spike
        } else if (volumeSpikeRatio > 1.5) {
          score += 15; // Moderate volume spike
        } else if (volumeSpikeRatio > 1.2) {
          score += 10; // Slight volume increase
        }
      }
      
      return Math.min(maxScore, Math.max(0, score));
      
    } catch (error) {
      logger.warning(`Error in volume evaluation: ${error.message}`);
      return 0.0;
    }
  }

  /**
   * 📊 OPTIMIZED: Enhanced technical setup evaluation (0-100 score)
   * Uses only reliable TAAPI indicators with more sophisticated scoring
   */
  async _evaluateTechnicalSetup(taapiData, marketData) {
    let score = 0.0;
    const maxScore = 100.0;
    
    try {
      logger.info(`📊 [TECHNICAL] Evaluating technical setup indicators...`);
      
      // 🎯 RSI Technical Position (25 points) - Most reliable indicator
      const rsi1h = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      if (rsi1h) {
        let rsiScore = 0;
        
        if (rsi1h >= 40 && rsi1h <= 60) {
          rsiScore = 25; // Perfect bullish momentum zone
        } else if (rsi1h >= 35 && rsi1h <= 65) {
          rsiScore = 20; // Good momentum zone
        } else if (rsi1h >= 30 && rsi1h <= 70) {
          rsiScore = 15; // Acceptable zone
        } else if (rsi1h >= 25 && rsi1h <= 75) {
          rsiScore = 10; // Marginal zone
        } else {
          rsiScore = 5; // Extreme zones still have some potential
        }
        
        score += rsiScore;
        logger.info(`📊 [TECHNICAL] RSI Position Score: ${rsiScore}/25 (RSI: ${rsi1h.toFixed(1)})`);
      }
      
      // 🎯 MACD Technical Alignment (25 points) - Trend strength
      const macd1h = this._getIndicatorValue(taapiData, 'primary', 'macd');
      if (macd1h) {
        let macdScore = 0;
        const macdLine = macd1h.valueMACD || 0;
        const signalLine = macd1h.valueMACDSignal || 0;
        const histogram = macd1h.valueMACDHist || 0;
        
        // MACD above signal line (bullish crossover)
        if (macdLine > signalLine) {
          macdScore += 12;
          
          // Histogram increasing (momentum strengthening)
          if (histogram > 0) {
            macdScore += 8;
            
            // Strong positive histogram
            if (histogram > Math.abs(macdLine) * 0.1) {
              macdScore += 5;
            }
          }
        } else {
          // MACD below signal but still potentially bullish
          if (histogram > -Math.abs(macdLine) * 0.05) {
            macdScore += 8; // Weakening bearish momentum
          }
        }
        
        score += macdScore;
        logger.info(`📊 [TECHNICAL] MACD Alignment Score: ${macdScore}/25 (MACD: ${macdLine.toFixed(4)}, Signal: ${signalLine.toFixed(4)})`);
      }
      
      // 🎯 EMA Trend Alignment (20 points) - Trend direction
      const ema20 = this._getIndicatorValue(taapiData, 'primary', 'ema20');
      const ema50 = this._getIndicatorValue(taapiData, 'primary', 'ema50');
      
      if (ema20 && ema50) {
        let emaScore = 0;
        
        if (ema20 > ema50) {
          emaScore = 20; // Perfect bullish EMA alignment
          logger.info(`📊 [TECHNICAL] EMA Alignment: BULLISH (EMA20: ${ema20.toFixed(2)} > EMA50: ${ema50.toFixed(2)})`);
        } else {
          const difference = ((ema20 - ema50) / ema50) * 100;
          if (difference > -2) {
            emaScore = 12; // Close to crossover
          } else if (difference > -5) {
            emaScore = 8; // Potential reversal
          } else {
            emaScore = 5; // Still in bearish trend but giving some base points
          }
          logger.info(`📊 [TECHNICAL] EMA Alignment: Difference ${difference.toFixed(2)}%`);
        }
        
        score += emaScore;
        logger.info(`📊 [TECHNICAL] EMA Score: ${emaScore}/20`);
      }
      
      // 🎯 Bollinger Bands Position (15 points) - Price momentum
      const bbands = this._getIndicatorValue(taapiData, 'primary', 'bbands');
      if (bbands) {
        let bbandsScore = 0;
        const upper = bbands.valueUpperBand || 0;
        const middle = bbands.valueMiddleBand || 0;
        const lower = bbands.valueLowerBand || 0;
        
        // Use EMA20 as price proxy if no current price
        const priceProxy = ema20 || middle;
        
        if (priceProxy > middle) {
          if (priceProxy < upper * 0.98) {
            bbandsScore = 15; // Near upper band but not touching (good momentum)
          } else if (priceProxy > upper) {
            bbandsScore = 8; // Above upper band (overbought but strong)
          } else {
            bbandsScore = 12; // Above middle, good position
          }
        } else {
          if (priceProxy > lower * 1.05) {
            bbandsScore = 10; // Above lower band, potential bounce
          } else {
            bbandsScore = 6; // Near lower band, oversold potential
          }
        }
        
        score += bbandsScore;
        logger.info(`📊 [TECHNICAL] Bollinger Bands Score: ${bbandsScore}/15`);
      }
      
      // 🎯 ADX Trend Strength (15 points) - Trend confirmation
      const adx = this._getIndicatorValue(taapiData, 'primary', 'adx');
      if (adx) {
        let adxScore = 0;
        
        if (adx >= 30) {
          adxScore = 15; // Strong trend
        } else if (adx >= 25) {
          adxScore = 12; // Moderate trend
        } else if (adx >= 20) {
          adxScore = 8; // Developing trend
        } else {
          adxScore = 5; // Weak trend but still some value
        }
        
        score += adxScore;
        logger.info(`📊 [TECHNICAL] ADX Trend Strength Score: ${adxScore}/15 (ADX: ${adx.toFixed(1)})`);
      }
      
      // 🎯 Bonus: Multi-timeframe RSI Alignment (5 points bonus)
      const rsi15m = this._getIndicatorValue(taapiData, 'short_term', 'rsi');
      const rsi4h = this._getIndicatorValue(taapiData, 'long_term', 'rsi');
      
      if (rsi1h && rsi15m && rsi4h) {
        // All timeframes in bullish zone
        if (rsi1h > 45 && rsi15m > 45 && rsi4h > 45 && rsi4h < 70) {
          score += 5;
          logger.info(`📊 [TECHNICAL] Multi-timeframe RSI Bonus: +5 points`);
        }
      }
      
      const finalScore = Math.min(maxScore, Math.max(0, score));
      logger.info(`📊 [TECHNICAL] Final Technical Score: ${finalScore.toFixed(1)}/100`);
      
      return finalScore;
      
    } catch (error) {
      logger.warn(`⚠️ [TECHNICAL] Error in technical evaluation: ${error.message}`);
      return 35.0; // Default fallback score instead of 0
    }
  }

  /**
   * Evaluate breakout pattern quality (0-100 score)
   */
  async _evaluateBreakoutQuality(taapiData, marketData) {
    let score = 0.0;
    const maxScore = 100.0;
    
    try {
      // TTM Squeeze breakout (40 points)
      const squeeze = this._getIndicatorValue(taapiData, 'primary', 'squeeze');
      if (squeeze) {
        if (squeeze > 0.1) {
          score += 40; // Strong positive momentum
        } else if (squeeze > 0) {
          score += 30; // Positive momentum
        }
      }
      
      // Bollinger Band squeeze and expansion (30 points)
      const bbands = this._getIndicatorValue(taapiData, 'primary', 'bbands');
      if (bbands) {
        const upper = bbands.valueUpperBand || 0;
        const lower = bbands.valueLowerBand || 0;
        const middle = bbands.valueMiddleBand || 0;
        
        if (upper && lower && middle) {
          const bandWidth = (upper - lower) / middle;
          if (bandWidth > 0.04) {
            score += 30; // Bands expanding (breakout)
          } else if (bandWidth > 0.02) {
            score += 20; // Moderate expansion
          }
        }
      }
      
      // Volume breakout confirmation (20 points)
      if (marketData.volumeAnalysis) {
        const breakoutVolumeRatio = marketData.volumeAnalysis.breakoutVolumeRatio || 1.0;
        if (breakoutVolumeRatio > 2.0) {
          score += 20;
        } else if (breakoutVolumeRatio > 1.5) {
          score += 15;
        }
      }
      
      // Price breakout above resistance (10 points)
      if (marketData.resistanceLevels) {
        const currentPrice = marketData.currentPrice || 0;
        const resistance = marketData.resistanceLevels.nearestResistance || 0;
        if (currentPrice && resistance && currentPrice > resistance * 1.005) {
          score += 10;
        }
      }
      
      return Math.min(maxScore, Math.max(0, score));
      
    } catch (error) {
      logger.warning(`Error in breakout evaluation: ${error.message}`);
      return 0.0;
    }
  }

  /**
   * Evaluate multi-timeframe alignment (0-100 score)
   */
  async _evaluateTimeframeAlignment(taapiData, marketData) {
    let score = 0.0;
    const maxScore = 100.0;
    
    try {
      const timeframeScores = {};
      
      // 1h timeframe analysis (primary)
      const rsi1h = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      const macd1h = this._getIndicatorValue(taapiData, 'primary', 'macd');
      
      let tf1hScore = 0;
      if (rsi1h && rsi1h >= 40 && rsi1h <= 70) {
        tf1hScore += 50;
      }
      if (macd1h && this._isMacdBullish(macd1h)) {
        tf1hScore += 50;
      }
      timeframeScores['1h'] = tf1hScore;
      
      // 15m timeframe analysis (short-term)
      const rsi15m = this._getIndicatorValue(taapiData, 'short_term', 'rsi');
      const macd15m = this._getIndicatorValue(taapiData, 'short_term', 'macd');
      
      let tf15mScore = 0;
      if (rsi15m && rsi15m > 50) {
        tf15mScore += 50;
      }
      if (macd15m && this._isMacdBullish(macd15m)) {
        tf15mScore += 50;
      }
      timeframeScores['15m'] = tf15mScore;
      
      // 4h timeframe analysis (trend confirmation)
      const rsi4h = this._getIndicatorValue(taapiData, 'long_term', 'rsi');
      const macd4h = this._getIndicatorValue(taapiData, 'long_term', 'macd');
      
      let tf4hScore = 0;
      if (rsi4h && rsi4h > 40) {
        tf4hScore += 50;
      }
      if (macd4h && this._isMacdBullish(macd4h)) {
        tf4hScore += 50;
      }
      timeframeScores['4h'] = tf4hScore;
      
      // Calculate alignment score
      const totalTimeframes = Object.keys(timeframeScores).length;
      if (totalTimeframes > 0) {
        const alignedTimeframes = Object.values(timeframeScores).filter(score => score >= 50).length;
        const alignmentRatio = alignedTimeframes / totalTimeframes;
        score = alignmentRatio * maxScore;
        
        // Bonus for all timeframes aligned
        if (alignedTimeframes === totalTimeframes && totalTimeframes >= 3) {
          score = Math.min(maxScore, score * 1.1);
        }
      }
      
      return Math.min(maxScore, Math.max(0, score));
      
    } catch (error) {
      logger.warning(`Error in timeframe alignment evaluation: ${error.message}`);
      return 0.0;
    }
  }

  /**
   * Calculate weighted overall score based on strategy priorities
   * OPTIMIZED: Increased technical weight due to improved reliability
   */
  _calculateWeightedScore(momentumScore, volumeScore, technicalScore, breakoutScore, timeframeScore) {
    // 🔧 OPTIMIZED weights - Technical scoring now more reliable, so increased weight
    const weights = {
      momentum: 0.25,      // 25% - Core momentum confirmation  
      technical: 0.20,     // 20% - INCREASED from 10% - More reliable technical scoring
      volume: 0.20,        // 20% - REDUCED from 25% - Volume confirmation important but not primary
      breakout: 0.20,      // 20% - Breakout patterns important
      timeframe: 0.15      // 15% - REDUCED from 20% - Multi-timeframe alignment
    };
    
    const weightedScore = (
      momentumScore * weights.momentum +
      volumeScore * weights.volume +
      technicalScore * weights.technical +
      breakoutScore * weights.breakout +
      timeframeScore * weights.timeframe
    );
    
    const finalScore = Math.min(100.0, Math.max(0.0, weightedScore));
    
    logger.info(`📊 [WEIGHTS] Weighted Score Calculation:`);
    logger.info(`📊 [WEIGHTS] - Momentum: ${momentumScore.toFixed(1)} × ${weights.momentum} = ${(momentumScore * weights.momentum).toFixed(1)}`);
    logger.info(`📊 [WEIGHTS] - Technical: ${technicalScore.toFixed(1)} × ${weights.technical} = ${(technicalScore * weights.technical).toFixed(1)}`);
    logger.info(`📊 [WEIGHTS] - Volume: ${volumeScore.toFixed(1)} × ${weights.volume} = ${(volumeScore * weights.volume).toFixed(1)}`);
    logger.info(`📊 [WEIGHTS] - Breakout: ${breakoutScore.toFixed(1)} × ${weights.breakout} = ${(breakoutScore * weights.breakout).toFixed(1)}`);
    logger.info(`📊 [WEIGHTS] - Timeframe: ${timeframeScore.toFixed(1)} × ${weights.timeframe} = ${(timeframeScore * weights.timeframe).toFixed(1)}`);
    logger.info(`📊 [WEIGHTS] - Final Weighted Score: ${finalScore.toFixed(1)}/100`);
    
    return finalScore;
  }

  /**
   * Determine signal strength based on overall score and component analysis
   */
  _determineSignalStrength(overallScore, componentScores) {
    // Check for critical component failures first
    if (componentScores.volume < 20) {
      return EntrySignalStrength.AVOID; // Poor volume confirmation
    }
    
    if (componentScores.momentum < 25) {
      return EntrySignalStrength.WEAK; // Poor momentum
    }
    
    // Determine strength based on overall score
    if (overallScore >= 85) {
      return EntrySignalStrength.EXCELLENT;
    } else if (overallScore >= 75) {
      return EntrySignalStrength.STRONG;
    } else if (overallScore >= 60) {
      return EntrySignalStrength.MODERATE;
    } else if (overallScore >= 40) {
      return EntrySignalStrength.WEAK;
    } else {
      return EntrySignalStrength.AVOID;
    }
  }

  /**
   * Assess various confirmation criteria
   */
  _assessConfirmations(taapiData, marketData) {
    const confirmations = {
      volume: false,
      momentum: false,
      breakout: false
    };
    
    try {
      // Volume confirmation
      const mfi = this._getIndicatorValue(taapiData, 'primary', 'mfi');
      if (mfi && mfi > 55) {
        confirmations.volume = true;
      }
      
      // Momentum confirmation
      const macd = this._getIndicatorValue(taapiData, 'primary', 'macd');
      const rsi = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      if (macd && this._isMacdBullish(macd) && rsi && rsi >= 45 && rsi <= 70) {
        confirmations.momentum = true;
      }
      
      // Breakout confirmation
      const squeeze = this._getIndicatorValue(taapiData, 'primary', 'squeeze');
      if (squeeze && squeeze > 0) {
        confirmations.breakout = true;
      }
      
    } catch (error) {
      logger.warning(`Error assessing confirmations: ${error.message}`);
    }
    
    return confirmations;
  }

  /**
   * Identify risk factors and warning flags
   */
  async _identifyRiskFactors(taapiData, marketData) {
    const riskFactors = [];
    const warningFlags = [];
    
    try {
      // RSI overbought risk
      const rsi = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      if (rsi && rsi > 75) {
        riskFactors.push("RSI overbought (late entry risk)");
      } else if (rsi && rsi > 70) {
        warningFlags.push("RSI approaching overbought levels");
      }
      
      // Low volume risk
      const mfi = this._getIndicatorValue(taapiData, 'primary', 'mfi');
      if (mfi && mfi < 40) {
        riskFactors.push("Weak money flow (low institutional interest)");
      }
      
      // High volatility risk
      const atr = this._getIndicatorValue(taapiData, 'primary', 'atr');
      const currentPrice = marketData.currentPrice || 0;
      if (atr && currentPrice) {
        const atrPercentage = (atr / currentPrice) * 100;
        if (atrPercentage > 8.0) {
          riskFactors.push("High volatility (increased risk)");
        } else if (atrPercentage > 6.0) {
          warningFlags.push("Elevated volatility levels");
        }
      }
      
      // Market timing risk
      if (marketData.marketHours === 'off_hours') {
        warningFlags.push("Trading outside regular market hours");
      }
      
    } catch (error) {
      logger.warning(`Error identifying risk factors: ${error.message}`);
    }
    
    return { riskFactors, warningFlags };
  }

  /**
   * Assess entry timing quality
   */
  _assessEntryTiming(taapiData, marketData, overallScore) {
    try {
      const rsi = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      
      if (overallScore >= 80) {
        if (rsi && rsi >= 45 && rsi <= 60) {
          return "OPTIMAL";
        } else if (rsi && rsi < 45) {
          return "EARLY";
        } else {
          return "LATE";
        }
      } else if (overallScore >= 60) {
        return rsi && rsi < 65 ? "OPTIMAL" : "LATE";
      } else {
        return "EARLY";
      }
    } catch {
      return "UNKNOWN";
    }
  }

  /**
   * Assess how well signal fits current market phase
   */
  _assessMarketPhaseFit(taapiData, marketData) {
    try {
      const rsi = this._getIndicatorValue(taapiData, 'primary', 'rsi');
      const ema20 = this._getIndicatorValue(taapiData, 'primary', 'ema20');
      const ema50 = this._getIndicatorValue(taapiData, 'primary', 'ema50');
      
      if (rsi && ema20 && ema50) {
        if (ema20 > ema50 && rsi > 50) {
          return "MARKUP";        // Trending up
        } else if (rsi < 40) {
          return "ACCUMULATION"; // Oversold
        } else if (rsi >= 40 && rsi <= 60) {
          return "CONSOLIDATION"; // Range-bound
        } else {
          return "DISTRIBUTION"; // Potentially topping
        }
      }
    } catch {
      // Fall through to default
    }
    
    return "UNKNOWN";
  }

  /**
   * Calculate expected risk-reward ratio
   */
  _calculateRiskRewardRatio(taapiData, marketData, signalStrength) {
    const baseRrr = {
      [EntrySignalStrength.EXCELLENT]: 4.0,
      [EntrySignalStrength.STRONG]: 3.0,
      [EntrySignalStrength.MODERATE]: 2.5,
      [EntrySignalStrength.WEAK]: 2.0,
      [EntrySignalStrength.AVOID]: 1.0
    };
    
    let rrr = baseRrr[signalStrength] || 2.0;
    
    // Adjust based on ATR
    try {
      const atr = this._getIndicatorValue(taapiData, 'primary', 'atr');
      const currentPrice = marketData.currentPrice || 0;
      
      if (atr && currentPrice) {
        const atrPercentage = (atr / currentPrice) * 100;
        if (atrPercentage > 5.0) {
          rrr *= 1.2; // Higher potential reward in high volatility
        } else if (atrPercentage < 2.0) {
          rrr *= 0.9; // Lower potential reward in low volatility
        }
      }
    } catch {
      // Use base ratio
    }
    
    return rrr;
  }

  /**
   * Determine if entry meets high probability criteria (75-90% win rate target)
   */
  _isHighProbabilityEntry(overallScore, signalStrength, confirmations, riskFactors) {
    // Minimum score threshold - 🎯 DANISH PURE MODE: Lowered from 70 to 60
    if (overallScore < 60) {
      return false;
    }
    
    // Minimum signal strength
    if (![EntrySignalStrength.STRONG, EntrySignalStrength.EXCELLENT].includes(signalStrength)) {
      return false;
    }
    
    // Required confirmations for high probability
    const requiredConfirmations = ['volume', 'momentum'];
    for (const conf of requiredConfirmations) {
      if (!confirmations[conf]) {
        return false;
      }
    }
    
    // No critical risk factors
    const criticalRisks = ["RSI overbought (late entry risk)", "Weak money flow (low institutional interest)"];
    for (const risk of riskFactors) {
      if (criticalRisks.some(critical => risk.includes(critical))) {
        return false;
      }
    }
    
    return true;
  }

  // Helper methods
  
  /**
   * 📊 Safely extract indicator value from TAAPI data
   */
  _getIndicatorValue(taapiData, timeframe, indicator) {
    try {
      if (taapiData && taapiData[timeframe] && taapiData[timeframe][indicator]) {
        const result = taapiData[timeframe][indicator];
        
        // Handle nested object structure (some indicators return {value: X})
        if (typeof result === 'object' && result !== null) {
          return result.value || result;
        }
        
        return result;
      }
      
      return null;
    } catch (error) {
      logger.error(`Error extracting ${timeframe}.${indicator}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if MACD shows bullish configuration
   */
  _isMacdBullish(macdData) {
    try {
      const macd = macdData.valueMACD || 0;
      const signal = macdData.valueMACDSignal || 0;
      const histogram = macdData.valueMACDHist || 0;
      return macd > signal && histogram > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create error metrics object
   */
  _createErrorMetrics(errorMsg) {
    return new EntryQualityMetrics({
      overallScore: 0.0,
      signalStrength: EntrySignalStrength.AVOID,
      confidenceLevel: 0.0,
      riskRewardRatio: 1.0,
      riskFactors: [`Evaluation error: ${errorMsg}`],
      warningFlags: [],
      entryTiming: "UNKNOWN",
      marketPhaseFit: "UNKNOWN"
    });
  }

  /**
   * Log entry evaluation for performance tracking
   */
  _logEntryEvaluation(symbol, metrics) {
    this.performanceMetrics.totalSignals += 1;
    
    if (metrics.signalStrength === EntrySignalStrength.EXCELLENT) {
      this.performanceMetrics.excellentSignals += 1;
    } else if (metrics.signalStrength === EntrySignalStrength.STRONG) {
      this.performanceMetrics.strongSignals += 1;
    }
    
    // Store in history for analysis
    this.signalHistory.push({
      symbol,
      timestamp: new Date(),
      overallScore: metrics.overallScore,
      signalStrength: metrics.signalStrength,
      isHighProbability: metrics.isHighProbability,
      riskFactorsCount: metrics.riskFactors.length
    });
    
    // Keep only last 200 evaluations
    if (this.signalHistory.length > 200) {
      this.signalHistory = this.signalHistory.slice(-200);
    }
    
    logger.info(`📈 Entry evaluation complete for ${symbol}: Score ${metrics.overallScore.toFixed(1)}, Strength: ${metrics.signalStrength}`);
  }

  /**
   * Get performance summary for strategy optimization
   */
  getPerformanceSummary() {
    const total = this.performanceMetrics.totalSignals;
    
    return {
      totalEvaluations: total,
      excellentSignals: this.performanceMetrics.excellentSignals,
      strongSignals: this.performanceMetrics.strongSignals,
      excellentPercentage: total > 0 ? (this.performanceMetrics.excellentSignals / total * 100) : 0,
      strongOrExcellentPercentage: total > 0 ? ((this.performanceMetrics.excellentSignals + this.performanceMetrics.strongSignals) / total * 100) : 0,
      recentHighProbabilitySignals: this.signalHistory.slice(-50).filter(s => s.isHighProbability).length,
      signalQualityTrend: this._calculateQualityTrend()
    };
  }

  /**
   * Calculate trend in signal quality over recent evaluations
   */
  _calculateQualityTrend() {
    if (this.signalHistory.length < 20) {
      return "INSUFFICIENT_DATA";
    }
    
    const recent20 = this.signalHistory.slice(-20);
    const previous20 = this.signalHistory.length >= 40 ? this.signalHistory.slice(-40, -20) : [];
    
    if (previous20.length === 0) {
      return "INSUFFICIENT_DATA";
    }
    
    const recentAvg = recent20.reduce((sum, s) => sum + s.overallScore, 0) / recent20.length;
    const previousAvg = previous20.reduce((sum, s) => sum + s.overallScore, 0) / previous20.length;
    
    if (recentAvg > previousAvg * 1.05) {
      return "IMPROVING";
    } else if (recentAvg < previousAvg * 0.95) {
      return "DECLINING";
    } else {
      return "STABLE";
    }
  }
}

module.exports = { 
  HighWinRateEntryFilter, 
  EntryQualityMetrics, 
  EntrySignalStrength, 
  VolumePattern 
}; 