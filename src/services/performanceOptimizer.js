const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Trade Outcome class for tracking individual trade results
 */
class TradeOutcome {
  constructor({
    pair,
    entryTime = new Date(),
    exitTime = null,
    entryPrice,
    exitPrice = null,
    signalConfidence,
    entryQualityScore,
    signalStrength,
    breakoutType,
    volumeConfirmed = false,
    momentumConfirmed = false,
    isHighProbability = false,
    riskRewardRatio = 2.0,
    marketPhase = "UNKNOWN",
    rsiAtEntry = null,
    volumeSpikeRatio = null
  } = {}) {
    this.pair = pair;
    this.entryTime = entryTime;
    this.exitTime = exitTime;
    this.entryPrice = entryPrice;
    this.exitPrice = exitPrice;
    this.signalConfidence = signalConfidence;
    this.entryQualityScore = entryQualityScore;
    this.signalStrength = signalStrength;
    this.breakoutType = breakoutType;
    this.volumeConfirmed = volumeConfirmed;
    this.momentumConfirmed = momentumConfirmed;
    this.isHighProbability = isHighProbability;
    this.riskRewardRatio = riskRewardRatio;
    this.marketPhase = marketPhase;
    this.rsiAtEntry = rsiAtEntry;
    this.volumeSpikeRatio = volumeSpikeRatio;
    
    // Outcome metrics
    this.pnlPercentage = null;
    this.isWinner = null;
    this.holdDurationHours = null;
    this.maxDrawdown = null;
    this.maxProfit = null;
  }

  calculateOutcome() {
    if (this.exitPrice && this.exitTime) {
      this.pnlPercentage = ((this.exitPrice - this.entryPrice) / this.entryPrice) * 100;
      this.isWinner = this.pnlPercentage > 0;
      this.holdDurationHours = (this.exitTime - this.entryTime) / (1000 * 60 * 60);
    }
  }
}

/**
 * Performance Metrics class for comprehensive performance tracking
 */
class PerformanceMetrics {
  constructor({
    totalTrades = 0,
    winningTrades = 0,
    losingTrades = 0,
    winRate = 0,
    avgWin = 0,
    avgLoss = 0,
    profitFactor = 0,
    maxConsecutiveWins = 0,
    maxConsecutiveLosses = 0,
    avgHoldTimeHours = 0,
    bestTrade = 0,
    worstTrade = 0,
    totalPnl = 0,
    highProbWinRate = 0,
    excellentSignalWinRate = 0,
    strongSignalWinRate = 0,
    volumeConfirmedWinRate = 0,
    breakoutConfirmedWinRate = 0,
    momentumConfirmedWinRate = 0
  } = {}) {
    this.totalTrades = totalTrades;
    this.winningTrades = winningTrades;
    this.losingTrades = losingTrades;
    this.winRate = winRate;
    this.avgWin = avgWin;
    this.avgLoss = avgLoss;
    this.profitFactor = profitFactor;
    this.maxConsecutiveWins = maxConsecutiveWins;
    this.maxConsecutiveLosses = maxConsecutiveLosses;
    this.avgHoldTimeHours = avgHoldTimeHours;
    this.bestTrade = bestTrade;
    this.worstTrade = worstTrade;
    this.totalPnl = totalPnl;
    this.highProbWinRate = highProbWinRate;
    this.excellentSignalWinRate = excellentSignalWinRate;
    this.strongSignalWinRate = strongSignalWinRate;
    this.volumeConfirmedWinRate = volumeConfirmedWinRate;
    this.breakoutConfirmedWinRate = breakoutConfirmedWinRate;
    this.momentumConfirmedWinRate = momentumConfirmedWinRate;
  }
}

/**
 * Performance Optimizer & Analytics System
 * Continuously monitors and optimizes the momentum strategy for 75-90% win rate
 */
