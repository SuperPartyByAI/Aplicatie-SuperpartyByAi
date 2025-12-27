# Coqui XTTS v2 - Voice Cloning Service

High-quality voice cloning service to replace ElevenLabs.

## Features

- ✅ Voice cloning from 6-30 second audio sample
- ✅ High quality audio (24kHz, 128kbps MP3)
- ✅ Romanian language support
- ✅ Intelligent caching for speed
- ✅ CPU optimized (no GPU required)
- ✅ REST API compatible with existing backend

## Setup

### 1. Build Docker image

```bash
docker build -t coqui-tts .
```

### 2. Run locally

```bash
docker run -p 5001:5001 coqui-tts
```

### 3. Deploy to Railway

```bash
# Railway will auto-detect Dockerfile
railway up
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Generate Speech
```bash
POST /tts
Content-Type: application/json

{
  "text": "Bună, sunt Kasya de la SuperParty",
  "use_cache": true
}
```

### Clone Voice (Upload Reference)
```bash
POST /clone-voice
Content-Type: multipart/form-data

audio: <audio_file.wav>
```

### Clear Cache
```bash
POST /cache/clear
```

## Voice Reference

Upload a 6-30 second audio sample of the voice you want to clone.

**Requirements:**
- Format: WAV, MP3, or FLAC
- Duration: 6-30 seconds
- Quality: Clear speech, no background noise
- Content: Varied intonation and emotions

## Performance

- **First generation:** 3-5 seconds (model loading)
- **Cached responses:** <100ms
- **Subsequent generations:** 2-3 seconds
- **Memory usage:** ~2GB RAM

## Quality Settings

Configured for maximum quality to match ElevenLabs:

- Sample rate: 24kHz
- Temperature: 0.75 (balanced)
- Split sentences: Yes (better prosody)
- Streaming: No (full quality)

## Cost

**$0/month** - Completely free, no API limits!

Runs on Railway free tier or $5/month for guaranteed uptime.
