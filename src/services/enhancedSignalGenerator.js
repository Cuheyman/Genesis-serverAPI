// src/services/enhancedSignalGenerator.js
const EnhancedTaapiServiceV2 = require('./enhancedTaapiServiceV2');
const logger = require('../utils/logger');

class EnhancedSignalGenerator {
  constructor(taapiService = null) {
    // Use provided service or create new V2 service
    this.taapiService = taapiService || new EnhancedTaapiServiceV2();
    this.signalCache = new Map();
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes cache for signals
    
    logger.info('🚀 Enhanced Signal Generator V2 initialized');
  }

  async enhanceSignalWithTaapi(baseSignal, marketData, symbol, timeframe = '1h', riskLevel = 'balanced') {
    const startTime = Date.now();
    
    try {
      logger.info(`🔍 DEBUG: enhanceSignalWithTaapi called for ${symbol}`);
      
      // Check if symbol should use TAAPI (dynamic routing)
      const routing = await this.taapiService.symbolManager.routeSymbolRequest(symbol);
      
      if (routing.strategy === 'fallback_only') {
        logger.info(`⏭️ Skipping TAAPI for ${symbol} - ${routing.source}`);
        return this.createEnhancedSignal(baseSignal, null, symbol, 'symbol_unsupported');
      }
      
      logger.info(`Enhancing signal for ${symbol} with TAAPI indicators`);
      
      // Get TAAPI indicators using the queue system
      const taapiIndicators = await this.taapiService.getBulkIndicators(symbol, timeframe);
      
      logger.info(`🔍 DEBUG: taapiIndicators received for ${symbol}:`, JSON.stringify(taapiIndicators, null, 2));
      
      // Check if we got fallback data
      if (taapiIndicators && taapiIndicators.isFallbackData) {
        logger.warn(`TAAPI returned fallback data for ${symbol}, using base signal`);
        return this.createEnhancedSignal(baseSignal, taapiIndicators, symbol, 'taapi_fallback');
      }
      
      logger.info(`✅ DEBUG: TAAPI data check passed for ${symbol} - using real TAAPI data`);
      
      // Check signal cache
      const cacheKey = `signal_${symbol}_${Math.floor(Date.now() / 300000)}`;
      if (this.signalCache.has(cacheKey)) {
        const cached = this.signalCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
          logger.debug(`Using cached enhanced signal for ${symbol}`);
          return cached.signal;
        }
      }
      
      logger.info(`🔄 DEBUG: Generating enhanced signal for ${symbol} with real TAAPI data`);
      
      // Generate enhanced signal with TAAPI data
      const enhancedSignal = await this.generateEnhancedSignal(
        baseSignal, 
        marketData, 
        taapiIndicators, 
        riskLevel
      );
      
      logger.info(`✅ DEBUG: Enhanced signal generated successfully for ${symbol}`);
      
      // Cache the result
      this.signalCache.set(cacheKey, {
        signal: enhancedSignal,
        timestamp: Date.now()
      });
      
      const processingTime = Date.now() - startTime;
      logger.info(`Enhanced signal completed for ${symbol}`, {
        signal: enhancedSignal.signal,
        confidence: enhancedSignal.confidence,
        processing_time: processingTime,
        taapi_used: true,
        taapi_available: true,
        rsi_value: taapiIndicators.rsi
      });
      
      return enhancedSignal;
      
    } catch (error) {
      logger.error(`❌ DEBUG: Signal enhancement failed for ${symbol}:`, error.message);
      logger.error(`Signal enhancement failed, falling back to base signal:`, error);
      
      const fallbackSignal = this.createEnhancedSignal(baseSignal, null, symbol, 'error_fallback');
      return fallbackSignal;
    }
  }

  async generateEnhancedSignal(baseSignal, marketData, taapiIndicators, riskLevel) {
    try {
      // Analyze TAAPI indicators if available
      let taapiAnalysis = null;
      if (taapiIndicators && !taapiIndicators.isFallbackData) {
        taapiAnalysis = this.analyzeTaapiIndicators(taapiIndicators);
      }
      
      // Combine base signal with TAAPI analysis
      if (taapiAnalysis) {
        return this.combineSignals(baseSignal, taapiAnalysis, taapiIndicators);
      } else {
        // Use base signal with reduced confidence
        return this.createEnhancedSignal(baseSignal, taapiIndicators, baseSignal.symbol, 'base_only');
      }
      
    } catch (error) {
      logger.error('Error generating enhanced signal:', error);
      return this.createEnhancedSignal(baseSignal, null, baseSignal.symbol, 'generation_error');
    }
  }

  shouldUseTaapiEnhancement(symbol) {
    // This is now handled by the dynamic symbol manager
    // The routing decision is made at the service level
    return true; // Let the service decide
  }

  createEnhancedSignal(baseSignal, taapiData, symbol, enhancementType) {
    let signal = baseSignal.signal || 'HOLD';
    let confidence = baseSignal.confidence || 50;
    let reasoning = baseSignal.reasoning || [];

    // Adjust confidence based on enhancement type
    switch (enhancementType) {
      case 'taapi_enhanced':
        // TAAPI data successfully used
        confidence = Math.min(confidence + 15, 95);
        reasoning.push('Enhanced with real TAAPI indicators');
        break;
      case 'taapi_fallback':
        confidence = Math.max(confidence - 10, 20);
        reasoning.push('TAAPI unavailable - using enhanced fallback');
        break;
      case 'symbol_unsupported':
        confidence = Math.max(confidence - 15, 15);
        reasoning.push('Symbol not supported by current TAAPI plan');
        break;
      case 'error_fallback':
        confidence = Math.max(confidence - 25, 10);
        reasoning.push('TAAPI error - using base signal only');
        break;
      case 'base_only':
        confidence = Math.max(confidence - 5, 25);
        reasoning.push('Using base technical analysis');
        break;
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
        isFallbackData: taapiData.isFallbackData || false,
        realIndicators: taapiData.realIndicators || 0
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
    if (taapiData.rsi !== undefined && taapiData.rsi !== null) {
      const rsi = taapiData.rsi;
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
    if (taapiData.macd && taapiData.macd.macd !== undefined) {
      const macd = taapiData.macd.macd;
      const signal = taapiData.macd.signal;
      const histogram = taapiData.macd.histogram;

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
    if (taapiData.stochastic && taapiData.stochastic.k !== undefined) {
      const stochK = taapiData.stochastic.k;
      const stochD = taapiData.stochastic.d;

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
    if (taapiData.ema20 !== undefined && taapiData.ema50 !== undefined) {
      const ema20 = taapiData.ema20;
      const ema50 = taapiData.ema50;

      if (ema20 > ema50) {
        signals.push('BUY');
        weights.push(0.15);
        reasoning.push('Short-term EMA above long-term');
        totalConfidence += 65;
      } else if (ema20 < ema50) {
        signals.push('SELL');
        weights.push(0.15);
        reasoning.push('Short-term EMA below long-term');
        totalConfidence += 65;
      }
    }

    // ADX Trend Strength
    if (taapiData.adx !== undefined) {
      const adx = taapiData.adx;
      if (adx > 25) {
        totalConfidence += 10;
        reasoning.push(`Strong trend detected (ADX: ${adx.toFixed(1)})`);
      } else {
        totalConfidence -= 10;
        reasoning.push(`Weak trend (ADX: ${adx.toFixed(1)})`);
      }
    }

    // Calculate weighted signal
    const buySignals = signals.filter(s => s === 'BUY').length;
    const sellSignals = signals.filter(s => s === 'SELL').length;
    
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

  combineSignals(baseSignal, taapiAnalysis, taapiData) {
    const baseWeight = 0.4;
    const taapiWeight = 0.6;

    const signalToValue = { 'BUY': 1, 'HOLD': 0, 'SELL': -1 };

    const baseValue = signalToValue[baseSignal.signal] || 0;
    const taapiValue = signalToValue[taapiAnalysis.signal] || 0;

    const combinedValue = (baseValue * baseWeight) + (taapiValue * taapiWeight);
    
    let finalSignal = 'HOLD';
    if (combinedValue > 0.3) {
      finalSignal = 'BUY';
    } else if (combinedValue < -0.3) {
      finalSignal = 'SELL';
    }

    const baseConfidence = baseSignal.confidence || 50;
    const taapiConfidence = taapiAnalysis.confidence || 50;
    const combinedConfidence = (baseConfidence * baseWeight) + (taapiConfidence * taapiWeight);

    let confidenceBoost = 0;
    if (baseSignal.signal === taapiAnalysis.signal && finalSignal !== 'HOLD') {
      confidenceBoost = 15;
    } else if (baseSignal.signal !== taapiAnalysis.signal) {
      confidenceBoost = -10;
    }

    return {
      symbol: baseSignal.symbol || 'UNKNOWN',
      signal: finalSignal,
      confidence: Math.max(Math.min(combinedConfidence + confidenceBoost, 95), 5),
      reasoning: [
        `Base signal: ${baseSignal.signal} (${baseConfidence}%)`,
        `TAAPI signal: ${taapiAnalysis.signal} (${taapiConfidence}%)`,
        ...taapiAnalysis.reasoning
      ],
      timestamp: Date.now(),
      enhancement_type: 'taapi_enhanced',
      taapi_data: {
        source: taapiData.source,
        isFallbackData: false,
        realIndicators: taapiData.realIndicators || 4
      },
      base_signal: {
        signal: baseSignal.signal,
        confidence: baseSignal.confidence
      }
    };
  }

  async shouldAvoidEntry(symbol, signalType, marketData) {
    try {
      // Check symbol routing first
      const routing = await this.taapiService.symbolManager.routeSymbolRequest(symbol);
      if (routing.strategy === 'fallback_only') {
        return {
          avoid: false,
          reason: 'Symbol not supported by TAAPI - no avoidance restrictions'
        };
      }

      // Use cached data if available
      const cacheKey = `avoid_${symbol}_${Math.floor(Date.now() / 600000)}`;
      const cached = this.signalCache.get(cacheKey);
      if (cached) {
        return cached.avoidance;
      }

      // Get TAAPI indicators for avoidance check
      const taapiData = await this.taapiService.getBulkIndicators(symbol, '1h');
      
      if (!taapiData || taapiData.isFallbackData) {
        return {
          avoid: false,
          reason: 'TAAPI unavailable - no avoidance restrictions'
        };
      }

      const avoidanceChecks = [];

      // Extreme RSI conditions
      if (taapiData.rsi !== undefined) {
        const rsi = taapiData.rsi;
        if ((signalType === 'BUY' && rsi > 80) || (signalType === 'SELL' && rsi < 20)) {
          avoidanceChecks.push(`Extreme RSI (${rsi.toFixed(1)})`);
        }
      }

      // Strong opposing trend
      if (taapiData.adx !== undefined && taapiData.adx > 40) {
        if (taapiData.ema20 !== undefined && taapiData.ema50 !== undefined) {
          const trendUp = taapiData.ema20 > taapiData.ema50;
          if ((signalType === 'SELL' && trendUp) || (signalType === 'BUY' && !trendUp)) {
            avoidanceChecks.push(`Strong opposing trend (ADX: ${taapiData.adx.toFixed(1)})`);
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
  async getServiceHealth() {
    try {
      const taapiHealth = await this.taapiService.getServiceHealth();
      
      return {
        taapi: taapiHealth.taapi,
        service_version: 'enhanced_signal_generator_v2',
        cache_size: this.signalCache.size,
        cache_entries: Array.from(this.signalCache.keys()).slice(0, 5)
      };
    } catch (error) {
      return {
        taapi: { available: false, error: error.message },
        service_version: 'enhanced_signal_generator_v2_error',
        cache_size: this.signalCache.size
      };
    }
  }

  // Clear caches and reset services
  reset() {
    this.signalCache.clear();
    this.taapiService.reset();
    logger.info('Enhanced signal generator V2 reset');
  }
}

module.exports = EnhancedSignalGenerator;