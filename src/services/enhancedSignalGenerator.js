// src/services/enhancedSignalGenerator.js
const EnhancedTaapiService = require('./enhancedTaapiService');
const logger = require('../utils/logger');

class EnhancedSignalGenerator {
  constructor() {
    this.taapiService = new EnhancedTaapiService();
    this.signalCache = new Map();
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes cache for signals
  }

  async enhanceSignalWithTaapi(baseSignal, marketData, symbol, timeframe = '1h', riskLevel = 'balanced') {
    const startTime = Date.now(); // ✅ ADD: Missing startTime variable
    
    try {
      logger.info(`🔍 DEBUG: enhanceSignalWithTaapi called for ${symbol}`);
      logger.info(`Enhancing signal for ${symbol} with Taapi indicators`);
      
      // ✅ SINGLE CALL: Get TAAPI indicators once
      const taapiIndicators = await this.taapiService.getBulkIndicators(symbol, timeframe);
      
      logger.info(`🔍 DEBUG: taapiIndicators received for ${symbol}:`, JSON.stringify(taapiIndicators, null, 2));
      
      // ✅ Check if we got fallback data instead of real TAAPI data
      if (taapiIndicators && taapiIndicators.isFallbackData) {
        logger.warn(`TAAPI returned fallback data for ${symbol}, using base signal`);
        throw new Error('TAAPI returned fallback data instead of real indicators');
      }
      
      logger.info(`✅ DEBUG: TAAPI data check passed for ${symbol} - using real TAAPI data`);
      
      // ✅ Check if we should use Taapi enhancement
      if (!this.shouldUseTaapiEnhancement || !this.shouldUseTaapiEnhancement(symbol)) {
        logger.info(`Skipping Taapi enhancement for ${symbol}`);
        return this.createEnhancedSignal ? 
          this.createEnhancedSignal(baseSignal, null, symbol, 'base_only') : 
          { ...baseSignal, enhanced_by: 'base_only' };
      }
      
      // ✅ Check signal cache first
      const cacheKey = `signal_${symbol}_${Math.floor(Date.now() / 300000)}`; // 5-minute buckets
      if (this.signalCache && this.signalCache.has && this.signalCache.has(cacheKey)) {
        const cached = this.signalCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < (this.cacheExpiry || 300000)) {
          logger.debug(`Using cached enhanced signal for ${symbol}`);
          return cached.signal;
        }
      }
      
      logger.info(`🔄 DEBUG: Generating enhanced signal for ${symbol} with real TAAPI data`);
      
      // ✅ Generate enhanced signal with TAAPI data
      let enhancedSignal;
      if (this.generateEnhancedSignal) {
        enhancedSignal = await this.generateEnhancedSignal(
          baseSignal, 
          marketData, 
          taapiIndicators, 
          riskLevel
        );
      } else {
        // ✅ Fallback: Create basic enhanced signal if method doesn't exist
        enhancedSignal = {
          ...baseSignal,
          taapi_data: taapiIndicators,
          enhanced_by: 'taapi_integration',
          enhancement_quality: 'partial' // Since only RSI is real
        };
      }
      
      logger.info(`✅ DEBUG: Enhanced signal generated successfully for ${symbol}`);
      
      // ✅ Cache the result if cache is available
      if (this.signalCache && this.signalCache.set) {
        this.signalCache.set(cacheKey, {
          signal: enhancedSignal,
          timestamp: Date.now()
        });
      }
      
      const processingTime = Date.now() - startTime;
      logger.info(`Enhanced signal completed for ${symbol}`, {
        signal: enhancedSignal.signal,
        confidence: enhancedSignal.confidence,
        processing_time: processingTime,
        taapi_used: true,
        taapi_available: true,
        rsi_value: taapiIndicators.rsi // ✅ Log actual RSI value received
      });
      
      return enhancedSignal;
      
    } catch (error) {
      logger.error(`❌ DEBUG: Signal enhancement failed for ${symbol}:`, error.message);
      logger.error(`Signal enhancement failed, falling back to base signal:`, error);
      
      // ✅ Create fallback signal
      const fallbackSignal = this.createEnhancedSignal ? 
        this.createEnhancedSignal(baseSignal, null, symbol, 'error_fallback') :
        { ...baseSignal, enhanced_by: 'error_fallback', warnings: [error.message] };
        
      return fallbackSignal;
    }
  }

  shouldUseTaapiEnhancement(symbol) {
    // Check service status
    const serviceStatus = this.taapiService.getServiceStatus();
    if (!serviceStatus.available) {
      logger.debug(`Taapi service unavailable for ${symbol}`);
      return false;
    }

    // Skip enhancement for known problematic symbols
    const problematicSymbols = [
      'ENAUSDT', 'HYPERUSDT', 'VIRTUALUSDT', 'NEIROUSDT', 
      'FUNUSDT', 'HBARUSDT', 'XTZUSDT'
    ];
    
    if (problematicSymbols.includes(symbol)) {
      logger.debug(`Skipping Taapi for problematic symbol: ${symbol}`);
      return false;
    }

    return true;
  }

  createEnhancedSignal(baseSignal, taapiData, symbol, enhancementType) {
    let signal = baseSignal.signal || 'HOLD';
    let confidence = baseSignal.confidence || 50;
    let reasoning = baseSignal.reasoning || [];

    if (taapiData && taapiData.source === 'taapi') {
      // Apply Taapi-based enhancements
      const taapiAnalysis = this.analyzeTaapiIndicators(taapiData);
      
      // Combine base signal with Taapi analysis
      const combinedAnalysis = this.combineSignals(baseSignal, taapiAnalysis);
      
      signal = combinedAnalysis.signal;
      confidence = combinedAnalysis.confidence;
      reasoning = [...reasoning, ...combinedAnalysis.reasoning];
    } else {
      // Fallback logic - adjust confidence based on enhancement type
      switch (enhancementType) {
        case 'fallback':
          confidence = Math.max(confidence - 20, 10);
          reasoning.push('Taapi unavailable - using fallback analysis');
          break;
        case 'error_fallback':
          confidence = Math.max(confidence - 30, 5);
          reasoning.push('Taapi error - using base signal only');
          break;
        case 'base_only':
          confidence = Math.max(confidence - 10, 15);
          reasoning.push('Using base technical analysis only');
          break;
      }
    }

    return {
      symbol,
      signal,
      confidence: Math.round(confidence),
      reasoning,
      timestamp: Date.now(),
      enhancement_type: enhancementType,
      taapi_data: taapiData ? {
        source: taapiData.source,
        confidence: taapiData.confidence
      } : null,
      base_signal: {
        signal: baseSignal.signal,
        confidence: baseSignal.confidence
      }
    };
  }

  analyzeTaapiIndicators(taapiData) {
    const signals = [];
    const weights = [];
    let totalConfidence = 0;
    let reasoning = [];

    // RSI Analysis
    if (taapiData.rsi && taapiData.rsi.value) {
      const rsi = taapiData.rsi.value;
      if (rsi > 70) {
        signals.push('SELL');
        weights.push(0.25);
        reasoning.push(`RSI overbought (${rsi.toFixed(1)})`);
        totalConfidence += 80;
      } else if (rsi < 30) {
        signals.push('BUY');
        weights.push(0.25);
        reasoning.push(`RSI oversold (${rsi.toFixed(1)})`);
        totalConfidence += 80;
      } else if (rsi > 60) {
        signals.push('SELL');
        weights.push(0.1);
        reasoning.push(`RSI trending high (${rsi.toFixed(1)})`);
        totalConfidence += 60;
      } else if (rsi < 40) {
        signals.push('BUY');
        weights.push(0.1);
        reasoning.push(`RSI trending low (${rsi.toFixed(1)})`);
        totalConfidence += 60;
      }
    }

    // MACD Analysis
    if (taapiData.macd && taapiData.macd.valueMACD !== undefined) {
      const macd = taapiData.macd.valueMACD;
      const signal = taapiData.macd.valueMACDSignal;
      const histogram = taapiData.macd.valueMACDHist;

      if (macd > signal && histogram > 0) {
        signals.push('BUY');
        weights.push(0.2);
        reasoning.push('MACD bullish crossover');
        totalConfidence += 75;
      } else if (macd < signal && histogram < 0) {
        signals.push('SELL');
        weights.push(0.2);
        reasoning.push('MACD bearish crossover');
        totalConfidence += 75;
      }
    }

    // Stochastic Analysis
    if (taapiData.stoch && taapiData.stoch.valueK) {
      const stochK = taapiData.stoch.valueK;
      const stochD = taapiData.stoch.valueD;

      if (stochK > 80 && stochD > 80) {
        signals.push('SELL');
        weights.push(0.15);
        reasoning.push(`Stochastic overbought (K:${stochK.toFixed(1)})`);
        totalConfidence += 70;
      } else if (stochK < 20 && stochD < 20) {
        signals.push('BUY');
        weights.push(0.15);
        reasoning.push(`Stochastic oversold (K:${stochK.toFixed(1)})`);
        totalConfidence += 70;
      }
    }

    // EMA Trend Analysis
    if (taapiData.ema20 && taapiData.ema50 && taapiData.ema20.value && taapiData.ema50.value) {
      const ema20 = taapiData.ema20.value;
      const ema50 = taapiData.ema50.value;

      if (ema20 > ema50) {
        signals.push('BUY');
        weights.push(0.15);
        reasoning.push('Short-term EMA above long-term');
        totalConfidence += 65;
      } else {
        signals.push('SELL');
        weights.push(0.15);
        reasoning.push('Short-term EMA below long-term');
        totalConfidence += 65;
      }
    }

    // ADX Trend Strength
    if (taapiData.adx && taapiData.adx.value) {
      const adx = taapiData.adx.value;
      if (adx > 25) {
        // Strong trend - increase confidence of other signals
        totalConfidence += 10;
        reasoning.push(`Strong trend detected (ADX: ${adx.toFixed(1)})`);
      } else {
        // Weak trend - decrease confidence
        totalConfidence -= 10;
        reasoning.push(`Weak trend (ADX: ${adx.toFixed(1)})`);
      }
    }

    // Calculate weighted signal
    const buySignals = signals.filter((s, i) => s === 'BUY').length;
    const sellSignals = signals.filter((s, i) => s === 'SELL').length;
    
    let finalSignal = 'HOLD';
    let confidence = Math.max(totalConfidence / Math.max(signals.length, 1), 20);

    if (buySignals > sellSignals && buySignals >= 2) {
      finalSignal = 'BUY';
    } else if (sellSignals > buySignals && sellSignals >= 2) {
      finalSignal = 'SELL';
    } else {
      confidence = Math.max(confidence - 20, 10);
      reasoning.push('Mixed signals - holding position');
    }

    return {
      signal: finalSignal,
      confidence: Math.min(confidence, 95),
      reasoning: reasoning
    };
  }

  combineSignals(baseSignal, taapiAnalysis) {
    const baseWeight = 0.4;
    const taapiWeight = 0.6;

    // Convert signals to numeric values for calculation
    const signalToValue = { 'BUY': 1, 'HOLD': 0, 'SELL': -1 };
    const valueToSignal = { 1: 'BUY', 0: 'HOLD', '-1': 'SELL' };

    const baseValue = signalToValue[baseSignal.signal] || 0;
    const taapiValue = signalToValue[taapiAnalysis.signal] || 0;

    // Calculate weighted average
    const combinedValue = (baseValue * baseWeight) + (taapiValue * taapiWeight);
    
    // Determine final signal based on combined value
    let finalSignal = 'HOLD';
    if (combinedValue > 0.3) {
      finalSignal = 'BUY';
    } else if (combinedValue < -0.3) {
      finalSignal = 'SELL';
    }

    // Calculate combined confidence
    const baseConfidence = baseSignal.confidence || 50;
    const taapiConfidence = taapiAnalysis.confidence || 50;
    const combinedConfidence = (baseConfidence * baseWeight) + (taapiConfidence * taapiWeight);

    // Boost confidence if signals agree
    let confidenceBoost = 0;
    if (baseSignal.signal === taapiAnalysis.signal && finalSignal !== 'HOLD') {
      confidenceBoost = 15;
    } else if (baseSignal.signal !== taapiAnalysis.signal) {
      confidenceBoost = -10;
    }

    return {
      signal: finalSignal,
      confidence: Math.max(Math.min(combinedConfidence + confidenceBoost, 95), 5),
      reasoning: [
        `Base signal: ${baseSignal.signal} (${baseConfidence}%)`,
        `Taapi signal: ${taapiAnalysis.signal} (${taapiConfidence}%)`,
        ...taapiAnalysis.reasoning
      ]
    };
  }

  async shouldAvoidEntry(symbol, signalType, marketData) {
    try {
      // Quick validation without heavy Taapi calls
      if (!this.shouldUseTaapiEnhancement(symbol)) {
        return {
          avoid: false,
          reason: 'Taapi unavailable - proceeding with base analysis'
        };
      }

      // Use cached data if available
      const cacheKey = `avoid_${symbol}_${Math.floor(Date.now() / 600000)}`; // 10-minute buckets
      const cached = this.signalCache.get(cacheKey);
      if (cached) {
        return cached.avoidance;
      }

      // Get minimal indicators for avoidance check
      const taapiData = await this.taapiService.getBulkIndicators(symbol, '1h', 'binance');
      
      if (!taapiData || taapiData.source === 'fallback') {
        return {
          avoid: false,
          reason: 'Taapi unavailable - no avoidance restrictions'
        };
      }

      // Check for extreme conditions that suggest avoiding entry
      const avoidanceChecks = [];

      // Extreme RSI conditions
      if (taapiData.rsi && taapiData.rsi.value) {
        const rsi = taapiData.rsi.value;
        if ((signalType === 'BUY' && rsi > 80) || (signalType === 'SELL' && rsi < 20)) {
          avoidanceChecks.push(`Extreme RSI (${rsi.toFixed(1)})`);
        }
      }

      // Strong opposing trend
      if (taapiData.adx && taapiData.adx.value > 40) {
        // Very strong trend - be cautious about counter-trend entries
        if (taapiData.ema20 && taapiData.ema50) {
          const trendUp = taapiData.ema20.value > taapiData.ema50.value;
          if ((signalType === 'SELL' && trendUp) || (signalType === 'BUY' && !trendUp)) {
            avoidanceChecks.push(`Strong opposing trend (ADX: ${taapiData.adx.value.toFixed(1)})`);
          }
        }
      }

      const shouldAvoid = avoidanceChecks.length >= 2;
      const result = {
        avoid: shouldAvoid,
        reason: shouldAvoid ? avoidanceChecks.join(', ') : 'No avoidance conditions detected'
      };

      // Cache the result
      this.signalCache.set(cacheKey, {
        avoidance: result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      logger.error('Entry avoidance check failed:', error);
      return {
        avoid: false,
        reason: 'Avoidance check failed - proceeding with caution'
      };
    }
  }

  // Get service health status
  getServiceHealth() {
    return {
      taapi: this.taapiService.getServiceStatus(),
      cache_size: this.signalCache.size,
      cache_entries: Array.from(this.signalCache.keys()).slice(0, 5) // Sample entries
    };
  }

  // Clear caches and reset services
  reset() {
    this.signalCache.clear();
    this.taapiService.reset();
    logger.info('Enhanced signal generator reset');
  }
}

module.exports = EnhancedSignalGenerator;