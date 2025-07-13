const logger = require('../utils/logger');

class RiskParameterService {
  constructor() {
    this.riskProfiles = {
      conservative: {
        max_position_size: 2,
        max_leverage: 1,
        stop_loss_multiplier: 1.5,
        take_profit_multiplier: 1.5,
        volatility_threshold: 0.3,
        confidence_threshold: 60,
        max_drawdown: 5,
        correlation_limit: 0.3,
        sector_concentration: 20,
        risk_per_trade: 1,
        max_open_positions: 3,
        rebalance_frequency: 'weekly',
        sentiment_filter: true,
        liquidity_requirement: 'high',
        market_cap_minimum: 1000000000, // $1B
        volume_requirement: 10000000 // $10M daily
      },
      balanced: {
        max_position_size: 5,
        max_leverage: 2,
        stop_loss_multiplier: 1.2,
        take_profit_multiplier: 2.0,
        volatility_threshold: 0.5,
        confidence_threshold: 50,
        max_drawdown: 10,
        correlation_limit: 0.5,
        sector_concentration: 30,
        risk_per_trade: 2,
        max_open_positions: 5,
        rebalance_frequency: 'daily',
        sentiment_filter: true,
        liquidity_requirement: 'medium',
        market_cap_minimum: 500000000, // $500M
        volume_requirement: 5000000 // $5M daily
      },
      aggressive: {
        max_position_size: 10,
        max_leverage: 5,
        stop_loss_multiplier: 1.0,
        take_profit_multiplier: 3.0,
        volatility_threshold: 0.8,
        confidence_threshold: 40,
        max_drawdown: 20,
        correlation_limit: 0.7,
        sector_concentration: 50,
        risk_per_trade: 3,
        max_open_positions: 8,
        rebalance_frequency: 'hourly',
        sentiment_filter: false,
        liquidity_requirement: 'low',
        market_cap_minimum: 100000000, // $100M
        volume_requirement: 1000000 // $1M daily
      }
    };

    this.marketConditionAdjustments = {
      bull_market: {
        position_size_multiplier: 1.2,
        confidence_adjustment: 5,
        stop_loss_adjustment: 0.9,
        take_profit_adjustment: 1.1
      },
      bear_market: {
        position_size_multiplier: 0.7,
        confidence_adjustment: -10,
        stop_loss_adjustment: 1.2,
        take_profit_adjustment: 0.8
      },
      sideways_market: {
        position_size_multiplier: 0.9,
        confidence_adjustment: -5,
        stop_loss_adjustment: 1.1,
        take_profit_adjustment: 0.9
      },
      high_volatility: {
        position_size_multiplier: 0.6,
        confidence_adjustment: -15,
        stop_loss_adjustment: 1.5,
        take_profit_adjustment: 1.3
      },
      low_volatility: {
        position_size_multiplier: 1.1,
        confidence_adjustment: 5,
        stop_loss_adjustment: 0.8,
        take_profit_adjustment: 1.2
      }
    };
  }

  getRiskParameters(riskLevel, marketConditions = {}) {
    const baseProfile = this.riskProfiles[riskLevel] || this.riskProfiles.balanced;
    
    // Apply market condition adjustments
    const adjustedProfile = this.applyMarketConditionAdjustments(baseProfile, marketConditions);
    
    // Add dynamic risk metrics
    const dynamicMetrics = this.calculateDynamicRiskMetrics(adjustedProfile, marketConditions);
    
    return {
      ...adjustedProfile,
      dynamic_metrics: dynamicMetrics,
      risk_level: riskLevel,
      market_conditions: marketConditions,
      last_updated: Date.now()
    };
  }

  applyMarketConditionAdjustments(baseProfile, marketConditions) {
    let adjustedProfile = { ...baseProfile };
    
    // Determine primary market condition
    const primaryCondition = this.determinePrimaryMarketCondition(marketConditions);
    const adjustment = this.marketConditionAdjustments[primaryCondition];
    
    if (adjustment) {
      adjustedProfile.max_position_size = Math.round(
        adjustedProfile.max_position_size * adjustment.position_size_multiplier
      );
      
      adjustedProfile.confidence_threshold = Math.max(20, Math.min(80,
        adjustedProfile.confidence_threshold + adjustment.confidence_adjustment
      ));
      
      adjustedProfile.stop_loss_multiplier *= adjustment.stop_loss_adjustment;
      adjustedProfile.take_profit_multiplier *= adjustment.take_profit_adjustment;
    }
    
    // Apply volatility-specific adjustments
    if (marketConditions.volatility_regime === 'HIGH_VOLATILITY') {
      const volAdjustment = this.marketConditionAdjustments.high_volatility;
      adjustedProfile.max_position_size = Math.round(
        adjustedProfile.max_position_size * volAdjustment.position_size_multiplier
      );
      adjustedProfile.stop_loss_multiplier *= volAdjustment.stop_loss_adjustment;
    }
    
    return adjustedProfile;
  }

