// Startup script to launch Python FastAPI backend
import { spawn } from 'child_process';
import path from 'path';

console.log('🐍 Starting Python FastAPI server...');
console.log('📂 Node.js server replaced with Python backend');

const pythonProcess = spawn('python', ['main.py'], {
  cwd: path.join(process.cwd(), 'backend'),
  stdio: 'inherit'
});

pythonProcess.on('error', (error) => {
  console.error('🔴 Failed to start Python server:', error);
  process.exit(1);
});

pythonProcess.on('exit', (code) => {
  console.log(`🔴 Python server exited with code ${code}`);
  process.exit(code || 0);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Python server...');
  pythonProcess.kill();
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Python server...');
  pythonProcess.kill();
});