// 🛡️ Smart Quality Filter System
// File: src/services/smartQualityFilter.js
// Maintains quality while allowing profitable trades

const logger = require('../utils/logger');

class SmartQualityFilter {
  constructor() {
    this.stats = {
      total_analyzed: 0,
      tier1_approved: 0,
      tier2_approved: 0,
      tier3_approved: 0,
      downtrend_blocked: 0,
      risk_factor_blocked: 0,
      volume_blocked: 0,
      confirmation_blocked: 0
    };
  }

  // 🎯 MAIN QUALITY CHECK
  async checkSignalQuality(symbol, signal, technicalData, marketData) {
    this.stats.total_analyzed++;
    
    // 🔥 FIXED: Use tier from signal if available, otherwise determine from confidence
    const tier = signal.tier || this.determineTier(signal.confidence);
    if (tier === 0) {
      return { allowed: false, reason: "Below minimum confidence threshold" };
    }

    logger.info(`🔍 [QUALITY] ${symbol} - Tier ${tier} (${signal.confidence.toFixed(1)}%)`);

    // Run all quality checks in sequence
    const downtrendCheck = await this.checkDowntrendByTier(symbol, signal, technicalData, marketData, tier);
    if (!downtrendCheck.allowed) {
      this.stats.downtrend_blocked++;
      return downtrendCheck;
    }

    const riskCheck = await this.checkRiskFactors(symbol, signal, technicalData, tier);
    if (!riskCheck.allowed) {
      this.stats.risk_factor_blocked++;
      return riskCheck;
    }

    const volumeCheck = await this.checkVolumeQuality(symbol, signal, technicalData, tier);
    if (!volumeCheck.allowed) {
      this.stats.volume_blocked++;
      return volumeCheck;
    }

    const confirmationCheck = await this.checkConfirmations(symbol, signal, technicalData, tier);
    if (!confirmationCheck.allowed) {
      this.stats.confirmation_blocked++;
      return confirmationCheck;
    }

    // All checks passed - approve signal
    this.stats[`tier${tier}_approved`]++;
    
    const qualityScore = this.calculateQualityScore(downtrendCheck, riskCheck, volumeCheck, confirmationCheck);
    
    logger.info(`✅ [QUALITY] ${symbol} APPROVED - Tier ${tier} (Score: ${qualityScore}/100)`);

    return {
      allowed: true,
      tier: tier,
      quality_score: qualityScore,
      reason: `High quality Tier ${tier} signal`,
      breakdown: {
        downtrend: downtrendCheck.score || 75,
        risk: riskCheck.score || 70,
        volume: volumeCheck.score || 75,
        confirmations: confirmationCheck.score || 80
      }
    };
  }

  // 🔍 TIERED DOWNTREND PROTECTION
  async checkDowntrendByTier(symbol, signal, technicalData, marketData, tier) {
    const indicators = {
      ema20: technicalData?.ema20,
      ema50: technicalData?.ema50,
      ema200: technicalData?.ema200,
      rsi: technicalData?.rsi || 50,
      adx: technicalData?.adx || 20,
      price: marketData?.current_price
    };

    logger.info(`📊 [DOWNTREND] ${symbol} EMAs: 20=${indicators.ema20?.toFixed(2)}, 50=${indicators.ema50?.toFixed(2)}, 200=${indicators.ema200?.toFixed(2)}`);
    logger.info(`📊 [DOWNTREND] ${symbol} RSI=${indicators.rsi}, ADX=${indicators.adx}, Price=${indicators.price}`);

    switch(tier) {
      case 1: return this.tier1StrictDowntrendCheck(symbol, indicators);
      case 2: return this.tier2ModerateDowntrendCheck(symbol, indicators);
      case 3: return this.tier3RelaxedDowntrendCheck(symbol, indicators);
      default: return { allowed: false, reason: "Invalid tier" };
    }
  }

