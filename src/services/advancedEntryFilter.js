class AdvancedEntryFilter {
    constructor(config) {
      this.config = config;
      this.performanceMetrics = {
        total_signals: 0,
        excellent_signals: 0,
        strong_signals: 0
      };
      this.signalHistory = [];
    }
  
    async evaluateEntryQuality(symbol, taapiData, marketData) {
      try {
        // Component scores
        const momentumScore = this.calculateMomentumScore(taapiData);
        const volumeScore = this.calculateVolumeScore(taapiData);
        const technicalScore = this.calculateTechnicalScore(taapiData);
        const breakoutScore = this.calculateBreakoutScore(taapiData);
        const timeframeScore = this.calculateTimeframeAlignmentScore(taapiData);
  
        // Weighted overall score
        const overallScore = this.calculateWeightedScore({
          momentum: momentumScore,
          volume: volumeScore,
          technical: technicalScore,
          breakout: breakoutScore,
          timeframe: timeframeScore
        });
  
        // Determine signal strength
        const signalStrength = this.determineSignalStrength(overallScore, {
          momentum: momentumScore,
          volume: volumeScore,
          technical: technicalScore,
          breakout: breakoutScore,
          timeframe: timeframeScore
        });
  
        // Assess confirmations
        const confirmations = this.assessConfirmations(taapiData, marketData);
  
        // Identify risk factors
        const riskFactors = this.identifyRiskFactors(taapiData, marketData);
  
        // Determine if high probability
        const isHighProbability = this.determineHighProbability(overallScore, confirmations, riskFactors);
  
        // Calculate confidence level
        const confidenceLevel = Math.min(100, overallScore + (confirmations.volume ? 5 : 0) + (confirmations.breakout ? 5 : 0));
  
        const entryMetrics = {
          overall_score: overallScore,
          signal_strength: signalStrength,
          confidence_level: confidenceLevel,
          risk_reward_ratio: this.calculateRiskRewardRatio(overallScore),
          momentum_score: momentumScore,
          volume_score: volumeScore,
          technical_score: technicalScore,
          breakout_score: breakoutScore,
          timeframe_alignment_score: timeframeScore,
          is_high_probability: isHighProbability,
          has_volume_confirmation: confirmations.volume,
          has_momentum_confirmation: confirmations.momentum,
          has_breakout_confirmation: confirmations.breakout,
          risk_factors: riskFactors,
          warning_flags: this.identifyWarningFlags(taapiData, marketData),
          entry_timing: this.assessEntryTiming(taapiData),
          market_phase_fit: this.assessMarketPhaseFit(taapiData)
        };
  
        // Track performance
        this.trackEntryEvaluation(symbol, entryMetrics);
  
        return entryMetrics;
  
      } catch (error) {
        return this.createErrorMetrics(error.message);
      }
    }
  
    calculateMomentumScore(taapiData) {
      let score = 0;
      const primary = taapiData.primary || {};
  
      // RSI momentum
      const rsi = this.extractIndicatorValue(primary.rsi);
      if (rsi >= 40 && rsi <= 65) score += 25;
      else if (rsi >= 35 && rsi <= 70) score += 15;
  
      // MACD momentum
      const macd = primary.macd || {};
      if (this.isMacdBullish(macd)) score += 25;
  
      // EMA alignment
      if (this.checkEmaAlignment(primary)) score += 25;
  
      // ADX strength
      const adx = this.extractIndicatorValue(primary.adx);
      if (adx >= 25) score += 25;
  
      return Math.min(100, score);
    }
  
    calculateVolumeScore(taapiData) {
      let score = 0;
      const primary = taapiData.primary || {};
  
      // MFI (Money Flow Index)
      const mfi = this.extractIndicatorValue(primary.mfi);
      if (mfi >= 55) score += 30;
      else if (mfi >= 45) score += 20;
  
      // OBV trend
      const obv = this.extractIndicatorValue(primary.obv);
      if (obv) score += 20; // Simplified - would need trend analysis
  
      // Volume spike detection
      const volumeSpike = this.detectVolumeSpike(primary.volume);
      if (volumeSpike >= 1.8) score += 50;
      else if (volumeSpike >= 1.5) score += 30;
  
      return Math.min(100, score);
    }
  
    calculateTechnicalScore(taapiData) {
      let score = 0;
      const primary = taapiData.primary || {};
  
      // Bollinger Bands position
      const bbands = primary.bbands || {};
      if (this.isInBollingerBandRange(bbands)) score += 25;
  
      // Stochastic RSI
      const stochrsi = primary.stochrsi || {};
      if (this.isStochRSIBullish(stochrsi)) score += 25;
  
      // Williams %R
      const williams = this.extractIndicatorValue(primary.williams);
      if (williams >= -80 && williams <= -20) score += 25;
  
      // ATR for volatility
      const atr = this.extractIndicatorValue(primary.atr);
      if (atr) score += 25; // Simplified
  
      return Math.min(100, score);
    }
  
    calculateBreakoutScore(taapiData) {
      let score = 0;
      const primary = taapiData.primary || {};
  
      // Squeeze momentum
      const squeeze = this.extractIndicatorValue(primary.squeeze);
      if (squeeze > 0) score += 40;
  
      // Bollinger Band squeeze
      if (this.detectBollingerSqueeze(primary.bbands)) score += 30;
  
      // Volatility expansion
      if (this.detectVolatilityExpansion(primary.atr)) score += 30;
  
      return Math.min(100, score);
    }
  
    calculateTimeframeAlignmentScore(taapiData) {
      let score = 0;
  
      // Check alignment across timeframes
      const primaryRsi = this.extractIndicatorValue(taapiData.primary?.rsi);
      const shortTermRsi = this.extractIndicatorValue(taapiData.short_term?.rsi);
      const longTermRsi = this.extractIndicatorValue(taapiData.long_term?.rsi);
  
      if (primaryRsi > 45 && shortTermRsi > 45 && longTermRsi > 45) {
        score += 50;
      }
  
      // MACD alignment
      if (this.isMacdBullish(taapiData.primary?.macd) && 
          this.isMacdBullish(taapiData.short_term?.macd)) {
        score += 50;
      }
  
      return Math.min(100, score);
    }
  
    calculateWeightedScore(componentScores) {
      const weights = {
        momentum: 0.30,
        volume: 0.25,
        breakout: 0.20,
        timeframe: 0.15,
        technical: 0.10
      };
  
      return Object.entries(componentScores).reduce((total, [component, score]) => {
        return total + (score * weights[component]);
      }, 0);
    }
  
    determineSignalStrength(overallScore, componentScores) {
      // Check for critical failures
      if (componentScores.volume < 20) return 'AVOID';
      if (componentScores.momentum < 25) return 'WEAK';
  
      // Determine based on overall score
      if (overallScore >= 85) return 'EXCELLENT';
      if (overallScore >= 75) return 'STRONG';
      if (overallScore >= 60) return 'MODERATE';
      if (overallScore >= 40) return 'WEAK';
      return 'AVOID';
    }
  
    assessConfirmations(taapiData, marketData) {
      const confirmations = {
        volume: false,
        momentum: false,
        breakout: false
      };
  
      // Volume confirmation
      const mfi = this.extractIndicatorValue(taapiData.primary?.mfi);
      if (mfi && mfi > 55) confirmations.volume = true;
  
      // Momentum confirmation
      const macd = taapiData.primary?.macd || {};
      const rsi = this.extractIndicatorValue(taapiData.primary?.rsi);
      if (this.isMacdBullish(macd) && rsi >= 45 && rsi <= 70) {
        confirmations.momentum = true;
      }
  
      // Breakout confirmation
      const squeeze = this.extractIndicatorValue(taapiData.primary?.squeeze);
      if (squeeze && squeeze > 0) confirmations.breakout = true;
  
      return confirmations;
    }
  
    identifyRiskFactors(taapiData, marketData) {
      const riskFactors = [];
  
      // RSI overbought
      const rsi = this.extractIndicatorValue(taapiData.primary?.rsi);
      if (rsi >= 75) riskFactors.push("RSI overbought (late entry risk)");
  
      // Weak money flow
      const mfi = this.extractIndicatorValue(taapiData.primary?.mfi);
      if (mfi < 45) riskFactors.push("Weak money flow (low institutional interest)");
  
      // High volatility
      const atr = this.extractIndicatorValue(taapiData.primary?.atr);
      if (atr) { // Simplified volatility check
        // Would need historical ATR comparison
      }
  
      return riskFactors;
    }
  
    identifyWarningFlags(taapiData, marketData) {
      const warnings = [];
  
      // Divergence warnings
      if (this.detectRsiDivergence(taapiData)) {
        warnings.push("RSI divergence detected");
      }
  
      // Volume warnings
      if (this.detectVolumeWeakness(taapiData)) {
        warnings.push("Volume weakness detected");
      }
  
      return warnings;
    }
  
    determineHighProbability(overallScore, confirmations, riskFactors) {
      // High probability criteria
      if (overallScore < 75) return false;
      if (!confirmations.volume || !confirmations.momentum) return false;
      if (riskFactors.some(risk => risk.includes("overbought") || risk.includes("Weak money flow"))) return false;
      return true;
    }
  
    // Helper methods
    extractIndicatorValue(indicatorData) {
      if (!indicatorData) return 0;
      if (typeof indicatorData === 'number') return indicatorData;
      return indicatorData.value || indicatorData.result || 0;
    }
  
    isMacdBullish(macdData) {
      if (!macdData) return false;
      const macd = macdData.valueMACD || 0;
      const signal = macdData.valueMACDSignal || 0;
      const histogram = macdData.valueMACDHist || 0;
      return macd > signal && histogram > 0;
    }
  
    checkEmaAlignment(primaryData) {
      const ema20 = this.extractIndicatorValue(primaryData.ema20);
      const ema50 = this.extractIndicatorValue(primaryData.ema50);
      const ema200 = this.extractIndicatorValue(primaryData.ema200);
      return ema20 > ema50 && ema50 > ema200;
    }
  
    detectVolumeSpike(volumeData) {
      // Mock calculation - would need historical volume data
      return 2.0;
    }
  
    isInBollingerBandRange(bbandsData) {
      // Simplified - would need price comparison
      return true;
    }
  
    isStochRSIBullish(stochrsiData) {
      const fastK = this.extractIndicatorValue(stochrsiData.valueFastK);
      const fastD = this.extractIndicatorValue(stochrsiData.valueFastD);
      return fastK > fastD && fastK > 20;
    }
  
    detectBollingerSqueeze(bbandsData) {
      const upper = bbandsData?.valueUpperBand || 0;
      const lower = bbandsData?.valueLowerBand || 0;
      const middle = bbandsData?.valueMiddleBand || 0;
      const bandwidth = middle > 0 ? ((upper - lower) / middle) : 0;
      return bandwidth < 0.1;
    }
  
    detectVolatilityExpansion(atrData) {
      // Simplified - would need historical ATR comparison
      return true;
    }
  
    detectRsiDivergence(taapiData) {
      // Simplified - would need price and RSI history
      return false;
    }
  
    detectVolumeWeakness(taapiData) {
      const mfi = this.extractIndicatorValue(taapiData.primary?.mfi);
      return mfi < 40;
    }
  
    calculateRiskRewardRatio(overallScore) {
      const baseRatio = 2.0;
      const bonus = overallScore > 80 ? 1.0 : 0.0;
      return baseRatio + bonus;
    }
  
    assessEntryTiming(taapiData) {
      const rsi = this.extractIndicatorValue(taapiData.primary?.rsi);
      if (rsi >= 70) return 'LATE';
      if (rsi >= 45 && rsi <= 65) return 'OPTIMAL';
      return 'EARLY';
    }
  
    assessMarketPhaseFit(taapiData) {
      const adx = this.extractIndicatorValue(taapiData.primary?.adx);
      if (adx >= 30) return 'TRENDING';
      if (adx >= 20) return 'CONSOLIDATION';
      return 'CHOPPY';
    }
  
    trackEntryEvaluation(symbol, metrics) {
      this.performanceMetrics.total_signals++;
      if (metrics.signal_strength === 'EXCELLENT') {
        this.performanceMetrics.excellent_signals++;
      } else if (metrics.signal_strength === 'STRONG') {
        this.performanceMetrics.strong_signals++;
      }
  
      this.signalHistory.push({
        symbol: symbol,
        timestamp: new Date(),
        overall_score: metrics.overall_score,
        signal_strength: metrics.signal_strength,
        is_high_probability: metrics.is_high_probability
      });
  
      // Keep only last 200 evaluations
      if (this.signalHistory.length > 200) {
        this.signalHistory = this.signalHistory.slice(-200);
      }
    }
  
    createErrorMetrics(errorMsg) {
      return {
        overall_score: 0,
        signal_strength: 'AVOID',
        confidence_level: 0,
        risk_reward_ratio: 1.0,
        momentum_score: 0,
        volume_score: 0,
        technical_score: 0,
        breakout_score: 0,
        timeframe_alignment_score: 0,
        is_high_probability: false,
        has_volume_confirmation: false,
        has_momentum_confirmation: false,
        has_breakout_confirmation: false,
        risk_factors: [`Evaluation error: ${errorMsg}`],
        warning_flags: [],
        entry_timing: 'UNKNOWN',
        market_phase_fit: 'UNKNOWN'
      };
    }
  
    getPerformanceMetrics() {
      const total = this.performanceMetrics.total_signals;
      return {
        total_evaluations: total,
        excellent_signals: this.performanceMetrics.excellent_signals,
        strong_signals: this.performanceMetrics.strong_signals,
        excellent_percentage: total > 0 ? (this.performanceMetrics.excellent_signals / total) * 100 : 0,
        strong_or_excellent_percentage: total > 0 ? ((this.performanceMetrics.excellent_signals + this.performanceMetrics.strong_signals) / total) * 100 : 0
      };
    }
  }


  module.exports = { AdvancedEntryFilter };