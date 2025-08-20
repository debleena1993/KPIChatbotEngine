#!/usr/bin/env python3
"""
Python Backend Server
Runs the FastAPI authentication server on port 8000
"""

import uvicorn
from main import app

if __name__ == "__main__":
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        reload=True,
        log_level="info"
    )