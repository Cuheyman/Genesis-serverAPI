// src/services/enhancedSignalGenerator.js
const OptimizedTaapiService = require('./optimizedTaapiService');
const logger = require('../utils/logger');

class EnhancedSignalGenerator {
  constructor(taapiService = null) {
    // 🚀 CRITICAL FIX: Use OptimizedTaapiService for Pro Plan bulk queries
    this.taapiService = taapiService || new OptimizedTaapiService();
    this.signalCache = new Map();
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes cache for signals
    
    // 🔄 Batch processing for Pro Plan optimization
    this.batchQueue = new Map(); // Queue symbols for batch processing
    this.batchTimeout = null;
    this.batchDelay = 100; // 100ms delay to collect symbols for batching
    this.maxBatchSize = 20; // Pro plan can handle 20 symbols per request
  
    // 🇩🇰 DANISH STRATEGY CONFIG
    this.danishConfig = {
      IGNORE_BEARISH_SIGNALS: true,
      ONLY_BULLISH_ENTRIES: true,
      REQUIRE_VOLUME_CONFIRMATION: true,
      REQUIRE_BREAKOUT_CONFIRMATION: true,
      MIN_CONFLUENCE_SCORE: 65,
      MIN_CONFIDENCE_SCORE: 70,  // CRITICAL: 70% minimum
      EXCELLENT_ENTRY_THRESHOLD: 80,
      MOMENTUM_THRESHOLDS: {
        rsi_oversold_entry: 38,
        rsi_momentum_sweet_spot: [40, 65],
        rsi_overbought_avoid: 72,  // CRITICAL: No entries above 72
        macd_histogram_min: 0.001,
        volume_spike_min: 1.8,
        breakout_confirmation: 0.5
      }
    };
    logger.info('🔍 DEBUG: Service type:', this.taapiService.constructor.name);
    logger.info('🔍 DEBUG: isProPlan:', this.taapiService.isProPlan);
    logger.info('🔍 DEBUG: bulkEnabled:', this.taapiService.bulkEnabled);
    logger.info('🔍 DEBUG: TAAPI_FREE_PLAN_MODE env:', process.env.TAAPI_FREE_PLAN_MODE);
    logger.info('🚀 Enhanced Signal Generator V3 initialized with Pro Plan Optimization & Danish Strategy');
  }

  // 🔧 MAIN METHOD: Enhanced Signal Generation with Pro Plan Bulk Query Optimization
  async enhanceSignalWithTaapi(baseSignal, marketData, symbol, timeframe = '1h', riskLevel = 'balanced') {
    const startTime = Date.now();
    
    try {
      logger.info(`🔍 DEBUG: enhanceSignalWithTaapi called for ${symbol}`);
      
      // 🚀 OPTIMIZATION: Use batch processing for Pro Plan
      if (this.taapiService.isProPlan && this.taapiService.bulkEnabled) {
        return await this.enhanceSignalWithBatchOptimization(baseSignal, marketData, symbol, timeframe, riskLevel, startTime);
      }
      
      // 🔄 FALLBACK: Individual processing for free plan or when batch is disabled
      return await this.enhanceSignalIndividual(baseSignal, marketData, symbol, timeframe, riskLevel, startTime);
      
    } catch (error) {
      logger.error(`❌ DEBUG: Signal enhancement failed for ${symbol}:`, error.message);
      logger.error(`Signal enhancement failed, falling back to base signal:`, error);
      
      const fallbackSignal = this.createEnhancedSignal(baseSignal, null, symbol, 'error_fallback');
      return fallbackSignal;
    }
  }