  // 🥇 TIER 1: ULTRA STRICT DOWNTREND PROTECTION
  tier1StrictDowntrendCheck(symbol, indicators) {
    const { ema20, ema50, ema200, rsi, adx, price } = indicators;
    
    logger.info(`🥇 [TIER-1] Ultra-strict analysis for ${symbol}`);
    
    // 🔥 ULTRA STRICT: Block any bearish EMA alignment for Tier 1
    if (ema20 && ema50 && ema20 < ema50) {
      const gap = ((ema50 - ema20) / ema50) * 100;
      logger.info(`❌ [TIER-1] ${symbol} BLOCKED - Bearish EMA alignment (${gap.toFixed(1)}% gap)`);
      return { allowed: false, reason: "Tier 1: Bearish EMA alignment not allowed", score: 20 };
    }
    
    // 🔥 ULTRA STRICT: Block price below EMA20 for Tier 1
    if (price && ema20 && price < ema20) {
      const gap = ((ema20 - price) / ema20) * 100;
      logger.info(`❌ [TIER-1] ${symbol} BLOCKED - Price below EMA20 (${gap.toFixed(1)}% gap)`);
      return { allowed: false, reason: "Tier 1: Price below EMA20 not allowed", score: 25 };
    }
    
    // 🔥 ULTRA STRICT: Higher RSI requirement for better quality
    if (rsi < 50) { // Increased from 45 to 50 - much stricter
      logger.info(`❌ [TIER-1] ${symbol} BLOCKED - RSI too weak (${rsi})`);
      return { allowed: false, reason: "Tier 1: RSI too weak for premium entry", score: 30 };
    }
    
    // 🔥 ULTRA STRICT: Higher ADX requirement for better trend strength
    if (adx < 30) { // Increased from 25 to 30 - much stricter
      logger.info(`❌ [TIER-1] ${symbol} BLOCKED - ADX too weak (${adx})`);
      return { allowed: false, reason: "Tier 1: Trend strength insufficient", score: 35 };
    }

    // 🔥 ULTRA STRICT: Block any long-term bearish structure for Tier 1
    if (ema50 && ema200 && ema50 < ema200) {
      const gap = ((ema200 - ema50) / ema200) * 100;
      logger.info(`❌ [TIER-1] ${symbol} BLOCKED - Long-term bearish structure (EMA50 < EMA200 by ${gap.toFixed(1)}%)`);
      return { allowed: false, reason: "Tier 1: Long-term bearish structure not allowed", score: 25 };
    }

    // 🔥 ULTRA STRICT: Additional volume requirement for Tier 1
    if (indicators.volume_ratio && indicators.volume_ratio < 1.5) { // Increased from 1.2 to 1.5
      logger.info(`❌ [TIER-1] ${symbol} BLOCKED - Volume ratio too low (${indicators.volume_ratio})`);
      return { allowed: false, reason: "Tier 1: Volume ratio insufficient for premium entry", score: 30 };
    }

    logger.info(`✅ [TIER-1] ${symbol} APPROVED - Premium quality confirmed`);
    return { allowed: true, reason: "Tier 1: Premium quality confirmed", score: 95 };
  }

  // 🥈 TIER 2: MODERATE DOWNTREND PROTECTION
  tier2ModerateDowntrendCheck(symbol, indicators) {
    const { ema20, ema50, ema200, rsi, adx, price } = indicators;
    
    logger.info(`🥈 [TIER-2] Moderate analysis for ${symbol}`);
    
    // 🔥 TIGHTENED: Block any bearish EMA sequence for Tier 2
    if (ema20 && ema50 && ema200 && ema20 < ema50 && ema50 < ema200) {
      const gap1 = ((ema50 - ema20) / ema50) * 100;
      const gap2 = ((ema200 - ema50) / ema200) * 100;
      
      if (gap1 > 1 && gap2 > 1) { // Tighter than before (was 2%)
        logger.info(`❌ [TIER-2] ${symbol} BLOCKED - Bearish EMA sequence (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`);
        return { allowed: false, reason: `Tier 2: Bearish EMA sequence (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`, score: 25 };
      } else {
        logger.info(`⚠️ [TIER-2] ${symbol} WARNING - Mild bearish EMA sequence (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`);
      }
    }
    
    // 🔥 TIGHTENED: Block price below EMAs for Tier 2
    if (price && ema20 && ema50 && price < ema20 * 0.98 && price < ema50 * 0.98) { // Tighter than before (was 0.97)
      const gap1 = ((ema20 - price) / ema20) * 100;
      const gap2 = ((ema50 - price) / ema50) * 100;
      logger.info(`❌ [TIER-2] ${symbol} BLOCKED - Price below EMAs (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`);
      return { allowed: false, reason: "Tier 2: Price below EMAs", score: 30 };
    }
    
    // 🔥 ULTRA TIGHTENED: Much higher RSI requirement for Tier 2
    if (rsi < 45) { // Increased from 35 to 45 - much stricter
      logger.info(`❌ [TIER-2] ${symbol} BLOCKED - RSI too weak (${rsi})`);
      return { allowed: false, reason: "Tier 2: RSI too weak", score: 35 };
    }
    
    // 🔥 ULTRA TIGHTENED: Much higher ADX requirement for Tier 2
    if (adx < 30) { // Increased from 25 to 30 - much stricter
      logger.info(`❌ [TIER-2] ${symbol} BLOCKED - ADX too weak (${adx})`);
      return { allowed: false, reason: "Tier 2: ADX too weak", score: 35 };
    }

    // 🔥 ULTRA TIGHTENED: Volume ratio requirement for Tier 2
    if (indicators.volume_ratio && indicators.volume_ratio < 1.3) { // Require 1.3x volume for Tier 2
      logger.info(`❌ [TIER-2] ${symbol} BLOCKED - Volume ratio too low (${indicators.volume_ratio})`);
      return { allowed: false, reason: "Tier 2: Volume ratio insufficient", score: 30 };
    }

    logger.info(`✅ [TIER-2] ${symbol} APPROVED - Good quality setup`);
    return { allowed: true, reason: "Tier 2: Good quality setup", score: 75 };
  }

