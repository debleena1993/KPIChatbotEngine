// Import Node.js modules
import { spawn } from "child_process";

console.log('🐍 Starting Python server manager...');

// Use Python server manager instead of Node.js
const pythonManager = spawn('python', ['services/index.py'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});

pythonManager.on('error', (error) => {
  console.error('❌ Failed to start Python server manager:', error);
  process.exit(1);
});

pythonManager.on('exit', (code) => {
  console.log(`🐍 Python server manager exited with code ${code}`);
  process.exit(code || 0);
});

// Handle graceful shutdown
const cleanup = () => {
  console.log('🛑 Shutting down Python server manager...');
  pythonManager.kill('SIGTERM');
};

// All server management is now handled by the Python server manager
