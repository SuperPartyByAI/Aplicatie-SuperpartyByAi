"""
Coqui XTTS v2 API - High Quality Voice Cloning Service
Matches ElevenLabs quality with cloned voice
"""

from flask import Flask, request, send_file, jsonify
from TTS.api import TTS
import torch
import os
import hashlib
import time
from pathlib import Path
import config

app = Flask(__name__)

# Initialize TTS model
print("🔄 Loading Coqui XTTS v2 model...")
tts = TTS(config.MODEL_NAME)
print("✅ Model loaded successfully")

# Cache for generated audio
cache_dir = Path(config.CACHE_DIR)
cache_dir.mkdir(exist_ok=True)

def get_cache_key(text, speaker_wav):
    """Generate cache key from text and speaker"""
    content = f"{text}_{speaker_wav}_{config.TEMPERATURE}_{config.SPEED}"
    return hashlib.md5(content.encode()).hexdigest()

def generate_speech(text, speaker_wav, output_path):
    """
    Generate speech with high quality settings
    """
    try:
        print(f"🎤 Generating speech: {len(text)} chars")
        start_time = time.time()
        
        # Generate with XTTS v2
        tts.tts_to_file(
            text=text,
            file_path=output_path,
            speaker_wav=speaker_wav,
            language=config.LANGUAGE,
            split_sentences=config.SPLIT_SENTENCES,
            temperature=config.TEMPERATURE,
            speed=config.SPEED
        )
        
        duration = time.time() - start_time
        print(f"✅ Generated in {duration:.2f}s")
        
        return True
        
    except Exception as e:
        print(f"❌ Error generating speech: {e}")
        return False

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model': config.MODEL_NAME,
        'language': config.LANGUAGE,
        'cache_enabled': config.ENABLE_CACHE
    })

@app.route('/tts', methods=['POST'])
def text_to_speech():
    """
    Generate speech from text
    
    Request body:
    {
        "text": "Text to convert to speech",
        "use_cache": true
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Text is required'}), 400
        
        text = data['text'].strip()
        use_cache = data.get('use_cache', config.ENABLE_CACHE)
        
        if len(text) > config.MAX_TEXT_LENGTH:
            return jsonify({'error': f'Text too long (max {config.MAX_TEXT_LENGTH} chars)'}), 400
        
        if len(text) == 0:
            return jsonify({'error': 'Text cannot be empty'}), 400
        
        # Check if speaker reference exists
        if not os.path.exists(config.SPEAKER_REFERENCE_PATH):
            return jsonify({'error': 'Speaker reference not found'}), 500
        
        # Check cache
        cache_key = get_cache_key(text, config.SPEAKER_REFERENCE_PATH)
        cache_file = cache_dir / f"{cache_key}.wav"
        
        if use_cache and cache_file.exists():
            print(f"📦 Cache hit: {cache_key}")
            return send_file(
                cache_file,
                mimetype='audio/wav',
                as_attachment=False,
                download_name='speech.wav'
            )
        
        # Generate new audio
        output_path = cache_dir / f"{cache_key}.wav"
        
        success = generate_speech(
            text=text,
            speaker_wav=config.SPEAKER_REFERENCE_PATH,
            output_path=str(output_path)
        )
        
        if not success:
            return jsonify({'error': 'Failed to generate speech'}), 500
        
        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=False,
            download_name='speech.wav'
        )
        
    except Exception as e:
        print(f"❌ Error in /tts: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/clone-voice', methods=['POST'])
def clone_voice():
    """
    Upload reference audio for voice cloning
    
    Expects multipart/form-data with 'audio' file
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'Audio file is required'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save reference audio
        audio_file.save(config.SPEAKER_REFERENCE_PATH)
        
        print(f"✅ Voice reference saved: {config.SPEAKER_REFERENCE_PATH}")
        
        return jsonify({
            'success': True,
            'message': 'Voice cloned successfully',
            'reference_path': config.SPEAKER_REFERENCE_PATH
        })
        
    except Exception as e:
        print(f"❌ Error in /clone-voice: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/cache/clear', methods=['POST'])
def clear_cache():
    """Clear audio cache"""
    try:
        count = 0
        for file in cache_dir.glob('*.wav'):
            file.unlink()
            count += 1
        
        return jsonify({
            'success': True,
            'cleared': count
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🚀 Starting Coqui XTTS v2 API...")
    print(f"   Port: 5001")
    print(f"   Cache: {config.CACHE_DIR}")
    print(f"   Speaker: {config.SPEAKER_REFERENCE_PATH}")
    app.run(host='0.0.0.0', port=5001, debug=False)
