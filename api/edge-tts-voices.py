import json
import asyncio
import edge_tts
from http.server import BaseHTTPRequestHandler


async def _get_voices():
    voices_manager = await edge_tts.VoicesManager.create()
    return voices_manager.voices


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            voices = asyncio.run(_get_voices())

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(voices).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
