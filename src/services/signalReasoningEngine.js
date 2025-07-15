const logger = require('../utils/logger');

class SignalReasoningEngine {
  constructor() {
    this.reasoningTemplates = {
      technical: {
        bullish: [
          'RSI {rsi} indicates oversold conditions below 30',
          'MACD histogram {macd_histogram} shows bullish momentum',
          'Price {price} above SMA20 {sma20} confirms uptrend',
          'Bollinger Bands suggest price near lower support at {bb_lower}',
          'Volume ratio {volume_ratio}x confirms buying interest',
          'ATR {atr} indicates manageable volatility for entry'
        ],
        bearish: [
          'RSI {rsi} indicates overbought conditions above 70',
          'MACD histogram {macd_histogram} shows bearish momentum',
          'Price {price} below SMA20 {sma20} confirms downtrend',
          'Bollinger Bands suggest price near upper resistance at {bb_upper}',
          'Volume ratio {volume_ratio}x confirms selling pressure',
          'High volatility {volatility} suggests increased downside risk'
        ],
        neutral: [
          'RSI {rsi} in neutral zone between 40-60',
          'MACD signals lack clear direction',
          'Price consolidating between SMA20 {sma20} and SMA50 {sma50}',
          'Low volume ratio {volume_ratio}x suggests indecision',
          'Bollinger Bands indicate sideways movement'
        ]
      },
      onchain: {
        bullish: [
          'Whale accumulation trend: {whale_accumulation}',
          'Smart money inflow detected: {smart_money_flow}',
          'Network activity increasing: {active_addresses} addresses',
          'DeFi TVL growing: ${tvl}B total value locked',
          'Low market manipulation risk: {manipulation_risk}',
          'High liquidity score: {liquidity_score}/100'
        ],
        bearish: [
          'Whale distribution pattern: {whale_accumulation}',
          'Smart money outflow detected: {smart_money_flow}',
          'Network activity declining: {active_addresses} addresses',
          'DeFi TVL contracting: ${tvl}B total value locked',
          'High market manipulation risk: {manipulation_risk}',
          'Low liquidity score: {liquidity_score}/100'
        ],
        neutral: [
          'Neutral whale activity: {whale_accumulation}',
          'Balanced smart money flow: {smart_money_flow}',
          'Stable network metrics: {active_addresses} addresses',
          'Steady DeFi activity: ${tvl}B TVL'
        ]
      },
      offchain: {
        bullish: [
          'Negative funding rate {funding_rate} suggests shorts paying longs',
          'Fear & Greed index {fear_greed} indicates oversold market sentiment',
          'Long/short ratio {long_short_ratio} shows balanced positioning',
          'Low liquidation pressure {liquidation_pressure}% reduces cascade risk',
          'Strong order book depth ${order_book_depth} supports price',
          'Volatility regime {volatility_regime} favorable for entries'
        ],
        bearish: [
          'High funding rate {funding_rate} suggests longs paying shorts',
          'Fear & Greed index {fear_greed} indicates overbought market sentiment',
          'Long/short ratio {long_short_ratio} shows overcrowded longs',
          'High liquidation pressure {liquidation_pressure}% increases cascade risk',
          'Thin order book depth ${order_book_depth} suggests fragile support',
          'Volatility regime {volatility_regime} unfavorable for longs'
        ],
        neutral: [
          'Balanced funding rate {funding_rate} suggests equilibrium',
          'Fear & Greed index {fear_greed} in neutral territory',
          'Long/short ratio {long_short_ratio} shows balanced sentiment',
          'Moderate liquidation pressure {liquidation_pressure}%',
          'Adequate order book depth ${order_book_depth}'
        ]
      },
      market_regime: {
        accumulation: [
          'Accumulation phase: Low volatility with increasing volume suggests smart money entry',
          'Price stability {price_stability} indicates controlled buying',
          'Volume pattern supports accumulation thesis',
          'Ideal phase for gradual position building'
        ],
        distribution: [
          'Distribution phase: High volatility with decreasing volume suggests smart money exit',
          'Topping pattern detected in recent price action',
          'Volume divergence indicates distribution',
          'Caution advised - potential market top'
        ],
        markup: [
          'Markup phase: Rising prices with strong momentum',
          'Trend following strategy appropriate',
          'Volume confirms price movement',
          'Momentum {momentum_state} supports continued uptrend'
        ],
        markdown: [
          'Markdown phase: Falling prices with strong bearish momentum',
          'Defensive positioning recommended',
          'Volume confirms selling pressure',
          'Momentum {momentum_state} supports continued downtrend'
        ],
        consolidation: [
          'Consolidation phase: Sideways price action with low volatility',
          'Range trading strategy appropriate',
          'Waiting for breakout direction',
          'Support at {support_level}, resistance at {resistance_level}'
        ]
      },
      risk_factors: {
        high: [
          'High volatility {volatility} increases position risk',
          'Market manipulation risk elevated: {manipulation_risk}',
          'Low liquidity {liquidity_score}/100 may impact execution',
          'Distribution phase suggests potential reversal',
          'Extreme sentiment readings indicate potential contrarian move'
        ],
        medium: [
          'Moderate volatility {volatility} requires position sizing consideration',
          'Standard market conditions with normal risk levels',
          'Adequate liquidity for position management',
          'Balanced risk-reward profile'
        ],
        low: [
          'Low volatility {volatility} environment supports larger positions',
          'Strong liquidity {liquidity_score}/100 ensures good execution',
          'Accumulation phase reduces timing risk',
          'Multiple confirmations reduce signal risk'
        ]
      }
    };

    this.confluenceWeights = {
      technical: 0.3,
      onchain: 0.25,
      offchain: 0.25,
      market_regime: 0.2
    };
  }