  determinePrimaryMarketCondition(marketConditions) {
    if (marketConditions.primary_trend === 'BULLISH' && 
        marketConditions.secondary_trend === 'BULLISH') {
      return 'bull_market';
    }
    
    if (marketConditions.primary_trend === 'BEARISH' && 
        marketConditions.secondary_trend === 'BEARISH') {
      return 'bear_market';
    }
    
    if (marketConditions.volatility_regime === 'HIGH_VOLATILITY') {
      return 'high_volatility';
    }
    
    if (marketConditions.volatility_regime === 'LOW_VOLATILITY') {
      return 'low_volatility';
    }
    
    return 'sideways_market';
  }

  calculateDynamicRiskMetrics(profile, marketConditions) {
    return {
      portfolio_heat: this.calculatePortfolioHeat(profile, marketConditions),
      risk_budget_utilization: this.calculateRiskBudgetUtilization(profile),
      correlation_risk: this.calculateCorrelationRisk(profile, marketConditions),
      liquidity_risk: this.calculateLiquidityRisk(profile, marketConditions),
      concentration_risk: this.calculateConcentrationRisk(profile),
      market_risk: this.calculateMarketRisk(marketConditions),
      volatility_risk: this.calculateVolatilityRisk(marketConditions),
      sentiment_risk: this.calculateSentimentRisk(marketConditions)
    };
  }

  calculatePortfolioHeat(profile, marketConditions) {
    let heat = 0;
    
    // Base heat from position size
    heat += (profile.max_position_size / 10) * 20;
    
    // Market condition heat
    if (marketConditions.volatility_regime === 'HIGH_VOLATILITY') heat += 30;
    if (marketConditions.market_phase === 'DISTRIBUTION') heat += 20;
    if (marketConditions.market_phase === 'MARKDOWN') heat += 25;
    
    // Leverage heat
    heat += (profile.max_leverage - 1) * 15;
    
    return Math.max(0, Math.min(100, heat));
  }

  calculateRiskBudgetUtilization(profile) {
    // Simulate current risk budget usage
    const maxRisk = profile.max_drawdown;
    const currentRisk = profile.risk_per_trade * profile.max_open_positions;
    
    return Math.min(100, (currentRisk / maxRisk) * 100);
  }

  calculateCorrelationRisk(profile, marketConditions) {
    let risk = 0;
    
    // Higher correlation in certain market phases
    if (marketConditions.market_phase === 'MARKDOWN') risk += 30;
    if (marketConditions.volatility_regime === 'HIGH_VOLATILITY') risk += 20;
    
    // Profile correlation limit adjustment
    risk += (profile.correlation_limit * 50);
    
    return Math.max(0, Math.min(100, risk));
  }

  calculateLiquidityRisk(profile, marketConditions) {
    let risk = 20; // Base liquidity risk
    
    // Market condition adjustments
    if (marketConditions.volatility_regime === 'HIGH_VOLATILITY') risk += 25;
    if (marketConditions.market_phase === 'DISTRIBUTION') risk += 15;
    
    // Profile liquidity requirement adjustment
    if (profile.liquidity_requirement === 'high') risk -= 15;
    else if (profile.liquidity_requirement === 'low') risk += 15;
    
    return Math.max(0, Math.min(100, risk));
  }

  calculateConcentrationRisk(profile) {
    // Risk from sector concentration limits
    const concentrationRisk = (profile.sector_concentration / 100) * 60;
    
    return Math.max(0, Math.min(100, concentrationRisk));
  }

  calculateMarketRisk(marketConditions) {
    let risk = 30; // Base market risk
    
    // Market phase risk
    const phaseRisk = {
      'ACCUMULATION': 20,
      'MARKUP': 25,
      'DISTRIBUTION': 40,
      'MARKDOWN': 45,
      'CONSOLIDATION': 15
    };
    
    risk += phaseRisk[marketConditions.market_phase] || 30;
    
    // Trend alignment risk
    if (marketConditions.alignment === 'DIVERGENT') risk += 15;
    
    return Math.max(0, Math.min(100, risk));
  }

  calculateVolatilityRisk(marketConditions) {
    const volatilityRisk = {
      'LOW_VOLATILITY': 15,
      'NORMAL_VOLATILITY': 30,
      'HIGH_VOLATILITY': 60
    };
    
    return volatilityRisk[marketConditions.volatility_regime] || 30;
  }

