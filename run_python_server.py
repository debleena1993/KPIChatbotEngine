#!/usr/bin/env python3
"""
Main Python server that replaces Node.js completely
Serves both the frontend and handles all API requests
"""
import subprocess
import sys
import os

# Change to backend directory and run the server
os.chdir('backend')
subprocess.run([sys.executable, 'main.py'])