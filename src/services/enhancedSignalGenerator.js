// src/services/enhancedSignalGenerator.js
const OptimizedTaapiService = require('./optimizedTaapiService');
const logger = require('../utils/logger');

const { AdvancedScalpingSystem } = require('./advancedScalpingSystem'); 


class EnhancedSignalGenerator {
  constructor(taapiService = null) {
    // 🚀 CRITICAL FIX: Use OptimizedTaapiService for Pro Plan bulk queries
    this.taapiService = taapiService || new OptimizedTaapiService();
    this.signalCache = new Map();
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes cache for signals
    
    


    this.scalpingSystem= new AdvancedScalpingSystem(this.taapiService);

    this.binanceClient = null;
    this.offChainService = null;

    // 🔄 Batch processing for Pro Plan optimization
    this.batchQueue = new Map(); // Queue symbols for batch processing
    this.batchTimeout = null;
    this.batchDelay = 100; // 100ms delay to collect symbols for batching
    this.maxBatchSize = 20; // Pro plan can handle 20 symbols per request
  
    // 🔄 DOWNTREND FILTER
    this.downtrendFilter = {
      rejectionStats: {
        total_checked: 0,
        downtrend_rejected: 0,
        weak_trend_rejected: 0,
        passed_filter: 0
      }
    };
    // 🇩🇰 DANISH STRATEGY CONFIG (DUAL-TIER FOR 18-25% MONTHLY ROI TARGET):
    this.danishConfig = {
      IGNORE_BEARISH_SIGNALS: true,
      ONLY_BULLISH_ENTRIES: true,
      REQUIRE_VOLUME_CONFIRMATION: true,
      REQUIRE_BREAKOUT_CONFIRMATION: true, // Vælger udelukkende at handle på udvælgte, stærke bullish setups
      
      // 🎯 TIER 1: ULTRA-SELECTIVE (Original Backtested - 2-3 signals/month)
      MIN_CONFLUENCE_SCORE: 65, // Minimum confluence percentage for entry
      MIN_CONFIDENCE_SCORE: 55,  // 🎯 DANISH PURE MODE: Lowered from 60 to 55 - 55-70% trust API directly, 70%+ immediate execution
      EXCELLENT_ENTRY_THRESHOLD: 80, // Threshold for "excellent" quality entries
      
      // 🎯 TIER 2: MODERATE SELECTIVE (For more monthly opportunities)
      MODERATE_CONFLUENCE_SCORE: 58, // Moderate quality signals (6-8 signals/month)
      MODERATE_CONFIDENCE_SCORE: 55,  // Lower confidence threshold for moderate trades
      MODERATE_POSITION_SIZE: 10, // 🥈 TIER 2: 10% per trade (moderate aggressive sizing)
      
      // 🎯 AGGRESSIVE ROI TARGET CONFIGURATION (100% EQUITY USAGE)
      MONTHLY_ROI_TARGET: 55, // Target 55% monthly (middle of 40-70% range)
      PRIMARY_POSITION_SIZE: 20, // 🥇 TIER 1: 20% per trade (aggressive sizing)
      MAX_MONTHLY_TRADES: 13, // Balance between frequency and selectivity
      
      MOMENTUM_THRESHOLDS: {
        rsi_oversold_entry: 38, // More conservative than standard 30
        rsi_momentum_sweet_spot: [35, 70], // Lowered RSI range for more opportunities
        rsi_overbought_avoid: 72,  // CRITICAL: No entries above 72
        macd_histogram_min: 0.001, // Must be positive for bullish momentum
        volume_spike_min: 1.2, // Lowered volume spike for confirmation (was 1.8)
        breakout_confirmation: 0.5, // Minimum breakout strength
        
        // 🎯 MODERATE TIER THRESHOLDS (More Relaxed)
        moderate_volume_spike_min: 1.1, // Lowered volume increase for moderate signals (was 1.4)
        moderate_rsi_range: [30, 75], // Wider RSI range for more opportunities
        moderate_adx_min: 18 // Lower ADX requirement for moderate signals (was 20)
      }
    };
    logger.info('🔍 DEBUG: Service type:', this.taapiService.constructor.name);
    logger.info('🔍 DEBUG: isProPlan:', this.taapiService.isProPlan);
    logger.info('🔍 DEBUG: bulkEnabled:', this.taapiService.bulkEnabled);
    logger.info('🔍 DEBUG: TAAPI_FREE_PLAN_MODE env:', process.env.TAAPI_FREE_PLAN_MODE);
    logger.info('🚀 Enhanced Signal Generator V3 initialized with AGGRESSIVE Danish Dual-Tier Strategy (TARGET: 40-70% Monthly ROI)');
    
    // 🇩🇰 AGGRESSIVE DANISH DUAL-TIER STRATEGY (TARGET: 40-70% MONTHLY ROI):
    // 🥇 TIER 1 - ULTRA-SELECTIVE: 60% confidence, 65% confluence, 20% position size (2-5 trades/month)
    // 🥈 TIER 2 - MODERATE: 55% confidence, 58% confluence, 10% position size (6-8 trades/month)  
    // 📊 MATH: (5×20%×8% + 8×10%×6%) × 85% win rate = ~55% monthly ROI target
    // 🛡️ RISK: AGGRESSIVE approach - 100% equity usage with quality-focused entries
    // 🎪 FREQUENCY: 10-13 total trades per month with maximum capital efficiency
    // 🚀 ANNUAL POTENTIAL: 7,000%+ if sustained and compounded
  }

