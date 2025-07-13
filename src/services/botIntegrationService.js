const logger = require('../utils/logger');

class BotIntegrationService {
  constructor() {
    this.strategyMappings = {
      // Market Phase Strategy Mappings
      'ACCUMULATION': {
        'BUY': 'gradual_accumulation',
        'SELL': 'risk_management_exit',
        'HOLD': 'accumulation_wait'
      },
      'DISTRIBUTION': {
        'BUY': 'contrarian_entry',
        'SELL': 'distribution_exit',
        'HOLD': 'distribution_wait'
      },
      'MARKUP': {
        'BUY': 'trend_following',
        'SELL': 'profit_taking',
        'HOLD': 'momentum_wait'
      },
      'MARKDOWN': {
        'BUY': 'oversold_bounce',
        'SELL': 'trend_following_short',
        'HOLD': 'defensive_hold'
      },
      'CONSOLIDATION': {
        'BUY': 'range_support_buy',
        'SELL': 'range_resistance_sell',
        'HOLD': 'breakout_wait'
      },
      'NEUTRAL': {
        'BUY': 'opportunistic_entry',
        'SELL': 'opportunistic_exit',
        'HOLD': 'market_neutral'
      }
    };

    this.executionProfiles = {
      'conservative': {
        max_position_size: 0.02, // 2% of portfolio
        entry_method: 'scaled_entry',
        exit_method: 'scaled_exit',
        stop_loss_type: 'trailing',
        take_profit_levels: 3,
        risk_per_trade: 0.01
      },
      'balanced': {
        max_position_size: 0.05, // 5% of portfolio
        entry_method: 'standard_entry',
        exit_method: 'level_based_exit',
        stop_loss_type: 'fixed',
        take_profit_levels: 3,
        risk_per_trade: 0.02
      },
      'aggressive': {
        max_position_size: 0.10, // 10% of portfolio
        entry_method: 'immediate_entry',
        exit_method: 'momentum_exit',
        stop_loss_type: 'dynamic',
        take_profit_levels: 2,
        risk_per_trade: 0.03
      }
    };
  }

  translateSignalToBotInstructions(signal, riskParams, marketContext) {
    const marketPhase = marketContext.market_regime.market_phase;
    const strategy = this.strategyMappings[marketPhase][signal.signal];
    const riskLevel = riskParams.risk_level;
    const executionProfile = this.executionProfiles[riskLevel];

    return {
      // Core Trading Instructions
      trading_instruction: {
        action: signal.signal,
        strategy_type: strategy,
        confidence: signal.confidence,
        strength: signal.strength,
        market_phase: marketPhase,
        priority: this.calculatePriority(signal, marketContext)
      },

      // Position Management
      position_management: {
        entry_price: signal.entry_price,
        position_size: this.calculatePositionSize(signal, executionProfile, riskParams),
        entry_method: this.getEntryMethod(strategy, executionProfile, signal),
        max_position_value: executionProfile.max_position_size,
        scaling_levels: this.getScalingLevels(signal, strategy)
      },

      // Risk Management
      risk_management: {
        stop_loss: {
          price: signal.stop_loss,
          type: executionProfile.stop_loss_type,
          trail_distance: this.calculateTrailDistance(signal, marketContext),
          max_loss_percent: executionProfile.risk_per_trade
        },
        take_profit: {
          levels: [
            { price: signal.take_profit_1, size_percent: 30 },
            { price: signal.take_profit_2, size_percent: 50 },
            { price: signal.take_profit_3, size_percent: 20 }
          ],
          method: executionProfile.exit_method,
          trailing_profit: this.shouldUseTrailingProfit(strategy, marketContext)
        },
        position_timeout: this.getPositionTimeout(strategy, marketContext),
        emergency_exit_conditions: this.getEmergencyExitConditions(marketContext)
      },

      // Execution Timing
      execution_timing: {
        urgency: this.getExecutionUrgency(signal, marketContext),
        market_hours_only: this.shouldTradeMarketHoursOnly(strategy, marketContext),
        volume_requirements: this.getVolumeRequirements(signal, marketContext),
        spread_tolerance: this.getSpreadTolerance(riskLevel, marketContext)
      },

      // Market Context
      market_context: {
        regime: marketContext.market_regime,
        volatility_environment: marketContext.market_regime.volatility_regime,
        trend_alignment: marketContext.market_regime.primary_trend === marketContext.market_regime.secondary_trend,
        sentiment_backdrop: this.getSentimentBackdrop(marketContext),
        liquidity_conditions: this.getLiquidityConditions(marketContext)
      },

      // Bot-Specific Instructions
      bot_instructions: {
        python_bot: this.generatePythonBotInstructions(signal, strategy, executionProfile, marketContext),
        ninjatrader: this.generateNinjaTraderInstructions(signal, strategy, executionProfile, marketContext),
        mt4_mt5: this.generateMT4MT5Instructions(signal, strategy, executionProfile, marketContext),
        custom_api: this.generateCustomAPIInstructions(signal, strategy, executionProfile, marketContext)
      },

      // Monitoring Instructions
      monitoring: {
        key_levels: this.getKeyMonitoringLevels(signal, marketContext),
        indicators_to_watch: this.getIndicatorsToWatch(strategy, marketContext),
        exit_signals: this.getExitSignalConditions(strategy, marketContext),
        rebalance_triggers: this.getRebalanceTriggers(strategy, marketContext)
      },

      // Validation and Safety
      validation: {
        pre_trade_checks: this.getPreTradeChecks(signal, riskParams, marketContext),
        position_limits: this.getPositionLimits(riskParams, marketContext),
        correlation_checks: this.getCorrelationChecks(riskParams),
        drawdown_limits: this.getDrawdownLimits(riskParams)
      },

      timestamp: Date.now()
    };
  }

