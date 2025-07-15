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


  
// 🔧 ENHANCED createEnhancedSignal method - Handle free plan limitations gracefully
createEnhancedSignal(baseSignal, taapiData, symbol, enhancementType) {
  let signal = baseSignal.signal || 'HOLD';
  let confidence = baseSignal.confidence || 50;
  
  // Ensure reasoning is always an array
  let reasoning = [];
  if (baseSignal.reasoning) {
    if (Array.isArray(baseSignal.reasoning)) {
      reasoning = [...baseSignal.reasoning];
    } else if (typeof baseSignal.reasoning === 'string') {
      reasoning = [baseSignal.reasoning];
    }
  }

  // Adjust confidence and reasoning based on enhancement type
  switch (enhancementType) {
    case 'taapi_enhanced':
      confidence = Math.min(confidence + 15, 95);
      reasoning.push('Enhanced with real TAAPI indicators');
      break;
      
    case 'free_plan_limitation':
      // 🎯 SPECIAL: Free plan limitation - still provide good analysis
      confidence = Math.max(confidence - 5, 25); // Minimal penalty
      reasoning.push(`Free plan: ${symbol} not in supported symbols (BTC, ETH, XRP, LTC, XMR)`);
      reasoning.push('Using enhanced CoinGecko and market analysis');
      break;
      
    case 'taapi_rate_limited':
      confidence = Math.max(confidence - 8, 22);
      reasoning.push('TAAPI rate limited - using enhanced fallback analysis');
      break;
      
    case 'error_fallback':
      confidence = Math.max(confidence - 25, 10);
      reasoning.push('Technical error - using base signal analysis');
      break;
      
    case 'base_only':
      confidence = Math.max(confidence - 5, 25);
      reasoning.push('Using base technical analysis with market data');
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
    },
    plan_info: {
      plan_type: 'free',
      symbol_supported: enhancementType === 'taapi_enhanced',
      supported_symbols: ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'LTCUSDT', 'XMRUSDT']
    }
  };
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

  // 🚨 URGENT FIX: Replace the analyzeTaapiIndicators method in enhancedSignalGenerator.js
// This fixes the "Cannot read properties of undefined (reading 'toFixed')" error

