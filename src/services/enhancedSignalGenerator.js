// src/services/enhancedSignalGenerator.js
const TaapiService = require('./taapiService');
const logger = require('../utils/logger');

class EnhancedSignalGenerator {
  constructor() {
    this.taapiService = TaapiService;
    this.signalHistory = new Map(); // Track signal quality over time
  }

  // Hovedfunktion der forbedrer eksisterende signaler med Taapi data
  async enhanceSignalWithTaapi(baseSignal, marketData, symbol, timeframe = '1h', riskLevel = 'balanced') {
    try {
      logger.info(`Enhancing signal for ${symbol} with Taapi indicators`);
      
      // Hent real-time indikatorer fra Taapi
      const taapiIndicators = await this.taapiService.getBulkIndicators(symbol, timeframe);
      
      // Generer forbedret signal
      const enhancedSignal = await this.generateEnhancedSignal(
        baseSignal, 
        marketData, 
        taapiIndicators, 
        riskLevel
      );
      
      // Valider signalet mod multiple confirmations
      const validatedSignal = this.validateSignalWithMultipleConfirmations(
        enhancedSignal, 
        taapiIndicators, 
        marketData.current_price
      );
      
      // Track signal quality for learning
      this.trackSignalQuality(symbol, validatedSignal);
      
      return validatedSignal;
      
    } catch (error) {
      logger.error('Signal enhancement failed, falling back to base signal:', error);
      // Fallback til base signal hvis Taapi fejler
      return this.addFallbackWarning(baseSignal, error.message);
    }
  }

  async generateEnhancedSignal(baseSignal, marketData, taapiIndicators, riskLevel) {
    const currentPrice = marketData.current_price;
    
    // Generer Taapi-baseret signal
    const taapiSignal = this.taapiService.generateConfirmedSignal(
      taapiIndicators, 
      currentPrice, 
      riskLevel
    );
    
    // Kombiner base signal med Taapi signal
    const combinedSignal = this.combineSignals(baseSignal, taapiSignal, taapiIndicators);
    
    // Beregn forbedrede entry/exit points
    const enhancedLevels = this.calculateEnhancedLevels(
      combinedSignal, 
      taapiIndicators, 
      currentPrice
    );
    
    return {
      ...combinedSignal,
      ...enhancedLevels,
      taapi_analysis: taapiSignal.analysis,
      risk_factors: taapiSignal.risk_factors,
      indicator_confirmation: this.getIndicatorConfirmationScore(taapiIndicators, combinedSignal.signal),
      signal_quality: this.assessSignalQuality(taapiIndicators, combinedSignal),
      enhanced_by: 'taapi_integration'
    };
  }

  combineSignals(baseSignal, taapiSignal, indicators) {
    // Vægt base signal og Taapi signal
    const baseWeight = 0.4;
    const taapiWeight = 0.6;
    
    // Kombiner confidence scores
    const combinedConfidence = (baseSignal.confidence * baseWeight) + (taapiSignal.confidence * taapiWeight);
    
    // Determine final signal
    let finalSignal = 'HOLD';
    let reasoning = [];
    
    // Hvis begge signaler er enige
    if (baseSignal.signal === taapiSignal.signal) {
      finalSignal = baseSignal.signal;
      reasoning.push(`Both base and Taapi signals agree: ${finalSignal}`);
      reasoning.push(`Combined confidence: ${combinedConfidence.toFixed(1)}%`);
    }
    // Hvis Taapi signal er stærkere og confidence er høj
    else if (taapiSignal.confidence > 70 && taapiSignal.confidence > baseSignal.confidence) {
      finalSignal = taapiSignal.signal;
      reasoning.push(`Taapi signal override due to higher confidence (${taapiSignal.confidence}% vs ${baseSignal.confidence}%)`);
    }
    // Hvis base signal er stærkere
    else if (baseSignal.confidence > taapiSignal.confidence) {
      finalSignal = baseSignal.signal;
      reasoning.push(`Base signal maintained due to higher confidence (${baseSignal.confidence}% vs ${taapiSignal.confidence}%)`);
    }
    // Hvis signaler er konflikterende og confidence er ens, hold
    else {
      finalSignal = 'HOLD';
      reasoning.push(`Conflicting signals with similar confidence - holding position`);
    }

    // Reducer confidence hvis der er risiko faktorer
    let adjustedConfidence = combinedConfidence;
    if (indicators.rsi > 80 || indicators.rsi < 20) {
      adjustedConfidence *= 0.85;
      reasoning.push('Confidence reduced due to extreme RSI');
    }
    
    if (this.isHighVolatilityEnvironment(indicators)) {
      adjustedConfidence *= 0.9;
      reasoning.push('Confidence reduced due to high volatility');
    }

    return {
      signal: finalSignal,
      confidence: Math.round(adjustedConfidence),
      reasoning: reasoning.join(' | '),
      base_signal: {
        action: baseSignal.signal,
        confidence: baseSignal.confidence
      },
      taapi_signal: {
        action: taapiSignal.signal, 
        confidence: taapiSignal.confidence,
        reasoning: taapiSignal.reasoning
      }
    };
  }

