#!/bin/bash
# Script to start the Python FastAPI backend
# This replaces the Node.js authentication system

echo "Starting Python FastAPI Authentication Backend..."
echo "Backend will run on http://localhost:8000"

# Navigate to backend directory
cd "$(dirname "$0")"

# Start the FastAPI server
python3 main.py