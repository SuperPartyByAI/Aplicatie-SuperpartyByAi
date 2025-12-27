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

# Install PyTorch CPU
RUN pip install --no-cache-dir torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu

# Install Coqui TTS from GitHub
RUN pip install --no-cache-dir git+https://github.com/coqui-ai/TTS.git

# Install other dependencies
RUN pip install --no-cache-dir \
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

# Create directories
RUN mkdir -p /app/audio /app/cache

# Expose port
EXPOSE 5001

# Run with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "app:app"]
