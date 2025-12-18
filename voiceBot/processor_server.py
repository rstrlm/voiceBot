# processor_server.py
import base64
import io
import os
import tempfile

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel
import requests as http
from piper.voice import PiperVoice
import numpy as np

# ================= CONFIG ================= #

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "phi3"

PIPER_MODEL_PATH = "en_US-amy-medium.onnx"   # Model must be next to this script
WAKE_WORDS = ["bot", "hey bot"]

# Whisper model
WHISPER_MODEL = WhisperModel("small.en", device="cpu", compute_type="int8")

# FastAPI app
app = FastAPI()

# Load Piper voice at startup
try:
    print(f"[Piper] Loading voice model: {PIPER_MODEL_PATH}")
    PIPER_VOICE = PiperVoice.load(PIPER_MODEL_PATH)
    print("[Piper] Model loaded successfully.")
except Exception as e:
    print(f"[Piper] ERROR loading model: {e}")
    raise


# ================= HELPERS ================= #

def pcm_to_wav_file(pcm_bytes: bytes, sample_rate=48000, channels=2) -> str:
    """Wrap raw PCM into WAV file for Whisper."""
    import wave

    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    with wave.open(path, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)

    return path


def transcribe(path: str) -> str:
    segments, _ = WHISPER_MODEL.transcribe(path)
    return "".join(seg.text for seg in segments).strip()


def ask_ollama(prompt: str) -> str:
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    r = http.post(OLLAMA_URL, json=payload, timeout=120)
    r.raise_for_status()
    return r.json().get("response", "").strip()


def tts_with_piper(text: str) -> bytes:
    """Generate WAV audio using Piper's float32 AudioChunk output."""
    import wave

    pcm_chunks = []
    sample_rate = None

    for chunk in PIPER_VOICE.synthesize(text):

        # Piper outputs float32 PCM
        if hasattr(chunk, "audio_float_array"):
            float_data = chunk.audio_float_array
            int16_data = (float_data * 32767.0).astype(np.int16)
            pcm_chunks.append(int16_data.tobytes())
        else:
            raise RuntimeError(f"Unsupported AudioChunk format: {chunk}")

        if sample_rate is None:
            if hasattr(chunk, "sample_rate"):
                sample_rate = chunk.sample_rate
            else:
                raise RuntimeError("AudioChunk missing sample_rate")

    pcm_bytes = b"".join(pcm_chunks)

    # Write WAV in memory
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)

    return buf.getvalue()


# ================= MAIN ENDPOINT ================= #

@app.post("/process")
async def process(request: Request):
    pcm_bytes = await request.body()

    if not pcm_bytes:
        return JSONResponse(status_code=400, content={"error": "empty body"})

    # Convert PCM to WAV temp file
    wav_path = pcm_to_wav_file(pcm_bytes)

    try:
        user_text = transcribe(wav_path)
    finally:
        try:
            os.remove(wav_path)
        except:
            pass

    if not user_text:
        user_text = "(no speech detected)"

    print(f"[Whisper] User said: {user_text!r}")

    user_text_lower = user_text.lower()

    # -------------- WAKE-WORD DETECTION --------------
    if not any(w in user_text_lower for w in WAKE_WORDS):
        print("[Wake] No wake word detected. Ignoring.")
        return {
            "user_text": user_text,
            "reply_text": "",
            "reply_audio_b64": None,
            "ignore": True,
        }

    # Remove wake word from prompt before LLM
    cleaned_prompt = user_text_lower
    for w in WAKE_WORDS:
        cleaned_prompt = cleaned_prompt.replace(w, "")
    cleaned_prompt = cleaned_prompt.strip()

    print(f"[Wake] Wake-word detected. Cleaned prompt: {cleaned_prompt!r}")

    # -------------- LLM RESPONSE --------------
    try:
        reply_text = ask_ollama(cleaned_prompt)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Ollama error: {e}", "user_text": cleaned_prompt},
        )

    print(f"[Ollama] Reply: {reply_text!r}")

    # -------------- TTS (Piper) --------------
    try:
        reply_wav_bytes = tts_with_piper(reply_text)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "error": f"Piper TTS error: {e}",
                "user_text": cleaned_prompt,
                "reply_text": reply_text,
            },
        )

    reply_audio_b64 = base64.b64encode(reply_wav_bytes).decode("ascii")

    return {
        "user_text": cleaned_prompt,
        "reply_text": reply_text,
        "reply_audio_b64": reply_audio_b64,
        "ignore": False,
    }


# ================= RUN SERVER ================= #

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