  calculatePriority(signal, marketContext) {
    let priority = 'MEDIUM';
    
    if (signal.confidence > 75 && signal.strength === 'STRONG') {
      priority = 'HIGH';
    } else if (signal.confidence < 45 || signal.strength === 'WEAK') {
      priority = 'LOW';
    }

    // Adjust based on market conditions
    if (marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY') {
      priority = priority === 'HIGH' ? 'MEDIUM' : 'LOW';
    }

    return priority;
  }

  calculatePositionSize(signal, executionProfile, riskParams) {
    const baseSize = Math.min(
      signal.position_size_percent / 100,
      executionProfile.max_position_size
    );

    // Adjust for confidence
    const confidenceMultiplier = signal.confidence / 100;
    
    // Adjust for risk validation
    const riskMultiplier = riskParams.risk_validation?.approved ? 1.0 : 0.5;

    return {
      percentage: baseSize * confidenceMultiplier * riskMultiplier,
      dollar_amount: null, // To be calculated by bot based on account size
      shares: null, // To be calculated by bot based on price
      max_percentage: executionProfile.max_position_size,
      confidence_adjusted: true,
      risk_adjusted: true
    };
  }

  getEntryMethod(strategy, executionProfile, signal) {
    const methods = {
      'gradual_accumulation': {
        type: 'scaled_entry',
        orders: 3,
        spacing: '2%',
        timeframe: '15min'
      },
      'trend_following': {
        type: 'immediate_entry',
        orders: 1,
        condition: 'market_order'
      },
      'range_support_buy': {
        type: 'limit_entry',
        orders: 1,
        price_offset: '-0.1%'
      },
      'contrarian_entry': {
        type: 'scaled_entry',
        orders: 2,
        spacing: '1%',
        timeframe: '5min'
      },
      'oversold_bounce': {
        type: 'limit_entry',
        orders: 1,
        price_offset: '+0.05%'
      }
    };

    return methods[strategy] || {
      type: executionProfile.entry_method,
      orders: 1,
      condition: 'market_order'
    };
  }

  getScalingLevels(signal, strategy) {
    if (strategy === 'gradual_accumulation') {
      return [
        { percentage: 40, price_offset: '0%' },
        { percentage: 35, price_offset: '-1%' },
        { percentage: 25, price_offset: '-2%' }
      ];
    } else if (strategy === 'contrarian_entry') {
      return [
        { percentage: 60, price_offset: '0%' },
        { percentage: 40, price_offset: '-0.5%' }
      ];
    }

    return [{ percentage: 100, price_offset: '0%' }];
  }

  calculateTrailDistance(signal, marketContext) {
    const volatility = marketContext.market_regime.volatility_regime;
    const baseDistance = Math.abs(signal.entry_price - signal.stop_loss) / signal.entry_price;

    const multipliers = {
      'LOW_VOLATILITY': 0.8,
      'NORMAL_VOLATILITY': 1.0,
      'HIGH_VOLATILITY': 1.5
    };

    return baseDistance * (multipliers[volatility] || 1.0);
  }

  shouldUseTrailingProfit(strategy, marketContext) {
    const trendStrategies = ['trend_following', 'momentum_wait', 'markup_strategy'];
    const strongTrend = marketContext.market_regime.primary_trend === marketContext.market_regime.secondary_trend;
    
    return trendStrategies.includes(strategy) && strongTrend;
  }

