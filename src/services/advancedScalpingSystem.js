// ===============================================
// ADVANCED SCALPING SYSTEM - PERFECT ENTRY/EXIT TIMING
// Replaces the restrictive downtrend filter with intelligent signal enhancement
// ===============================================

const logger = require('../utils/logger');

const PrecisionEntryTimer = require('./precisionEntryTimer');

class AdvancedScalpingSystem {
  constructor(taapiService, binanceClient = null, offChainService = null) {
    this.taapiService = taapiService;
    this.binanceClient = binanceClient;
    this.offChainService = offChainService;
    
    // Only initialize precision timer if we have the required dependencies
    if (this.binanceClient && this.offChainService) {
      this.precisionTimer = new PrecisionEntryTimer(
        this.binanceClient,
        this.offChainService
      );
      logger.info('🎯 Precision timer initialized in scalping system');
    } else {
      this.precisionTimer = null;
      logger.warn('⚠️ Precision timer not initialized - missing dependencies (binanceClient or offChainService)');
    }
      
    this.activeScalps = new Map();
    this.profitTargets = {
      tier1: 0.8,   // 0.8% quick profit
      tier2: 1.5,   // 1.5% medium profit  
      tier3: 2.5    // 2.5% maximum profit
    };
    this.maxHoldTime = 4 * 60 * 60 * 1000; // 4 hours max hold
    this.entryPrecision = {
      rsi: { min: 25, max: 45 },      // Enter on oversold but recovering
      macd: { histogram: "> 0", signal: "bullish_cross" },
      ema: { alignment: "bullish", price_position: "above_ema20" },
      volume: { spike: "> 1.5x", confirmation: true },
      momentum: { acceleration: "> 0" }
    };
    
    // Track stats
    this.stats = {
      total_analyzed: 0,
      perfect_entries: 0,
      enhanced_signals: 0,
      blocked_signals: 0
    };
  }

  // 🎯 PERFECT ENTRY DETECTOR (Replaces downtrend blocking with enhancement)
  async detectPerfectEntry(symbol, marketData) {
    try {
      this.stats.total_analyzed++;
      logger.info(`🔍 [SCALPING] Analyzing perfect entry for ${symbol}`);
      
      // Get current TAAPI data (use existing technical data if available)
      let symbolData = marketData.technical_data || {};
      
      // If we have TAAPI service, get fresh data
      if (this.taapiService && this.taapiService.getBulkIndicatorsOptimized) {
        try {
          const indicators = await this.taapiService.getBulkIndicatorsOptimized([symbol], '15m', 'binance');
          if (indicators[symbol] && !indicators[symbol].isFallbackData) {
            symbolData = { ...symbolData, ...indicators[symbol] };
          }
        } catch (error) {
          logger.warn(`[SCALPING] TAAPI data fetch failed for ${symbol}, using existing data`);
        }
      }

      const currentPrice = marketData.current_price;
      const entryScore = await this.calculateEntryScore(symbolData, currentPrice);
      
      logger.info(`📊 [SCALPING] ${symbol} Entry Score: ${entryScore.totalScore}/100`);

      // 🎯 Much more lenient than 85+ - we want to enhance, not block like downtrend filter
      if (entryScore.totalScore >= 60) { // Lowered from 85 to 60
        this.stats.perfect_entries++;
        return {
          entry: true,
          score: entryScore.totalScore,
          conditions: entryScore.conditions,
          expectedMove: entryScore.expectedMove,
          riskReward: entryScore.riskReward,
          maxHold: this.calculateMaxHoldTime(entryScore),
          targets: this.calculateDynamicTargets(currentPrice, entryScore)
        };
      }

      return { 
        entry: false, 
        reason: `Entry score ${entryScore.totalScore}/100 (need 60+ for scalping mode)`,
        score: entryScore.totalScore
      };

    } catch (error) {
      logger.error(`Error detecting entry for ${symbol}:`, error.message);
      return { entry: false, reason: "Analysis error", score: 0 };
    }
  }

