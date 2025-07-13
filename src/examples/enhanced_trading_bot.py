#!/usr/bin/env python3
"""
Enhanced Trading Bot Example
Demonstrates how to use the enhanced market-adaptive API with proper strategy execution.
"""

import requests
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('enhanced_trading_bot.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class EnhancedTradingBot:
    """
    Enhanced trading bot that uses the market-adaptive API to make intelligent trading decisions.
    """
    
    def __init__(self, api_key: str, base_url: str = "http://localhost:3000", 
                 risk_level: str = "balanced", account_balance: float = 10000):
        self.api_key = api_key
        self.base_url = base_url
        self.risk_level = risk_level
        self.account_balance = account_balance
        self.positions = []
        self.trade_history = []
        
        # Risk management settings
        self.max_portfolio_risk = 0.20  # 20% max portfolio risk
        self.max_position_size = 0.05   # 5% max single position
        self.correlation_threshold = 0.7  # 70% correlation limit
        
        # Strategy settings
        self.confidence_threshold = 50  # Minimum confidence for trades
        self.max_positions = 5  # Maximum concurrent positions
        
        logger.info(f"Enhanced Trading Bot initialized with {risk_level} risk level")
        logger.info(f"Account Balance: ${account_balance:,.2f}")
    
    def get_enhanced_signal(self, symbol: str, timeframe: str = "1h") -> Dict[str, Any]:
        """Get enhanced signal from the API"""
        try:
            url = f"{self.base_url}/api/v1/signal"
            headers = {
                'Content-Type': 'application/json',
                'X-API-Key': self.api_key
            }
            payload = {
                'symbol': symbol,
                'timeframe': timeframe,
                'risk_level': self.risk_level,
                'include_reasoning': True
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting signal for {symbol}: {e}")
            return None
    
    def get_bot_instructions(self, symbol: str, timeframe: str = "1h") -> Dict[str, Any]:
        """Get bot-specific execution instructions"""
        try:
            url = f"{self.base_url}/api/v1/bot-instructions"
            headers = {
                'Content-Type': 'application/json',
                'X-API-Key': self.api_key
            }
            payload = {
                'symbol': symbol,
                'timeframe': timeframe,
                'risk_level': self.risk_level,
                'bot_type': 'python'
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting bot instructions for {symbol}: {e}")
            return None
    
    def validate_strategy(self, signal: Dict[str, Any]) -> Dict[str, Any]:
        """Validate strategy before execution"""
        try:
            url = f"{self.base_url}/api/v1/validate-strategy"
            headers = {
                'Content-Type': 'application/json',
                'X-API-Key': self.api_key
            }
            payload = {
                'signal': signal,
                'risk_params': {
                    'confidence_threshold': self.confidence_threshold,
                    'max_position_size': self.max_position_size,
                    'max_portfolio_risk': self.max_portfolio_risk
                },
                'account_balance': self.account_balance,
                'existing_positions': self.positions
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error validating strategy: {e}")
            return {'valid': False, 'error': str(e)}
    
    def execute_strategy(self, symbol: str, instructions: Dict[str, Any]) -> bool:
        """Execute trading strategy based on bot instructions"""
        try:
            signal_summary = instructions['signal_summary']
            execution_instructions = instructions['execution_instructions']
            
            logger.info(f"Executing {signal_summary['action']} strategy for {symbol}")
            logger.info(f"Market Phase: {signal_summary['market_phase']}")
            logger.info(f"Strategy Type: {signal_summary['strategy_type']}")
            logger.info(f"Confidence: {signal_summary['confidence']}%")
            
            # Get execution details
            position_mgmt = execution_instructions['position_management']
            risk_mgmt = execution_instructions['risk_management']
            
            # Execute based on market phase and strategy
            market_phase = signal_summary['market_phase']
            action = signal_summary['action']
            
            if market_phase == 'ACCUMULATION':
                return self.execute_accumulation_strategy(symbol, position_mgmt, risk_mgmt)
            elif market_phase == 'DISTRIBUTION':
                return self.execute_distribution_strategy(symbol, position_mgmt, risk_mgmt)
            elif market_phase == 'MARKUP':
                return self.execute_markup_strategy(symbol, position_mgmt, risk_mgmt)
            elif market_phase == 'MARKDOWN':
                return self.execute_markdown_strategy(symbol, position_mgmt, risk_mgmt)
            elif market_phase == 'CONSOLIDATION':
                return self.execute_consolidation_strategy(symbol, position_mgmt, risk_mgmt)
            else:
                return self.execute_neutral_strategy(symbol, position_mgmt, risk_mgmt)
                
        except Exception as e:
            logger.error(f"Error executing strategy for {symbol}: {e}")
            return False
    
    def execute_accumulation_strategy(self, symbol: str, position_mgmt: Dict, risk_mgmt: Dict) -> bool:
        """Execute accumulation strategy with scaled entry"""
        logger.info(f"Executing accumulation strategy for {symbol}")
        
        entry_method = position_mgmt['entry_method']
        position_size = position_mgmt['position_size']['percentage']
        
        if entry_method['type'] == 'scaled_entry':
            # Implement scaled entry logic
            scaling_levels = position_mgmt['scaling_levels']
            
            for i, level in enumerate(scaling_levels):
                order_size = position_size * (level['percentage'] / 100)
                price_offset = float(level['price_offset'].replace('%', '')) / 100
                
                # Simulate order placement
                order = {
                    'symbol': symbol,
                    'side': 'buy',
                    'amount': order_size,
                    'price_offset': price_offset,
                    'type': 'limit',
                    'delay': i * 900,  # 15 minutes between orders
                    'timestamp': datetime.now()
                }
                
                logger.info(f"Placing accumulation order {i+1}: {order_size:.4f} at {price_offset:.2%} offset")
                
                # In real implementation, place actual order here
                self.simulate_order_placement(order, risk_mgmt)
                
                # Delay between orders
                if i < len(scaling_levels) - 1:
                    time.sleep(5)  # Simulate delay (reduced for demo)
        
        return True
    
    def execute_distribution_strategy(self, symbol: str, position_mgmt: Dict, risk_mgmt: Dict) -> bool:
        """Execute distribution strategy with risk-off positioning"""
        logger.info(f"Executing distribution strategy for {symbol}")
        
        # Check if we have existing positions to exit
        existing_position = self.get_position(symbol)
        
        if existing_position:
            # Exit existing position
            logger.info(f"Exiting existing position in {symbol}")
            self.simulate_position_exit(existing_position, 'distribution_exit')
        
        # Consider short opportunity if confidence is high
        if position_mgmt['position_size']['percentage'] > 0:
            order = {
                'symbol': symbol,
                'side': 'sell',
                'amount': position_mgmt['position_size']['percentage'],
                'type': 'market',
                'timestamp': datetime.now()
            }
            
            logger.info(f"Placing distribution short order: {order['amount']:.4f}")
            self.simulate_order_placement(order, risk_mgmt)
        
        return True
    
    def execute_markup_strategy(self, symbol: str, position_mgmt: Dict, risk_mgmt: Dict) -> bool:
        """Execute markup strategy with trend following"""
        logger.info(f"Executing markup strategy for {symbol}")
        
        entry_method = position_mgmt['entry_method']
        
        if entry_method['type'] == 'immediate_entry':
            # Immediate market entry for strong trends
            order = {
                'symbol': symbol,
                'side': 'buy',
                'amount': position_mgmt['position_size']['percentage'],
                'type': 'market',
                'timestamp': datetime.now()
            }
            
            logger.info(f"Placing immediate trend-following order: {order['amount']:.4f}")
            self.simulate_order_placement(order, risk_mgmt)
        
        return True
    
    def execute_markdown_strategy(self, symbol: str, position_mgmt: Dict, risk_mgmt: Dict) -> bool:
        """Execute markdown strategy with defensive positioning"""
        logger.info(f"Executing markdown strategy for {symbol}")
        
        # Exit long positions if any
        existing_position = self.get_position(symbol)
        if existing_position and existing_position['side'] == 'long':
            logger.info(f"Exiting long position in {symbol} due to markdown phase")
            self.simulate_position_exit(existing_position, 'markdown_exit')
        
        # Consider short opportunity for oversold bounce
        if position_mgmt['position_size']['percentage'] > 0:
            order = {
                'symbol': symbol,
                'side': 'sell',
                'amount': position_mgmt['position_size']['percentage'],
                'type': 'limit',
                'timestamp': datetime.now()
            }
            
            logger.info(f"Placing markdown short order: {order['amount']:.4f}")
            self.simulate_order_placement(order, risk_mgmt)
        
        return True
    
    def execute_consolidation_strategy(self, symbol: str, position_mgmt: Dict, risk_mgmt: Dict) -> bool:
        """Execute consolidation strategy with range trading"""
        logger.info(f"Executing consolidation strategy for {symbol}")
        
        entry_method = position_mgmt['entry_method']
        
        if entry_method['type'] == 'limit_entry':
            # Range trading with limit orders
            order = {
                'symbol': symbol,
                'side': 'buy',
                'amount': position_mgmt['position_size']['percentage'],
                'type': 'limit',
                'price_offset': float(entry_method.get('price_offset', '-0.1%').replace('%', '')) / 100,
                'timestamp': datetime.now()
            }
            
            logger.info(f"Placing range trading order: {order['amount']:.4f} at {order['price_offset']:.2%} offset")
            self.simulate_order_placement(order, risk_mgmt)
        
        return True
    
    def execute_neutral_strategy(self, symbol: str, position_mgmt: Dict, risk_mgmt: Dict) -> bool:
        """Execute neutral strategy with opportunistic approach"""
        logger.info(f"Executing neutral strategy for {symbol}")
        
        # Conservative approach - only trade with high confidence
        if position_mgmt['position_size']['percentage'] > 0:
            order = {
                'symbol': symbol,
                'side': 'buy',
                'amount': position_mgmt['position_size']['percentage'] * 0.5,  # Reduce size for neutral
                'type': 'limit',
                'timestamp': datetime.now()
            }
            
            logger.info(f"Placing neutral opportunity order: {order['amount']:.4f}")
            self.simulate_order_placement(order, risk_mgmt)
        
        return True
    
    def simulate_order_placement(self, order: Dict, risk_mgmt: Dict) -> bool:
        """Simulate order placement (replace with actual broker API)"""
        try:
            # Calculate position value
            position_value = self.account_balance * order['amount']
            
            # Create position record
            position = {
                'symbol': order['symbol'],
                'side': 'long' if order['side'] == 'buy' else 'short',
                'amount': order['amount'],
                'value': position_value,
                'entry_price': 50000,  # Simulated price
                'stop_loss': risk_mgmt['stop_loss']['price'],
                'take_profit_levels': risk_mgmt['take_profit']['levels'],
                'timestamp': order['timestamp'],
                'status': 'open'
            }
            
            # Add to positions
            self.positions.append(position)
            
            # Add to trade history
            trade = {
                'symbol': order['symbol'],
                'action': 'open',
                'side': position['side'],
                'amount': order['amount'],
                'price': position['entry_price'],
                'timestamp': order['timestamp']
            }
            
            self.trade_history.append(trade)
            
            logger.info(f"✅ Order placed: {order['side'].upper()} {order['amount']:.4f} {order['symbol']}")
            logger.info(f"💰 Position value: ${position_value:,.2f}")
            logger.info(f"🛡️ Stop loss: ${risk_mgmt['stop_loss']['price']:,.2f}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error simulating order placement: {e}")
            return False
    
    def simulate_position_exit(self, position: Dict, reason: str) -> bool:
        """Simulate position exit"""
        try:
            # Remove from positions
            self.positions = [p for p in self.positions if p != position]
            
            # Add to trade history
            trade = {
                'symbol': position['symbol'],
                'action': 'close',
                'side': position['side'],
                'amount': position['amount'],
                'price': position['entry_price'] * 1.02,  # Simulated 2% profit
                'reason': reason,
                'timestamp': datetime.now()
            }
            
            self.trade_history.append(trade)
            
            logger.info(f"🔄 Position closed: {position['side'].upper()} {position['amount']:.4f} {position['symbol']}")
            logger.info(f"📊 Reason: {reason}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error simulating position exit: {e}")
            return False
    
    def get_position(self, symbol: str) -> Optional[Dict]:
        """Get existing position for symbol"""
        for position in self.positions:
            if position['symbol'] == symbol:
                return position
        return None
    
    def analyze_symbol(self, symbol: str) -> bool:
        """Analyze a symbol and execute appropriate strategy"""
        logger.info(f"🔍 Analyzing {symbol}")
        
        # Get enhanced signal
        signal = self.get_enhanced_signal(symbol)
        if not signal:
            logger.warning(f"Could not get signal for {symbol}")
            return False
        
        # Check confidence threshold
        if signal['confidence'] < self.confidence_threshold:
            logger.info(f"⚠️ Signal confidence ({signal['confidence']}%) below threshold ({self.confidence_threshold}%)")
            return False
        
        # Get bot instructions
        instructions = self.get_bot_instructions(symbol)
        if not instructions:
            logger.warning(f"Could not get bot instructions for {symbol}")
            return False
        
        # Validate strategy
        validation = self.validate_strategy(signal)
        if not validation.get('valid', False):
            logger.warning(f"❌ Strategy validation failed for {symbol}")
            logger.warning(f"Validation details: {validation}")
            return False
        
        # Check position limits
        if len(self.positions) >= self.max_positions:
            logger.info(f"📊 Maximum positions ({self.max_positions}) reached")
            return False
        
        # Execute strategy
        success = self.execute_strategy(symbol, instructions)
        
        if success:
            logger.info(f"✅ Strategy executed successfully for {symbol}")
        else:
            logger.error(f"❌ Strategy execution failed for {symbol}")
        
        return success
    
    def run_trading_cycle(self, symbols: List[str]):
        """Run one complete trading cycle"""
        logger.info("🚀 Starting trading cycle")
        logger.info(f"📊 Analyzing {len(symbols)} symbols")
        
        # Display current portfolio status
        self.display_portfolio_status()
        
        # Analyze each symbol
        for symbol in symbols:
            try:
                self.analyze_symbol(symbol)
                time.sleep(2)  # Rate limiting
                
            except Exception as e:
                logger.error(f"Error analyzing {symbol}: {e}")
                continue
        
        # Display updated portfolio status
        self.display_portfolio_status()
        
        logger.info("🏁 Trading cycle completed")
    
    def display_portfolio_status(self):
        """Display current portfolio status"""
        logger.info("📊 Portfolio Status:")
        logger.info(f"💰 Account Balance: ${self.account_balance:,.2f}")
        logger.info(f"📈 Open Positions: {len(self.positions)}")
        logger.info(f"📋 Total Trades: {len(self.trade_history)}")
        
        if self.positions:
            total_value = sum(p['value'] for p in self.positions)
            logger.info(f"💼 Total Position Value: ${total_value:,.2f}")
            
            for position in self.positions:
                logger.info(f"   {position['symbol']}: {position['side'].upper()} ${position['value']:,.2f}")
    
    def run_continuous_trading(self, symbols: List[str], cycle_interval: int = 300):
        """Run continuous trading with specified interval"""
        logger.info(f"🔄 Starting continuous trading with {cycle_interval}s intervals")
        
        try:
            while True:
                self.run_trading_cycle(symbols)
                logger.info(f"😴 Sleeping for {cycle_interval} seconds...")
                time.sleep(cycle_interval)
                
        except KeyboardInterrupt:
            logger.info("⏹️ Trading stopped by user")
        except Exception as e:
            logger.error(f"❌ Continuous trading error: {e}")
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get trading performance summary"""
        if not self.trade_history:
            return {'message': 'No trades executed yet'}
        
        trades_df = pd.DataFrame(self.trade_history)
        
        total_trades = len(trades_df)
        open_trades = len(trades_df[trades_df['action'] == 'open'])
        closed_trades = len(trades_df[trades_df['action'] == 'close'])
        
        return {
            'total_trades': total_trades,
            'open_trades': open_trades,
            'closed_trades': closed_trades,
            'symbols_traded': trades_df['symbol'].nunique(),
            'account_balance': self.account_balance,
            'open_positions': len(self.positions),
            'last_trade': trades_df.iloc[-1].to_dict() if not trades_df.empty else None
        }

def main():
    """Main function to run the enhanced trading bot"""
    
    # Configuration
    config = {
        'api_key': 'your-api-key-here',  # Replace with your actual API key
        'base_url': 'http://localhost:3000',
        'risk_level': 'balanced',  # conservative, balanced, aggressive
        'account_balance': 10000,
        'symbols': ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'],
        'cycle_interval': 300,  # 5 minutes
        'run_continuous': False  # Set to True for continuous trading
    }
    
    print("🤖 Enhanced Trading Bot")
    print("=" * 50)
    print(f"Risk Level: {config['risk_level'].upper()}")
    print(f"Account Balance: ${config['account_balance']:,.2f}")
    print(f"Symbols: {', '.join(config['symbols'])}")
    print("=" * 50)
    
    # Create and run the bot
    bot = EnhancedTradingBot(
        api_key=config['api_key'],
        base_url=config['base_url'],
        risk_level=config['risk_level'],
        account_balance=config['account_balance']
    )
    
    try:
        if config['run_continuous']:
            bot.run_continuous_trading(config['symbols'], config['cycle_interval'])
        else:
            # Run single cycle
            bot.run_trading_cycle(config['symbols'])
            
            # Display performance summary
            performance = bot.get_performance_summary()
            print("\n📊 Performance Summary:")
            print(json.dumps(performance, indent=2, default=str))
            
    except KeyboardInterrupt:
        print("\n⏹️ Bot stopped by user")
    except Exception as e:
        print(f"\n❌ Bot error: {e}")
        logger.error(f"Bot error: {e}")

if __name__ == "__main__":
    main() 