  getPositionTimeout(strategy, marketContext) {
    const timeouts = {
      'gradual_accumulation': '7d',
      'trend_following': '3d',
      'range_support_buy': '1d',
      'distribution_exit': '2d',
      'oversold_bounce': '4h',
      'breakout_wait': '6h'
    };

    const baseTimeout = timeouts[strategy] || '1d';
    
    // Adjust for volatility
    if (marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY') {
      return this.reduceTimeout(baseTimeout);
    }

    return baseTimeout;
  }

  reduceTimeout(timeout) {
    const reductions = {
      '7d': '3d',
      '3d': '1d',
      '1d': '12h',
      '12h': '6h',
      '6h': '3h',
      '4h': '2h'
    };
    return reductions[timeout] || timeout;
  }

  getEmergencyExitConditions(marketContext) {
    return [
      {
        condition: 'volatility_spike',
        threshold: marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY' ? '50%' : '30%',
        action: 'reduce_position_50%'
      },
      {
        condition: 'correlation_breakdown',
        threshold: '0.8',
        action: 'exit_correlated_positions'
      },
      {
        condition: 'liquidity_crisis',
        threshold: 'spread_>_2%',
        action: 'hold_orders'
      },
      {
        condition: 'market_circuit_breaker',
        threshold: 'exchange_halt',
        action: 'emergency_exit_all'
      }
    ];
  }

  getExecutionUrgency(signal, marketContext) {
    if (signal.confidence > 80 && marketContext.market_regime.regime_confidence > 0.8) {
      return 'HIGH';
    } else if (signal.confidence < 50 || marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY') {
      return 'LOW';
    }
    return 'MEDIUM';
  }

  shouldTradeMarketHoursOnly(strategy, marketContext) {
    const afterHoursStrategies = ['gradual_accumulation', 'breakout_wait'];
    const highVolatility = marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY';
    
    return !afterHoursStrategies.includes(strategy) || highVolatility;
  }

  getVolumeRequirements(signal, marketContext) {
    return {
      minimum_volume: marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY' ? '2x_average' : '1.2x_average',
      volume_spike_threshold: '3x_average',
      low_volume_action: 'reduce_position_size'
    };
  }

  getSpreadTolerance(riskLevel, marketContext) {
    const baseTolerance = {
      'conservative': 0.01,
      'balanced': 0.02,
      'aggressive': 0.05
    };

    const base = baseTolerance[riskLevel] || 0.02;
    
    if (marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY') {
      return base * 2;
    }

    return base;
  }

  generatePythonBotInstructions(signal, strategy, executionProfile, marketContext) {
    return {
      framework: 'python_trading_bot',
      execution_method: 'api_call',
      code_structure: {
        signal_processing: {
          action: signal.signal,
          confidence: signal.confidence,
          strategy_type: strategy,
          risk_level: executionProfile
        },
        position_management: {
          entry_logic: this.getPythonEntryLogic(strategy, signal),
          exit_logic: this.getPythonExitLogic(strategy, signal),
          risk_management: this.getPythonRiskLogic(executionProfile, signal)
        },
        monitoring: {
          indicators: this.getPythonMonitoringCode(strategy, marketContext),
          alerts: this.getPythonAlertCode(signal, marketContext)
        }
      },
      dependencies: ['pandas', 'numpy', 'ccxt', 'ta-lib', 'requests'],
      example_implementation: this.generatePythonExample(signal, strategy, executionProfile)
    };
  }

  generateNinjaTraderInstructions(signal, strategy, executionProfile, marketContext) {
    return {
      platform: 'ninjatrader',
      execution_method: 'ati_commands',
      commands: {
        entry: this.getNinjaTraderEntryCommands(signal, strategy),
        exit: this.getNinjaTraderExitCommands(signal, strategy),
        risk_management: this.getNinjaTraderRiskCommands(executionProfile, signal)
      },
      strategy_template: this.getNinjaTraderStrategyTemplate(strategy, signal),
      automation_settings: {
        auto_execute: executionProfile.entry_method === 'immediate_entry',
        position_sizing: 'percentage_based',
        risk_per_trade: executionProfile.risk_per_trade
      }
    };
  }

  generateMT4MT5Instructions(signal, strategy, executionProfile, marketContext) {
    return {
      platform: 'mt4_mt5',
      execution_method: 'expert_advisor',
      mql_code: {
        entry_conditions: this.getMQLEntryConditions(signal, strategy),
        exit_conditions: this.getMQLExitConditions(signal, strategy),
        risk_management: this.getMQLRiskManagement(executionProfile, signal)
      },
      ea_settings: {
        magic_number: this.generateMagicNumber(strategy),
        lot_sizing: 'dynamic',
        max_spread: this.getSpreadTolerance(executionProfile.risk_per_trade, marketContext)
      }
    };
  }

