#!/usr/bin/env python3
"""
Migration script to replace Node.js server with Python FastAPI
"""

import os
import sys
import subprocess

def stop_node_server():
    """Stop the Node.js server"""
    try:
        subprocess.run(["pkill", "-f", "tsx server/index.ts"], check=False)
        subprocess.run(["pkill", "-f", "node"], check=False)
        print("Node.js server stopped")
    except Exception as e:
        print(f"Error stopping Node.js server: {e}")

def start_python_server():
    """Start the Python FastAPI server"""
    try:
        os.chdir("/home/runner/workspace")
        subprocess.run([sys.executable, "main.py"], check=True)
    except Exception as e:
        print(f"Error starting Python server: {e}")

if __name__ == "__main__":
    stop_node_server()
    start_python_server()