analyzeTaapiIndicators(taapiData) {
  const signals = [];
  const weights = [];
  let totalConfidence = 0;
  let reasoning = [];

  // 🚨 SAFETY CHECK: Ensure taapiData exists
  if (!taapiData || typeof taapiData !== 'object') {
    return {
      signal: 'HOLD',
      confidence: 20,
      reasoning: ['Invalid TAAPI data received']
    };
  }

  // RSI Analysis with null safety
  if (taapiData.rsi !== undefined && taapiData.rsi !== null && typeof taapiData.rsi === 'number') {
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
  } else {
    reasoning.push('RSI data unavailable');
  }

  // MACD Analysis with null safety
  if (taapiData.macd && typeof taapiData.macd === 'object') {
    const macd = taapiData.macd.macd;
    const signal = taapiData.macd.signal;
    const histogram = taapiData.macd.histogram;

    if (typeof macd === 'number' && typeof signal === 'number' && typeof histogram === 'number') {
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
    } else {
      reasoning.push('MACD data incomplete');
    }
  } else {
    reasoning.push('MACD data unavailable');
  }

  // Stochastic Analysis with null safety
  if (taapiData.stochastic && typeof taapiData.stochastic === 'object') {
    const stochK = taapiData.stochastic.k;
    const stochD = taapiData.stochastic.d;

    if (typeof stochK === 'number' && typeof stochD === 'number') {
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
    } else {
      reasoning.push('Stochastic data incomplete');
    }
  } else {
    reasoning.push('Stochastic data unavailable');
  }

  // EMA Trend Analysis with null safety
  if (typeof taapiData.ema20 === 'number' && typeof taapiData.ema50 === 'number') {
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
  } else {
    reasoning.push('EMA data unavailable');
  }

  // ADX Trend Strength with null safety
  if (typeof taapiData.adx === 'number') {
    const adx = taapiData.adx;
    if (adx > 25) {
      totalConfidence += 10;
      reasoning.push(`Strong trend detected (ADX: ${adx.toFixed(1)})`);
    } else {
      totalConfidence -= 10;
      reasoning.push(`Weak trend (ADX: ${adx.toFixed(1)})`);
    }
  } else {
    reasoning.push('ADX data unavailable');
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

  // 🚨 SAFETY: Ensure confidence is a valid number
  if (isNaN(confidence) || !isFinite(confidence)) {
    confidence = 20; // Default safe value
  }

  return {
    signal: finalSignal,
    confidence: Math.min(Math.max(confidence, 1), 95), // Clamp between 1-95
    reasoning: reasoning.length > 0 ? reasoning : ['Analysis completed with limited data']
  };
}

async enhanceSignalWithTaapi(baseSignal, marketData, symbol, timeframe = '1h', riskLevel = 'balanced') {
  const startTime = Date.now();
  
  try {
    logger.info(`🔍 DEBUG: enhanceSignalWithTaapi called for ${symbol}`);
    
    // Check symbol routing with hardcoded whitelist
    const routing = await this.taapiService.symbolManager.routeSymbolRequest(symbol);
    
    if (routing.strategy === 'fallback_only') {
      logger.info(`⏭️ ${symbol} not in free plan whitelist - ${routing.message}`);
      logger.info(`📊 Delivering enhanced fallback analysis for ${symbol}`);
      
      // Create enhanced signal without TAAPI but with better confidence
      return this.createEnhancedSignal(baseSignal, null, symbol, 'free_plan_limitation');
    }
    
    logger.info(`✅ ${symbol} in free plan whitelist - enhancing with TAAPI indicators`);
    
    // Get TAAPI indicators for supported symbols
    const taapiIndicators = await this.taapiService.getBulkIndicators(symbol, timeframe);
    
    logger.info(`🔍 DEBUG: taapiIndicators received for ${symbol}:`, JSON.stringify(taapiIndicators, null, 2));
    
    // Check if we got fallback data (rate limited, etc.)
    if (taapiIndicators && taapiIndicators.isFallbackData) {
      logger.warn(`TAAPI returned fallback data for ${symbol} (rate limited) - using enhanced base signal`);
      return this.createEnhancedSignal(baseSignal, taapiIndicators, symbol, 'taapi_rate_limited');
    }
    
    logger.info(`✅ Real TAAPI data received for ${symbol} - generating enhanced signal`);
    
    // Generate enhanced signal with real TAAPI data
    const enhancedSignal = await this.generateEnhancedSignal(
      baseSignal, 
      marketData, 
      taapiIndicators, 
      riskLevel
    );
    
    const processingTime = Date.now() - startTime;
    logger.info(`Enhanced signal completed for ${symbol}`, {
      signal: enhancedSignal.signal,
      confidence: enhancedSignal.confidence,
      processing_time: processingTime,
      taapi_used: true,
      taapi_available: true,
      data_source: 'real_taapi'
    });
    
    return enhancedSignal;
    
  } catch (error) {
    logger.error(`❌ Signal enhancement failed for ${symbol}:`, error.message);
    
    // Always return a signal - never fail completely
    const fallbackSignal = this.createEnhancedSignal(baseSignal, null, symbol, 'error_fallback');
    return fallbackSignal;
  }
}

// 🔧 ENHANCED createEnhancedSignal method - Handle free plan limitations gracefully
createEnhancedSignal(baseSignal, taapiData, symbol, enhancementType) {
  let signal = baseSignal.signal || 'HOLD';
  let confidence = baseSignal.confidence || 50;
  
  // Ensure reasoning is always an array
  let reasoning = [];
  if (baseSignal.reasoning) {
    if (Array.isArray(baseSignal.reasoning)) {
      reasoning = [...baseSignal.reasoning];
    } else if (typeof baseSignal.reasoning === 'string') {
      reasoning = [baseSignal.reasoning];
    }
  }

  // Adjust confidence and reasoning based on enhancement type
  switch (enhancementType) {
    case 'taapi_enhanced':
      confidence = Math.min(confidence + 15, 95);
      reasoning.push('Enhanced with real TAAPI indicators');
      break;
      
    case 'free_plan_limitation':
      // 🎯 SPECIAL: Free plan limitation - still provide good analysis
      confidence = Math.max(confidence - 5, 25); // Minimal penalty
      reasoning.push(`Free plan: ${symbol} not in supported symbols (BTC, ETH, XRP, LTC, XMR)`);
      reasoning.push('Using enhanced CoinGecko and market analysis');
      break;
      
    case 'taapi_rate_limited':
      confidence = Math.max(confidence - 8, 22);
      reasoning.push('TAAPI rate limited - using enhanced fallback analysis');
      break;
      
    case 'error_fallback':
      confidence = Math.max(confidence - 25, 10);
      reasoning.push('Technical error - using base signal analysis');
      break;
      
    case 'base_only':
      confidence = Math.max(confidence - 5, 25);
      reasoning.push('Using base technical analysis with market data');
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
    },
    plan_info: {
      plan_type: 'free',
      symbol_supported: enhancementType === 'taapi_enhanced',
      supported_symbols: ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'LTCUSDT', 'XMRUSDT']
    }
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

  shouldUseTaapiEnhancement(symbol) {
    // This is now handled by the dynamic symbol manager
    // The routing decision is made at the service level
    return true; // Let the service decide
  }

  getServiceHealth() {
    try {
      const cacheEntries = Array.from(this.signalCache.entries()).slice(0, 3).map(([key, value]) => ({
        key,
        age_minutes: Math.floor((Date.now() - value.timestamp) / 60000),
        signal: value.signal?.signal
      }));

      return {
        signal_generator: 'healthy',
        cache_size: this.signalCache.size,
        cache_entries: cacheEntries,
        taapi: this.taapiService ? {
          available: true,
          service_type: 'enhanced_v2'
        } : {
          available: false,
          service_type: 'none'
        }
      };
    } catch (error) {
      return {
        signal_generator: 'error',
        error: error.message,
        cache_size: 0
      };
    }
  }

  // Clear old cache entries periodically
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.signalCache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.signalCache.delete(key);
      }
    }
  }
}

module.exports = EnhancedSignalGenerator;