  calculateEnhancedLevels(signal, indicators, currentPrice) {
    const atr = indicators.atr || (currentPrice * 0.02); // Fallback til 2% hvis ATR ikke tilgængelig
    
    // Basis levels
    let stopLoss, takeProfit1, takeProfit2, takeProfit3;
    
    if (signal.signal === 'BUY') {
      // Support fra Bollinger Lower Band eller EMA20
      const support = Math.min(
        indicators.bollinger?.lower || currentPrice * 0.98,
        indicators.ema20 * 0.995 || currentPrice * 0.98
      );
      
      stopLoss = Math.max(support, currentPrice - (atr * 2));
      
      // Resistance levels baseret på Bollinger Bands og Fibonacci
      const resistance1 = indicators.bollinger?.upper || currentPrice * 1.02;
      takeProfit1 = currentPrice + (atr * 1.5);
      takeProfit2 = currentPrice + (atr * 3);
      takeProfit3 = Math.min(resistance1, currentPrice + (atr * 5));
      
    } else if (signal.signal === 'SELL') {
      // Resistance fra Bollinger Upper Band eller EMA20
      const resistance = Math.max(
        indicators.bollinger?.upper || currentPrice * 1.02,
        indicators.ema20 * 1.005 || currentPrice * 1.02
      );
      
      stopLoss = Math.min(resistance, currentPrice + (atr * 2));
      
      // Support levels
      const support1 = indicators.bollinger?.lower || currentPrice * 0.98;
      takeProfit1 = currentPrice - (atr * 1.5);
      takeProfit2 = currentPrice - (atr * 3);
      takeProfit3 = Math.max(support1, currentPrice - (atr * 5));
    }

    return {
      entry_price: currentPrice,
      stop_loss: stopLoss,
      take_profit_1: takeProfit1,
      take_profit_2: takeProfit2,
      take_profit_3: takeProfit3,
      atr_used: atr,
      support_resistance: {
        primary_support: indicators.bollinger?.lower,
        primary_resistance: indicators.bollinger?.upper,
        ema20_level: indicators.ema20,
        ema50_level: indicators.ema50
      }
    };
  }