  // 🎯 FIXED: Initialize precision timing properly
  async initializePrecisionTiming(binanceClient = null, offChainService = null) {
    try {
      logger.info('🎯 Initializing precision timing system...');
      
      // Set the dependencies
      this.binanceClient = binanceClient;
      this.offChainService = offChainService;
      
      // Reinitialize scalping system with precision timing
      if (this.binanceClient && this.offChainService) {
        this.scalpingSystem = new AdvancedScalpingSystem(
          this.taapiService,
          this.binanceClient,
          this.offChainService
        );
        logger.info('✅ Precision timing system initialized with full dependencies');
        return true;
      } else {
        logger.warn('⚠️ Precision timing initialized with limited dependencies - some features may not work');
        // Keep existing scalping system (basic mode)
        logger.info('📊 Scalping system running in basic mode without precision timing');
        return false;
      }
    } catch (error) {
      logger.error(`❌ Error initializing precision timing: ${error.message}`);
      return false;
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

  // ===============================================
// UPDATE YOUR applyDanishStrategyFilter METHOD
// ===============================================
async applyDanishStrategyFilter(momentumSignal, technicalData, marketData) {
  try {

    logger.info(`🔥 [DEBUG] applyDanishStrategyFilter CALLED for ${marketData.symbol} with confidence ${momentumSignal.confidence}%`);
    logger.info(`🔍 [DEBUG] ScalpingSystem exists: ${!!this.scalpingSystem}`);
    logger.info(`🔍 [DEBUG] PrecisionTimer exists: ${!!this.scalpingSystem?.precisionTimer}`);
    
    logger.info(`🇩🇰 APPLYING Danish Dual-Tier Strategy Filter with PRECISION TIMING for ${marketData.symbol || 'UNKNOWN'} (ROI Target: 18-25%)`);
    logger.info(`🔍 Initial Signal: ${momentumSignal.signal}, Confidence: ${momentumSignal.confidence}%`);
    
    // Extract technical data with null safety
    const rsi = technicalData?.rsi || momentumSignal?.technical_data?.rsi || 50;
    const adx = technicalData?.adx || momentumSignal?.technical_data?.adx || 20;
    const volumeRatio = technicalData?.volume_ratio || momentumSignal?.volume_analysis?.volume_ratio || 1.0;
    
    logger.info(`📊 Technical Data: RSI=${rsi}, ADX=${adx}, Volume Ratio=${volumeRatio}`);
    
    // 🚀 NEW: ALWAYS analyze precision timing FIRST (even for low confidence signals)
    logger.info(`🎯 ANALYZING PRECISION TIMING for ${marketData.symbol} (confidence: ${momentumSignal.confidence}%)`);
    
    let precisionTiming = null;
    try {
      if (this.scalpingSystem && this.scalpingSystem.precisionTimer) {
        precisionTiming = await this.scalpingSystem.precisionTimer.detectPerfectEntry(
          marketData.symbol || 'UNKNOWN',
          momentumSignal,
          marketData
        );
        
        // 🎯 LOG PRECISION TIMING ANALYSIS FOR ALL SIGNALS
        if (precisionTiming.perfect_timing) {
          logger.info(`🚀 [PRECISION-TIMING] ${marketData.symbol} - PERFECT TIMING DETECTED! Score: ${precisionTiming.precision_score}/100`);
          logger.info(`⚡ [PRECISION-SIGNALS] Micro-momentum: ${precisionTiming.micro_signals?.micro_momentum_signal || 'N/A'}, VWAP: ${precisionTiming.micro_signals?.vwap_entry_signal || 'N/A'}, Order Flow: ${precisionTiming.micro_signals?.order_flow_entry_signal || 'N/A'}`);
        } else {
          logger.info(`⏰ [PRECISION-TIMING] ${marketData.symbol} - TIMING NOT OPTIMAL (${precisionTiming.precision_score || 0}/100) - ${precisionTiming.reason}`);
          if (precisionTiming.micro_status) {
            logger.info(`⏱️ [PRECISION-STATUS] Micro-momentum: ${precisionTiming.micro_status.micro_momentum}, VWAP: ${precisionTiming.micro_status.vwap_entry}, Order Flow: ${precisionTiming.micro_status.order_flow_entry}`);
          }
        }
      } else {
        logger.warn(`⚠️ [PRECISION-TIMING] Precision timer not initialized for ${marketData.symbol}`);
        precisionTiming = { perfect_timing: false, reason: 'Precision timer not available', precision_score: 0 };
      }
    } catch (error) {
      logger.error(`❌ [PRECISION-TIMING] Error analyzing ${marketData.symbol}: ${error.message}`);
      precisionTiming = { perfect_timing: false, reason: 'Precision analysis error', precision_score: 0 };
    }
    
    // 🇩🇰 DUAL-TIER EVALUATION: Check which tier this signal qualifies for
    let signalTier = null;
    let positionSize = 0;
    let wouldBeBuySignal = false;
    
    // Check Tier 1 (Ultra-Selective) criteria
    if (momentumSignal.confidence >= this.danishConfig.MIN_CONFIDENCE_SCORE && 
        volumeRatio >= this.danishConfig.MOMENTUM_THRESHOLDS.volume_spike_min && 
        adx >= 25 && rsi >= 35 && rsi <= 70) {
      signalTier = 'TIER_1_ULTRA';
      positionSize = this.danishConfig.PRIMARY_POSITION_SIZE;
      wouldBeBuySignal = true;
      logger.info(`🎯 QUALIFIED FOR TIER 1: Ultra-selective signal (${positionSize}% position)`);
    }
    // Check Tier 2 (Moderate) criteria  
    else if (momentumSignal.confidence >= this.danishConfig.MODERATE_CONFIDENCE_SCORE &&
             volumeRatio >= this.danishConfig.MOMENTUM_THRESHOLDS.moderate_volume_spike_min &&
             adx >= this.danishConfig.MOMENTUM_THRESHOLDS.moderate_adx_min &&
             rsi >= 30 && rsi <= 75) {
      signalTier = 'TIER_2_MODERATE';
      positionSize = this.danishConfig.MODERATE_POSITION_SIZE;
      wouldBeBuySignal = true;
      logger.info(`🎯 QUALIFIED FOR TIER 2: Moderate signal (${positionSize}% position)`);
    }
    
    // 🚨 NEW: Check for Tier 3 qualification (55-64% confidence)
    else if (momentumSignal.confidence >= 55 && momentumSignal.confidence < 65 &&
             volumeRatio >= 1.1 && adx >= 15 && rsi >= 30 && rsi <= 75) {
      signalTier = 'TIER_3_CONSERVATIVE';
      positionSize = 5; // 5% position for Tier 3
      wouldBeBuySignal = true;
      logger.info(`🎯 QUALIFIED FOR TIER 3: Conservative signal (${positionSize}% position)`);
    }
    
    // 🚀 Apply SCALPING ENHANCEMENT for tier-qualified signals
    if (wouldBeBuySignal) {
      logger.info(`🎯 [TIER-${signalTier}] Signal qualified for BUY - applying SCALPING ENHANCEMENT`);
      
      // Apply scalping enhancement
      const scalpingEnhanced = await this.scalpingSystem.enhanceExistingSignal(
        marketData.symbol || 'UNKNOWN',
        momentumSignal,
        marketData
      );
      
      // 🚀 DECISION LOGIC: Only proceed if BOTH precision timing AND scalping are good
      if (precisionTiming.perfect_timing && scalpingEnhanced.scalping_mode) {
        logger.info(`🎯 [PERFECT-ENTRY] ${marketData.symbol} - BOTH PRECISION TIMING AND SCALPING OPTIMAL!`);
        
        // Calculate Danish compliance score
        const danishComplianceScore = this.calculateDanishComplianceScore(momentumSignal, {
          rsi, adx, volumeRatio
        });

        return {
          ...scalpingEnhanced,
          signal: 'BUY',
          action: 'BUY',
          signal_tier: signalTier,
          position_size_percent: positionSize,
          monthly_roi_contribution: signalTier === 'TIER_1_ULTRA' ? 'HIGH' : 
                                   signalTier === 'TIER_2_MODERATE' ? 'MODERATE' : 'CONSERVATIVE',
          danish_strategy_validated: true,
          danish_compliance_score: danishComplianceScore,
          danish_filter_applied: `${signalTier}_PRECISION_SCALPING_PERFECT`,
          strategy_type: 'PRECISION_SCALPING_STRATEGY',
          downtrend_filter_passed: true,
          converted_hold_to_buy: true,
          // 🎯 PRECISION DATA
          precision_timing: precisionTiming,
          precision_perfect: true,
          precision_score: precisionTiming.precision_score,
          micro_signals: precisionTiming.micro_signals,
          entry_quality: 'PERFECT_PRECISION_SCALPING_SETUP',
          reasoning: `Danish ${signalTier} + PRECISION + SCALPING: PERFECT TIMING (P:${precisionTiming.precision_score}/100, S:${scalpingEnhanced.entry_score}/100) - ENTRY NOW!`
        };
      }
      // 🔄 PRECISION TIMING NOT READY - Block the trade but show analysis
      else if (!precisionTiming.perfect_timing) {
        logger.info(`❌ [PRECISION-BLOCKED] ${marketData.symbol} ${signalTier}: Precision timing not ready - ${precisionTiming.reason}`);
        
        return {
          ...momentumSignal,
          signal: 'HOLD',
          action: 'HOLD',
          confidence: Math.max(momentumSignal.confidence - 15, 10),
          signal_tier: signalTier,
          position_size_percent: 0,
          // 🎯 PRECISION DATA
          precision_timing: precisionTiming,
          precision_perfect: false,
          precision_score: precisionTiming.precision_score || 0,
          precision_waiting_for: precisionTiming.waiting_for || ['Unknown factors'],
          micro_status: precisionTiming.micro_status,
          reasoning: `${signalTier} BLOCKED: Precision timing not ready - ${precisionTiming.reason}`,
          danish_filter_applied: 'PRECISION_TIMING_BLOCKED',
          strategy_type: 'DANISH_DUAL_TIER_STRATEGY',
          entry_quality: 'PRECISION_BLOCKED',
          tier_qualified: signalTier,
          tier_blocked_by_precision: true
        };
      }
      // 🔄 SCALPING NOT READY
      else {
        logger.info(`❌ [SCALPING-BLOCKED] ${marketData.symbol} ${signalTier}: Scalping not optimal but precision timing good`);
        
        return {
          ...momentumSignal,
          signal: 'HOLD',
          action: 'HOLD',
          signal_tier: signalTier,
          position_size_percent: 0,
          // 🎯 PRECISION DATA
          precision_timing: precisionTiming,
          precision_perfect: true,
          precision_score: precisionTiming.precision_score,
          micro_signals: precisionTiming.micro_signals,
          reasoning: `${signalTier} BLOCKED: Precision timing perfect but scalping not optimal`,
          danish_filter_applied: 'SCALPING_BLOCKED_PRECISION_GOOD',
          entry_quality: 'PRECISION_GOOD_SCALPING_BLOCKED',
          tier_qualified: signalTier,
          tier_blocked_by_scalping: true
        };
      }
    }
    
    // If doesn't qualify for any tier, return with precision analysis
    if (!signalTier && momentumSignal.confidence < this.danishConfig.MODERATE_CONFIDENCE_SCORE) {
      logger.info(`❌ DANISH FILTER: Confidence ${momentumSignal.confidence}% < ${this.danishConfig.MIN_CONFIDENCE_SCORE}% minimum`);
      return {
        ...momentumSignal,
        signal: 'HOLD',
        action: 'HOLD',
        confidence: momentumSignal.confidence,
        position_size_percent: 0,
        // 🎯 ADD PRECISION DATA FOR LOW CONFIDENCE SIGNALS
        precision_timing: precisionTiming,
        precision_perfect: precisionTiming.perfect_timing,
        precision_score: precisionTiming.precision_score || 0,
        precision_waiting_for: precisionTiming.waiting_for || ['Low base confidence'],
        micro_status: precisionTiming.micro_status,
        reasoning: `Danish Strategy: Confidence ${momentumSignal.confidence.toFixed(1)}% below minimum ${this.danishConfig.MIN_CONFIDENCE_SCORE}% - waiting for better setup`,
        danish_filter_applied: 'MIN_CONFIDENCE_NOT_MET',
        strategy_type: 'DANISH_MOMENTUM_BULL_STRATEGY',
        entry_quality: 'REJECTED_LOW_CONFIDENCE'
      };
    }
    
    // 🇩🇰 RULE: IGNORE ALL BEARISH SIGNALS
    if (this.danishConfig.IGNORE_BEARISH_SIGNALS && momentumSignal.signal === 'SELL') {
      logger.info(`❌ DANISH FILTER: SELL signal rejected - only bullish entries allowed`);
      return {
        ...momentumSignal,
        signal: 'HOLD',
        action: 'HOLD',
        confidence: 0,
        position_size_percent: 0,
        // 🎯 ADD PRECISION DATA FOR BEARISH SIGNALS
        precision_timing: precisionTiming,
        precision_perfect: precisionTiming.perfect_timing,
        precision_score: precisionTiming.precision_score || 0,
        reasoning: 'Danish Strategy: Bearish signals ignored - only bullish entries allowed',
        danish_filter_applied: 'BEARISH_SIGNAL_FILTERED',
        strategy_type: 'DANISH_DUAL_TIER_STRATEGY',
        entry_quality: 'REJECTED_BEARISH'
      };
    }

    // ✅ HANDLE TIER-QUALIFIED SIGNALS (fallback if precision/scalping didn't run)
    if (signalTier && wouldBeBuySignal) {
      logger.info(`⚠️ FALLBACK: Signal QUALIFIED for ${signalTier} but precision/scalping analysis didn't run - using STANDARD MODE`);
      
      // Calculate Danish compliance score
      const danishComplianceScore = this.calculateDanishComplianceScore(momentumSignal, {
        rsi, adx, volumeRatio
      });

      // Convert HOLD to BUY and enhance the signal
      const enhancedSignal = {
        ...momentumSignal,
        signal: 'BUY',
        action: 'BUY',
        strategy_type: 'DANISH_DUAL_TIER_STRATEGY',
        signal_tier: signalTier,
        position_size_percent: positionSize,
        monthly_roi_contribution: signalTier === 'TIER_1_ULTRA' ? 'HIGH' : signalTier === 'TIER_2_MODERATE' ? 'MODERATE' : 'CONSERVATIVE',
        danish_strategy_validated: true,
        danish_compliance_score: danishComplianceScore,
        danish_filter_applied: `${signalTier}_QUALIFIED_STANDARD`,
        downtrend_filter_passed: true,
        converted_hold_to_buy: true,
        scalping_analyzed: false,
        scalping_mode: false,
        // 🎯 ADD PRECISION DATA FOR FALLBACK
        precision_timing: precisionTiming,
        precision_perfect: precisionTiming.perfect_timing,
        precision_score: precisionTiming.precision_score || 0,
        precision_note: 'Precision analysis performed but using fallback standard mode',
        entry_quality: signalTier === 'TIER_1_ULTRA' ? 'EXCELLENT_ULTRA_SETUP' : 
                      signalTier === 'TIER_2_MODERATE' ? 'GOOD_MODERATE_SETUP' : 'FAIR_CONSERVATIVE_SETUP',
        reasoning: `Danish ${signalTier}: HOLD→BUY conversion (${momentumSignal.confidence.toFixed(1)}% confidence, ${positionSize}% position) - TIER QUALIFIED (Fallback Standard Mode)`
      };

      logger.info(`✅ DANISH RESULT: HOLD→BUY conversion with ${enhancedSignal.confidence.toFixed(1)}% confidence (${signalTier}) - FALLBACK STANDARD MODE`);
      return enhancedSignal;
    }
    
    // If no tier qualification, keep as HOLD
    logger.info(`❌ DANISH FILTER: Signal failed tier qualification criteria - keeping as HOLD`);
    return {
      ...momentumSignal,
      signal: 'HOLD',
      action: 'HOLD',
      confidence: Math.max(25, momentumSignal.confidence - 15),
      position_size_percent: 0,
      // 🎯 ADD PRECISION DATA FOR FAILED QUALIFICATION
      precision_timing: precisionTiming,
      precision_perfect: precisionTiming.perfect_timing,
      precision_score: precisionTiming.precision_score || 0,
      precision_waiting_for: precisionTiming.waiting_for || ['Failed tier qualification'],
      reasoning: `Danish Strategy: Signal ${momentumSignal.confidence.toFixed(1)}% confidence but failed tier qualification`,
      danish_filter_applied: 'TIER_QUALIFICATION_FAILED',
      strategy_type: 'DANISH_DUAL_TIER_STRATEGY',
      entry_quality: 'REJECTED_TIER_CRITERIA'
    };

  } catch (error) {
    logger.error('❌ Danish strategy filter error:', error);
    return {
      signal: 'HOLD',
      action: 'HOLD',
      confidence: 20,
      position_size_percent: 0,
      precision_timing: null,
      precision_perfect: false,
      precision_score: 0,
      reasoning: 'Danish strategy filter error - defaulting to HOLD for safety',
      danish_filter_applied: 'ERROR_HOLD',
      strategy_type: 'DANISH_DUAL_TIER_STRATEGY',
      entry_quality: 'ERROR'
    };
  }
}

checkDowntrendFilter(symbol, signal, technicalData, currentPrice) {
  try {
    this.downtrendFilter.rejectionStats.total_checked++;
    
    logger.info(`🔍 [DOWNTREND-FILTER] Checking ${symbol} (conf: ${signal.confidence.toFixed(1)}%)`);
    
    // Only apply to Tier 3 signals (55-64% confidence) - let higher confidence pass
    if (signal.confidence >= 65) {
      logger.info(`✅ [DOWNTREND-FILTER] ${symbol} is Tier 1/2 signal - SKIP filter`);
      this.downtrendFilter.rejectionStats.passed_filter++;
      return { allowed: true, reason: "High confidence signal - filter bypassed" };
    }

    // Extract EMA data from your existing TAAPI structure
    const ema20 = this.extractTaapiValue(technicalData, 'ema20') || signal.taapi_data?.ema20;
    const ema50 = this.extractTaapiValue(technicalData, 'ema50') || signal.taapi_data?.ema50;
    const ema200 = this.extractTaapiValue(technicalData, 'ema200') || signal.taapi_data?.ema200;
    const rsi = technicalData?.rsi || signal.technical_data?.rsi || 50;
    const adx = technicalData?.adx || signal.technical_data?.adx || 20;

    logger.info(`📊 [DOWNTREND-FILTER] ${symbol} EMAs: 20=${ema20?.toFixed(2)}, 50=${ema50?.toFixed(2)}, 200=${ema200?.toFixed(2)}, RSI=${rsi}, ADX=${adx}`);

    // ========================================
    // 🚨 RELAXED DOWNTREND CHECKS (Less Aggressive)
    // ========================================

    let blockedReasons = [];
    let warningFlags = [];

    // 🚨 CHECK 1: SEVERE BEARISH EMA SEQUENCE (Only block extreme cases)
    if (ema20 && ema50 && ema200) {
      if (ema20 < ema50 && ema50 < ema200) {
        // Calculate how severe the bearish alignment is
        const ema20_vs_50_gap = ((ema50 - ema20) / ema50) * 100;
        const ema50_vs_200_gap = ((ema200 - ema50) / ema200) * 100;
        
        // Only block if gaps are significant (>3% each)
        if (ema20_vs_50_gap > 3 && ema50_vs_200_gap > 3) {
          logger.info(`❌ [DOWNTREND-FILTER] ${symbol} BLOCKED - SEVERE bearish EMA sequence (gaps: ${ema20_vs_50_gap.toFixed(1)}%, ${ema50_vs_200_gap.toFixed(1)}%)`);
          blockedReasons.push(`SEVERE bearish EMA sequence (${ema20_vs_50_gap.toFixed(1)}% & ${ema50_vs_200_gap.toFixed(1)}% gaps)`);
        } else {
          warningFlags.push(`Mild bearish EMA alignment (gaps: ${ema20_vs_50_gap.toFixed(1)}%, ${ema50_vs_200_gap.toFixed(1)}%)`);
        }
      }
    }

    // 🚨 CHECK 2: PRICE FAR BELOW ALL EMAs (Only block extreme cases)
    if (currentPrice && ema20 && ema50 && ema200) {
      const price_vs_ema20 = ((currentPrice - ema20) / ema20) * 100;
      const price_vs_ema50 = ((currentPrice - ema50) / ema50) * 100;
      const price_vs_ema200 = ((currentPrice - ema200) / ema200) * 100;
      
      // Only block if price is >5% below ALL EMAs
      if (price_vs_ema20 < -5 && price_vs_ema50 < -5 && price_vs_ema200 < -5) {
        logger.info(`❌ [DOWNTREND-FILTER] ${symbol} BLOCKED - Price far below all EMAs (${price_vs_ema20.toFixed(1)}%, ${price_vs_ema50.toFixed(1)}%, ${price_vs_ema200.toFixed(1)}%)`);
        blockedReasons.push(`Price far below all EMAs (${price_vs_ema20.toFixed(1)}%, ${price_vs_ema50.toFixed(1)}%, ${price_vs_ema200.toFixed(1)}%)`);
      } else if (currentPrice < ema20 && currentPrice < ema50 && currentPrice < ema200) {
        warningFlags.push(`Price below all EMAs but within tolerance`);
      }
    }

    // 🚨 CHECK 3: SEVERE SHORT-TERM DOWNTREND (Only block extreme cases)
    if (ema20 && ema50 && currentPrice) {
      if (ema20 < ema50 && currentPrice < ema20) {
        const emaGap = ((ema50 - ema20) / ema50) * 100;
        const priceGap = ((ema20 - currentPrice) / ema20) * 100;
        
        // Only block if BOTH gaps are significant (>4% EMA gap AND >3% price gap)
        if (emaGap > 4 && priceGap > 3) {
          logger.info(`❌ [DOWNTREND-FILTER] ${symbol} BLOCKED - SEVERE short-term downtrend (EMA gap: ${emaGap.toFixed(2)}%, price gap: ${priceGap.toFixed(2)}%)`);
          blockedReasons.push(`SEVERE short-term downtrend (EMA: ${emaGap.toFixed(2)}%, price: ${priceGap.toFixed(2)}%)`);
        } else {
          warningFlags.push(`Mild short-term downtrend (EMA: ${emaGap.toFixed(2)}%, price: ${priceGap.toFixed(2)}%)`);
        }
      }
    }

    // 🚨 CHECK 4: VERY WEAK TREND + DEEPLY OVERSOLD (Only extreme cases)
    if (adx && rsi && adx < 15 && rsi < 25) {
      logger.info(`❌ [DOWNTREND-FILTER] ${symbol} BLOCKED - Very weak trend + deeply oversold (ADX: ${adx}, RSI: ${rsi})`);
      blockedReasons.push(`Very weak trend + deeply oversold (ADX: ${adx}, RSI: ${rsi})`);
    } else if (adx && rsi && adx < 20 && rsi < 35) {
      warningFlags.push(`Weak trend + oversold (ADX: ${adx}, RSI: ${rsi})`);
    }

    // ========================================
    // DECISION LOGIC - Only block on multiple severe issues
    // ========================================

    if (blockedReasons.length >= 2) {
      // Block only if 2+ severe issues detected
      logger.info(`❌ [DOWNTREND-FILTER] ${symbol} REJECTED - Multiple severe issues: ${blockedReasons.join(' + ')}`);
      this.downtrendFilter.rejectionStats.downtrend_rejected++;
      return { 
        allowed: false, 
        reason: `Multiple severe downtrend signals: ${blockedReasons.join(' + ')}`,
        severe_issues: blockedReasons,
        warnings: warningFlags
      };
    } else if (blockedReasons.length === 1) {
      // Single severe issue - allow but warn
      logger.info(`⚠️ [DOWNTREND-FILTER] ${symbol} ALLOWED with warning - Single issue: ${blockedReasons[0]}`);
      warningFlags.push(...blockedReasons);
    }

    // ========================================
    // POSITIVE TREND CONFIRMATIONS
    // ========================================

    let passReasons = [];

    // ✅ BULLISH EMA ALIGNMENT
    if (ema20 && ema50 && ema20 > ema50) {
      passReasons.push("EMA20 > EMA50 (bullish short-term)");
    }

    // ✅ PRICE ABOVE KEY EMA
    if (currentPrice && ema20 && currentPrice > ema20) {
      passReasons.push("Price above EMA20");
    } else if (currentPrice && ema50 && currentPrice > ema50) {
      passReasons.push("Price above EMA50");
    }

    // ✅ DECENT TREND STRENGTH
    if (adx && adx > 20) {
      passReasons.push(`Decent trend strength (ADX: ${adx})`);
    }

    // ✅ NOT OVERBOUGHT
    if (rsi && rsi < 70) {
      passReasons.push(`Not overbought (RSI: ${rsi})`);
    }

    // ✅ REASONABLE RSI LEVEL
    if (rsi && rsi > 30 && rsi < 70) {
      passReasons.push(`Healthy RSI level (${rsi})`);
    }

    logger.info(`✅ [DOWNTREND-FILTER] ${symbol} PASSED - ${passReasons.length > 0 ? passReasons.join(', ') : 'No major downtrend detected'}`);
    if (warningFlags.length > 0) {
      logger.info(`⚠️ [DOWNTREND-FILTER] ${symbol} WARNINGS: ${warningFlags.join(', ')}`);
    }
    
    this.downtrendFilter.rejectionStats.passed_filter++;
    
    return { 
      allowed: true, 
      reason: "Relaxed downtrend analysis passed",
      confirmations: passReasons,
      warnings: warningFlags,
      trend_strength: adx || 'unknown'
    };

  } catch (error) {
    logger.info(`⚠️ [DOWNTREND-FILTER] Error checking ${symbol}: ${error.message}`);
    // On error, allow the trade but log it
    this.downtrendFilter.rejectionStats.passed_filter++;
    return { allowed: true, reason: "Filter error - trade allowed" };
  }
}

// ===============================================
// ADD THIS TEMPORARY DEBUG METHOD
// ===============================================

debugDowntrendFilter(symbol, signal, technicalData, currentPrice) {
  logger.info(`🔍 [DEBUG-FILTER] === DETAILED ANALYSIS FOR ${symbol} ===`);
  logger.info(`🔍 [DEBUG-FILTER] Signal: ${signal.signal}, Confidence: ${signal.confidence}%`);
  
  // Extract all available data
  const ema20 = this.extractTaapiValue(technicalData, 'ema20') || signal.taapi_data?.ema20;
  const ema50 = this.extractTaapiValue(technicalData, 'ema50') || signal.taapi_data?.ema50;
  const ema200 = this.extractTaapiValue(technicalData, 'ema200') || signal.taapi_data?.ema200;
  const rsi = technicalData?.rsi || signal.technical_data?.rsi || 50;
  const adx = technicalData?.adx || signal.technical_data?.adx || 20;

  logger.info(`🔍 [DEBUG-FILTER] Current Price: $${currentPrice}`);
  logger.info(`🔍 [DEBUG-FILTER] EMA20: ${ema20}, EMA50: ${ema50}, EMA200: ${ema200}`);
  logger.info(`🔍 [DEBUG-FILTER] RSI: ${rsi}, ADX: ${adx}`);
  
  // Check each condition individually
  if (ema20 && ema50 && ema200) {
    logger.info(`🔍 [DEBUG-FILTER] EMA Order: ${ema20 > ema50 ? 'EMA20>EMA50' : 'EMA20<EMA50'}, ${ema50 > ema200 ? 'EMA50>EMA200' : 'EMA50<EMA200'}`);
    
    if (ema20 < ema50 && ema50 < ema200) {
      const gap1 = ((ema50 - ema20) / ema50) * 100;
      const gap2 = ((ema200 - ema50) / ema200) * 100;
      logger.info(`🔍 [DEBUG-FILTER] BEARISH EMA SEQUENCE - Gaps: ${gap1.toFixed(2)}%, ${gap2.toFixed(2)}%`);
    }
  }
  
  if (currentPrice && ema20) {
    const priceVsEma = ((currentPrice - ema20) / ema20) * 100;
    logger.info(`🔍 [DEBUG-FILTER] Price vs EMA20: ${priceVsEma > 0 ? '+' : ''}${priceVsEma.toFixed(2)}%`);
  }
  
  logger.info(`🔍 [DEBUG-FILTER] === END DEBUG FOR ${symbol} ===`);
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

  getServiceHealth() {
    try {
      const cacheEntries = Array.from(this.signalCache.entries()).slice(0, 3).map(([key, value]) => ({
        key,
        age_minutes: Math.floor((Date.now() - value.timestamp) / 60000),
        signal: value.signal?.signal
      }));
  
      return {
        signal_generator: 'healthy',
        version: 'v4_precision_scalping_enhanced', // Updated version
        cache_size: this.signalCache.size,
        danish_strategy: 'enabled',
        scalping_system: 'enabled',
        // 🎯 FIXED: Use correct property name
        scalping_stats: this.scalpingSystem?.getScalpingStats?.() || { error: 'Not initialized' },
        precision_timing: this.isPrecisionTimingReady() ? 'enabled' : 'disabled', // NEW
        precision_ready: this.isPrecisionTimingReady(), // NEW
        confidence_threshold: this.danishConfig.MIN_CONFIDENCE_SCORE,
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


  getDowntrendFilterStats() {
    const total = this.downtrendFilter.rejectionStats.total_checked;
    return {
      ...this.downtrendFilter.rejectionStats,
      rejection_rate: total > 0 ? ((this.downtrendFilter.rejectionStats.downtrend_rejected + this.downtrendFilter.rejectionStats.weak_trend_rejected) / total * 100).toFixed(1) + '%' : '0%',
      pass_rate: total > 0 ? (this.downtrendFilter.rejectionStats.passed_filter / total * 100).toFixed(1) + '%' : '0%'
    };
  }

  resetDowntrendFilterStats() {
    this.downtrendFilter.rejectionStats = {
      total_checked: 0,
      downtrend_rejected: 0,
      weak_trend_rejected: 0,
      passed_filter: 0
    };
    logger.info('🔄 Downtrend filter stats reset');
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

  // 🎯 NEW: TIER-BASED SIGNAL GENERATION WITH LOWERED THRESHOLDS
  generateSignalBasedOnConfidence(confidence, pair) {
    // TIER 3: Generate BUY signals for 55%+ confidence (was 70%+)
    if (confidence >= 55) {
      return {
        signal: 'BUY',
        confidence: confidence,
        reasoning: `Strong momentum detected for ${pair} - confidence ${confidence.toFixed(1)}%`,
        tier_eligible: true
      };
    }
    
    // TIER 2: Generate BUY signals for 65%+ confidence 
    if (confidence >= 65) {
      return {
        signal: 'BUY', 
        confidence: confidence,
        reasoning: `High momentum detected for ${pair} - confidence ${confidence.toFixed(1)}%`,
        tier_eligible: true,
        tier_boost: true
      };
    }
    
    // TIER 1: Generate BUY signals for 80%+ confidence
    if (confidence >= 80) {
      return {
        signal: 'BUY',
        confidence: confidence,
        reasoning: `Excellent momentum detected for ${pair} - confidence ${confidence.toFixed(1)}%`,
        tier_eligible: true,
        tier_premium: true
      };
    }
    
    // Below 55% = HOLD signal
    return {
      signal: 'HOLD',
      confidence: confidence,
      reasoning: `Insufficient momentum for ${pair} - confidence ${confidence.toFixed(1)}%`,
      tier_eligible: false
    };
  }

  // 🎯 UPDATED: DANISH ADAPTIVE SIGNAL GENERATOR WITH LOWERED THRESHOLDS
  generateDanishAdaptiveSignal(marketData, technicalData, onChainData, offChainData, requestParams) {
    try {
      const symbol = marketData.symbol || 'UNKNOWN';
      const price = marketData.current_price;
      const rsi = technicalData.rsi || 50;
      const volumeRatio = technicalData.volume_ratio || 1.0;
      const adx = technicalData.adx || 20;
      
      // Calculate base confidence from technical analysis
      let confidence = this._calculateBaseConfidence(technicalData);
      
      // LOWERED DANISH BUY SIGNAL REQUIREMENTS:
      const danishBuyRequirements = {
        // TIER 3: Conservative BUY signals (was 70%, now 55%)
        tier3_confidence: 55,
        tier3_rsi_min: 35,          // Lower RSI requirement (was 40)
        tier3_volume_min: 1.2,      // Lower volume requirement (was 1.5)
        
        // TIER 2: Moderate BUY signals (was 75%, now 65%) 
        tier2_confidence: 65,
        tier2_rsi_min: 40,
        tier2_volume_min: 1.3,
        
        // TIER 1: Premium BUY signals (was 85%, now 80%)
        tier1_confidence: 80,
        tier1_rsi_min: 45,
        tier1_volume_min: 1.5
      };
      
      // Generate BUY signal if meets any tier requirements
      if (confidence >= danishBuyRequirements.tier3_confidence &&
          rsi >= danishBuyRequirements.tier3_rsi_min &&
          volumeRatio >= danishBuyRequirements.tier3_volume_min) {
          
          let tier = 3;
          if (confidence >= danishBuyRequirements.tier1_confidence) tier = 1;
          else if (confidence >= danishBuyRequirements.tier2_confidence) tier = 2;
          
          return {
              signal: 'BUY',  // Direct BUY signal, no HOLD conversion needed
              confidence: confidence,
              tier: tier,
              reasoning: `Danish Tier ${tier} BUY signal - confidence ${confidence.toFixed(1)}%`,
              strategy_type: `Danish Tier ${tier} Entry`,
              danish_requirements_met: true
          };
      }
      
      // Default to HOLD if requirements not met
      return {
          signal: 'HOLD',
          confidence: confidence,
          reasoning: `Danish requirements not met - confidence ${confidence.toFixed(1)}%`,
          danish_requirements_met: false
      };
      
    } catch (error) {
      logger.error('Error in generateDanishAdaptiveSignal:', error);
      return {
        signal: 'HOLD',
        confidence: 20,
        reasoning: `Error in Danish signal generation: ${error.message}`,
        danish_requirements_met: false
      };
    }
  }

  // 🎯 HELPER: Calculate base confidence from technical data
  _calculateBaseConfidence(technicalData) {
    let confidence = 50; // Base confidence
    
    // RSI contribution
    const rsi = technicalData.rsi || 50;
    if (rsi >= 35 && rsi <= 70) confidence += 15;
    else if (rsi < 30 || rsi > 75) confidence -= 10;
    
    // Volume contribution
    const volumeRatio = technicalData.volume_ratio || 1.0;
    if (volumeRatio >= 1.2) confidence += 10;
    else if (volumeRatio < 0.8) confidence -= 10;
    
    // ADX contribution
    const adx = technicalData.adx || 20;
    if (adx >= 25) confidence += 10;
    else if (adx < 15) confidence -= 5;
    
    return Math.max(0, Math.min(100, confidence));
  }
}

module.exports = EnhancedSignalGenerator;