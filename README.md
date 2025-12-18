# voiceBot

This is a test project done mostly with Vibe Coding 
A fully local, privacy-friendly Discord voice bot that can **listen**, **understand**, **think**, and **speak** in real time.

The bot joins a Discord voice channel, listens to users, transcribes speech with Whisper, generates replies using a local LLM (Ollama), synthesizes speech with Piper TTS, and plays the response back into Discord — **only when a wake word is spoken** (e.g. *“bot”*, *“hey bot”*).

## ✨ Features

* 🎧 Discord voice receive & playback
* 🗣️ Speech-to-Text using **Whisper (faster-whisper)**
* 🤖 Local LLM responses via **Ollama**
* 🔊 Text-to-Speech using **Piper (piper-tts / piper1-gpl)**
* 💤 Wake-word activation (no accidental replies)
* 🔒 Fully local — **no cloud audio processing**
* 🧠 Modular Node.js + Python architecture
* ⚡ Real-time interaction in voice channels

## 🧩 Architecture Overview

```
Discord Voice Channel
        ↓
Node.js Bot (@discordjs/voice)
        ↓ PCM Audio
FastAPI Backend (Python)
        ↓
Whisper (Speech → Text)
        ↓
Ollama (LLM Response)
        ↓
Piper (Text → Speech)
        ↓ WAV
Node.js Bot
        ↓
Discord Voice Playback
```

## 🛠️ Tech Stack

### Node.js

* `discord.js`
* `@discordjs/voice`
* `@discordjs/opus`
* `prism-media`

### Python

* `fastapi`
* `uvicorn`
* `faster-whisper`
* `piper-tts`
* `numpy`
* `requests`

### AI / Audio

* **Whisper** — speech-to-text
* **Ollama** — local LLM inference
* **Piper** — local text-to-speech
* **FFmpeg + Opus** — audio handling

## 📁 Project Structure

```
project/
│
├─ voiceBot/
│   ├─ bot.js                # Discord voice bot (Node.js)
│   ├─ processor_server.py   # STT + LLM + TTS backend (Python)
│   ├─ package.json
│
├─ .gitignore
├─ README.md
```

> Piper voice models (`*.onnx`) are stored **next to `processor_server.py`** and ignored by Git.

## 🚀 Setup Guide

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/rstrlm/voiceBot.git
cd voiceBot
```

### 2️⃣ Node.js Setup

```bash
cd voiceBot
npm install
```

Create a `.env` file (recommended):

```env
DISCORD_TOKEN=your_discord_bot_token_here
```

### 3️⃣ Python Setup

Create and activate a virtual environment:

```bash
python -m venv venv
```

**Windows**

```bash
venv\Scripts\activate
```

**Linux / macOS**

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install fastapi uvicorn faster-whisper piper-tts numpy requests
```

### 4️⃣ Download a Piper Voice Model

```bash
python -m piper.download_voices en_US-amy-medium
```

Place `en_US-amy-medium.onnx` **next to** `processor_server.py`.

### 5️⃣ Start Ollama

Install Ollama:
[https://ollama.com](https://ollama.com)

Pull and run a model:

```bash
ollama pull phi3
ollama run phi3
```

Ollama must remain running in the background.

### 6️⃣ Run the Python Backend

```bash
python processor_server.py
```

Expected output:

```
[Piper] Loading voice model: en_US-amy-medium.onnx
[Piper] Model loaded successfully.
```

### 7️⃣ Run the Discord Bot

```bash
node bot.js
```

## 🎮 Usage

1. Join a Discord voice channel
2. In a text channel, type:

   ```
   !join
   !listen
   ```
3. Speak using a wake word:

   * “hey bot what time is it?”
   * “bot tell me a joke”
4. The bot replies **in voice**

## 🔑 Wake Word System

Configured in `processor_server.py`:

```python
WAKE_WORDS = ["bot", "hey bot"]
```

* The bot ignores speech unless a wake word is detected
* Wake words are removed before sending text to the LLM

Example:

* “hey bot what’s the weather” → “what’s the weather”

## 🔒 Privacy & Local Processing

* No cloud STT / TTS
* No audio storage
* Whisper, Ollama, and Piper all run locally
* Audio is processed in memory only

## 🧪 Troubleshooting

### Bot doesn’t respond

* Say the wake word clearly
* Confirm Python backend is running
* Confirm Ollama is running and model is available

### No audio playback

* Ensure FFmpeg is installed/working
* Ensure `@discordjs/opus` is installed

### Piper errors

* Use CPU-friendly Piper models (low/medium often easiest)
* Confirm `.onnx` file path is correct

## 📈 Future Improvements

* Streaming TTS (speak while thinking)
* Multiple voices per user
* Conversation memory
* Confidence-based wake word detection
* Voice commands (“bot stop”, “bot go silent”, etc.)
* Dockerized deployment

## 📜 License

MIT (or your preferred license)

## ❤️ Credits

* Discord.js
* faster-whisper (Whisper)
* Ollama
* Piper TTS (piper-tts / piper1-gpl)

---