  // 🥉 TIER 3: RELAXED DOWNTREND PROTECTION
  tier3RelaxedDowntrendCheck(symbol, indicators) {
    const { ema20, ema50, ema200, rsi, adx, price } = indicators;
    
    logger.info(`🥉 [TIER-3] Relaxed analysis for ${symbol}`);
    
    // Block only SEVERE bearish EMA sequence
    if (ema20 && ema50 && ema200 && ema20 < ema50 && ema50 < ema200) {
      const gap1 = ((ema50 - ema20) / ema50) * 100;
      const gap2 = ((ema200 - ema50) / ema200) * 100;
      
      if (gap1 > 4 && gap2 > 4) {
        logger.info(`❌ [TIER-3] ${symbol} BLOCKED - SEVERE bearish EMA sequence (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`);
        return { allowed: false, reason: `Tier 3: SEVERE bearish EMA sequence (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`, score: 20 };
      } else {
        logger.info(`⚠️ [TIER-3] ${symbol} WARNING - Bearish EMA sequence within tolerance (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%)`);
      }
    }
    
    // Block extremely weak conditions
    if (rsi < 20 && adx < 15) {
      logger.info(`❌ [TIER-3] ${symbol} BLOCKED - Extremely weak conditions (RSI: ${rsi}, ADX: ${adx})`);
      return { allowed: false, reason: "Tier 3: Extremely weak conditions", score: 25 };
    }
    
    // Block extreme price dislocation
    if (price && ema20 && ema50 && ema200 && 
        price < ema20 * 0.94 && price < ema50 * 0.94 && price < ema200 * 0.94) {
      const gap1 = ((ema20 - price) / ema20) * 100;
      const gap2 = ((ema50 - price) / ema50) * 100;
      const gap3 = ((ema200 - price) / ema200) * 100;
      logger.info(`❌ [TIER-3] ${symbol} BLOCKED - Extreme price dislocation (${gap1.toFixed(1)}%, ${gap2.toFixed(1)}%, ${gap3.toFixed(1)}%)`);
      return { allowed: false, reason: "Tier 3: Extreme price dislocation", score: 20 };
    }

    logger.info(`✅ [TIER-3] ${symbol} APPROVED - Acceptable risk level`);
    return { allowed: true, reason: "Tier 3: Acceptable risk level", score: 60 };
  }