  // 📊 ENHANCED ENTRY SCORING (More generous than original downtrend filter)
  async calculateEntryScore(symbolData, currentPrice) {
    let totalScore = 0;
    let conditions = [];
    let expectedMove = 0;

    // 1. RSI MOMENTUM (25 points max) - More generous range
    const rsi = symbolData.rsi || 50;
    if (rsi >= 20 && rsi <= 50) { // Expanded from 25-45
      const rsiScore = Math.max(0, 25 - Math.abs(rsi - 35));
      totalScore += rsiScore;
      conditions.push(`RSI favorable (${rsi.toFixed(1)})`);
      expectedMove += 0.5;
    } else if (rsi >= 15 && rsi <= 60) { // Even more generous backup
      totalScore += 12;
      conditions.push(`RSI acceptable (${rsi.toFixed(1)})`);
      expectedMove += 0.2;
    }

    // 2. MACD MOMENTUM (20 points max) - More flexible
    if (symbolData.macd) {
      const { macd, signal, histogram } = symbolData.macd;
      
      if (histogram > 0 && macd > signal) {
        totalScore += 20;
        conditions.push("MACD bullish momentum");
        expectedMove += 0.8;
      } else if (macd > signal || histogram > -0.1) { // More lenient
        totalScore += 12;
        conditions.push("MACD improving");
        expectedMove += 0.4;
      }
    } else {
      // Give some score even without MACD data
      totalScore += 8;
      conditions.push("MACD data unavailable - assuming neutral");
    }

    // 3. EMA TREND ALIGNMENT (20 points max) - More generous
    const { ema20, ema50 } = symbolData;
    if (ema20 && ema50 && currentPrice) {
      if (ema20 > ema50 && currentPrice > ema20) {
        totalScore += 20;
        conditions.push("Perfect EMA alignment");
        expectedMove += 0.6;
      } else if (currentPrice > ema20 || ema20 > ema50) { // Either condition
        totalScore += 12;
        conditions.push("Decent EMA setup");
        expectedMove += 0.3;
      } else if (currentPrice > ema50) { // At least above longer EMA
        totalScore += 8;
        conditions.push("Price above EMA50");
        expectedMove += 0.1;
      }
    } else {
      // Give baseline score when EMA data missing
      totalScore += 10;
      conditions.push("EMA data limited - baseline score");
    }

    // 4. VOLUME CONFIRMATION (15 points max) - More lenient
    const volumeRatio = symbolData.volume_ratio || 1.0;
    if (volumeRatio >= 1.8) {
      totalScore += 15;
      conditions.push(`Strong volume (${volumeRatio.toFixed(1)}x)`);
      expectedMove += 1.0;
    } else if (volumeRatio >= 1.3) { // Lowered from 1.5
      totalScore += 10;
      conditions.push(`Good volume (${volumeRatio.toFixed(1)}x)`);
      expectedMove += 0.4;
    } else if (volumeRatio >= 1.0) { // Even normal volume gets some points
      totalScore += 5;
      conditions.push(`Normal volume (${volumeRatio.toFixed(1)}x)`);
    }

    // 5. ADX TREND STRENGTH (10 points max) - More generous
    const adx = symbolData.adx || 20;
    if (adx >= 20) { // Lowered from 25
      totalScore += 10;
      conditions.push(`Good trend (ADX: ${adx})`);
      expectedMove += 0.4;
    } else if (adx >= 15) { // Give points for weaker trends too
      totalScore += 6;
      conditions.push(`Developing trend (ADX: ${adx})`);
      expectedMove += 0.2;
    }

    // 6. BONUS POINTS - Price action (10 points max)
    // Give bonus for being above key levels
    if (currentPrice && ema20 && currentPrice > ema20 * 1.02) {
      totalScore += 5;
      conditions.push("Price well above EMA20");
    }
    if (currentPrice && ema50 && currentPrice > ema50 * 1.05) {
      totalScore += 5;
      conditions.push("Price well above EMA50");
    }

    return {
      totalScore: Math.round(totalScore),
      conditions,
      expectedMove: Math.max(0.3, expectedMove), // Minimum expected move
      riskReward: expectedMove / 0.4 // Risk 0.4% to make expectedMove%
    };
  }

