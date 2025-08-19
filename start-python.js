#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Python backend server...');

// Start Python server
const pythonProcess = spawn('python', ['main.py'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT || '5000',
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});

pythonProcess.on('error', (error) => {
  console.error('Failed to start Python server:', error);
  process.exit(1);
});

pythonProcess.on('exit', (code) => {
  console.log(`Python server exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down Python server...');
  pythonProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down Python server...');
  pythonProcess.kill('SIGINT');
});