  generateCustomAPIInstructions(signal, strategy, executionProfile, marketContext) {
    return {
      api_format: 'rest_json',
      webhook_compatible: true,
      payload_structure: {
        action: signal.signal,
        symbol: marketContext.symbol,
        strategy: strategy,
        position_size: this.calculatePositionSize(signal, executionProfile, {}),
        stop_loss: signal.stop_loss,
        take_profit: [signal.take_profit_1, signal.take_profit_2, signal.take_profit_3],
        metadata: {
          confidence: signal.confidence,
          market_phase: marketContext.market_regime.market_phase,
          timestamp: Date.now()
        }
      },
      authentication: {
        method: 'api_key',
        headers: ['X-API-Key', 'X-Timestamp', 'X-Signature']
      }
    };
  }

  getPythonEntryLogic(strategy, signal) {
    const logicMap = {
      'gradual_accumulation': `
# Gradual accumulation strategy
def execute_accumulation_entry(signal, position_size):
    total_size = position_size
    orders = []
    
    # Split into 3 orders
    sizes = [0.4 * total_size, 0.35 * total_size, 0.25 * total_size]
    price_offsets = [0, -0.01, -0.02]  # 0%, -1%, -2%
    
    for i, (size, offset) in enumerate(zip(sizes, price_offsets)):
        entry_price = signal['entry_price'] * (1 + offset)
        orders.append({
            'size': size,
            'price': entry_price,
            'type': 'limit',
            'delay': i * 900  # 15 min delays
        })
    
    return orders`,
      
      'trend_following': `
# Trend following strategy
def execute_trend_entry(signal, position_size):
    return [{
        'size': position_size,
        'price': signal['entry_price'],
        'type': 'market',
        'delay': 0
    }]`,
      
      'range_support_buy': `
# Range support strategy
def execute_range_entry(signal, position_size):
    entry_price = signal['entry_price'] * 0.999  # Slightly below current
    return [{
        'size': position_size,
        'price': entry_price,
        'type': 'limit',
        'delay': 0
    }]`
    };

    return logicMap[strategy] || logicMap['trend_following'];
  }

  getPythonExitLogic(strategy, signal) {
    return `
# Exit logic for ${strategy}
def execute_exit_strategy(signal, current_position):
    exit_orders = []
    
    # Take profit levels
    tp_levels = [
        {'price': signal['take_profit_1'], 'size': 0.3},
        {'price': signal['take_profit_2'], 'size': 0.5},
        {'price': signal['take_profit_3'], 'size': 0.2}
    ]
    
    for tp in tp_levels:
        exit_orders.append({
            'size': current_position * tp['size'],
            'price': tp['price'],
            'type': 'limit'
        })
    
    # Stop loss
    exit_orders.append({
        'size': current_position,
        'price': signal['stop_loss'],
        'type': 'stop'
    })
    
    return exit_orders`;
  }

  getPythonRiskLogic(executionProfile, signal) {
    return `
# Risk management for ${executionProfile.risk_per_trade * 100}% risk per trade
def calculate_position_size(account_balance, risk_per_trade, entry_price, stop_loss):
    risk_amount = account_balance * ${executionProfile.risk_per_trade}
    price_risk = abs(entry_price - stop_loss) / entry_price
    max_position_value = risk_amount / price_risk
    
    # Apply maximum position size limit
    max_allowed = account_balance * ${executionProfile.max_position_size}
    position_value = min(max_position_value, max_allowed)
    
    return position_value / entry_price  # Return shares/units`;
  }

  generatePythonExample(signal, strategy, executionProfile) {
    return `
# Example implementation for ${strategy}
import requests
import json
from datetime import datetime

class TradingBot:
    def __init__(self, api_key, account_balance):
        self.api_key = api_key
        self.account_balance = account_balance
        self.max_position_size = ${executionProfile.max_position_size}
        self.risk_per_trade = ${executionProfile.risk_per_trade}
    
    def process_signal(self, signal_data):
        # Validate signal
        if signal_data['confidence'] < 50:
            print("Signal confidence too low, skipping")
            return
        
        # Calculate position size
        position_size = self.calculate_position_size(
            signal_data['entry_price'], 
            signal_data['stop_loss']
        )
        
        # Execute based on strategy
        if signal_data['strategy_type'] == '${strategy}':
            self.execute_${strategy.replace('-', '_')}(signal_data, position_size)
    
    def calculate_position_size(self, entry_price, stop_loss):
        risk_amount = self.account_balance * self.risk_per_trade
        price_risk = abs(entry_price - stop_loss) / entry_price
        max_position_value = risk_amount / price_risk
        max_allowed = self.account_balance * self.max_position_size
        return min(max_position_value, max_allowed) / entry_price

# Usage
bot = TradingBot("your_api_key", 10000)
signal = ${JSON.stringify(signal, null, 2)}
bot.process_signal(signal)`;
  }