  generateComprehensiveReasoning(signal, technicalData, onChainData, offChainData, marketRegime, riskParams) {
    const reasoning = {
      signal: signal.signal,
      confidence: signal.confidence,
      primary_reasoning: this.generatePrimaryReasoning(signal, technicalData, onChainData, offChainData, marketRegime),
      supporting_factors: this.identifySupportingFactors(signal, technicalData, onChainData, offChainData, marketRegime),
      risk_assessment: this.generateRiskAssessment(signal, technicalData, offChainData, marketRegime, riskParams),
      confluence_analysis: this.analyzeConfluence(signal, technicalData, onChainData, offChainData, marketRegime),
      market_context: this.generateMarketContext(marketRegime, offChainData),
      key_levels: this.identifyKeyLevels(signal, technicalData, offChainData),
      execution_guidance: this.generateExecutionGuidance(signal, technicalData, offChainData, riskParams),
      alternative_scenarios: this.generateAlternativeScenarios(signal, technicalData, onChainData, offChainData),
      data_quality_assessment: this.assessDataQuality(onChainData, offChainData),
      timestamp: Date.now()
    };

    return reasoning;
  }

  generatePrimaryReasoning(signal, technicalData, onChainData, offChainData, marketRegime) {
    const signalDirection = signal.signal.toLowerCase();
    const phase = marketRegime.market_phase.toLowerCase();
    
    let primaryReason = '';
    
    // Start with market regime context
    if (this.reasoningTemplates.market_regime[phase]) {
      primaryReason += this.formatReasoning(
        this.reasoningTemplates.market_regime[phase][0], 
        { ...technicalData, ...marketRegime }
      ) + '. ';
    }
    
    // Add technical analysis primary reason
    if (signalDirection === 'buy') {
      primaryReason += this.selectStrongestTechnicalReason('bullish', technicalData);
    } else if (signalDirection === 'sell') {
      primaryReason += this.selectStrongestTechnicalReason('bearish', technicalData);
    } else {
      primaryReason += this.selectStrongestTechnicalReason('neutral', technicalData);
    }
    
    // Add on-chain confirmation
    const onChainConfirmation = this.getOnChainConfirmation(signalDirection, onChainData);
    if (onChainConfirmation) {
      primaryReason += ' ' + onChainConfirmation;
    }
    
    return primaryReason;
  }

  selectStrongestTechnicalReason(sentiment, technicalData) {
    const reasons = this.reasoningTemplates.technical[sentiment];
    
    // Logic to select the most relevant technical reason based on data strength
    if (technicalData.rsi < 30 && sentiment === 'bullish') {
      return this.formatReasoning(reasons[0], technicalData);
    } else if (technicalData.rsi > 70 && sentiment === 'bearish') {
      return this.formatReasoning(reasons[0], technicalData);
    } else if (technicalData.macd?.histogram && Math.abs(technicalData.macd.histogram) > 0.001) {
      return this.formatReasoning(reasons[1], technicalData);
    } else if (technicalData.volume_ratio > 1.2 || technicalData.volume_ratio < 0.8) {
      return this.formatReasoning(reasons[4], technicalData);
    }
    
    // Default to first reason if no specific condition met
    return this.formatReasoning(reasons[0], technicalData);
  }

  getOnChainConfirmation(signalDirection, onChainData) {
    const whaleActivity = onChainData?.whale_activity?.whale_accumulation;
    const smartMoney = onChainData?.sentiment_indicators?.smart_money_flow;
    
    if (signalDirection === 'buy' && whaleActivity === 'buying') {
      return this.formatReasoning(
        this.reasoningTemplates.onchain.bullish[0], 
        { whale_accumulation: whaleActivity }
      );
    } else if (signalDirection === 'sell' && whaleActivity === 'selling') {
      return this.formatReasoning(
        this.reasoningTemplates.onchain.bearish[0], 
        { whale_accumulation: whaleActivity }
      );
    } else if (signalDirection === 'buy' && smartMoney === 'inflow') {
      return this.formatReasoning(
        this.reasoningTemplates.onchain.bullish[1], 
        { smart_money_flow: smartMoney }
      );
    }
    
    return null;
  }

