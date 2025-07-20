  
  class MomentumTradingOrchestrator {
    constructor(momentumService, entryFilter) {
      this.momentumService = momentumService;
      this.entryFilter = entryFilter;
      this.activePairs = new Set();
      this.monitoringActive = false;
      this.tradeHistory = [];
      this.winRateTracker = {
        total_trades: 0,
        winning_trades: 0,
        current_win_rate: 0,
        target_win_rate: 0.8
      };
      this.lastScanTime = 0;
    }
  
    async startMomentumTrading(pairs = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']) {
      this.activePairs = new Set(pairs);
      this.monitoringActive = true;
      
      console.log(`Starting momentum trading for ${pairs.length} pairs`);
      console.log(`Target win rate: ${this.winRateTracker.target_win_rate * 100}%`);
      
      // Start main trading loop
      await this.runTradingLoop();
    }
  
    async runTradingLoop() {
      while (this.monitoringActive) {
        try {
          const loopStartTime = Date.now();
          
          // Scan all active pairs
          const scanResults = await this.scanPairsForOpportunities();
          
          // Process high-quality opportunities
          for (const opportunity of scanResults.opportunities) {
            await this.processTradeOpportunity(opportunity);
          }
          
          // Update performance metrics
          this.updatePerformanceMetrics();
          
          // Adaptive delay based on market conditions
          const processingTime = Date.now() - loopStartTime;
          const minDelay = 30000; // 30 seconds minimum
          const delay = Math.max(minDelay, processingTime * 2);
          
          await this.sleep(delay);
          
        } catch (error) {
          console.error('Error in trading loop:', error);
          await this.sleep(60000); // Wait 1 minute on error
        }
      }
    }
  
    async scanPairsForOpportunities() {
      const opportunities = [];
      const scanResults = {
        pairs_scanned: 0,
        signals_generated: 0,
        opportunities: []
      };
      
      for (const pair of this.activePairs) {
        try {
          // Generate momentum signal
          const momentumSignal = await this.momentumService.generateMomentumSignal(pair);
          scanResults.signals_generated++;
          
          // Evaluate with entry filter
          const mockTaapiData = this.createMockTaapiData(momentumSignal);
          const mockMarketData = this.createMockMarketData();
          
          const entryMetrics = await this.entryFilter.evaluateEntryQuality(pair, mockTaapiData, mockMarketData);
          
          // Check if trade should be executed
          if (this.shouldExecuteTrade(momentumSignal, entryMetrics)) {
            opportunities.push({
              pair: pair,
              momentum_signal: momentumSignal,
              entry_metrics: entryMetrics,
              priority: this.calculateOpportunityPriority(entryMetrics)
            });
          }
          
          scanResults.pairs_scanned++;
          
        } catch (error) {
          console.error(`Error scanning ${pair}:`, error);
        }
      }
      
      // Sort opportunities by priority
      opportunities.sort((a, b) => b.priority - a.priority);
      scanResults.opportunities = opportunities;
      
      return scanResults;
    }
  
    async processTradeOpportunity(opportunity) {
      const { pair, momentum_signal, entry_metrics } = opportunity;
      
      try {
        console.log(`Processing trade opportunity for ${pair}`);
        console.log(`- Confidence: ${momentum_signal.confidence.toFixed(1)}%`);
        console.log(`- Entry Quality: ${entry_metrics.signal_strength}`);
        console.log(`- High Probability: ${entry_metrics.is_high_probability}`);
        
        // Execute trade (simulation mode)
        const tradeResult = await this.executeTrade(pair, momentum_signal, entry_metrics);
        
        // Track trade
        this.trackTradeExecution(pair, momentum_signal, entry_metrics, tradeResult);
        
      } catch (error) {
        console.error(`Error processing trade for ${pair}:`, error);
      }
    }
  
    shouldExecuteTrade(momentumSignal, entryMetrics) {
      // Primary quality gate
      if (!entryMetrics.is_high_probability) return false;
      
      // Signal strength requirement
      if (!['STRONG', 'EXCELLENT'].includes(entryMetrics.signal_strength)) return false;
      
      // Confidence threshold - 🎯 DANISH PURE MODE: Lowered from 60 to 55
      if (momentumSignal.confidence < 55) return false;
      
      // Volume confirmation requirement
      if (!entryMetrics.has_volume_confirmation) return false;
      
      // Breakout confirmation requirement
      if (!entryMetrics.has_breakout_confirmation) return false;
      
      // Risk factors check
      const criticalRisks = ["RSI overbought", "Weak money flow"];
      for (const risk of entryMetrics.risk_factors) {
        if (criticalRisks.some(critical => risk.includes(critical))) return false;
      }
      
      return true;
    }
  
    async executeTrade(pair, signal, metrics) {
      // Simulation mode - would integrate with actual bot execution
      const result = {
        success: true,
        pair: pair,
        action: signal.action,
        entry_price: 50000, // Mock price
        position_size: 0.02,
        timestamp: new Date()
      };
      
      console.log(`SIMULATION: Would execute ${signal.action} for ${pair}`);
      console.log(`Entry Price: ${result.entry_price}`);
      console.log(`Position Size: ${result.position_size * 100}%`);
      
      return result;
    }
  
    calculateOpportunityPriority(entryMetrics) {
      let priority = entryMetrics.overall_score;
      
      // Bonus for high probability signals
      if (entryMetrics.is_high_probability) priority += 10;
      
      // Bonus for excellent signals
      if (entryMetrics.signal_strength === 'EXCELLENT') priority += 15;
      
      // Bonus for good risk-reward
      if (entryMetrics.risk_reward_ratio >= 3.0) priority += 5;
      
      return priority;
    }
  
    trackTradeExecution(pair, signal, metrics, result) {
      const tradeRecord = {
        pair: pair,
        timestamp: new Date(),
        signal_confidence: signal.confidence,
        entry_quality_score: metrics.overall_score,
        signal_strength: metrics.signal_strength,
        is_high_probability: metrics.is_high_probability,
        execution_success: result.success,
        entry_timing: metrics.entry_timing,
        breakout_type: signal.momentum_data?.breakout_type || 'UNKNOWN',
        risk_reward_ratio: metrics.risk_reward_ratio
      };
      
      this.tradeHistory.push(tradeRecord);
      
      // Update win rate tracking
      if (result.success) {
        this.winRateTracker.total_trades++;
        // In real implementation, would track actual trade outcomes
      }
    }
  
    updatePerformanceMetrics() {
      if (this.tradeHistory.length > 0) {
        const successfulTrades = this.tradeHistory.filter(t => t.execution_success).length;
        this.winRateTracker.current_win_rate = successfulTrades / this.tradeHistory.length;
      }
    }
  
    createMockTaapiData(signal) {
      return {
        primary: {
          rsi: { value: 55 },
          macd: { valueMACD: 100, valueMACDSignal: 90, valueMACDHist: 10 },
          ema20: { value: 49000 },
          ema50: { value: 48000 },
          ema200: { value: 45000 },
          mfi: { value: 60 },
          adx: { value: 30 },
          squeeze: { value: 0.1 },
          bbands: { valueUpperBand: 51000, valueMiddleBand: 50000, valueLowerBand: 49000 },
          stochrsi: { valueFastK: 60, valueFastD: 55 },
          williams: { value: -40 },
          atr: { value: 1000 },
          volume: { value: 1000000 },
          obv: { value: 5000000 }
        },
        short_term: {
          rsi: { value: 58 },
          macd: { valueMACD: 80, valueMACDSignal: 75, valueMACDHist: 5 }
        },
        long_term: {
          rsi: { value: 52 },
          macd: { valueMACD: 120, valueMACDSignal: 110, valueMACDHist: 10 }
        }
      };
    }
  
    createMockMarketData() {
      return {
        current_price: 50000,
        volume_analysis: { volume_spike_ratio: 1.8 },
        price_momentum: { '1h': 0.8, '4h': 1.2 }
      };
    }
  
    async stopTrading() {
      this.monitoringActive = false;
      console.log('Momentum trading system stopped');
    }
  
    getPerformanceReport() {
      return {
        total_trades: this.winRateTracker.total_trades,
        current_win_rate: this.winRateTracker.current_win_rate,
        target_win_rate: this.winRateTracker.target_win_rate,
        active_pairs: Array.from(this.activePairs),
        recent_trades: this.tradeHistory.slice(-10),
        trade_history_length: this.tradeHistory.length
      };
    }
  
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }
  
  module.exports = {
    MomentumTradingOrchestrator
  };