class PerformanceOptimizer {
  constructor(dataPath = './data/momentum_performance.json') {
    this.dataPath = dataPath;
    
    // Performance tracking
    this.activeTrades = new Map(); // tradeId -> TradeOutcome
    this.completedTrades = []; // Last 1000 trades
    this.performanceHistory = []; // Last 100 performance snapshots
    
    // Optimization parameters
    this.optimizationTargets = {
      minWinRate: 0.75,
      targetWinRate: 0.85,
      minProfitFactor: 1.5,
      targetProfitFactor: 2.5,
      maxConsecutiveLosses: 5
    };
    
    // Adaptive thresholds
    this.adaptiveThresholds = {
      confluenceScore: 70.0,
      confidenceScore: 75.0,
      volumeSpikeMin: 1.8,
      rsiEntryMax: 65.0,
      momentumStrengthMin: 'MODERATE'
    };
    
    // Analytics cache
    this.analyticsCache = {};
    this.lastOptimization = new Date();
    
    // Initialize data storage
    this._initializeDataStorage();
    
    logger.info('📊 Performance Optimizer initialized for 75-90% win rate targeting');
  }

  async _initializeDataStorage() {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.dataPath);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Load existing data if available
      try {
        const data = await fs.readFile(this.dataPath, 'utf8');
        const parsedData = JSON.parse(data);
        
        this.completedTrades = parsedData.completedTrades || [];
        this.performanceHistory = parsedData.performanceHistory || [];
        this.adaptiveThresholds = { ...this.adaptiveThresholds, ...parsedData.adaptiveThresholds };
        
        logger.info(`📁 Loaded ${this.completedTrades.length} completed trades from storage`);
      } catch (error) {
        logger.info('📁 No existing performance data found, starting fresh');
      }
    } catch (error) {
      logger.error(`Error initializing data storage: ${error.message}`);
    }
  }

  /**
   * Track a new trade entry
   */
  async trackTradeEntry(pair, entryData) {
    const tradeId = `${pair}_${Date.now()}`;
    
    const tradeOutcome = new TradeOutcome({
      pair,
      entryTime: new Date(),
      entryPrice: entryData.entry_price || 0,
      signalConfidence: entryData.confidence || 0,
      entryQualityScore: entryData.entry_quality_score || 0,
      signalStrength: entryData.signal_strength || 'UNKNOWN',
      breakoutType: entryData.breakout_type || 'NONE',
      volumeConfirmed: entryData.volume_confirmed || false,
      momentumConfirmed: entryData.momentum_confirmed || false,
      isHighProbability: entryData.is_high_probability || false,
      riskRewardRatio: entryData.risk_reward_ratio || 2.0,
      marketPhase: entryData.market_phase || 'UNKNOWN',
      rsiAtEntry: entryData.rsi_at_entry,
      volumeSpikeRatio: entryData.volume_spike_ratio
    });
    
    this.activeTrades.set(tradeId, tradeOutcome);
    
    logger.info(`📊 TRADE ENTRY TRACKED: ${tradeId}`, {
      pair,
      entryPrice: tradeOutcome.entryPrice,
      confidence: tradeOutcome.signalConfidence,
      qualityScore: tradeOutcome.entryQualityScore,
      highProbability: tradeOutcome.isHighProbability
    });
    
    return tradeId;
  }

  /**
   * Track trade exit and calculate performance
   */
  async trackTradeExit(tradeId, exitPrice, exitReason = "MANUAL") {
    if (!this.activeTrades.has(tradeId)) {
      logger.warning(`Trade ID ${tradeId} not found in active trades`);
      return;
    }
    
    const trade = this.activeTrades.get(tradeId);
    trade.exitTime = new Date();
    trade.exitPrice = exitPrice;
    trade.calculateOutcome();
    
    // Move to completed trades
    this.completedTrades.push(trade);
    this.activeTrades.delete(tradeId);
    
    // Keep only last 1000 trades
    if (this.completedTrades.length > 1000) {
      this.completedTrades = this.completedTrades.slice(-1000);
    }
    
    // Save to persistent storage
    await this._saveTradeData();
    
    logger.info(`📊 TRADE EXIT TRACKED: ${tradeId}`, {
      pair: trade.pair,
      pnl: trade.pnlPercentage?.toFixed(2) + '%',
      winner: trade.isWinner,
      holdTime: trade.holdDurationHours?.toFixed(1) + 'h',
      exitReason
    });
    
    // Trigger optimization check if needed
    if (this.completedTrades.length % 10 === 0) { // Every 10 trades
      await this._checkOptimizationTriggers();
    }
  }

  /**
   * Get current performance metrics
   */
  async getCurrentPerformance() {
    if (this.completedTrades.length < 10) {
      return this._getDefaultMetrics();
    }
    
    const trades = this.completedTrades;
    const winningTrades = trades.filter(t => t.isWinner);
    const losingTrades = trades.filter(t => !t.isWinner);
    
    // Basic metrics
    const totalTrades = trades.length;
    const winCount = winningTrades.length;
    const lossCount = losingTrades.length;
    const winRate = winCount / totalTrades;
    
    // PnL metrics
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.pnlPercentage, 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, t) => sum + t.pnlPercentage, 0) / losingTrades.length 
      : 0;
    const profitFactor = lossCount > 0 && avgLoss !== 0 
      ? Math.abs(avgWin * winCount / (avgLoss * lossCount)) 
      : Infinity;
    
    // Consecutive metrics
    const maxConsecutiveWins = this._calculateMaxConsecutive(trades, true);
    const maxConsecutiveLosses = this._calculateMaxConsecutive(trades, false);
    
    // Time metrics
    const avgHoldTime = trades
      .filter(t => t.holdDurationHours !== null)
      .reduce((sum, t) => sum + t.holdDurationHours, 0) / trades.length;
    
    // Best/worst trades
    const pnls = trades.map(t => t.pnlPercentage).filter(p => p !== null);
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
    const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
    
    // Quality-based metrics
    const highProbTrades = trades.filter(t => t.isHighProbability);
    const highProbWinRate = highProbTrades.length > 0 
      ? highProbTrades.filter(t => t.isWinner).length / highProbTrades.length 
      : 0;
    
    const excellentTrades = trades.filter(t => t.signalStrength === 'EXCELLENT');
    const excellentWinRate = excellentTrades.length > 0 
      ? excellentTrades.filter(t => t.isWinner).length / excellentTrades.length 
      : 0;
    
    const strongTrades = trades.filter(t => t.signalStrength === 'STRONG');
    const strongWinRate = strongTrades.length > 0 
      ? strongTrades.filter(t => t.isWinner).length / strongTrades.length 
      : 0;
    
    // Strategy-specific metrics
    const volumeTrades = trades.filter(t => t.volumeConfirmed);
    const volumeWinRate = volumeTrades.length > 0 
      ? volumeTrades.filter(t => t.isWinner).length / volumeTrades.length 
      : 0;
    
    const breakoutTrades = trades.filter(t => t.breakoutType !== 'NONE');
    const breakoutWinRate = breakoutTrades.length > 0 
      ? breakoutTrades.filter(t => t.isWinner).length / breakoutTrades.length 
      : 0;
    
    const momentumTrades = trades.filter(t => t.momentumConfirmed);
    const momentumWinRate = momentumTrades.length > 0 
      ? momentumTrades.filter(t => t.isWinner).length / momentumTrades.length 
      : 0;
    
    return new PerformanceMetrics({
      totalTrades,
      winningTrades: winCount,
      losingTrades: lossCount,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldTimeHours: avgHoldTime,
      bestTrade,
      worstTrade,
      totalPnl,
      highProbWinRate,
      excellentSignalWinRate: excellentWinRate,
      strongSignalWinRate: strongWinRate,
      volumeConfirmedWinRate: volumeWinRate,
      breakoutConfirmedWinRate: breakoutWinRate,
      momentumConfirmedWinRate: momentumWinRate
    });
  }

  /**
   * Check if optimization is needed and trigger if necessary
   */
  async _checkOptimizationTriggers() {
    const currentMetrics = await this.getCurrentPerformance();
    
    // Check if we need to optimize
    const needsOptimization = (
      currentMetrics.winRate < this.optimizationTargets.minWinRate ||
      currentMetrics.profitFactor < this.optimizationTargets.minProfitFactor ||
      currentMetrics.maxConsecutiveLosses > this.optimizationTargets.maxConsecutiveLosses
    );
    
    if (needsOptimization) {
      logger.warning(`🔧 OPTIMIZATION TRIGGER ACTIVATED`, {
        currentWinRate: (currentMetrics.winRate * 100).toFixed(1) + '%',
        targetWinRate: (this.optimizationTargets.targetWinRate * 100).toFixed(1) + '%',
        currentProfitFactor: currentMetrics.profitFactor.toFixed(2),
        maxConsecutiveLosses: currentMetrics.maxConsecutiveLosses
      });
      
      await this._optimizeThresholds(currentMetrics);
    }
  }

  /**
   * Optimize strategy thresholds based on performance analysis
   */
  async _optimizeThresholds(currentMetrics) {
    const optimizationSuggestions = [];
    
    // Analyze which signal types perform best
    const signalAnalysis = await this._analyzeSignalPerformance();
    
    // If win rate is too low, increase selectivity
    if (currentMetrics.winRate < this.optimizationTargets.minWinRate) {
      
      // Increase confluence score threshold
      if (currentMetrics.highProbWinRate > currentMetrics.winRate * 1.1) {
        const newConfluence = Math.min(85, this.adaptiveThresholds.confluenceScore + 5);
        optimizationSuggestions.push(`Increase confluence threshold: ${this.adaptiveThresholds.confluenceScore} -> ${newConfluence}`);
        this.adaptiveThresholds.confluenceScore = newConfluence;
      }
      
      // Increase confidence threshold
      const newConfidence = Math.min(90, this.adaptiveThresholds.confidenceScore + 5);
      optimizationSuggestions.push(`Increase confidence threshold: ${this.adaptiveThresholds.confidenceScore} -> ${newConfidence}`);
      this.adaptiveThresholds.confidenceScore = newConfidence;
      
      // Require stronger volume confirmation
      if (currentMetrics.volumeConfirmedWinRate > currentMetrics.winRate * 1.05) {
        const newVolume = Math.min(3.0, this.adaptiveThresholds.volumeSpikeMin + 0.2);
        optimizationSuggestions.push(`Increase volume spike requirement: ${this.adaptiveThresholds.volumeSpikeMin} -> ${newVolume}`);
        this.adaptiveThresholds.volumeSpikeMin = newVolume;
      }
    }
    
    // If consecutive losses are too high, be more conservative with RSI
    if (currentMetrics.maxConsecutiveLosses > this.optimizationTargets.maxConsecutiveLosses) {
      const newRsiMax = Math.max(60, this.adaptiveThresholds.rsiEntryMax - 3);
      optimizationSuggestions.push(`Lower RSI entry maximum: ${this.adaptiveThresholds.rsiEntryMax} -> ${newRsiMax}`);
      this.adaptiveThresholds.rsiEntryMax = newRsiMax;
    }
    
    // Log optimization actions
    if (optimizationSuggestions.length > 0) {
      logger.info("🔧 THRESHOLD OPTIMIZATION APPLIED:");
      optimizationSuggestions.forEach(suggestion => {
        logger.info(`  - ${suggestion}`);
      });
      
      // Save optimization to storage
      await this._savePerformanceSnapshot(currentMetrics);
    }
    
    this.lastOptimization = new Date();
  }

  /**
   * Analyze performance by signal characteristics
   */
  async _analyzeSignalPerformance() {
    if (this.completedTrades.length < 20) {
      return {};
    }
    
    const trades = this.completedTrades;
    const analysis = {};
    
    // Performance by signal strength
    const byStrength = {};
    for (const trade of trades) {
      if (!byStrength[trade.signalStrength]) byStrength[trade.signalStrength] = [];
      byStrength[trade.signalStrength].push(trade.isWinner);
    }
    
    analysis.bySignalStrength = {};
    for (const [strength, wins] of Object.entries(byStrength)) {
      analysis.bySignalStrength[strength] = {
        winRate: wins.filter(w => w).length / wins.length,
        tradeCount: wins.length
      };
    }
    
    // Performance by breakout type
    const byBreakout = {};
    for (const trade of trades) {
      if (!byBreakout[trade.breakoutType]) byBreakout[trade.breakoutType] = [];
      byBreakout[trade.breakoutType].push(trade.isWinner);
    }
    
    analysis.byBreakoutType = {};
    for (const [breakoutType, wins] of Object.entries(byBreakout)) {
      analysis.byBreakoutType[breakoutType] = {
        winRate: wins.filter(w => w).length / wins.length,
        tradeCount: wins.length
      };
    }
    
    // Performance by market phase
    const byPhase = {};
    for (const trade of trades) {
      if (!byPhase[trade.marketPhase]) byPhase[trade.marketPhase] = [];
      byPhase[trade.marketPhase].push(trade.isWinner);
    }
    
    analysis.byMarketPhase = {};
    for (const [phase, wins] of Object.entries(byPhase)) {
      analysis.byMarketPhase[phase] = {
        winRate: wins.filter(w => w).length / wins.length,
        tradeCount: wins.length
      };
    }
    
    return analysis;
  }

  /**
   * Save performance snapshot to storage
   */
  async _savePerformanceSnapshot(metrics) {
    const snapshot = {
      timestamp: new Date().toISOString(),
      winRate: metrics.winRate,
      totalTrades: metrics.totalTrades,
      profitFactor: metrics.profitFactor,
      avgHoldTime: metrics.avgHoldTimeHours,
      confluenceThreshold: this.adaptiveThresholds.confluenceScore,
      confidenceThreshold: this.adaptiveThresholds.confidenceScore,
      highProbWinRate: metrics.highProbWinRate
    };
    
    this.performanceHistory.push(snapshot);
    
    // Keep only last 100 snapshots
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
    
    await this._saveTradeData();
  }

  /**
   * Save trade data to persistent storage
   */
  async _saveTradeData() {
    try {
      const data = {
        completedTrades: this.completedTrades,
        performanceHistory: this.performanceHistory,
        adaptiveThresholds: this.adaptiveThresholds,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`Error saving trade data: ${error.message}`);
    }
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    const recommendations = [];
    
    if (this.completedTrades.length < 20) {
      recommendations.push("Collect more trade data (minimum 20 trades) for meaningful optimization");
      return recommendations;
    }
    
    const recentTrades = this.completedTrades.slice(-20);
    const recentWinRate = recentTrades.filter(t => t.isWinner).length / recentTrades.length;
    
    if (recentWinRate < 0.75) {
      recommendations.push("Recent win rate below target (75%) - consider increasing selectivity");
      recommendations.push(`Current thresholds: Confluence ${this.adaptiveThresholds.confluenceScore.toFixed(0)}%, Confidence ${this.adaptiveThresholds.confidenceScore.toFixed(0)}%`);
    }
    
    // Analyze best performing characteristics
    const highProbTrades = recentTrades.filter(t => t.isHighProbability);
    if (highProbTrades.length > 0) {
      const hpWinRate = highProbTrades.filter(t => t.isWinner).length / highProbTrades.length;
      if (hpWinRate > recentWinRate * 1.1) {
        recommendations.push(`High-probability trades performing well (${(hpWinRate * 100).toFixed(1)}% win rate) - focus on these setups`);
      }
    }
    
    const volumeConfirmedTrades = recentTrades.filter(t => t.volumeConfirmed);
    if (volumeConfirmedTrades.length > 0) {
      const volWinRate = volumeConfirmedTrades.filter(t => t.isWinner).length / volumeConfirmedTrades.length;
      if (volWinRate > recentWinRate * 1.05) {
        recommendations.push(`Volume-confirmed trades outperforming (${(volWinRate * 100).toFixed(1)}% vs ${(recentWinRate * 100).toFixed(1)}%) - prioritize volume confirmation`);
      }
    }
    
    return recommendations;
  }

  /**
   * Get current adaptive thresholds
   */
  getCurrentThresholds() {
    return { ...this.adaptiveThresholds };
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport() {
    const metrics = await this.getCurrentPerformance();
    const recommendations = this.getOptimizationRecommendations();
    const signalAnalysis = await this._analyzeSignalPerformance();
    
    const report = `
=== MOMENTUM STRATEGY PERFORMANCE REPORT ===
Generated: ${new Date().toISOString()}

OVERALL PERFORMANCE:
- Total Trades: ${metrics.totalTrades}
- Win Rate: ${(metrics.winRate * 100).toFixed(1)}% (Target: ${(this.optimizationTargets.targetWinRate * 100).toFixed(1)}%)
- Profit Factor: ${metrics.profitFactor.toFixed(2)} (Target: ${this.optimizationTargets.targetProfitFactor.toFixed(1)}+)
- Average Win: ${metrics.avgWin.toFixed(2)}%
- Average Loss: ${metrics.avgLoss.toFixed(2)}%
- Best Trade: ${metrics.bestTrade.toFixed(2)}%
- Worst Trade: ${metrics.worstTrade.toFixed(2)}%
- Total PnL: ${metrics.totalPnl.toFixed(2)}%

QUALITY METRICS:
- High Probability Win Rate: ${(metrics.highProbWinRate * 100).toFixed(1)}%
- Excellent Signal Win Rate: ${(metrics.excellentSignalWinRate * 100).toFixed(1)}%
- Strong Signal Win Rate: ${(metrics.strongSignalWinRate * 100).toFixed(1)}%

STRATEGY CONFIRMATION METRICS:
- Volume Confirmed Win Rate: ${(metrics.volumeConfirmedWinRate * 100).toFixed(1)}%
- Breakout Confirmed Win Rate: ${(metrics.breakoutConfirmedWinRate * 100).toFixed(1)}%
- Momentum Confirmed Win Rate: ${(metrics.momentumConfirmedWinRate * 100).toFixed(1)}%

RISK METRICS:
- Max Consecutive Wins: ${metrics.maxConsecutiveWins}
- Max Consecutive Losses: ${metrics.maxConsecutiveLosses}
- Average Hold Time: ${metrics.avgHoldTimeHours.toFixed(1)} hours

CURRENT ADAPTIVE THRESHOLDS:
- Confluence Score: ${this.adaptiveThresholds.confluenceScore.toFixed(0)}%
- Confidence Score: ${this.adaptiveThresholds.confidenceScore.toFixed(0)}%
- Volume Spike Minimum: ${this.adaptiveThresholds.volumeSpikeMin.toFixed(1)}x
- RSI Entry Maximum: ${this.adaptiveThresholds.rsiEntryMax.toFixed(0)}

OPTIMIZATION RECOMMENDATIONS:
${recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}
`;
    
    if (signalAnalysis.bySignalStrength) {
      const strengthAnalysis = Object.entries(signalAnalysis.bySignalStrength)
        .map(([strength, data]) => `  - ${strength}: ${(data.winRate * 100).toFixed(1)}% win rate (${data.tradeCount} trades)`)
        .join('\n');
      
      return report + `\nSIGNAL PERFORMANCE ANALYSIS:\nBy Signal Strength:\n${strengthAnalysis}`;
    }
    
    return report;
  }

  // Helper methods
  
  _calculateMaxConsecutive(trades, targetOutcome) {
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    
    for (const trade of trades) {
      if (trade.isWinner === targetOutcome) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }
    
    return maxConsecutive;
  }

  _getDefaultMetrics() {
    return new PerformanceMetrics({
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0.0,
      avgWin: 0.0,
      avgLoss: 0.0,
      profitFactor: 0.0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      avgHoldTimeHours: 0.0,
      bestTrade: 0.0,
      worstTrade: 0.0,
      totalPnl: 0.0,
      highProbWinRate: 0.0,
      excellentSignalWinRate: 0.0,
      strongSignalWinRate: 0.0,
      volumeConfirmedWinRate: 0.0,
      breakoutConfirmedWinRate: 0.0,
      momentumConfirmedWinRate: 0.0
    });
  }

  // Public API methods
  
  getActiveTrades() {
    return Array.from(this.activeTrades.entries()).map(([id, trade]) => ({
      id,
      pair: trade.pair,
      entryTime: trade.entryTime,
      entryPrice: trade.entryPrice,
      confidence: trade.signalConfidence,
      quality: trade.signalStrength,
      isHighProbability: trade.isHighProbability
    }));
  }

  getRecentTrades(count = 20) {
    return this.completedTrades.slice(-count).map(trade => ({
      pair: trade.pair,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      pnl: trade.pnlPercentage,
      isWinner: trade.isWinner,
      confidence: trade.signalConfidence,
      quality: trade.signalStrength,
      isHighProbability: trade.isHighProbability
    }));
  }
}