  identifySupportingFactors(signal, technicalData, onChainData, offChainData, marketRegime) {
    const factors = {
      technical: [],
      onchain: [],
      offchain: [],
      market_regime: []
    };
    
    const signalDirection = signal.signal.toLowerCase();
    const sentiment = signalDirection === 'buy' ? 'bullish' : signalDirection === 'sell' ? 'bearish' : 'neutral';
    
    // Technical supporting factors
    factors.technical = this.getTechnicalSupportingFactors(sentiment, technicalData);
    
    // On-chain supporting factors
    factors.onchain = this.getOnChainSupportingFactors(sentiment, onChainData);
    
    // Off-chain supporting factors
    factors.offchain = this.getOffChainSupportingFactors(sentiment, offChainData);
    
    // Market regime supporting factors
    factors.market_regime = this.getMarketRegimeSupportingFactors(marketRegime);
    
    return factors;
  }

  getTechnicalSupportingFactors(sentiment, technicalData) {
    const factors = [];
    const templates = this.reasoningTemplates.technical[sentiment];
    
    // RSI factor
    if ((sentiment === 'bullish' && technicalData.rsi < 40) || 
        (sentiment === 'bearish' && technicalData.rsi > 60)) {
      factors.push(this.formatReasoning(templates[0], technicalData));
    }
    
    // MACD factor
    if (technicalData.macd?.histogram) {
      const macdBullish = technicalData.macd.histogram > 0;
      if ((sentiment === 'bullish' && macdBullish) || (sentiment === 'bearish' && !macdBullish)) {
        factors.push(this.formatReasoning(templates[1], {
          ...technicalData,
          macd_histogram: technicalData.macd.histogram.toFixed(4)
        }));
      }
    }
    
    // Volume factor
    if ((sentiment === 'bullish' && technicalData.volume_ratio > 1.1) ||
        (sentiment === 'bearish' && technicalData.volume_ratio > 1.1)) {
      factors.push(this.formatReasoning(templates[4], technicalData));
    }
    
    return factors;
  }

  getOnChainSupportingFactors(sentiment, onChainData) {
    const factors = [];
    const templates = this.reasoningTemplates.onchain[sentiment];
    
    // Whale activity
    const whaleActivity = onChainData?.whale_activity?.whale_accumulation;
    if (whaleActivity && whaleActivity !== 'neutral') {
      factors.push(this.formatReasoning(templates[0], {
        whale_accumulation: whaleActivity
      }));
    }
    
    // Smart money flow
    const smartMoney = onChainData?.sentiment_indicators?.smart_money_flow;
    if (smartMoney && smartMoney !== 'neutral') {
      factors.push(this.formatReasoning(templates[1], {
        smart_money_flow: smartMoney
      }));
    }
    
    // Liquidity score
    const liquidityScore = onChainData?.risk_assessment?.liquidity_score;
    if (liquidityScore) {
      if ((sentiment === 'bullish' && liquidityScore > 70) || 
          (sentiment === 'bearish' && liquidityScore < 40)) {
        factors.push(this.formatReasoning(templates[5] || templates[4], {
          liquidity_score: liquidityScore
        }));
      }
    }
    
    return factors;
  }

  getOffChainSupportingFactors(sentiment, offChainData) {
    const factors = [];
    const templates = this.reasoningTemplates.offchain[sentiment];
    
    // Funding rate
    const fundingRate = offChainData.funding_rates?.current_funding_rate;
    if (fundingRate !== undefined) {
      if ((sentiment === 'bullish' && fundingRate < 0) || 
          (sentiment === 'bearish' && fundingRate > 0.001)) {
        factors.push(this.formatReasoning(templates[0], {
          funding_rate: (fundingRate * 100).toFixed(4) + '%'
        }));
      }
    }
    
    // Fear & Greed
    const fearGreed = offChainData.market_sentiment?.fear_greed_index;
    if (fearGreed !== undefined) {
      if ((sentiment === 'bullish' && fearGreed < 35) || 
          (sentiment === 'bearish' && fearGreed > 65)) {
        factors.push(this.formatReasoning(templates[1], {
          fear_greed: fearGreed
        }));
      }
    }
    
    // Long/Short ratio
    const longShortRatio = offChainData.sentiment_indicators?.long_short_ratio;
    if (longShortRatio !== undefined) {
      factors.push(this.formatReasoning(templates[2], {
        long_short_ratio: longShortRatio.toFixed(2)
      }));
    }
    
    return factors;
  }

  getMarketRegimeSupportingFactors(marketRegime) {
    const factors = [];
    const phase = marketRegime.market_phase?.toLowerCase();
    
    if (phase && this.reasoningTemplates.market_regime[phase]) {
      const templates = this.reasoningTemplates.market_regime[phase];
      
      // Add regime-specific factors
      if (templates.length > 1) {
        factors.push(this.formatReasoning(templates[1], marketRegime));
      }
      if (templates.length > 2) {
        factors.push(this.formatReasoning(templates[2], marketRegime));
      }
    }
    
    return factors;
  }