  validateSignalWithMultipleConfirmations(signal, indicators, currentPrice) {
    const confirmations = [];
    const warnings = [];
    
    // 1. Trend Confirmation
    if (signal.signal === 'BUY') {
      if (currentPrice > indicators.ema20 && indicators.ema20 > indicators.ema50) {
        confirmations.push('Trend alignment confirmed (Price > EMA20 > EMA50)');
      } else {
        warnings.push('Trend alignment missing - higher risk entry');
      }
    } else if (signal.signal === 'SELL') {
      if (currentPrice < indicators.ema20 && indicators.ema20 < indicators.ema50) {
        confirmations.push('Downtrend confirmed (Price < EMA20 < EMA50)');
      } else {
        warnings.push('Downtrend not confirmed - higher risk entry');
      }
    }
    
    // 2. Momentum Confirmation
    if (indicators.rsi >= 30 && indicators.rsi <= 70) {
      confirmations.push('RSI in healthy range');
    } else {
      warnings.push(`RSI extreme: ${indicators.rsi.toFixed(1)}`);
    }
    
    // 3. Volume Confirmation
    if (indicators.mfi > 20 && indicators.mfi < 80) {
      confirmations.push('Money flow in normal range');
    } else {
      warnings.push(`Extreme money flow: ${indicators.mfi.toFixed(1)}`);
    }
    
    // 4. Volatility Check
    if (indicators.atr && !this.isHighVolatilityEnvironment(indicators)) {
      confirmations.push('Volatility acceptable for entry');
    } else {
      warnings.push('High volatility environment - exercise caution');
    }
    
    // 5. Candlestick Pattern Confirmation
    if (signal.signal === 'BUY' && (indicators.hammer > 0 || indicators.engulfing > 0)) {
      confirmations.push('Bullish candlestick pattern detected');
    } else if (signal.signal === 'SELL' && indicators.shootingStar > 0) {
      confirmations.push('Bearish candlestick pattern detected');
    }
    
    // Beregn validation score
    const validationScore = (confirmations.length / (confirmations.length + warnings.length)) * 100;
    
    // Adjust confidence baseret på validation
    let adjustedConfidence = signal.confidence;
    if (validationScore < 60) {
      adjustedConfidence *= 0.8;
    } else if (validationScore > 80) {
      adjustedConfidence *= 1.1;
    }
    
    return {
      ...signal,
      confidence: Math.min(95, Math.round(adjustedConfidence)),
      validation: {
        score: Math.round(validationScore),
        confirmations,
        warnings,
        recommendation: validationScore > 70 ? 'PROCEED' : validationScore > 50 ? 'CAUTION' : 'AVOID'
      }
    };
  }

  getIndicatorConfirmationScore(indicators, signal) {
    let score = 0;
    let total = 0;
    
    // RSI confirmation
    total++;
    if (signal === 'BUY' && indicators.rsi < 60) score++;
    else if (signal === 'SELL' && indicators.rsi > 40) score++;
    else if (signal === 'HOLD') score++;
    
    // MACD confirmation
    if (indicators.macd) {
      total++;
      if (signal === 'BUY' && indicators.macd.histogram > 0) score++;
      else if (signal === 'SELL' && indicators.macd.histogram < 0) score++;
      else if (signal === 'HOLD') score++;
    }
    
    // Stochastic confirmation
    if (indicators.stochastic) {
      total++;
      if (signal === 'BUY' && indicators.stochastic.k < 80) score++;
      else if (signal === 'SELL' && indicators.stochastic.k > 20) score++;
      else if (signal === 'HOLD') score++;
    }
    
    // ADX strength confirmation
    if (indicators.adx) {
      total++;
      if ((signal === 'BUY' || signal === 'SELL') && indicators.adx > 20) score++;
      else if (signal === 'HOLD' && indicators.adx < 20) score++;
    }
    
    return total > 0 ? Math.round((score / total) * 100) : 0;
  }

  assessSignalQuality(indicators, signal) {
    const quality = {
      data_completeness: this.getDataCompleteness(indicators),
      indicator_alignment: this.getIndicatorAlignment(indicators, signal.signal),
      risk_level: this.getRiskLevel(indicators),
      confidence_grade: this.getConfidenceGrade(signal.confidence)
    };
    
    // Beregn overall quality score
    const scores = Object.values(quality).map(item => item.score || 0);
    quality.overall_score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    quality.overall_grade = this.getGrade(quality.overall_score);
    
    return quality;
  }

  getDataCompleteness(indicators) {
    const requiredIndicators = ['rsi', 'macd', 'ema20', 'ema50', 'atr', 'adx'];
    const available = requiredIndicators.filter(ind => indicators[ind] !== undefined).length;
    const score = Math.round((available / requiredIndicators.length) * 100);
    
    return {
      score,
      grade: this.getGrade(score),
      available_indicators: available,
      total_indicators: requiredIndicators.length
    };
  }

