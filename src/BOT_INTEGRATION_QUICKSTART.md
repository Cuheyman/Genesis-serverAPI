# Bot Integration Quick Start Guide

## Overview
This guide helps you quickly integrate your trading bot with the enhanced market-adaptive API. The API now provides sophisticated strategy recommendations that adapt to different market conditions.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
# Python
pip install requests pandas numpy

# Node.js
npm install axios

# Or any HTTP client library in your preferred language
```

### 2. Get Your API Key
- Contact the API provider for your API key
- Set it in your environment variables or configuration file

### 3. Basic API Call
```python
import requests

def get_trading_signal(symbol, risk_level='balanced'):
    url = "http://localhost:3000/api/v1/signal"
    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': 'your-api-key'
    }
    payload = {
        'symbol': symbol,
        'risk_level': risk_level,
        'include_reasoning': True
    }
    
    response = requests.post(url, headers=headers, json=payload)
    return response.json()

# Get signal
signal = get_trading_signal('BTCUSDT')
print(f"Action: {signal['signal']}")
print(f"Confidence: {signal['confidence']}%")
```

## 📊 Understanding Signals

### Signal Structure
```json
{
  "signal": "BUY",
  "confidence": 72,
  "strength": "MODERATE",
  "entry_price": 43250.50,
  "stop_loss": 42100.00,
  "take_profit_1": 44500.00,
  "take_profit_2": 45750.00,
  "take_profit_3": 47000.00,
  "position_size_percent": 3.5,
  "market_context": {
    "market_regime": {
      "market_phase": "ACCUMULATION",
      "primary_trend": "BULLISH",
      "volatility_regime": "NORMAL_VOLATILITY"
    }
  }
}
```

### Market Phases & Bot Actions

| Phase | Characteristics | Bot Strategy |
|-------|----------------|--------------|
| **ACCUMULATION** | Low volatility, building positions | Scale into positions gradually |
| **DISTRIBUTION** | High volatility, profit taking | Exit longs, consider shorts |
| **MARKUP** | Rising trend, momentum | Trend following, immediate entries |
| **MARKDOWN** | Falling trend, bearish | Defensive holds, short opportunities |
| **CONSOLIDATION** | Sideways, range-bound | Range trading, breakout preparation |

## 🤖 Bot Implementation Examples

### Simple Python Bot
```python
class SimpleTradingBot:
    def __init__(self, api_key, risk_level='balanced'):
        self.api_key = api_key
        self.risk_level = risk_level
        self.base_url = "http://localhost:3000"
    
    def get_signal(self, symbol):
        url = f"{self.base_url}/api/v1/signal"
        headers = {'X-API-Key': self.api_key}
        payload = {
            'symbol': symbol,
            'risk_level': self.risk_level
        }
        
        response = requests.post(url, headers=headers, json=payload)
        return response.json()
    
    def execute_trade(self, symbol):
        signal = self.get_signal(symbol)
        
        # Check confidence threshold
        if signal['confidence'] < 60:
            print(f"❌ Low confidence: {signal['confidence']}%")
            return
        
        # Execute based on market phase
        market_phase = signal['market_context']['market_regime']['market_phase']
        
        if market_phase == 'ACCUMULATION' and signal['signal'] == 'BUY':
            self.execute_accumulation_buy(signal)
        elif market_phase == 'DISTRIBUTION' and signal['signal'] == 'SELL':
            self.execute_distribution_sell(signal)
        elif market_phase == 'MARKUP' and signal['signal'] == 'BUY':
            self.execute_trend_following_buy(signal)
        # ... more conditions
    
    def execute_accumulation_buy(self, signal):
        # Split into multiple orders for accumulation
        total_size = signal['position_size_percent']
        orders = [
            {'size': total_size * 0.4, 'price': signal['entry_price']},
            {'size': total_size * 0.35, 'price': signal['entry_price'] * 0.99},
            {'size': total_size * 0.25, 'price': signal['entry_price'] * 0.98}
        ]
        
        for order in orders:
            print(f"📈 Placing accumulation order: {order}")
            # Place actual order with your broker API
