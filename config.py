"""
Configuration for Coqui XTTS v2 - High Quality Voice Cloning
"""

import os

# Model configuration
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
LANGUAGE = "ro"  # Romanian

# Audio quality settings (match ElevenLabs quality)
SAMPLE_RATE = 24000  # High quality audio
AUDIO_FORMAT = "mp3"
AUDIO_BITRATE = "128k"

# Performance settings
ENABLE_CACHE = True
CACHE_DIR = "/app/cache"
MAX_CACHE_SIZE_MB = 500

# Voice cloning settings
SPEAKER_REFERENCE_PATH = "/app/models/kasya-reference.wav"
MIN_REFERENCE_DURATION = 6  # seconds
MAX_REFERENCE_DURATION = 30  # seconds

# Generation settings for quality
TEMPERATURE = 0.75  # Lower = more consistent, higher = more expressive
TOP_K = 50
TOP_P = 0.85
SPEED = 1.0  # Speech speed multiplier

# Optimization settings
USE_DEEPSPEED = False  # CPU only
STREAMING = False  # Generate full audio for better quality
SPLIT_SENTENCES = True  # Better prosody for long texts

# API settings
MAX_TEXT_LENGTH = 500  # characters
REQUEST_TIMEOUT = 30  # seconds

print(f"✅ Coqui XTTS v2 configured for HIGH QUALITY")
print(f"   Model: {MODEL_NAME}")
print(f"   Language: {LANGUAGE}")
print(f"   Sample Rate: {SAMPLE_RATE}Hz")
print(f"   Cache: {'Enabled' if ENABLE_CACHE else 'Disabled'}")
