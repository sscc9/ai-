#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Edge TTS Backend in background..."
./start_tts_backend.sh > /dev/null 2>&1 &

echo "Starting AI Werewolf Simulator Frontend..."
npm run dev