```

### Advanced Bot with Instructions
```python
def get_bot_instructions(symbol, bot_type='python'):
    url = f"{base_url}/api/v1/bot-instructions"
    headers = {'X-API-Key': api_key}
    payload = {
        'symbol': symbol,
        'bot_type': bot_type,
        'risk_level': 'balanced'
    }
    
    response = requests.post(url, headers=headers, json=payload)
    return response.json()

# Get detailed instructions
instructions = get_bot_instructions('BTCUSDT')

# Access specific guidance
entry_method = instructions['execution_instructions']['position_management']['entry_method']
risk_management = instructions['execution_instructions']['risk_management']
monitoring = instructions['execution_instructions']['monitoring']

print(f"Entry Method: {entry_method['type']}")
print(f"Stop Loss: {risk_management['stop_loss']['price']}")
print(f"Take Profit Levels: {len(risk_management['take_profit']['levels'])}")
```

## 🛡️ Risk Management Integration

### Position Sizing
```python
def calculate_position_size(signal, account_balance, max_risk=0.02):
    # Risk-based position sizing
    risk_amount = account_balance * max_risk
    price_risk = abs(signal['entry_price'] - signal['stop_loss']) / signal['entry_price']
    
    if price_risk > 0:
        position_value = risk_amount / price_risk
        position_size = position_value / signal['entry_price']
        
        # Apply maximum position size limit
        max_position_value = account_balance * 0.05  # 5% max
        if position_value > max_position_value:
            position_size = max_position_value / signal['entry_price']
        
        return position_size
    
    return 0
```

### Stop Loss & Take Profit
```python
def set_risk_management(signal, position_size):
    # Stop loss
    stop_loss_order = {
        'symbol': signal['symbol'],
        'side': 'sell',
        'amount': position_size,
        'price': signal['stop_loss'],
        'type': 'stop_loss'
    }
    
    # Take profit levels
    tp_levels = [
        {'price': signal['take_profit_1'], 'size': position_size * 0.3},
        {'price': signal['take_profit_2'], 'size': position_size * 0.5},
        {'price': signal['take_profit_3'], 'size': position_size * 0.2}
    ]
    
    return stop_loss_order, tp_levels
```

## 📈 Strategy Implementation

### Accumulation Strategy
```python
def execute_accumulation_strategy(signal):
    """Gradual position building during accumulation phase"""
    if signal['market_context']['market_regime']['market_phase'] != 'ACCUMULATION':
        return False
    
    total_size = signal['position_size_percent']
    
    # Split into 3 orders with 15-minute intervals
    orders = [
        {'size': total_size * 0.4, 'delay': 0, 'price_offset': 0},
        {'size': total_size * 0.35, 'delay': 900, 'price_offset': -0.01},
        {'size': total_size * 0.25, 'delay': 1800, 'price_offset': -0.02}
    ]
    
    for order in orders:
        price = signal['entry_price'] * (1 + order['price_offset'])
        
        # Schedule order
        if order['delay'] > 0:
            time.sleep(order['delay'])
        
        place_order(signal['symbol'], 'buy', order['size'], price)
```

### Distribution Strategy
```python
def execute_distribution_strategy(signal):
    """Risk-off positioning during distribution phase"""
    if signal['market_context']['market_regime']['market_phase'] != 'DISTRIBUTION':
        return False
    
    # Exit existing long positions
    close_long_positions(signal['symbol'])
    
    # Consider short opportunity if confidence is high
    if signal['confidence'] > 70 and signal['signal'] == 'SELL':
        place_order(signal['symbol'], 'sell', signal['position_size_percent'], 'market')
```

## 🔄 Continuous Trading Loop

```python
def run_trading_bot():
    symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
    
    while True:
        for symbol in symbols:
            try:
                # Get signal
                signal = get_signal(symbol)
                
                # Validate signal
                if signal['confidence'] < 50:
                    continue
                
                # Execute strategy
                execute_strategy(symbol, signal)
                
                # Rate limiting
                time.sleep(10)
                
            except Exception as e:
                print(f"Error processing {symbol}: {e}")
                continue
        
        # Wait before next cycle
        time.sleep(300)  # 5 minutes
