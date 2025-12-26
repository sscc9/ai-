import edge_tts
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
import asyncio
import os

app = FastAPI()

class TTSRequest(BaseModel):
    text: str
    voice: str
    rate: str = "+0%"
    pitch: str = "+0%"

@app.get("/voices")
async def get_voices():
    try:
        voices_manager = await edge_tts.VoicesManager.create()
        return voices_manager.voices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tts")
async def generate_tts(request: TTSRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        communicate = edge_tts.Communicate(
            request.text, 
            request.voice,
            rate=request.rate,
            pitch=request.pitch
        )
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        print(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