  calculateSentimentRisk(marketConditions) {
    // This would be calculated based on sentiment indicators
    // For now, return a moderate risk level
    return 35;
  }

  validateSignalAgainstRiskParameters(signal, riskParams, marketData) {
    const validationResults = {
      approved: true,
      adjustments: [],
      warnings: [],
      risk_score: 0
    };

    // Position size validation
    if (signal.position_size_percent > riskParams.max_position_size) {
      validationResults.adjustments.push({
        parameter: 'position_size_percent',
        original: signal.position_size_percent,
        adjusted: riskParams.max_position_size,
        reason: 'Exceeds maximum position size limit'
      });
      signal.position_size_percent = riskParams.max_position_size;
    }

    // Confidence threshold validation
    if (signal.confidence < riskParams.confidence_threshold) {
      validationResults.warnings.push({
        type: 'LOW_CONFIDENCE',
        message: `Signal confidence ${signal.confidence}% below threshold ${riskParams.confidence_threshold}%`,
        recommendation: 'Consider reducing position size or waiting for higher confidence'
      });
      validationResults.risk_score += 20;
    }

    // Volatility validation
    if (signal.volatility_rating === 'HIGH' || signal.volatility_rating === 'EXTREME') {
      if (marketData.volatility > riskParams.volatility_threshold) {
        validationResults.warnings.push({
          type: 'HIGH_VOLATILITY',
          message: 'Market volatility exceeds risk tolerance',
          recommendation: 'Consider reducing position size or implementing tighter stops'
        });
        validationResults.risk_score += 25;
        
        // Auto-adjust position size for high volatility
        const volatilityAdjustment = Math.max(0.5, 1 - (marketData.volatility - riskParams.volatility_threshold));
        signal.position_size_percent = Math.round(signal.position_size_percent * volatilityAdjustment);
        
        validationResults.adjustments.push({
          parameter: 'position_size_percent',
          original: signal.position_size_percent / volatilityAdjustment,
          adjusted: signal.position_size_percent,
          reason: 'Volatility adjustment applied'
        });
      }
    }

    // Market cap and volume validation
    if (marketData.market_cap < riskParams.market_cap_minimum) {
      validationResults.warnings.push({
        type: 'LOW_MARKET_CAP',
        message: 'Asset market cap below minimum requirement',
        recommendation: 'Consider focusing on larger cap assets'
      });
      validationResults.risk_score += 15;
    }

    if (marketData.volume_24h < riskParams.volume_requirement) {
      validationResults.warnings.push({
        type: 'LOW_VOLUME',
        message: 'Asset trading volume below minimum requirement',
        recommendation: 'Liquidity risk - consider smaller position or avoid trade'
      });
      validationResults.risk_score += 20;
    }

    // Stop loss validation
    const currentStopDistance = Math.abs(signal.entry_price - signal.stop_loss) / signal.entry_price;
    const maxStopDistance = riskParams.stop_loss_multiplier * 0.05; // 5% base * multiplier
    
    if (currentStopDistance > maxStopDistance) {
      const adjustedStopLoss = signal.signal === 'BUY' ? 
        signal.entry_price * (1 - maxStopDistance) :
        signal.entry_price * (1 + maxStopDistance);
      
      validationResults.adjustments.push({
        parameter: 'stop_loss',
        original: signal.stop_loss,
        adjusted: adjustedStopLoss,
        reason: 'Stop loss too wide for risk parameters'
      });
      signal.stop_loss = adjustedStopLoss;
    }

    // Risk score calculation
    if (validationResults.risk_score > 50) {
      validationResults.approved = false;
      validationResults.warnings.push({
        type: 'HIGH_RISK_SCORE',
        message: `Total risk score ${validationResults.risk_score} exceeds acceptable level`,
        recommendation: 'Consider avoiding this trade or significantly reducing position size'
      });
    }

    return validationResults;
  }

  generateRiskReport(riskParams, marketConditions, portfolioData = {}) {
    const dynamicMetrics = riskParams.dynamic_metrics;
    
    return {
      risk_level: riskParams.risk_level,
      overall_risk_score: this.calculateOverallRiskScore(dynamicMetrics),
      risk_breakdown: {
        market_risk: dynamicMetrics.market_risk,
        volatility_risk: dynamicMetrics.volatility_risk,
        liquidity_risk: dynamicMetrics.liquidity_risk,
        concentration_risk: dynamicMetrics.concentration_risk,
        correlation_risk: dynamicMetrics.correlation_risk
      },
      portfolio_metrics: {
        heat_level: dynamicMetrics.portfolio_heat,
        risk_budget_usage: dynamicMetrics.risk_budget_utilization,
        max_drawdown_limit: riskParams.max_drawdown,
        position_limits: {
          max_position_size: riskParams.max_position_size,
          max_open_positions: riskParams.max_open_positions,
          max_leverage: riskParams.max_leverage
        }
      },
      market_assessment: {
        primary_trend: marketConditions.primary_trend,
        market_phase: marketConditions.market_phase,
        volatility_regime: marketConditions.volatility_regime,
        regime_confidence: marketConditions.regime_confidence
      },
      recommendations: this.generateRiskRecommendations(dynamicMetrics, marketConditions),
      alerts: this.generateRiskAlerts(dynamicMetrics, riskParams),
      timestamp: Date.now()
    };
  }

