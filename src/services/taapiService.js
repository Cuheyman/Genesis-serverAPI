// src/services/taapiService.js
const axios = require('axios');
const logger = require('../utils/logger');

class TaapiService {
  constructor() {
    this.baseURL = 'https://api.taapi.io';
    this.secret = process.env.TAAPI_SECRET || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbHVlIjoiNjg1NDFjNDI4MDZmZjE2NTFlNTY4ZGNhIiwiaWF0IjoxNzUyNDIyMzg4LCJleHAiOjMzMjU2ODg2Mzg4fQ.Q4GOQ6s32PcS3S8zBNTGxJXHtoAt6bveeav8aIegmTU'; // Tilføj til .env fil
    this.rateLimitDelay = 1000; // 1 sekund mellem calls på gratis plan
    this.lastCallTime = 0;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastCall));
    }
    this.lastCallTime = Date.now();
  }

  // Hent flere indikatorer på én gang med bulk endpoint
  async getBulkIndicators(symbol, interval = '1h', exchange = 'binance') {
    try {
      await this.waitForRateLimit();
      
      const bulkRequest = {
        secret: this.secret,
        construct: [
          // Momentum indikatorer
          {
            indicator: 'rsi',
            exchange,
            symbol,
            interval,
            optInTimePeriod: 14
          },
          {
            indicator: 'macd',
            exchange,
            symbol,
            interval
          },
          {
            indicator: 'stoch',
            exchange,
            symbol,
            interval
          },
          
          // Trend indikatorer
          {
            indicator: 'ema',
            exchange,
            symbol,
            interval,
            optInTimePeriod: 20
          },
          {
            indicator: 'ema',
            exchange,
            symbol,
            interval,
            optInTimePeriod: 50
          },
          {
            indicator: 'ema',
            exchange,
            symbol,
            interval,
            optInTimePeriod: 200
          },
          {
            indicator: 'adx',
            exchange,
            symbol,
            interval
          },
          
          // Volume indikatorer
          {
            indicator: 'obv',
            exchange,
            symbol,
            interval
          },
          {
            indicator: 'mfi',
            exchange,
            symbol,
            interval
          },
          
          // Volatilitet indikatorer
          {
            indicator: 'bbands',
            exchange,
            symbol,
            interval
          },
          {
            indicator: 'atr',
            exchange,
            symbol,
            interval
          },
          
          // Candlestick patterns
          {
            indicator: 'cdlhammer',
            exchange,
            symbol,
            interval
          },
          {
            indicator: 'cdlengulfing',
            exchange,
            symbol,
            interval
          },
          {
            indicator: 'cdldoji',
            exchange,
            symbol,
            interval
          },
          {
            indicator: 'cdlshootingstar',
            exchange,
            symbol,
            interval
          }
        ]
      };

      const response = await axios.post(`${this.baseURL}/bulk`, bulkRequest, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return this.parseIndicatorResponse(response.data);
      
    } catch (error) {
      logger.error('Taapi bulk indicators failed:', error);
      throw new Error(`Taapi service error: ${error.message}`);
    }
  }

  parseIndicatorResponse(bulkData) {
    const indicators = {};
    
    bulkData.forEach((result, index) => {
      if (result.error) {
        logger.warn(`Indicator ${index} failed:`, result.error);
        return;
      }

      // Map resultaterne til vores struktur
      switch (index) {
        case 0: indicators.rsi = result.value; break;
        case 1: 
          indicators.macd = {
            macd: result.macd,
            signal: result.macdSignal,
            histogram: result.macdHist
          };
          break;
        case 2:
          indicators.stochastic = {
            k: result.stochK,
            d: result.stochD
          };
          break;
        case 3: indicators.ema20 = result.value; break;
        case 4: indicators.ema50 = result.value; break;
        case 5: indicators.ema200 = result.value; break;
        case 6: indicators.adx = result.value; break;
        case 7: indicators.obv = result.value; break;
        case 8: indicators.mfi = result.value; break;
        case 9:
          indicators.bollinger = {
            upper: result.bbandsUpper,
            middle: result.bbandsMiddle,
            lower: result.bbandsLower
          };
          break;
        case 10: indicators.atr = result.value; break;
        case 11: indicators.hammer = result.value; break;
        case 12: indicators.engulfing = result.value; break;
        case 13: indicators.doji = result.value; break;
        case 14: indicators.shootingStar = result.value; break;
      }
    });

    return indicators;
  }

  // Analyse markedets styrke baseret på multiple indicators
  analyzeMarketStrength(indicators, currentPrice) {
    const signals = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
      confidence: 0
    };

    // RSI analyse
    if (indicators.rsi < 30) signals.bullish += 2;
    else if (indicators.rsi > 70) signals.bearish += 2;
    else if (indicators.rsi >= 40 && indicators.rsi <= 60) signals.neutral += 1;

    // MACD analyse
    if (indicators.macd?.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
      signals.bullish += 2;
    } else if (indicators.macd?.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
      signals.bearish += 2;
    }

    // Trend analyse (EMA)
    if (currentPrice > indicators.ema20 && indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200) {
      signals.bullish += 3; // Stærk uptrend
    } else if (currentPrice < indicators.ema20 && indicators.ema20 < indicators.ema50 && indicators.ema50 < indicators.ema200) {
      signals.bearish += 3; // Stærk downtrend
    }

    // ADX strength
    if (indicators.adx > 25) {
      // Stærk trend - forstærk det dominerende signal
      if (signals.bullish > signals.bearish) signals.bullish += 1;
      else if (signals.bearish > signals.bullish) signals.bearish += 1;
    }

    // Stochastic analyse
    if (indicators.stochastic?.k < 20 && indicators.stochastic?.d < 20) {
      signals.bullish += 1;
    } else if (indicators.stochastic?.k > 80 && indicators.stochastic?.d > 80) {
      signals.bearish += 1;
    }

    // MFI (Money Flow Index)
    if (indicators.mfi < 20) signals.bullish += 1;
    else if (indicators.mfi > 80) signals.bearish += 1;

    // Candlestick patterns
    if (indicators.hammer > 0) signals.bullish += 1;
    if (indicators.engulfing > 0) signals.bullish += 1;
    if (indicators.shootingStar > 0) signals.bearish += 1;
    if (indicators.doji > 0) signals.neutral += 1;

    // Beregn samlet confidence
    const totalSignals = signals.bullish + signals.bearish + signals.neutral;
    const dominantSignal = Math.max(signals.bullish, signals.bearish, signals.neutral);
    
    signals.confidence = totalSignals > 0 ? (dominantSignal / totalSignals) * 100 : 0;

    return signals;
  }

  // Generer handelssignal baseret på multiple confirmations
  generateConfirmedSignal(indicators, currentPrice, riskLevel = 'balanced') {
    const analysis = this.analyzeMarketStrength(indicators, currentPrice);
    
    // Konfigurer confidence thresholds baseret på risiko niveau
    const thresholds = {
      conservative: { min_confidence: 75, min_signals: 4 },
      balanced: { min_confidence: 60, min_signals: 3 },
      aggressive: { min_confidence: 50, min_signals: 2 }
    };

    const config = thresholds[riskLevel] || thresholds.balanced;
    
    let signal = 'HOLD';
    let confidence = analysis.confidence;
    let reasoning = [];

    // Tjek om vi har nok signaler og confidence
    if (analysis.confidence >= config.min_confidence) {
      if (analysis.bullish >= config.min_signals && analysis.bullish > analysis.bearish) {
        signal = 'BUY';
        reasoning.push(`${analysis.bullish} bullish indicators confirmed`);
        
        // Ekstra validering for buy signal
        if (indicators.rsi < 70 && currentPrice > indicators.ema20) {
          reasoning.push('RSI not overbought and price above EMA20');
        } else if (indicators.rsi > 70) {
          // Reducer confidence hvis RSI er overbought
          confidence *= 0.8;
          reasoning.push('Warning: RSI overbought - reduced confidence');
        }
        
      } else if (analysis.bearish >= config.min_signals && analysis.bearish > analysis.bullish) {
        signal = 'SELL';
        reasoning.push(`${analysis.bearish} bearish indicators confirmed`);
        
        // Ekstra validering for sell signal
        if (indicators.rsi > 30 && currentPrice < indicators.ema20) {
          reasoning.push('RSI not oversold and price below EMA20');
        } else if (indicators.rsi < 30) {
          // Reducer confidence hvis RSI er oversold
          confidence *= 0.8;
          reasoning.push('Warning: RSI oversold - reduced confidence');
        }
      }
    }

    // Hvis ikke nok confidence, hold position
    if (confidence < config.min_confidence) {
      signal = 'HOLD';
      reasoning = [`Insufficient confidence (${confidence.toFixed(1)}%) for ${riskLevel} risk level`];
    }

    return {
      signal,
      confidence: Math.round(confidence),
      reasoning: reasoning.join('; '),
      analysis: {
        bullish_signals: analysis.bullish,
        bearish_signals: analysis.bearish,
        neutral_signals: analysis.neutral,
        market_strength: this.getMarketStrength(indicators),
        trend_direction: this.getTrendDirection(indicators, currentPrice)
      },
      risk_factors: this.identifyRiskFactors(indicators, currentPrice)
    };
  }

  getMarketStrength(indicators) {
    if (indicators.adx > 30) return 'STRONG';
    if (indicators.adx > 20) return 'MODERATE'; 
    return 'WEAK';
  }

  getTrendDirection(indicators, currentPrice) {
    if (currentPrice > indicators.ema20 && indicators.ema20 > indicators.ema50) return 'BULLISH';
    if (currentPrice < indicators.ema20 && indicators.ema20 < indicators.ema50) return 'BEARISH';
    return 'SIDEWAYS';
  }

  identifyRiskFactors(indicators, currentPrice) {
    const risks = [];
    
    if (indicators.rsi > 80 || indicators.rsi < 20) {
      risks.push('EXTREME_RSI');
    }
    
    if (indicators.atr > indicators.atr * 1.5) { // Sammenlign med moving average
      risks.push('HIGH_VOLATILITY');
    }
    
    if (indicators.mfi > 90 || indicators.mfi < 10) {
      risks.push('EXTREME_MONEY_FLOW');
    }
    
    // Bollinger Band squeeze
    const bbWidth = (indicators.bollinger?.upper - indicators.bollinger?.lower) / indicators.bollinger?.middle;
    if (bbWidth < 0.02) {
      risks.push('BOLLINGER_SQUEEZE');
    }
    
    return risks;
  }

  // Test forbindelse til Taapi
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseURL}/rsi`, {
        params: {
          secret: this.secret,
          exchange: 'binance',
          symbol: 'BTC/USDT',
          interval: '1h'
        },
        timeout: 5000
      });
      
      logger.info('Taapi connection successful', { rsi: response.data.value });
      return true;
    } catch (error) {
      logger.error('Taapi connection failed:', error.message);
      return false;
    }
  }
}

module.exports = new TaapiService();