  getNinjaTraderEntryCommands(signal, strategy) {
    if (strategy === 'gradual_accumulation') {
      return [
        `PLACE ORDER;${signal.entry_price};${signal.position_size_percent * 0.4}%;LIMIT;BUY`,
        `PLACE ORDER;${signal.entry_price * 0.99};${signal.position_size_percent * 0.35}%;LIMIT;BUY`,
        `PLACE ORDER;${signal.entry_price * 0.98};${signal.position_size_percent * 0.25}%;LIMIT;BUY`
      ];
    }
    
    return [`PLACE ORDER;${signal.entry_price};${signal.position_size_percent}%;MARKET;${signal.signal}`];
  }

  getNinjaTraderExitCommands(signal, strategy) {
    return [
      `SET STOP LOSS;${signal.stop_loss}`,
      `SET TAKE PROFIT;${signal.take_profit_1};30%`,
      `SET TAKE PROFIT;${signal.take_profit_2};50%`,
      `SET TAKE PROFIT;${signal.take_profit_3};20%`
    ];
  }

  // Additional helper methods for other platforms...
  
  getKeyMonitoringLevels(signal, marketContext) {
    return {
      critical_support: signal.stop_loss,
      resistance_levels: [signal.take_profit_1, signal.take_profit_2, signal.take_profit_3],
      volume_threshold: '1.5x_average',
      volatility_threshold: marketContext.market_regime.volatility_regime === 'HIGH_VOLATILITY' ? '30%' : '20%'
    };
  }

  getIndicatorsToWatch(strategy, marketContext) {
    const baseIndicators = ['RSI', 'MACD', 'Volume', 'Price_Action'];
    
    const strategySpecific = {
      'trend_following': ['Moving_Averages', 'Momentum'],
      'range_support_buy': ['Bollinger_Bands', 'Support_Resistance'],
      'gradual_accumulation': ['Volume_Profile', 'On_Balance_Volume'],
      'distribution_exit': ['Distribution_Days', 'Selling_Pressure']
    };

    return [...baseIndicators, ...(strategySpecific[strategy] || [])];
  }

  getExitSignalConditions(strategy, marketContext) {
    return {
      profit_target_hit: 'close_partial_position',
      stop_loss_hit: 'close_full_position',
      strategy_invalidation: 'reassess_position',
      market_regime_change: 'adjust_strategy',
      volatility_spike: 'reduce_position_size',
      correlation_breakdown: 'hedge_position'
    };
  }

  getSentimentBackdrop(marketContext) {
    // This would integrate with the off-chain data
    return {
      fear_greed_level: 'neutral', // Would come from actual data
      funding_rates: 'balanced',
      social_sentiment: 'mixed'
    };
  }

  getLiquidityConditions(marketContext) {
    return {
      spread_environment: 'normal',
      order_book_depth: 'adequate',
      volume_profile: 'average'
    };
  }

  // Validation and safety methods
  getPreTradeChecks(signal, riskParams, marketContext) {
    return [
      'account_balance_sufficient',
      'position_size_within_limits',
      'correlation_check_passed',
      'volatility_acceptable',
      'liquidity_adequate',
      'market_hours_appropriate'
    ];
  }

  getPositionLimits(riskParams, marketContext) {
    return {
      max_single_position: riskParams.max_position_size,
      max_total_exposure: 0.8, // 80% max total exposure
      max_correlated_exposure: 0.3, // 30% max in correlated assets
      max_sector_exposure: 0.4 // 40% max in single sector
    };
  }

  getCorrelationChecks(riskParams) {
    return {
      max_correlation_threshold: 0.7,
      correlation_lookback_period: '30d',
      rebalance_trigger: 0.8
    };
  }

  getDrawdownLimits(riskParams) {
    return {
      max_portfolio_drawdown: riskParams.max_drawdown,
      daily_loss_limit: riskParams.risk_per_trade * 5, // 5 trades worth
      stop_trading_threshold: riskParams.max_drawdown * 0.8
    };
  }

  generateMagicNumber(strategy) {
    // Generate unique magic number based on strategy
    const strategyCode = strategy.split('_').map(word => word.charCodeAt(0)).join('');
    return parseInt(strategyCode.slice(0, 8));
  }
}

module.exports = new BotIntegrationService(); 