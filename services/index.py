#!/usr/bin/env python3
"""
Python equivalent of server/index.ts
Manages both Python FastAPI backend and Vite frontend development server
"""

import os
import sys
import subprocess
import asyncio
import signal
import time
from typing import Optional
import threading
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

class ServerManager:
    """Manages both Python backend and Vite frontend servers"""
    
    def __init__(self):
        self.python_process: Optional[subprocess.Popen] = None
        self.vite_process: Optional[subprocess.Popen] = None
        self.running = False
        
    def log(self, message: str, source: str = "manager"):
        """Log with timestamp and source"""
        timestamp = time.strftime("%I:%M:%S %p")
        print(f"{timestamp} [{source}] {message}")
        
    def start_python_backend(self):
        """Start Python FastAPI backend on port 5001"""
        self.log("Starting Python FastAPI backend on port 5001", "python")
        
        env = os.environ.copy()
        env.update({
            'PORT': '5001',
            'NODE_ENV': env.get('NODE_ENV', 'development')
        })
        
        try:
            self.python_process = subprocess.Popen(
                [sys.executable, 'main.py'],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )
            
            # Stream output in separate thread
            def stream_output():
                if self.python_process and self.python_process.stdout:
                    for line in iter(self.python_process.stdout.readline, ''):
                        if line.strip():
                            self.log(line.strip(), "🐍 backend")
                        if not self.running:
                            break
                            
            threading.Thread(target=stream_output, daemon=True).start()
            
        except Exception as e:
            self.log(f"Failed to start Python backend: {e}", "error")
            return False
            
        return True
        
    def start_vite_frontend(self):
        """Start Vite frontend development server"""
        self.log("Starting Vite frontend development server", "vite")
        
        frontend_port = int(os.environ.get('PORT', '5000'))
        
        try:
            # Use the existing server/index.ts but modify it to just proxy to Python backend
            proxy_script = f'''
import express from 'express';
import {{ createServer }} from 'http';
import {{ setupVite }} from './server/vite';

const app = express();
app.use(express.json());

// Proxy API requests to Python backend
app.use('/api', async (req, res) => {{
  const backendUrl = `http://localhost:5001${{req.url}}`;
  
  try {{
    const response = await fetch(backendUrl, {{
      method: req.method,
      headers: {{
        'Content-Type': 'application/json',
        ...req.headers,
      }},
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    }});
    
    const contentType = response.headers.get('content-type');
    const data = contentType?.includes('application/json') 
      ? await response.json() 
      : await response.text();
      
    res.status(response.status);
    res.set({{
      'Content-Type': contentType || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }});
    
    if (typeof data === 'string') {{
      res.send(data);
    }} else {{
      res.json(data);
    }}
  }} catch (error) {{
    console.error(`API Proxy Error: ${{error}}`);
    res.status(500).json({{ error: 'Backend connection failed' }});
  }}
}});

const server = createServer(app);

(async () => {{
  if (process.env.NODE_ENV === 'development') {{
    await setupVite(app, server);
  }}
  
  server.listen({frontend_port}, "0.0.0.0", () => {{
    console.log(`⚡ Vite frontend serving on port {frontend_port}`);
    console.log(`🐍 Python backend running on port 5001`);
    console.log(`🌐 Application available at http://0.0.0.0:{frontend_port}`);
  }});
}})();

const cleanup = () => {{
  console.log('🛑 Shutting down servers...');
  server.close(() => {{
    process.exit(0);
  }});
}};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
'''
            
            # Write temporary proxy script
            with open('temp_frontend_server.ts', 'w') as f:
                f.write(proxy_script)
                
            env = os.environ.copy()
            env['NODE_ENV'] = env.get('NODE_ENV', 'development')
            
            self.vite_process = subprocess.Popen(
                ['npx', 'tsx', 'temp_frontend_server.ts'],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )
            
            # Stream output in separate thread
            def stream_vite_output():
                if self.vite_process and self.vite_process.stdout:
                    for line in iter(self.vite_process.stdout.readline, ''):
                        if line.strip():
                            self.log(line.strip(), "⚡ frontend")
                        if not self.running:
                            break
                            
            threading.Thread(target=stream_vite_output, daemon=True).start()
            
        except Exception as e:
            self.log(f"Failed to start Vite frontend: {e}", "error")
            return False
            
        return True
        
    def start_servers(self):
        """Start both backend and frontend servers"""
        self.running = True
        self.log("🐍 Starting Python backend + Vite frontend...", "manager")
        
        # Start Python backend first
        if not self.start_python_backend():
            return False
            
        # Wait a moment for backend to initialize
        time.sleep(2)
        
        # Start Vite frontend
        if not self.start_vite_frontend():
            return False
            
        self.log("✅ Both servers started successfully", "manager")
        return True
        
    def stop_servers(self):
        """Stop both servers gracefully"""
        self.running = False
        self.log("🛑 Shutting down servers...", "manager")
        
        if self.python_process:
            try:
                self.python_process.terminate()
                self.python_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.python_process.kill()
            except Exception as e:
                self.log(f"Error stopping Python backend: {e}", "error")
                
        if self.vite_process:
            try:
                self.vite_process.terminate()
                self.vite_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.vite_process.kill()
            except Exception as e:
                self.log(f"Error stopping Vite frontend: {e}", "error")
                
        # Clean up temporary files
        try:
            if os.path.exists('temp_frontend_server.ts'):
                os.remove('temp_frontend_server.ts')
        except Exception:
            pass
            
        self.log("✅ Servers stopped", "manager")
        
    def wait_for_servers(self):
        """Wait for both servers to complete"""
        try:
            while self.running:
                if self.python_process and self.python_process.poll() is not None:
                    self.log("Python backend exited", "manager")
                    break
                if self.vite_process and self.vite_process.poll() is not None:
                    self.log("Vite frontend exited", "manager")
                    break
                time.sleep(1)
        except KeyboardInterrupt:
            self.log("Received interrupt signal", "manager")
        finally:
            self.stop_servers()

def main():
    """Main entry point"""
    manager = ServerManager()
    
    # Setup signal handlers
    def signal_handler(signum, frame):
        manager.stop_servers()
        sys.exit(0)
        
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        if manager.start_servers():
            manager.wait_for_servers()
        else:
            manager.log("Failed to start servers", "error")
            sys.exit(1)
    except Exception as e:
        manager.log(f"Unexpected error: {e}", "error")
        manager.stop_servers()
        sys.exit(1)

if __name__ == "__main__":
    main()