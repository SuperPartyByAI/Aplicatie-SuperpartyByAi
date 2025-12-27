FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    ffmpeg \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir git+https://github.com/coqui-ai/TTS.git
RUN pip install --no-cache-dir flask gunicorn numpy scipy librosa soundfile

COPY . /app/

RUN mkdir -p /app/audio /app/cache

EXPOSE 5001

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "app:app"]