  getIndicatorAlignment(indicators, signal) {
    // Dette er forenklet - kan udvides med mere sofistikeret logik
    const score = this.getIndicatorConfirmationScore(indicators, signal);
    return {
      score,
      grade: this.getGrade(score)
    };
  }

  getRiskLevel(indicators) {
    let riskScore = 50; // Start med medium risk
    
    // Høj RSI øger risiko
    if (indicators.rsi > 70 || indicators.rsi < 30) riskScore += 20;
    
    // Høj volatilitet øger risiko
    if (this.isHighVolatilityEnvironment(indicators)) riskScore += 15;
    
    // Ekstrem MFI øger risiko
    if (indicators.mfi > 80 || indicators.mfi < 20) riskScore += 10;
    
    const risk = riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW';
    
    return {
      score: Math.min(100, riskScore),
      level: risk,
      grade: this.getGrade(100 - riskScore) // Invert for grade
    };
  }

  getConfidenceGrade(confidence) {
    return {
      score: confidence,
      grade: this.getGrade(confidence)
    };
  }

  getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  isHighVolatilityEnvironment(indicators) {
    // Dette kan udvides med mere sofistikerede volatility checks
    return indicators.atr > (indicators.atr * 1.5); // Simplified check
  }

  trackSignalQuality(symbol, signal) {
    // Track signal for later performance analysis
    const key = `${symbol}_${Date.now()}`;
    this.signalHistory.set(key, {
      symbol,
      signal: signal.signal,
      confidence: signal.confidence,
      timestamp: Date.now(),
      quality_score: signal.signal_quality?.overall_score
    });
    
    // Keep only last 100 signals per symbol
    if (this.signalHistory.size > 1000) {
      const oldest = Array.from(this.signalHistory.keys())[0];
      this.signalHistory.delete(oldest);
    }
  }

  addFallbackWarning(baseSignal, errorMessage) {
    return {
      ...baseSignal,
      confidence: Math.round(baseSignal.confidence * 0.8), // Reduce confidence
      warnings: [`Taapi enhancement failed: ${errorMessage}`, 'Using base signal only'],
      enhanced_by: 'fallback_mode'
    };
  }

  // Ny metode til at undgå dårlige entries
  async shouldAvoidEntry(symbol, timeframe = '1h') {
    try {
      const indicators = await this.taapiService.getBulkIndicators(symbol, timeframe);
      
      const avoidanceFactors = [];
      
      // Ekstreme RSI værdier
      if (indicators.rsi > 85 || indicators.rsi < 15) {
        avoidanceFactors.push(`Extreme RSI: ${indicators.rsi.toFixed(1)}`);
      }
      
      // Meget lav ADX (ingen trend)
      if (indicators.adx < 15) {
        avoidanceFactors.push(`No trend (ADX: ${indicators.adx.toFixed(1)})`);
      }
      
      // Bollinger Band squeeze
      if (indicators.bollinger) {
        const bbWidth = (indicators.bollinger.upper - indicators.bollinger.lower) / indicators.bollinger.middle;
        if (bbWidth < 0.015) {
          avoidanceFactors.push('Bollinger Band squeeze detected');
        }
      }
      
      // Ekstrem Money Flow
      if (indicators.mfi > 95 || indicators.mfi < 5) {
        avoidanceFactors.push(`Extreme Money Flow: ${indicators.mfi.toFixed(1)}`);
      }
      
      return {
        should_avoid: avoidanceFactors.length > 0,
        reasons: avoidanceFactors,
        recommendation: avoidanceFactors.length > 0 ? 'WAIT_FOR_BETTER_SETUP' : 'PROCEED_WITH_CAUTION'
      };
      
    } catch (error) {
      logger.error('Entry avoidance check failed:', error);
      return {
        should_avoid: false,
        reasons: ['Unable to perform avoidance check'],
        recommendation: 'PROCEED_WITH_EXTRA_CAUTION'
      };
    }
  }
}

module.exports = new EnhancedSignalGenerator();