  // 🚨 RISK FACTOR CHECK
  async checkRiskFactors(symbol, signal, technicalData, tier) {
    const riskFactors = [];
    const rsi = technicalData?.rsi || 50;
    const mfi = technicalData?.mfi || 50;
    const atr = technicalData?.atr;
    const price = signal.entry_price || technicalData?.price;

    // Identify risk factors
    if (rsi > 75) riskFactors.push("RSI overbought");
    if (rsi > 80) riskFactors.push("RSI severely overbought");
    if (mfi < 35) riskFactors.push("Weak money flow");
    
    if (atr && price) {
      const atrPercent = (atr / price) * 100;
      if (atrPercent > 8) riskFactors.push("High volatility");
      if (atrPercent > 12) riskFactors.push("Extreme volatility");
    }

    // Tier-based tolerance
    const maxAllowed = tier === 1 ? 0 : tier === 2 ? 1 : 2;
    
    logger.info(`🚨 [RISK] ${symbol} risk factors: ${riskFactors.length}/${maxAllowed} (${riskFactors.join(', ') || 'none'})`);
    
    if (riskFactors.length > maxAllowed) {
      logger.info(`❌ [RISK] ${symbol} BLOCKED - Too many risk factors for Tier ${tier}`);
      return {
        allowed: false,
        reason: `Too many risk factors for Tier ${tier} (${riskFactors.length}/${maxAllowed}): ${riskFactors.join(', ')}`,
        score: Math.max(20, 70 - (riskFactors.length * 15))
      };
    }

    return {
      allowed: true,
      reason: `Risk factors acceptable (${riskFactors.length}/${maxAllowed})`,
      score: Math.max(50, 85 - (riskFactors.length * 10))
    };
  }

  // 📊 VOLUME QUALITY CHECK
  async checkVolumeQuality(symbol, signal, technicalData, tier) {
    const volumeRatio = technicalData?.volume_ratio || 1.0;
    const mfi = technicalData?.mfi || 50;
    
    let volumeScore = 0;
    
    // 🔥 MORE PERMISSIVE: Volume ratio scoring (40 points max)
    if (volumeRatio >= 1.5) volumeScore += 40;
    else if (volumeRatio >= 1.2) volumeScore += 30;
    else if (volumeRatio >= 1.0) volumeScore += 20;
    else if (volumeRatio >= 0.9) volumeScore += 10; // 🔥 Accept lower volume
    else volumeScore += 0;
    
    // Money flow scoring (30 points max)
    if (mfi >= 60) volumeScore += 30;
    else if (mfi >= 50) volumeScore += 20;
    else if (mfi >= 40) volumeScore += 10;
    else volumeScore += 0;
    
    // Consistency bonus (30 points max) - simplified for now
    volumeScore += 15; // Base consistency score
    
    // 🔥 ULTRA STRICT: Tier-based requirements for proper cascade
    const minRequired = tier === 1 ? 70 : tier === 2 ? 75 : 40; // 🔥 Much stricter Tier 2 (was 60)
    
    logger.info(`📊 [VOLUME] ${symbol} volume score: ${volumeScore}/100 (min: ${minRequired}, ratio: ${volumeRatio.toFixed(2)}x, MFI: ${mfi})`);
    
    if (volumeScore < minRequired) {
      logger.info(`❌ [VOLUME] ${symbol} BLOCKED - Volume quality insufficient for Tier ${tier}`);
      return {
        allowed: false,
        reason: `Volume quality insufficient for Tier ${tier} (${volumeScore}/${minRequired})`,
        score: volumeScore
      };
    }

    return {
      allowed: true,
      reason: `Volume quality good (${volumeScore}/${minRequired})`,
      score: volumeScore
    };
  }

  // ✅ CONFIRMATION CHECK
  async checkConfirmations(symbol, signal, technicalData, tier) {
    let confirmations = 0;
    const confirmationDetails = [];
    
    // 🔥 BALANCED: Moderate volume confirmation requirement
    const volumeRatio = technicalData?.volume_ratio || 1.0;
    if (volumeRatio >= 1.1) { // 🔥 Balanced from 1.2 to 1.1
      confirmations++;
      confirmationDetails.push("volume");
    }
    
    // Momentum confirmation (MACD)
    const macd = technicalData?.macd;
    if (macd && macd.histogram > 0) {
      confirmations++;
      confirmationDetails.push("momentum");
    }
    
    // 🔥 BALANCED: Moderate RSI confirmation range
    const rsi = technicalData?.rsi || 50;
    if (rsi >= 30 && rsi <= 80) { // 🔥 Balanced range from 35-75 to 30-80
      confirmations++;
      confirmationDetails.push("rsi");
    }

    // 🔥 BALANCED: Moderate tier-based requirements
    const required = tier === 1 ? 2 : tier === 2 ? 1 : 1; // 🔥 Balanced Tier 1 from 3 to 2
    
    logger.info(`✅ [CONFIRM] ${symbol} confirmations: ${confirmations}/${required} (${confirmationDetails.join(', ') || 'none'})`);
    
    if (confirmations < required) {
      logger.info(`❌ [CONFIRM] ${symbol} BLOCKED - Insufficient confirmations for Tier ${tier}`);
      return {
        allowed: false,
        reason: `Insufficient confirmations for Tier ${tier} (${confirmations}/${required})`,
        score: (confirmations / required) * 60
      };
    }

    return {
      allowed: true,
      reason: `Confirmations met (${confirmations}/${required})`,
      score: Math.min(90, 60 + (confirmations * 10))
    };
  }