```

## 🧪 Testing & Validation

### Paper Trading
```python
def paper_trade_signal(signal):
    """Test signal without real money"""
    paper_portfolio = {
        'balance': 10000,
        'positions': []
    }
    
    # Simulate trade execution
    if signal['signal'] == 'BUY':
        position_size = calculate_position_size(signal, paper_portfolio['balance'])
        
        position = {
            'symbol': signal['symbol'],
            'side': 'long',
            'size': position_size,
            'entry_price': signal['entry_price'],
            'stop_loss': signal['stop_loss'],
            'take_profit': signal['take_profit_1']
        }
        
        paper_portfolio['positions'].append(position)
        print(f"📝 Paper trade: {position}")
    
    return paper_portfolio
```

### Strategy Validation
```python
def validate_strategy(signal):
    """Validate strategy before execution"""
    url = f"{base_url}/api/v1/validate-strategy"
    headers = {'X-API-Key': api_key}
    payload = {
        'signal': signal,
        'risk_params': {
            'max_position_size': 0.05,
            'confidence_threshold': 50
        },
        'account_balance': 10000
    }
    
    response = requests.post(url, headers=headers, json=payload)
    validation = response.json()
    
    if not validation['valid']:
        print(f"❌ Strategy validation failed: {validation['validation_details']}")
        return False
    
    return True
```

## 📊 Platform-Specific Integration

### NinjaTrader
```csharp
public class EnhancedSignalStrategy : Strategy
{
    private string apiKey = "your-api-key";
    private string baseUrl = "http://localhost:3000";
    
    protected override void OnBarUpdate()
    {
        var signal = GetSignalFromAPI(Instrument.MasterInstrument.Name);
        
        if (signal.MarketPhase == "ACCUMULATION" && signal.Signal == "BUY")
        {
            // Scaled entry for accumulation
            EnterLongLimit(0, true, signal.PositionSize * 0.4, signal.EntryPrice);
            EnterLongLimit(0, true, signal.PositionSize * 0.35, signal.EntryPrice * 0.99);
            EnterLongLimit(0, true, signal.PositionSize * 0.25, signal.EntryPrice * 0.98);
        }
    }
}
```

### MetaTrader
```mql5
void ProcessSignal()
{
    string url = "http://localhost:3000/api/v1/signal";
    string headers = "X-API-Key: your-api-key\r\nContent-Type: application/json";
    string data = "{\"symbol\":\"BTCUSDT\",\"risk_level\":\"balanced\"}";
    
    char result[];
    string response;
    
    int res = WebRequest("POST", url, headers, 5000, data, result, response);
    
    if (res == 200)
    {
        // Parse JSON response and execute strategy
        ProcessAPIResponse(response);
    }
}
```

## 🚨 Error Handling

```python
def safe_api_call(func, *args, **kwargs):
    """Wrapper for safe API calls with retry logic"""
    max_retries = 3
    retry_delay = 5
    
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                print(f"❌ API call failed after {max_retries} attempts: {e}")
                raise
            else:
                print(f"⚠️ API call failed (attempt {attempt + 1}), retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
```

## 📋 Checklist for Bot Integration

- [ ] API key configured
- [ ] HTTP client library installed
- [ ] Risk management parameters set
- [ ] Position sizing logic implemented
- [ ] Stop loss and take profit handling
- [ ] Market phase strategy mapping
- [ ] Error handling and retry logic
- [ ] Logging and monitoring
- [ ] Paper trading for testing
- [ ] Strategy validation before execution

## 🔗 Useful Endpoints

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `/api/v1/signal` | Get trading signal | Basic signal generation |
| `/api/v1/bot-instructions` | Get bot-specific instructions | Detailed execution guidance |
| `/api/v1/validate-strategy` | Validate strategy | Pre-execution validation |
| `/api/v1/risk-parameters/:level` | Get risk parameters | Risk management settings |
| `/api/v1/market-regime/:symbol` | Get market analysis | Market phase detection |

## 📞 Support

For additional support:
1. Check the full `STRATEGY_EXECUTION_GUIDE.md` for detailed implementation
2. Review the example bot in `src/examples/enhanced_trading_bot.py`
3. Use the configuration template in `src/examples/bot_config.json`

## ⚠️ Important Notes

1. **Always test in paper trading first**
2. **Start with conservative risk settings**
3. **Monitor your bot's performance closely**
4. **Implement proper error handling**
5. **Keep API keys secure**
6. **Respect rate limits**
7. **Have emergency stop mechanisms**

Happy trading! 🚀 