  generateRiskAssessment(signal, technicalData, offChainData, marketRegime, riskParams) {
    const riskLevel = this.determineRiskLevel(technicalData, offChainData, marketRegime);
    const riskFactors = this.identifyRiskFactors(technicalData, offChainData, marketRegime);
    
    return {
      risk_level: riskLevel,
      risk_score: this.calculateRiskScore(technicalData, offChainData, marketRegime),
      risk_factors: riskFactors,
      risk_mitigation: this.generateRiskMitigation(riskLevel, signal, riskParams),
      position_sizing_guidance: this.generatePositionSizingGuidance(riskLevel, signal.confidence, riskParams)
    };
  }

  determineRiskLevel(technicalData, offChainData, marketRegime) {
    let riskScore = 0;
    
    // Volatility risk
    if (technicalData.volatility > 0.6) riskScore += 30;
    else if (technicalData.volatility > 0.4) riskScore += 15;
    
    // Market phase risk
    if (marketRegime.market_phase === 'DISTRIBUTION') riskScore += 25;
    else if (marketRegime.market_phase === 'MARKDOWN') riskScore += 20;
    
    // Liquidation risk
    const liquidationPressure = offChainData.liquidation_data?.liquidation_pressure || 0;
    if (liquidationPressure > 60) riskScore += 20;
    else if (liquidationPressure > 40) riskScore += 10;
    
    // Funding rate extremes
    const fundingRate = Math.abs(offChainData.funding_rates?.current_funding_rate || 0);
    if (fundingRate > 0.002) riskScore += 15;
    
    if (riskScore > 50) return 'high';
    if (riskScore > 25) return 'medium';
    return 'low';
  }