  // 🎯 DYNAMIC PROFIT TARGETS (Optimized for quick profits)
  calculateDynamicTargets(entryPrice, entryScore) {
    const baseMove = Math.max(0.5, entryScore.expectedMove); // Minimum 0.5% target
    
    return {
      target1: entryPrice * (1 + (baseMove * 0.6) / 100),  // 60% of expected move
      target2: entryPrice * (1 + (baseMove * 0.9) / 100),  // 90% of expected move  
      target3: entryPrice * (1 + baseMove / 100),          // Full expected move
      stopLoss: entryPrice * (1 - 0.4 / 100),             // 0.4% stop loss (tighter)
      maxHold: this.calculateMaxHoldTime(entryScore)
    };
  }

  // ⏰ ADAPTIVE HOLD TIME (Shorter than original)
  calculateMaxHoldTime(entryScore) {
    const baseTime = 1.5 * 60 * 60 * 1000; // 1.5 hours base (shorter)
    const scoreMultiplier = entryScore.totalScore / 100;
    return Math.min(baseTime * scoreMultiplier * 2, 6 * 60 * 60 * 1000); // Max 6 hours
  }

  // 🚀 MAIN INTEGRATION METHOD (Replaces downtrend filter)
  async enhanceExistingSignal(symbol, baseSignal, marketData) {
    try {
      // Check if this would be a good scalping entry
      const scalpingEntry = await this.detectPerfectEntry(symbol, marketData);
      
      if (scalpingEntry.entry) {
        this.stats.enhanced_signals++;
        logger.info(`🎯 [SCALPING] Enhancing signal for ${symbol} - Score: ${scalpingEntry.score}/100`);
        
        return {
          ...baseSignal,
          signal: 'BUY',
          confidence: Math.min(95, baseSignal.confidence + 10), // Moderate boost
          scalping_mode: true,
          entry_score: scalpingEntry.score,
          expected_move: scalpingEntry.expectedMove,
          targets: scalpingEntry.targets,
          max_hold_time: scalpingEntry.maxHold,
          entry_conditions: scalpingEntry.conditions,
          reasoning: `${baseSignal.reasoning} | SCALPING: Enhanced entry (${scalpingEntry.score}/100) - ${scalpingEntry.conditions.join(', ')}`,
          scalping_targets: {
            target1: scalpingEntry.targets.target1,
            target2: scalpingEntry.targets.target2,
            target3: scalpingEntry.targets.target3,
            stop_loss: scalpingEntry.targets.stopLoss
          }
        };
      } else {
        // Unlike downtrend filter, we don't block - just don't enhance
        logger.info(`⚠️ [SCALPING] Not optimal for ${symbol} but allowing signal - ${scalpingEntry.reason}`);
        
        // Allow the signal but without scalping enhancements
        return {
          ...baseSignal,
          reasoning: `${baseSignal.reasoning} | SCALPING: Standard entry (score: ${scalpingEntry.score}/100)`,
          scalping_analyzed: true,
          entry_score: scalpingEntry.score || 0,
          scalping_mode: false
        };
      }

    } catch (error) {
      logger.error(`Scalping enhancement error for ${symbol}:`, error.message);
      // On error, return original signal (don't block like downtrend filter)
      return {
        ...baseSignal,
        reasoning: `${baseSignal.reasoning} | SCALPING: Analysis error - using base signal`,
        scalping_error: true
      };
    }
  }

  // 📊 GET SCALPING STATISTICS (Replaces downtrend filter stats)
  getScalpingStats() {
    const enhancement_rate = this.stats.total_analyzed > 0 ? 
      (this.stats.enhanced_signals / this.stats.total_analyzed * 100).toFixed(1) + '%' : '0%';
    
    return {
      active_scalps: this.activeScalps.size,
      total_analyzed: this.stats.total_analyzed,
      enhanced_signals: this.stats.enhanced_signals,
      perfect_entries: this.stats.perfect_entries,
      enhancement_rate: enhancement_rate,
      avg_entry_score: this.calculateAvgEntryScore()
    };
  }

  calculateAvgEntryScore() {
    // Implementation for average entry score
    return this.stats.enhanced_signals > 0 ? 
      (this.stats.perfect_entries / this.stats.enhanced_signals * 100).toFixed(1) : 0;
  }

  // 🔄 Reset statistics
  resetStats() {
    this.stats = {
      total_analyzed: 0,
      perfect_entries: 0,
      enhanced_signals: 0,
      blocked_signals: 0
    };
    logger.info('🔄 Scalping system stats reset');
  }
}

module.exports = { AdvancedScalpingSystem };