  calculateOverallRiskScore(dynamicMetrics) {
    const weights = {
      market_risk: 0.25,
      volatility_risk: 0.20,
      liquidity_risk: 0.15,
      concentration_risk: 0.15,
      correlation_risk: 0.10,
      portfolio_heat: 0.15
    };

    let overallScore = 0;
    for (const [metric, weight] of Object.entries(weights)) {
      overallScore += (dynamicMetrics[metric] || 0) * weight;
    }

    return Math.round(overallScore);
  }

  generateRiskRecommendations(dynamicMetrics, marketConditions) {
    const recommendations = [];

    if (dynamicMetrics.portfolio_heat > 70) {
      recommendations.push({
        type: 'REDUCE_EXPOSURE',
        priority: 'HIGH',
        message: 'Portfolio heat is elevated - consider reducing position sizes',
        action: 'Reduce overall exposure by 20-30%'
      });
    }

    if (dynamicMetrics.volatility_risk > 60) {
      recommendations.push({
        type: 'VOLATILITY_MANAGEMENT',
        priority: 'MEDIUM',
        message: 'High volatility environment detected',
        action: 'Implement tighter stop losses and reduce leverage'
      });
    }

    if (marketConditions.market_phase === 'DISTRIBUTION') {
      recommendations.push({
        type: 'MARKET_PHASE_ADJUSTMENT',
        priority: 'HIGH',
        message: 'Distribution phase detected - potential market top',
        action: 'Consider taking profits and reducing long exposure'
      });
    }

    if (dynamicMetrics.liquidity_risk > 50) {
      recommendations.push({
        type: 'LIQUIDITY_MANAGEMENT',
        priority: 'MEDIUM',
        message: 'Elevated liquidity risk',
        action: 'Focus on higher volume assets and avoid large position sizes'
      });
    }

    return recommendations;
  }

  generateRiskAlerts(dynamicMetrics, riskParams) {
    const alerts = [];

    if (dynamicMetrics.portfolio_heat > 80) {
      alerts.push({
        level: 'CRITICAL',
        type: 'PORTFOLIO_HEAT',
        message: 'Portfolio heat critical - immediate action required',
        timestamp: Date.now()
      });
    }

    if (dynamicMetrics.risk_budget_utilization > 90) {
      alerts.push({
        level: 'WARNING',
        type: 'RISK_BUDGET',
        message: 'Risk budget nearly exhausted',
        timestamp: Date.now()
      });
    }

    if (dynamicMetrics.correlation_risk > 70) {
      alerts.push({
        level: 'WARNING',
        type: 'CORRELATION',
        message: 'High correlation risk detected',
        timestamp: Date.now()
      });
    }

    return alerts;
  }

  getCustomRiskParameters(customSettings, baseRiskLevel = 'balanced') {
    const baseProfile = this.riskProfiles[baseRiskLevel];
    
    // Merge custom settings with base profile
    const customProfile = {
      ...baseProfile,
      ...customSettings,
      custom_settings: true,
      base_profile: baseRiskLevel
    };

    // Validate custom settings
    const validation = this.validateCustomRiskParameters(customProfile);
    
    if (!validation.valid) {
      logger.warn('Invalid custom risk parameters:', validation.errors);
      return baseProfile; // Fallback to base profile
    }

    return customProfile;
  }

  validateCustomRiskParameters(customProfile) {
    const errors = [];
    
    // Validate position size
    if (customProfile.max_position_size < 1 || customProfile.max_position_size > 25) {
      errors.push('max_position_size must be between 1 and 25');
    }

    // Validate leverage
    if (customProfile.max_leverage < 1 || customProfile.max_leverage > 10) {
      errors.push('max_leverage must be between 1 and 10');
    }

    // Validate confidence threshold
    if (customProfile.confidence_threshold < 20 || customProfile.confidence_threshold > 80) {
      errors.push('confidence_threshold must be between 20 and 80');
    }

    // Validate max drawdown
    if (customProfile.max_drawdown < 1 || customProfile.max_drawdown > 50) {
      errors.push('max_drawdown must be between 1 and 50');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = new RiskParameterService(); 