/**
 * Real-time Performance Monitor with alerts
 */
class RealTimePerformanceMonitor {
  constructor(optimizer) {
    this.optimizer = optimizer;
    this.alertThresholds = {
      consecutiveLosses: 3,
      winRateDrop: 0.10, // Alert if win rate drops 10% below target
      drawdownLimit: 0.15 // Alert if drawdown exceeds 15%
    };
    this.monitoring = false;
  }

  async startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    logger.info('📊 Real-time performance monitoring started');
    
    while (this.monitoring) {
      try {
        // Check every 5 minutes
        await this._sleep(5 * 60 * 1000);
        
        const currentMetrics = await this.optimizer.getCurrentPerformance();
        await this._checkPerformanceAlerts(currentMetrics);
        
      } catch (error) {
        logger.error(`Error in performance monitoring: ${error.message}`);
        await this._sleep(60 * 1000); // Wait 1 minute before retry
      }
    }
  }

  stopMonitoring() {
    this.monitoring = false;
    logger.info('📊 Real-time performance monitoring stopped');
  }

  async _checkPerformanceAlerts(metrics) {
    // Consecutive losses alert
    if (metrics.maxConsecutiveLosses >= this.alertThresholds.consecutiveLosses) {
      logger.warning(`🚨 ALERT: ${metrics.maxConsecutiveLosses} consecutive losses detected!`);
    }
    
    // Win rate drop alert
    const targetWinRate = this.optimizer.optimizationTargets.targetWinRate;
    if (metrics.winRate < targetWinRate - this.alertThresholds.winRateDrop) {
      logger.warning(`🚨 ALERT: Win rate (${(metrics.winRate * 100).toFixed(1)}%) significantly below target (${(targetWinRate * 100).toFixed(1)}%)`);
    }
    
    // Recent performance check
    if (this.optimizer.completedTrades.length >= 10) {
      const recentTrades = this.optimizer.completedTrades.slice(-10);
      const recentWinRate = recentTrades.filter(t => t.isWinner).length / recentTrades.length;
      
      if (recentWinRate < 0.6) { // Less than 60% in last 10 trades
        logger.warning(`🚨 ALERT: Recent performance declining (${(recentWinRate * 100).toFixed(1)}% in last 10 trades)`);
      }
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { 
  PerformanceOptimizer, 
  RealTimePerformanceMonitor,
  TradeOutcome, 
  PerformanceMetrics 
}; 