  // 🚀 PRO PLAN: Batch-optimized signal enhancement
  async enhanceSignalWithBatchOptimization(baseSignal, marketData, symbol, timeframe, riskLevel, startTime) {
    // Create a promise for this symbol that will be resolved when batch processes
    return new Promise((resolve, reject) => {
      // Add to batch queue
      this.batchQueue.set(symbol, {
        baseSignal,
        marketData,
        timeframe,
        riskLevel,
        startTime,
        resolve,
        reject
      });

      logger.info(`📦 Added ${symbol} to batch queue (${this.batchQueue.size} symbols queued)`);

      // Set up batch processing timer
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.batchDelay);

      // If batch is full, process immediately
      if (this.batchQueue.size >= this.maxBatchSize) {
        clearTimeout(this.batchTimeout);
        this.processBatch();
      }
    });
  }

  // 🔄 BATCH PROCESSOR: Process multiple symbols in single TAAPI request
  async processBatch() {
    if (this.batchQueue.size === 0) return;

    const batch = new Map(this.batchQueue);
    this.batchQueue.clear();
    this.batchTimeout = null;

    const symbols = Array.from(batch.keys());
    logger.info(`🚀 Processing batch of ${symbols.length} symbols: ${symbols.join(', ')}`);

    try {
      // 🔥 CORE: Get indicators for all symbols in single bulk request
      const bulkResults = await this.taapiService.getBulkIndicatorsOptimized(symbols, '1h', 'binance');
      
      // Process each symbol's result
      for (const [symbol, request] of batch) {
        try {
          const taapiIndicators = bulkResults[symbol];
          
          if (!taapiIndicators || taapiIndicators.isFallbackData) {
            logger.warn(`⚠️ Fallback data for ${symbol} in batch`);
            const fallbackSignal = this.createEnhancedSignal(request.baseSignal, taapiIndicators, symbol, 'taapi_fallback');
            request.resolve(fallbackSignal);
            continue;
          }

          logger.info(`✅ Pro Plan data received for ${symbol} - ${taapiIndicators.realIndicators} indicators`);
          
          // Generate enhanced signal
          const enhancedSignal = await this.generateEnhancedSignal(
            request.baseSignal, 
            request.marketData, 
            taapiIndicators, 
            request.riskLevel
          );
          
          // 🇩🇰 Apply Danish Strategy Filter
          const technicalData = {
            rsi: taapiIndicators.rsi,
            adx: taapiIndicators.adx,
            volume_ratio: taapiIndicators.volume_ratio || 1.0
          };
          
          const danishFilteredSignal = this.applyDanishStrategyFilter(enhancedSignal, technicalData, request.marketData);
          
          // Log results
          const processingTime = Date.now() - request.startTime;
          logger.info(`Enhanced signal completed for ${symbol}`, {
            signal: danishFilteredSignal.signal,
            confidence: danishFilteredSignal.confidence,
            processing_time: processingTime,
            taapi_used: true,
            taapi_available: true,
            data_source: "real_taapi_bulk",
            danish_filter_applied: danishFilteredSignal.danish_filter_applied
          });
          
          request.resolve(danishFilteredSignal);
          
        } catch (symbolError) {
          logger.error(`❌ Error processing ${symbol} in batch:`, symbolError.message);
          const errorSignal = this.createEnhancedSignal(request.baseSignal, null, symbol, 'batch_error');
          request.resolve(errorSignal);
        }
      }
      
    } catch (batchError) {
      logger.error(`❌ Batch processing failed:`, batchError.message);
      
      // Resolve all requests with fallback signals
      for (const [symbol, request] of batch) {
        const fallbackSignal = this.createEnhancedSignal(request.baseSignal, null, symbol, 'batch_failed');
        request.resolve(fallbackSignal);
      }
    }
  }

  // 🔄 INDIVIDUAL: Fallback to individual processing (Free Plan or batch disabled)
  async enhanceSignalIndividual(baseSignal, marketData, symbol, timeframe, riskLevel, startTime) {
    logger.info(`🔄 Processing ${symbol} individually (Free Plan or batch disabled)`);
    
    // Check if symbol should use TAAPI (dynamic routing)
    const routing = await this.taapiService.symbolManager?.routeSymbolRequest?.(symbol) || { strategy: 'taapi_direct' };
    
    if (routing.strategy === 'fallback_only') {
      logger.info(`⏭️ Skipping TAAPI for ${symbol} - ${routing.source}`);
      return this.createEnhancedSignal(baseSignal, null, symbol, 'symbol_unsupported');
    }
    
    logger.info(`✅ ${symbol} supported - enhancing with TAAPI indicators`);
    
    // Get TAAPI indicators (legacy method for individual requests)
    const taapiIndicators = await this.taapiService.getBulkIndicatorsLegacy?.(symbol, timeframe) || 
                            await this.taapiService.getSingleSymbolIndicators?.(symbol, timeframe, 'binance') ||
                            this.taapiService.getFallbackData(symbol);
    
    logger.info(`🔍 DEBUG: taapiIndicators received for ${symbol}:`, JSON.stringify(taapiIndicators, null, 2));
    
    // Check if we got fallback data
    if (taapiIndicators && taapiIndicators.isFallbackData) {
      logger.warn(`TAAPI returned fallback data for ${symbol}, using base signal`);
      return this.createEnhancedSignal(baseSignal, taapiIndicators, symbol, 'taapi_fallback');
    }
    
    logger.info(`✅ Real TAAPI data received for ${symbol} - generating enhanced signal`);
    
    // Generate the initial enhanced signal
    const enhancedSignal = await this.generateEnhancedSignal(
      baseSignal, 
      marketData, 
      taapiIndicators, 
      riskLevel
    );
    
    // 🇩🇰 CRITICAL: Apply Danish Strategy Filter BEFORE returning
    logger.info(`🇩🇰 BEFORE Danish Filter: ${symbol} - ${enhancedSignal.signal} at ${enhancedSignal.confidence}%`);
    
    const technicalData = {
      rsi: taapiIndicators.rsi,
      adx: taapiIndicators.adx,
      volume_ratio: taapiIndicators.volume_ratio || 1.0
    };
    
    const danishFilteredSignal = this.applyDanishStrategyFilter(enhancedSignal, technicalData, marketData);
    
    logger.info(`🇩🇰 AFTER Danish Filter: ${symbol} - ${danishFilteredSignal.signal} at ${danishFilteredSignal.confidence}%`);
    logger.info(`🔍 Filter Applied: ${danishFilteredSignal.danish_filter_applied || 'NONE'}`);
    
    // Cache the result
    const cacheKey = `signal_${symbol}_${Math.floor(Date.now() / 300000)}`;
    this.signalCache.set(cacheKey, {
      signal: danishFilteredSignal,
      timestamp: Date.now()
    });
    
    const processingTime = Date.now() - startTime;
    logger.info(`Enhanced signal completed for ${symbol}`, {
      signal: danishFilteredSignal.signal,
      confidence: danishFilteredSignal.confidence,
      processing_time: processingTime,
      taapi_used: true,
      taapi_available: true,
      data_source: "real_taapi_individual",
      danish_filter_applied: danishFilteredSignal.danish_filter_applied
    });
    
    return danishFilteredSignal;
  }

  // 🇩🇰 DANISH STRATEGY FILTER
  applyDanishStrategyFilter(momentumSignal, technicalData, marketData) {
    try {
      logger.info(`🇩🇰 APPLYING Danish Strategy Filter for ${marketData.symbol || 'UNKNOWN'}`);
      logger.info(`🔍 Initial Signal: ${momentumSignal.signal}, Confidence: ${momentumSignal.confidence}%`);
      
      // Extract technical data with null safety
      const rsi = technicalData?.rsi || momentumSignal?.technical_data?.rsi || 50;
      const adx = technicalData?.adx || momentumSignal?.technical_data?.adx || 20;
      const volumeRatio = technicalData?.volume_ratio || momentumSignal?.volume_analysis?.volume_ratio || 1.0;
      
      logger.info(`📊 Technical Data: RSI=${rsi}, ADX=${adx}, Volume Ratio=${volumeRatio}`);
      
      // 🇩🇰 RULE 1: MINIMUM CONFIDENCE REQUIREMENT (CRITICAL)
      if (momentumSignal.confidence < this.danishConfig.MIN_CONFIDENCE_SCORE) {
        logger.info(`❌ DANISH FILTER: Confidence ${momentumSignal.confidence}% < ${this.danishConfig.MIN_CONFIDENCE_SCORE}% minimum`);
        return {
          ...momentumSignal,
          signal: 'HOLD',
          action: 'HOLD',
          confidence: momentumSignal.confidence,
          reasoning: `Danish Strategy: Confidence ${momentumSignal.confidence.toFixed(1)}% below minimum ${this.danishConfig.MIN_CONFIDENCE_SCORE}% - waiting for better setup`,
          danish_filter_applied: 'MIN_CONFIDENCE_NOT_MET',
          strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
          entry_quality: 'REJECTED_LOW_CONFIDENCE'
        };
      }

      // 🇩🇰 RULE 2: RSI OVERBOUGHT AVOIDANCE (CRITICAL)
      if (rsi > this.danishConfig.MOMENTUM_THRESHOLDS.rsi_overbought_avoid) {
        logger.info(`❌ DANISH FILTER: RSI ${rsi.toFixed(1)} > ${this.danishConfig.MOMENTUM_THRESHOLDS.rsi_overbought_avoid} (overbought) - avoiding late entry`);
        return {
          ...momentumSignal,
          signal: 'HOLD',
          action: 'HOLD',
          confidence: Math.max(25, momentumSignal.confidence - 30),
          reasoning: `Danish Strategy: RSI overbought (${rsi.toFixed(1)}) - avoiding late entry, waiting for pullback`,
          danish_filter_applied: 'RSI_OVERBOUGHT_AVOIDED',
          strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
          entry_quality: 'REJECTED_OVERBOUGHT'
        };
      }

      // 🇩🇰 RULE 3: IGNORE ALL BEARISH SIGNALS
      if (this.danishConfig.IGNORE_BEARISH_SIGNALS && momentumSignal.signal === 'SELL') {
        logger.info(`❌ DANISH FILTER: SELL signal rejected - only bullish entries allowed`);
        return {
          ...momentumSignal,
          signal: 'HOLD',
          action: 'HOLD',
          confidence: 0,
          reasoning: 'Danish Strategy: Bearish signals ignored - only bullish entries allowed',
          danish_filter_applied: 'BEARISH_SIGNAL_FILTERED',
          strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
          entry_quality: 'REJECTED_BEARISH'
        };
      }

      // 🇩🇰 RULE 4: VOLUME CONFIRMATION REQUIRED
      if (this.danishConfig.REQUIRE_VOLUME_CONFIRMATION) {
        if (volumeRatio < this.danishConfig.MOMENTUM_THRESHOLDS.volume_spike_min) {
          logger.info(`❌ DANISH FILTER: Volume ratio ${volumeRatio.toFixed(2)} < ${this.danishConfig.MOMENTUM_THRESHOLDS.volume_spike_min} required`);
          return {
            ...momentumSignal,
            signal: 'HOLD',
            action: 'HOLD',
            confidence: Math.max(20, momentumSignal.confidence - 25),
            reasoning: `Danish Strategy: Volume confirmation required (${volumeRatio.toFixed(2)}x vs ${this.danishConfig.MOMENTUM_THRESHOLDS.volume_spike_min}x minimum)`,
            danish_filter_applied: 'VOLUME_CONFIRMATION_REQUIRED',
            strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
            entry_quality: 'REJECTED_LOW_VOLUME'
          };
        }
      }

      // 🇩🇰 RULE 5: TREND STRENGTH REQUIREMENT (ADX)
      const adxMinimum = 25; // Strong trend requirement
      if (adx < adxMinimum) {
        logger.info(`❌ DANISH FILTER: ADX ${adx} < ${adxMinimum} (weak trend) - waiting for stronger momentum`);
        return {
          ...momentumSignal,
          signal: 'HOLD',
          action: 'HOLD',
          confidence: Math.max(30, momentumSignal.confidence - 20),
          reasoning: `Danish Strategy: Weak trend strength (ADX: ${adx}) - waiting for stronger momentum (>25)`,
          danish_filter_applied: 'WEAK_TREND_AVOIDED',
          strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
          entry_quality: 'REJECTED_WEAK_TREND'
        };
      }

      // ✅ SIGNAL PASSED ALL DANISH FILTERS
      logger.info(`✅ DANISH FILTER: Signal PASSED all filters - generating enhanced signal`);
      
      // Calculate Danish compliance score
      const danishComplianceScore = this.calculateDanishComplianceScore(momentumSignal, {
        rsi, adx, volumeRatio
      });

      // Enhance the signal with Danish strategy validation
      const enhancedSignal = {
        ...momentumSignal,
        strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
        danish_strategy_validated: true,
        danish_compliance_score: danishComplianceScore,
        danish_filter_applied: 'ALL_FILTERS_PASSED',
        entry_quality: momentumSignal.confidence >= this.danishConfig.EXCELLENT_ENTRY_THRESHOLD ? 
          'EXCELLENT_DANISH_SETUP' : 'GOOD_DANISH_SETUP',
        reasoning: `Danish Strategy: High-quality ${momentumSignal.signal} signal (${momentumSignal.confidence.toFixed(1)}% confidence) with volume and momentum confirmation`
      };

      logger.info(`✅ DANISH RESULT: ${enhancedSignal.signal} signal with ${enhancedSignal.confidence.toFixed(1)}% confidence`);
      return enhancedSignal;

    } catch (error) {
      logger.error('❌ Danish strategy filter error:', error);
      // Return HOLD signal on filter error to be safe
      return {
        signal: 'HOLD',
        action: 'HOLD',
        confidence: 20,
        reasoning: 'Danish strategy filter error - defaulting to HOLD for safety',
        danish_filter_applied: 'ERROR_HOLD',
        strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
        entry_quality: 'ERROR'
      };
    }
  }

  // 🇩🇰 DANISH COMPLIANCE CALCULATION
  calculateDanishComplianceScore(signal, technicalData) {
    let score = 0;
    const { rsi, adx, volumeRatio } = technicalData;
    
    // Confidence requirement (25 points)
    if (signal.confidence >= this.danishConfig.MIN_CONFIDENCE_SCORE) {
      score += 25;
    }
    
    // RSI not overbought (20 points)
    if (rsi <= this.danishConfig.MOMENTUM_THRESHOLDS.rsi_overbought_avoid) {
      score += 20;
    }
    
    // Volume confirmation (20 points)
    if (volumeRatio >= this.danishConfig.MOMENTUM_THRESHOLDS.volume_spike_min) {
      score += 20;
    }
    
    // Trend strength (15 points)
    if (adx >= 25) {
      score += 15;
    }
    
    // Only bullish signals (5 points)
    if (signal.signal !== 'SELL') {
      score += 5;
    }
    
    return Math.min(100, score);
  }

  // SIGNAL GENERATION HELPER
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

  // TAAPI INDICATOR ANALYSIS
  analyzeTaapiIndicators(taapiData) {
    const signals = [];
    const weights = [];
    let totalConfidence = 0;
    let reasoning = [];

    // Safety check
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

    // Safety check
    if (isNaN(confidence) || !isFinite(confidence)) {
      confidence = 20;
    }

    return {
      signal: finalSignal,
      confidence: Math.min(Math.max(confidence, 1), 95),
      reasoning: reasoning.length > 0 ? reasoning : ['Analysis completed with limited data']
    };
  }

  // SIGNAL COMBINATION
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

  // ENHANCED SIGNAL CREATION
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
        
      case 'symbol_unsupported':
        confidence = Math.max(confidence - 5, 25);
        reasoning.push(`${symbol} not in supported symbols - using enhanced analysis`);
        break;
        
      case 'taapi_fallback':
        confidence = Math.max(confidence - 8, 22);
        reasoning.push('TAAPI rate limited - using enhanced fallback analysis');
        break;
        
      case 'error_fallback':
        confidence = Math.max(confidence - 25, 10);
        reasoning.push('Technical error - using base signal analysis');
        break;

      case 'batch_error':
        confidence = Math.max(confidence - 15, 15);
        reasoning.push('Batch processing error - using base signal analysis');
        break;

      case 'batch_failed':
        confidence = Math.max(confidence - 20, 10);
        reasoning.push('Bulk query failed - using base signal analysis');
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
      }
    };
  }

  // 🔧 SERVICE HEALTH CHECK
  getServiceHealth() {
    try {
      const cacheEntries = Array.from(this.signalCache.entries()).slice(0, 3).map(([key, value]) => ({
        key,
        age_minutes: Math.floor((Date.now() - value.timestamp) / 60000),
        signal: value.signal?.signal
      }));

      return {
        signal_generator: 'healthy',
        version: 'v3_pro_optimized',
        cache_size: this.signalCache.size,
        cache_entries: cacheEntries,
        batch_queue_size: this.batchQueue.size,
        pro_plan_optimization: this.taapiService?.isProPlan || false,
        bulk_enabled: this.taapiService?.bulkEnabled || false,
        max_batch_size: this.maxBatchSize,
        danish_strategy: 'enabled',
        confidence_threshold: this.danishConfig.MIN_CONFIDENCE_SCORE,
        rsi_threshold: this.danishConfig.MOMENTUM_THRESHOLDS.rsi_overbought_avoid,
        taapi: this.taapiService ? {
          available: true,
          service_type: 'optimized_pro_plan',
          stats: this.taapiService.getServiceStats?.() || {}
        } : {
          available: false,
          service_type: 'none'
        }
      };
    } catch (error) {
      return {
        signal_generator: 'error',
        error: error.message,
        cache_size: 0,
        batch_queue_size: this.batchQueue.size
      };
    }
  }

  // 🧹 CACHE CLEANUP
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.signalCache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.signalCache.delete(key);
      }
    }
  }

  // 🚨 FORCE BATCH PROCESSING (for testing/debugging)
  forceBatchProcess() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    return this.processBatch();
  }
}

module.exports = EnhancedSignalGenerator;