class MomentumPerformanceOptimizer {
  constructor() {
    this.tradeHistory = [];
    this.adaptiveThresholds = {
      confidence_threshold: 60,  // 🎯 DANISH PURE MODE: Lowered from 70 to 60
      confluence_threshold: 65,
      volume_threshold: 1.8
    };
    this.optimizationTargets = {
      target_win_rate: 0.8,
      target_profit_factor: 2.0,
      max_drawdown: 0.05
    };
  }

  trackTradeEntry(symbol, entryData) {
    const tradeId = `${symbol}_${Date.now()}`;
    this.tradeHistory.push({
      trade_id: tradeId,
      symbol: symbol,
      entry_time: new Date(),
      entry_price: entryData.entry_price,
      confidence: entryData.confidence,
      confluence_score: entryData.confluence_score,
      volume_confirmed: entryData.volume_confirmed,
      breakout_confirmed: entryData.breakout_confirmed,
      status: 'OPEN'
    });
    return tradeId;
  }

  trackTradeExit(tradeId, exitPrice, exitReason) {
    const trade = this.tradeHistory.find(t => t.trade_id === tradeId);
    if (trade) {
      trade.exit_time = new Date();
      trade.exit_price = exitPrice;
      trade.exit_reason = exitReason;
      trade.profit_loss = (exitPrice - trade.entry_price) / trade.entry_price;
      trade.is_winner = trade.profit_loss > 0;
      trade.status = 'CLOSED';
      
      // Update adaptive thresholds
      this.updateAdaptiveThresholds();
    }
  }

  updateAdaptiveThresholds() {
    const closedTrades = this.tradeHistory.filter(t => t.status === 'CLOSED');
    if (closedTrades.length < 10) return;

    const recentTrades = closedTrades.slice(-20);
    const winRate = recentTrades.filter(t => t.is_winner).length / recentTrades.length;
    
    // Adjust thresholds based on performance
    if (winRate < this.optimizationTargets.target_win_rate) {
      this.adaptiveThresholds.confidence_threshold = Math.min(85, this.adaptiveThresholds.confidence_threshold + 2);
      this.adaptiveThresholds.confluence_threshold = Math.min(80, this.adaptiveThresholds.confluence_threshold + 2);
    } else if (winRate > 0.9) {
      this.adaptiveThresholds.confidence_threshold = Math.max(60, this.adaptiveThresholds.confidence_threshold - 1);
      this.adaptiveThresholds.confluence_threshold = Math.max(55, this.adaptiveThresholds.confluence_threshold - 1);
    }
  }

  getPerformanceReport() {
    const closedTrades = this.tradeHistory.filter(t => t.status === 'CLOSED');
    const wins = closedTrades.filter(t => t.is_winner);
    const losses = closedTrades.filter(t => !t.is_winner);
    
    return {
      total_trades: closedTrades.length,
      win_rate: wins.length / closedTrades.length,
      avg_win: wins.reduce((sum, t) => sum + t.profit_loss, 0) / wins.length,
      avg_loss: Math.abs(losses.reduce((sum, t) => sum + t.profit_loss, 0) / losses.length),
      profit_factor: wins.reduce((sum, t) => sum + t.profit_loss, 0) / Math.abs(losses.reduce((sum, t) => sum + t.profit_loss, 0)),
      current_thresholds: this.adaptiveThresholds,
      optimization_targets: this.optimizationTargets
    };
  }

  getCurrentThresholds() {
    return this.adaptiveThresholds;
  }
}

module.exports = { MomentumPerformanceOptimizer };