  // 📊 HELPER METHODS
  determineTier(confidence) {
    if (confidence >= 50) return 1;      // Premium tier
    if (confidence >= 35) return 2;      // Good tier
    if (confidence >= 25) return 3;      // Acceptable tier
    return 0; // Below minimum
  }

  calculateQualityScore(downtrendCheck, riskCheck, volumeCheck, confirmationCheck) {
    const weights = { 
      downtrend: 0.3, 
      risk: 0.25, 
      volume: 0.25, 
      confirmations: 0.2 
    };
    
    const scores = {
      downtrend: downtrendCheck.score || 70,
      risk: riskCheck.score || 70,
      volume: volumeCheck.score || 70,
      confirmations: confirmationCheck.score || 70
    };

    return Math.round(
      (scores.downtrend * weights.downtrend) +
      (scores.risk * weights.risk) +
      (scores.volume * weights.volume) +
      (scores.confirmations * weights.confirmations)
    );
  }

  // 📈 GET COMPREHENSIVE STATISTICS
  getStats() {
    const total = this.stats.total_analyzed;
    const approved = this.stats.tier1_approved + this.stats.tier2_approved + this.stats.tier3_approved;
    const blocked = this.stats.downtrend_blocked + this.stats.risk_factor_blocked + 
                   this.stats.volume_blocked + this.stats.confirmation_blocked;
    
    return {
      ...this.stats,
      approval_rate: total > 0 ? ((approved / total) * 100).toFixed(1) + '%' : '0%',
      rejection_rate: total > 0 ? ((blocked / total) * 100).toFixed(1) + '%' : '0%',
      tier_breakdown: {
        tier1_approved: this.stats.tier1_approved,
        tier1_rate: total > 0 ? ((this.stats.tier1_approved / total) * 100).toFixed(1) + '%' : '0%',
        tier2_approved: this.stats.tier2_approved,
        tier2_rate: total > 0 ? ((this.stats.tier2_approved / total) * 100).toFixed(1) + '%' : '0%',
        tier3_approved: this.stats.tier3_approved,
        tier3_rate: total > 0 ? ((this.stats.tier3_approved / total) * 100).toFixed(1) + '%' : '0%'
      },
      rejection_breakdown: {
        downtrend_blocked: this.stats.downtrend_blocked,
        downtrend_rate: total > 0 ? ((this.stats.downtrend_blocked / total) * 100).toFixed(1) + '%' : '0%',
        risk_factor_blocked: this.stats.risk_factor_blocked,
        risk_rate: total > 0 ? ((this.stats.risk_factor_blocked / total) * 100).toFixed(1) + '%' : '0%',
        volume_blocked: this.stats.volume_blocked,
        volume_rate: total > 0 ? ((this.stats.volume_blocked / total) * 100).toFixed(1) + '%' : '0%',
        confirmation_blocked: this.stats.confirmation_blocked,
        confirmation_rate: total > 0 ? ((this.stats.confirmation_blocked / total) * 100).toFixed(1) + '%' : '0%'
      }
    };
  }

  // 🔄 RESET STATISTICS
  resetStats() {
    this.stats = {
      total_analyzed: 0,
      tier1_approved: 0,
      tier2_approved: 0,
      tier3_approved: 0,
      downtrend_blocked: 0,
      risk_factor_blocked: 0,
      volume_blocked: 0,
      confirmation_blocked: 0
    };
    logger.info('🔄 Smart Quality Filter stats reset');
  }
}

module.exports = SmartQualityFilter;