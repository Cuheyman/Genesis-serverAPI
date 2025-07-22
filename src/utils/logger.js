const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class ComprehensiveLogger {
  constructor() {
    // Generate timestamped filename for this session
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/:/g, '-')
      .replace(/\./g, '-')
      .replace('T', '_')
      .split('.')[0]; // Remove milliseconds
    
    // Create session-specific log file
    this.sessionLogFile = path.join(logsDir, `api-session_${timestamp}.log`);
    this.combinedLogFile = path.join(logsDir, 'combined.log');
    this.errorLogFile = path.join(logsDir, 'error.log');
    
    // Session tracking
    this.sessionStartTime = now;
    this.isShuttingDown = false;
    
    // Initialize session log
    this.initializeSessionLog();
    
    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
    
    // Capture original console methods
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
    this.originalConsoleInfo = console.info;
    this.originalConsoleDebug = console.debug;
    
    // Override console methods to capture everything
    this.interceptConsoleOutput();
    
    console.log('🚀 Comprehensive logging system initialized');
    console.log(`📁 Session log file: ${this.sessionLogFile}`);
  }

  initializeSessionLog() {
    const startMessage = this.createStartupBanner();
    try {
      fs.writeFileSync(this.sessionLogFile, startMessage + '\n');
      console.log(`📝 Session log initialized: ${path.basename(this.sessionLogFile)}`);
    } catch (err) {
      console.error('❌ Failed to initialize session log:', err.message);
    }
  }

  createStartupBanner() {
    const now = this.sessionStartTime;
    const banner = `
===============================================
🚀 GENESIS AI TRADING API - SESSION START
===============================================
📅 Start Date: ${now.toDateString()}
🕐 Start Time: ${now.toTimeString()}
📂 Session ID: ${path.basename(this.sessionLogFile)}
🌍 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
💻 Platform: ${process.platform}
🔧 Node Version: ${process.version}
📊 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
===============================================
🎯 LOGGING: All console output will be captured
🛑 SHUTDOWN: Press Ctrl+C for graceful shutdown
===============================================
`;
    return banner;
  }

  createShutdownBanner() {
    const now = new Date();
    const uptimeMs = now.getTime() - this.sessionStartTime.getTime();
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    const banner = `
===============================================
🛑 GENESIS AI TRADING API - SESSION END
===============================================
📅 End Date: ${now.toDateString()}
🕐 End Time: ${now.toTimeString()}
⏱️  Session Duration: ${hours}h ${minutes}m ${seconds}s
💾 Final Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
📊 Total Log Size: ${this.getSessionLogSize()}
===============================================
✅ Session completed successfully
📁 Log saved: ${path.basename(this.sessionLogFile)}
===============================================
`;
    return banner;
  }

  getSessionLogSize() {
    try {
      const stats = fs.statSync(this.sessionLogFile);
      const sizeKB = Math.round(stats.size / 1024);
      return sizeKB > 1024 ? `${Math.round(sizeKB / 1024)}MB` : `${sizeKB}KB`;
    } catch {
      return 'Unknown';
    }
  }

  setupShutdownHandlers() {
    // Store reference to server for graceful shutdown
    this.server = null;
    
    // Handle Ctrl+C (SIGINT)
    process.on('SIGINT', () => {
      this.handleGracefulShutdown('SIGINT', 'Ctrl+C pressed by user');
    });

    // Handle termination signal (SIGTERM)
    process.on('SIGTERM', () => {
      this.handleGracefulShutdown('SIGTERM', 'Termination signal received');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logWithAllTargets('FATAL', `Uncaught Exception: ${error.message}`, { stack: error.stack });
      this.handleGracefulShutdown('EXCEPTION', `Uncaught exception: ${error.message}`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logWithAllTargets('FATAL', `Unhandled Rejection: ${reason}`, { promise });
      this.handleGracefulShutdown('REJECTION', `Unhandled promise rejection: ${reason}`);
    });

    // Handle normal exit
    process.on('exit', (code) => {
      if (!this.isShuttingDown) {
        this.finalizeSessionLog(`Process exit with code: ${code}`);
      }
    });
  }

  handleGracefulShutdown(signal, reason) {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    
    console.log(`\n🛑 Shutdown signal received: ${signal}`);
    console.log(`📝 Reason: ${reason}`);
    console.log('💾 Finalizing logs and shutting down gracefully...');
    
    // Close server if available
    if (this.server) {
      console.log('🔌 Closing HTTP server...');
      this.server.close(() => {
        console.log('✅ HTTP server closed');
        this.finalizeSessionLog(reason);
        
        // Give a moment for logs to write
        setTimeout(() => {
          console.log('✅ Shutdown complete');
          process.exit(signal === 'EXCEPTION' || signal === 'REJECTION' ? 1 : 0);
        }, 500);
      });
    } else {
      this.finalizeSessionLog(reason);
      
      // Give a moment for logs to write
      setTimeout(() => {
        console.log('✅ Shutdown complete');
        process.exit(signal === 'EXCEPTION' || signal === 'REJECTION' ? 1 : 0);
      }, 1000);
    }
  }
  
  // Method to set server reference for graceful shutdown
  setServer(server) {
    this.server = server;
    console.log('🔌 Server reference registered for graceful shutdown');
  }

  finalizeSessionLog(reason) {
    const shutdownBanner = this.createShutdownBanner();
    const finalMessage = `\n${shutdownBanner}\nShutdown reason: ${reason}\n`;
    
    try {
      fs.appendFileSync(this.sessionLogFile, finalMessage);
      console.log(`📁 Session log finalized: ${path.basename(this.sessionLogFile)}`);
    } catch (err) {
      console.error('❌ Failed to finalize session log:', err.message);
    }
  }

  interceptConsoleOutput() {
    // Override console.log
    console.log = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
      this.logWithAllTargets('INFO', message);
      this.originalConsoleLog.apply(console, args);
    };

    // Override console.error
    console.error = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
      this.logWithAllTargets('ERROR', message);
      this.originalConsoleError.apply(console, args);
    };

    // Override console.warn
    console.warn = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
      this.logWithAllTargets('WARN', message);
      this.originalConsoleWarn.apply(console, args);
    };

    // Override console.info
    console.info = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
      this.logWithAllTargets('INFO', message);
      this.originalConsoleInfo.apply(console, args);
    };

    // Override console.debug
    console.debug = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
      this.logWithAllTargets('DEBUG', message);
      this.originalConsoleDebug.apply(console, args);
    };
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  writeToFile(filename, message) {
    try {
      fs.appendFileSync(filename, message + '\n');
    } catch (err) {
      this.originalConsoleError('Failed to write to log file:', err.message);
    }
  }

  logWithAllTargets(level, message, meta = {}) {
    if (this.isShuttingDown) return;
    
    const formatted = this.formatMessage(level, message, meta);
    
    // Write to session log
    this.writeToFile(this.sessionLogFile, formatted);
    
    // Write to combined log
    this.writeToFile(this.combinedLogFile, formatted);
    
    // Write to error log if it's an error
    if (level.toUpperCase() === 'ERROR' || level.toUpperCase() === 'FATAL') {
      this.writeToFile(this.errorLogFile, formatted);
    }
  }

  // Public methods for direct logging (maintaining backward compatibility)
  info(message, meta = {}) {
    this.logWithAllTargets('INFO', message, meta);
  }

  error(message, meta = {}) {
    this.logWithAllTargets('ERROR', message, meta);
  }

  warn(message, meta = {}) {
    this.logWithAllTargets('WARN', message, meta);
  }

  debug(message, meta = {}) {
    this.logWithAllTargets('DEBUG', message, meta);
  }

  fatal(message, meta = {}) {
    this.logWithAllTargets('FATAL', message, meta);
  }

  // Method to get session information
  getSessionInfo() {
    return {
      sessionFile: this.sessionLogFile,
      sessionStart: this.sessionStartTime,
      uptime: Date.now() - this.sessionStartTime.getTime(),
      logSize: this.getSessionLogSize()
    };
  }
}

module.exports = new ComprehensiveLogger(); 