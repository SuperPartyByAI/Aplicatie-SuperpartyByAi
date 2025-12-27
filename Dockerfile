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
    TTS \
    flask==3.0.0 \
    gunicorn==21.2.0 \
    numpy \
    scipy \
    librosa \
    soundfile

# Copy application files
COPY app.py /app/
COPY config.py /app/
COPY models/ /app/models/

# Create directories for audio and cache
RUN mkdir -p /app/audio /app/cache

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5001/health')"

# Run with gunicorn for production
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "app:app"]
