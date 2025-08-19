
import express from 'express';
import { createServer } from 'http';
import { setupVite } from './server/vite';

const app = express();
app.use(express.json());

// Proxy API requests to Python backend
app.use('/api', async (req, res) => {
  const backendUrl = `http://localhost:5001${req.url}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers,
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });
    
    const contentType = response.headers.get('content-type');
    const data = contentType?.includes('application/json') 
      ? await response.json() 
      : await response.text();
      
    res.status(response.status);
    res.set({
      'Content-Type': contentType || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    
    if (typeof data === 'string') {
      res.send(data);
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`API Proxy Error: ${error}`);
    res.status(500).json({ error: 'Backend connection failed' });
  }
});

const server = createServer(app);

(async () => {
  if (process.env.NODE_ENV === 'development') {
    await setupVite(app, server);
  }
  
  server.listen(5000, "0.0.0.0", () => {
    console.log(`⚡ Vite frontend serving on port 5000`);
    console.log(`🐍 Python backend running on port 5001`);
    console.log(`🌐 Application available at http://0.0.0.0:5000`);
  });
})();

const cleanup = () => {
  console.log('🛑 Shutting down servers...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
