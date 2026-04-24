#!/bin/bash

# Navigate to server directory
cd "$(dirname "$0")/server"

# Check if venv exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv and install dependencies
source venv/bin/activate
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the server
echo "Starting Edge TTS Backend on http://localhost:8000..."
python main.py
