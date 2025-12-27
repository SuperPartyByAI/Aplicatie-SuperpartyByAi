# Coqui XTTS v2 - High Quality Voice Cloning
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    ffmpeg \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir \
    torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu \
    TTS==0.22.0 \
    flask==3.0.0 \
    gunicorn==21.2.0 \
    numpy==1.24.3 \
    scipy==1.11.4 \
    librosa==0.10.1 \
    soundfile==0.12.1

# Copy application files
COPY app.py /app/
COPY requirements.txt /app/
COPY config.py /app/

# Create directories for models and audio
RUN mkdir -p /app/models /app/audio /app/cache

# Download XTTS v2 model (will be cached)
RUN python -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')"

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5001/health')"

# Run with gunicorn for production
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "app:app"]