  calculateRiskScore(technicalData, offChainData, marketRegime) {
    let score = 0;
    
    // Technical risk factors
    score += technicalData.volatility * 100;
    if (technicalData.rsi > 80 || technicalData.rsi < 20) score += 15;
    
    // Market regime risk
    const phaseRisk = {
      'ACCUMULATION': 10,
      'MARKUP': 15,
      'DISTRIBUTION': 30,
      'MARKDOWN': 25,
      'CONSOLIDATION': 5
    };
    score += phaseRisk[marketRegime.market_phase] || 15;
    
    // Off-chain risk factors
    const liquidationPressure = offChainData.liquidation_data?.liquidation_pressure || 0;
    score += liquidationPressure * 0.5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  identifyRiskFactors(technicalData, offChainData, marketRegime) {
    const factors = [];
    const riskLevel = this.determineRiskLevel(technicalData, offChainData, marketRegime);
    const templates = this.reasoningTemplates.risk_factors[riskLevel];
    
    // Volatility risk
    if (technicalData.volatility > 0.5) {
      factors.push(this.formatReasoning(templates[0], {
        volatility: (technicalData.volatility * 100).toFixed(1) + '%'
      }));
    }
    
    // Market manipulation risk
    const manipulationRisk = offChainData.liquidation_data?.liquidation_sentiment;
    if (manipulationRisk === 'EXTREME_PRESSURE') {
      factors.push(this.formatReasoning(templates[1], {
        manipulation_risk: manipulationRisk
      }));
    }
    
    // Liquidity risk
    const liquidityScore = offChainData.order_book_analysis?.market_depth_score;
    if (liquidityScore < 50) {
      factors.push(this.formatReasoning(templates[2], {
        liquidity_score: liquidityScore
      }));
    }
    
    return factors;
  }

  generateRiskMitigation(riskLevel, signal, riskParams) {
    const mitigation = [];
    
    if (riskLevel === 'high') {
      mitigation.push('Reduce position size by 50% due to elevated risk');
      mitigation.push('Implement tighter stop loss at ' + (riskParams.stop_loss_multiplier * 0.5).toFixed(1) + '% level');
      mitigation.push('Consider waiting for better risk-reward setup');
    } else if (riskLevel === 'medium') {
      mitigation.push('Standard position sizing with enhanced monitoring');
      mitigation.push('Set stop loss at ' + riskParams.stop_loss_multiplier + '% level');
      mitigation.push('Monitor key support/resistance levels closely');
    } else {
      mitigation.push('Standard risk management protocols apply');
      mitigation.push('Favorable risk environment for position building');
    }
    
    return mitigation;
  }

  generatePositionSizingGuidance(riskLevel, confidence, riskParams) {
    let baseSize = riskParams.max_position_size;
    
    // Risk level adjustment
    if (riskLevel === 'high') baseSize *= 0.5;
    else if (riskLevel === 'medium') baseSize *= 0.8;
    
    // Confidence adjustment
    const confidenceMultiplier = confidence / 100;
    const adjustedSize = baseSize * confidenceMultiplier;
    
    return {
      recommended_size: Math.max(1, Math.round(adjustedSize)),
      max_size: riskParams.max_position_size,
      risk_adjustment: riskLevel,
      confidence_factor: confidenceMultiplier
    };
  }

  analyzeConfluence(signal, technicalData, onChainData, offChainData, marketRegime) {
    const confluenceFactors = {
      technical: this.calculateTechnicalConfluence(signal.signal, technicalData),
      onchain: this.calculateOnChainConfluence(signal.signal, onChainData),
      offchain: this.calculateOffChainConfluence(signal.signal, offChainData),
      market_regime: this.calculateMarketRegimeConfluence(signal.signal, marketRegime)
    };
    
    const weightedScore = Object.entries(confluenceFactors).reduce((total, [factor, score]) => {
      return total + (score * this.confluenceWeights[factor]);
    }, 0);
    
    return {
      individual_scores: confluenceFactors,
      weighted_score: Math.round(weightedScore),
      confluence_strength: this.interpretConfluenceStrength(weightedScore),
      alignment: this.checkDataAlignment(confluenceFactors)
    };
  }

  calculateTechnicalConfluence(signal, technicalData) {
    let score = 50; // Neutral base
    
    if (signal === 'BUY') {
      if (technicalData.rsi < 40) score += 15;
      if (technicalData.macd?.histogram > 0) score += 10;
      if (technicalData.volume_ratio > 1.1) score += 10;
      if (technicalData.rate_of_change > 0) score += 10;
    } else if (signal === 'SELL') {
      if (technicalData.rsi > 60) score += 15;
      if (technicalData.macd?.histogram < 0) score += 10;
      if (technicalData.volume_ratio > 1.1) score += 10;
      if (technicalData.rate_of_change < 0) score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  calculateOnChainConfluence(signal, onChainData) {
    let score = 50; // Neutral base
    
    const whaleActivity = onChainData?.whale_activity?.whale_accumulation;
    const smartMoney = onChainData?.sentiment_indicators?.smart_money_flow;
    
    if (signal === 'BUY') {
      if (whaleActivity === 'buying') score += 20;
      if (smartMoney === 'inflow') score += 15;
    } else if (signal === 'SELL') {
      if (whaleActivity === 'selling') score += 20;
      if (smartMoney === 'outflow') score += 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  calculateOffChainConfluence(signal, offChainData) {
    let score = 50; // Neutral base
    
    const fundingRate = offChainData.funding_rates?.current_funding_rate || 0;
    const fearGreed = offChainData.market_sentiment?.fear_greed_index || 50;
    
    if (signal === 'BUY') {
      if (fundingRate < 0) score += 10;
      if (fearGreed < 35) score += 15;
    } else if (signal === 'SELL') {
      if (fundingRate > 0.001) score += 10;
      if (fearGreed > 65) score += 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  calculateMarketRegimeConfluence(signal, marketRegime) {
    let score = 50; // Neutral base
    
    const phase = marketRegime.market_phase;
    const momentum = marketRegime.momentum_state;
    
    if (signal === 'BUY') {
      if (phase === 'ACCUMULATION' || phase === 'MARKUP') score += 15;
      if (momentum === 'BULLISH' || momentum === 'STRONG_BULLISH') score += 10;
    } else if (signal === 'SELL') {
      if (phase === 'DISTRIBUTION' || phase === 'MARKDOWN') score += 15;
      if (momentum === 'BEARISH' || momentum === 'STRONG_BEARISH') score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  interpretConfluenceStrength(score) {
    if (score > 75) return 'VERY_STRONG';
    if (score > 60) return 'STRONG';
    if (score > 40) return 'MODERATE';
    return 'WEAK';
  }

  checkDataAlignment(confluenceFactors) {
    const scores = Object.values(confluenceFactors);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
    
    if (variance < 100) return 'HIGHLY_ALIGNED';
    if (variance < 400) return 'MODERATELY_ALIGNED';
    return 'DIVERGENT';
  }

  generateMarketContext(marketRegime, offChainData) {
    return {
      market_phase: marketRegime.market_phase,
      trend_alignment: marketRegime.primary_trend === marketRegime.secondary_trend ? 'ALIGNED' : 'DIVERGENT',
      volatility_environment: marketRegime.volatility_regime,
      sentiment_backdrop: this.interpretSentimentBackdrop(offChainData.market_sentiment),
      regime_confidence: marketRegime.regime_confidence,
      key_characteristics: this.getPhaseCharacteristics(marketRegime.market_phase)
    };
  }

  interpretSentimentBackdrop(sentiment) {
    const fearGreed = sentiment?.fear_greed_index || 50;
    
    if (fearGreed > 75) return 'EXTREME_GREED';
    if (fearGreed > 55) return 'GREED';
    if (fearGreed > 45) return 'NEUTRAL';
    if (fearGreed > 25) return 'FEAR';
    return 'EXTREME_FEAR';
  }

  getPhaseCharacteristics(phase) {
    const characteristics = {
      'ACCUMULATION': ['Smart money entry', 'Low volatility', 'Increasing volume', 'Price consolidation'],
      'DISTRIBUTION': ['Smart money exit', 'High volatility', 'Decreasing volume', 'Topping patterns'],
      'MARKUP': ['Rising prices', 'Strong momentum', 'Volume confirmation', 'Trend following'],
      'MARKDOWN': ['Falling prices', 'Bearish momentum', 'High volume', 'Defensive positioning'],
      'CONSOLIDATION': ['Sideways movement', 'Low volatility', 'Range trading', 'Breakout preparation']
    };
    
    return characteristics[phase] || ['Transitional phase', 'Mixed signals', 'Cautious approach'];
  }

  identifyKeyLevels(signal, technicalData, offChainData) {
    const currentPrice = signal.entry_price;
    const volatility = technicalData.volatility || 0.02;
    
    // Technical levels
    const technicalLevels = {
      support: [
        technicalData.bollinger_bands?.lower || currentPrice * 0.98,
        technicalData.sma_20 || currentPrice * 0.97
      ],
      resistance: [
        technicalData.bollinger_bands?.upper || currentPrice * 1.02,
        technicalData.sma_50 || currentPrice * 1.03
      ]
    };
    
    // Order book levels
    const orderBookLevels = offChainData.order_book_analysis?.support_resistance_levels || {
      support_levels: [],
      resistance_levels: []
    };
    
    return {
      technical_levels: technicalLevels,
      order_book_levels: orderBookLevels,
      volatility_bands: {
        upper: currentPrice * (1 + volatility),
        lower: currentPrice * (1 - volatility)
      },
      stop_loss_level: signal.stop_loss,
      take_profit_levels: [signal.take_profit_1, signal.take_profit_2, signal.take_profit_3]
    };
  }

  generateExecutionGuidance(signal, technicalData, offChainData, riskParams) {
    const liquidity = offChainData.order_book_analysis?.liquidity_quality || 'GOOD';
    const spread = offChainData.order_book_analysis?.spread_percentage || 0.05;
    
    return {
      entry_strategy: this.getEntryStrategy(signal, liquidity, spread),
      exit_strategy: this.getExitStrategy(signal, technicalData),
      timing_considerations: this.getTimingConsiderations(offChainData),
      execution_tips: this.getExecutionTips(liquidity, spread, riskParams),
      monitoring_points: this.getMonitoringPoints(signal, technicalData)
    };
  }

  getEntryStrategy(signal, liquidity, spread) {
    if (liquidity === 'EXCELLENT' && spread < 0.02) {
      return 'Market order execution recommended - excellent liquidity';
    } else if (liquidity === 'GOOD' && spread < 0.05) {
      return 'Limit order near market price - good liquidity conditions';
    } else {
      return 'Scale into position with multiple smaller orders';
    }
  }

  getExitStrategy(signal, technicalData) {
    const volatility = technicalData.volatility || 0.02;
    
    if (volatility > 0.05) {
      return 'Scale out at multiple levels due to high volatility';
    } else {
      return 'Standard exit at predetermined levels';
    }
  }

  getTimingConsiderations(offChainData) {
    const considerations = [];
    
    const fundingTime = offChainData.funding_rates?.next_funding_time;
    if (fundingTime && (fundingTime - Date.now()) < 3600000) { // Within 1 hour
      considerations.push('Funding rate reset approaching - consider timing impact');
    }
    
    const liquidationPressure = offChainData.liquidation_data?.liquidation_pressure || 0;
    if (liquidationPressure > 50) {
      considerations.push('High liquidation pressure - avoid market orders during volatile periods');
    }
    
    return considerations;
  }

  getExecutionTips(liquidity, spread, riskParams) {
    const tips = [];
    
    if (spread > 0.1) {
      tips.push('Wide spread detected - use limit orders to avoid slippage');
    }
    
    if (riskParams.max_position_size > 5) {
      tips.push('Large position size - consider scaling in over multiple orders');
    }
    
    tips.push('Monitor order book depth before execution');
    tips.push('Set stop loss immediately after entry');
    
    return tips;
  }

  // 🚨 URGENT FIX: Replace the getMonitoringPoints method in signalReasoningEngine.js
// This fixes the "Cannot read properties of undefined (reading 'toFixed')" error

getMonitoringPoints(signal, technicalData) {
  // 🚨 SAFETY: Add null checks for all properties that call .toFixed()
  const entryPrice = signal?.entry_price || 0;
  const stopLoss = signal?.stop_loss || 0;
  const takeProfit1 = signal?.take_profit_1 || 0;
  const volumeRatio = technicalData?.volume_ratio || 1;
  const rsi = technicalData?.rsi || 50;

  const monitoringPoints = [];

  // Only add monitoring points if we have valid data
  if (entryPrice > 0) {
    monitoringPoints.push(`Price action around ${entryPrice.toFixed(4)} entry level`);
  }

  if (volumeRatio > 0) {
    monitoringPoints.push(`Volume confirmation - watch for ${(volumeRatio * 1.2).toFixed(1)}x increase`);
  }

  if (rsi > 0 && rsi <= 100) {
    monitoringPoints.push(`RSI levels - current ${rsi.toFixed(1)} watching for divergence`);
  }

  if (stopLoss > 0) {
    monitoringPoints.push(`Stop loss level at ${stopLoss.toFixed(4)}`);
  }

  if (takeProfit1 > 0) {
    monitoringPoints.push(`First take profit at ${takeProfit1.toFixed(4)}`);
  }

  // Fallback monitoring points if data is missing
  if (monitoringPoints.length === 0) {
    monitoringPoints.push(
      'Monitor price action and volume for entry confirmation',
      'Watch for trend reversal signals',
      'Set appropriate stop loss and take profit levels',
      'Monitor overall market sentiment'
    );
  }

  return monitoringPoints;
}

  generateAlternativeScenarios(signal, technicalData, onChainData, offChainData) {
    return {
      bullish_scenario: this.generateBullishScenario(signal, technicalData, onChainData),
      bearish_scenario: this.generateBearishScenario(signal, technicalData, onChainData),
      neutral_scenario: this.generateNeutralScenario(signal, technicalData, onChainData),
      probability_assessment: this.assessScenarioProbabilities(signal, technicalData, onChainData, offChainData)
    };
  }

  generateBullishScenario(signal, technicalData, onChainData) {
    // 🚨 SAFETY: Add null checks
    const entryPrice = signal?.entry_price || 0;
    const takeProfit1 = signal?.take_profit_1 || 0;
    const takeProfit2 = signal?.take_profit_2 || 0;
    const takeProfit3 = signal?.take_profit_3 || 0;
  
    return {
      description: 'Price breaks above resistance with volume confirmation',
      triggers: [
        entryPrice > 0 ? `Price sustained above ${(entryPrice * 1.02).toFixed(4)}` : 'Price breaks above resistance',
        'Volume ratio increases above 1.5x',
        'Whale accumulation continues',
        'RSI maintains above 50 without overbought conditions'
      ],
      targets: [takeProfit1, takeProfit2, takeProfit3].filter(target => target > 0),
      probability: this.calculateBullishProbability(signal, technicalData, onChainData)
    };
  }

  generateBearishScenario(signal, technicalData, onChainData) {
    // 🚨 SAFETY: Add null checks
    const entryPrice = signal?.entry_price || 0;
  
    return {
      description: 'Price fails at resistance and breaks support levels',
      triggers: [
        entryPrice > 0 ? `Price breaks below ${(entryPrice * 0.98).toFixed(4)}` : 'Price breaks below support',
        'Volume increases on selling pressure',
        'Whale distribution detected',
        'RSI breaks below 40 with momentum'
      ],
      targets: entryPrice > 0 ? 
        [(entryPrice * 0.95), (entryPrice * 0.92), (entryPrice * 0.88)] : 
        ['Lower support levels', 'Key technical levels', 'Major support zones'],
      probability: this.calculateBearishProbability(signal, technicalData, onChainData)
    };
  }

  generateNeutralScenario(signal, technicalData, onChainData) {
    // 🚨 SAFETY: Add null checks
    const entryPrice = signal?.entry_price || 0;
    
    return {
      description: 'Price consolidates in current range with low volatility',
      triggers: [
        entryPrice > 0 ? `Price stays between ${(entryPrice * 0.98).toFixed(4)} and ${(entryPrice * 1.02).toFixed(4)}` : 'Price consolidates in range',
        'Low volume and volatility',
        'Mixed whale activity signals',
        'RSI stays in 40-60 range'
      ],
      expected_range: entryPrice > 0 ? 
        [(entryPrice * 0.97), (entryPrice * 1.03)] : 
        ['Current support', 'Current resistance'],
      probability: this.calculateNeutralProbability(signal, technicalData, onChainData)
    };
  }

  calculateBullishProbability(signal, technicalData, onChainData) {
    // 🚨 SAFETY: Add comprehensive null checks
    let probability = 50; // Base probability
    
    try {
      // Technical factors
      if (technicalData?.rsi && technicalData.rsi < 70 && technicalData.rsi > 30) {
        probability += 10;
      }
      
      if (technicalData?.volume_ratio && technicalData.volume_ratio > 1.2) {
        probability += 15;
      }
      
      // On-chain factors with null safety
      if (onChainData?.whale_activity?.whale_accumulation === 'buying') {
        probability += 20;
      } else if (onChainData?.whale_activity?.whale_accumulation === 'accumulating') {
        probability += 10;
      }
      
      if (onChainData?.sentiment_indicators?.smart_money_flow === 'inflow') {
        probability += 15;
      }
      
      // Signal confidence
      if (signal?.confidence && signal.confidence > 70) {
        probability += 10;
      }
      
      return Math.max(10, Math.min(90, probability));
      
    } catch (error) {
      // Fallback if any calculation fails
      return 50;
    }
  }

  calculateBearishProbability(signal, technicalData, onChainData) {
    // 🚨 SAFETY: Add comprehensive null checks
    let probability = 50; // Base probability
    
    try {
      // Technical factors
      if (technicalData?.rsi && technicalData.rsi > 70) {
        probability += 15;
      }
      
      if (technicalData?.volume_ratio && technicalData.volume_ratio < 0.8) {
        probability += 10;
      }
      
      // On-chain factors with null safety
      if (onChainData?.whale_activity?.whale_accumulation === 'selling') {
        probability += 20;
      } else if (onChainData?.whale_activity?.whale_accumulation === 'distributing') {
        probability += 10;
      }
      
      if (onChainData?.sentiment_indicators?.smart_money_flow === 'outflow') {
        probability += 15;
      }
      
      // Signal confidence (inverted for bearish)
      if (signal?.confidence && signal.confidence < 30) {
        probability += 10;
      }
      
      return Math.max(10, Math.min(90, probability));
      
    } catch (error) {
      // Fallback if any calculation fails
      return 50;
    }
  }

  calculateNeutralProbability(signal, technicalData, onChainData) {
    // 🚨 SAFETY: Add comprehensive null checks
    let probability = 50; // Base probability
    
    try {
      // Technical factors favoring consolidation
      if (technicalData?.rsi && technicalData.rsi >= 40 && technicalData.rsi <= 60) {
        probability += 15;
      }
      
      if (technicalData?.volume_ratio && technicalData.volume_ratio >= 0.8 && technicalData.volume_ratio <= 1.2) {
        probability += 10;
      }
      
      // On-chain factors with null safety
      if (onChainData?.whale_activity?.whale_accumulation === 'neutral' || 
          onChainData?.whale_activity?.whale_accumulation === 'hodling') {
        probability += 15;
      }
      
      // Signal uncertainty
      if (signal?.confidence && signal.confidence >= 40 && signal.confidence <= 60) {
        probability += 10;
      }
      
      return Math.max(10, Math.min(90, probability));
      
    } catch (error) {
      // Fallback if any calculation fails
      return 50;
    }
  }

  assessScenarioProbabilities(signal, technicalData, onChainData, offChainData) {
    const bullish = this.calculateBullishProbability(signal, technicalData, onChainData);
    const bearish = this.calculateBearishProbability(signal, technicalData, onChainData);
    const neutral = Math.max(10, 100 - bullish - bearish);
    
    return {
      bullish: bullish,
      bearish: bearish,
      neutral: neutral,
      most_likely: bullish > bearish && bullish > neutral ? 'BULLISH' : 
                   bearish > neutral ? 'BEARISH' : 'NEUTRAL'
    };
  }

  assessDataQuality(onChainData, offChainData) {
    return {
      onchain_quality: onChainData?.source === 'coingecko' ? 'HIGH' : 'MEDIUM',
      offchain_quality: offChainData?.data_quality?.quality_score > 80 ? 'HIGH' : 
                       offChainData?.data_quality?.quality_score > 60 ? 'MEDIUM' : 'LOW',
      data_completeness: this.calculateDataCompleteness(onChainData, offChainData),
      reliability_score: this.calculateReliabilityScore(onChainData, offChainData)
    };
  }

  calculateDataCompleteness(onChainData, offChainData) {
    let completeness = 0;
    let totalSources = 0;
    
    // On-chain data completeness
    if (onChainData?.whale_activity) { completeness++; totalSources++; }
    if (onChainData?.sentiment_indicators) { completeness++; totalSources++; }
    if (onChainData?.network_metrics) { completeness++; totalSources++; }
    
    // Off-chain data completeness
    if (offChainData?.funding_rates) { completeness++; totalSources++; }
    if (offChainData?.market_sentiment) { completeness++; totalSources++; }
    if (offChainData?.order_book_analysis) { completeness++; totalSources++; }
    
    return totalSources > 0 ? Math.round((completeness / totalSources) * 100) : 0;
  }

  calculateReliabilityScore(onChainData, offChainData) {
    let score = 50; // Base score
    
    // On-chain reliability
    if (onChainData?.source === 'coingecko') score += 20;
    else if (onChainData?.source === 'coingecko_fallback') score += 10;
    
    // Off-chain reliability
    const offChainQuality = offChainData?.data_quality?.success_rate || 0;
    score += (offChainQuality / 100) * 30;
    
    return Math.max(20, Math.min(100, Math.round(score)));
  }

  formatReasoning(template, data) {
    let formatted = template;
    
    // Replace placeholders with actual data
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{${key}}`;
      if (formatted.includes(placeholder)) {
        let formattedValue = value;
        
        // Format numbers appropriately
        if (typeof value === 'number') {
          if (key.includes('price') || key.includes('level')) {
            formattedValue = value.toFixed(4);
          } else if (key.includes('ratio') || key.includes('volatility')) {
            formattedValue = value.toFixed(2);
          } else if (key.includes('percentage') || key === 'rsi') {
            formattedValue = value.toFixed(1);
          } else {
            formattedValue = value.toFixed(2);
          }
        }
        
        formatted = formatted.replace(placeholder, formattedValue);
      }
    }
    
    return formatted;
  }
}

module.exports = new SignalReasoningEngine(); 