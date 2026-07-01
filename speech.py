"""
speech.py — Audio recording & transcription for HifzMate
Uses: sounddevice + scipy for LOCAL mic recording (CLI testing only)
      SpeechRecognition for transcription (used in production via app.py)
"""

import speech_recognition as sr
import tempfile
import os

# sounddevice/scipy are only needed for local CLI testing (record_audio()).
# On cloud hosts (Render, etc.) PortAudio may not be installed, so we
# import them lazily/safely so the app doesn't crash on startup.
try:
    import sounddevice as sd
    import scipy.io.wavfile as wav
    _AUDIO_RECORDING_AVAILABLE = True
except (ImportError, OSError):
    _AUDIO_RECORDING_AVAILABLE = False

recognizer = sr.Recognizer()

SAMPLE_RATE = 16000   # 16kHz — optimal for speech recognition
CHANNELS    = 1       # Mono


# ─────────────────────────────────────────────
# Record live from microphone (LOCAL USE ONLY —
# not used in the deployed web app; browser JS
# handles recording there instead)
# ─────────────────────────────────────────────
def record_audio(duration: int = 8) -> str:
    """
    Record audio from the default microphone using sounddevice.
    Returns path to a temporary WAV file.
    Only works when running locally with a real microphone device.
    """
    if not _AUDIO_RECORDING_AVAILABLE:
        raise RuntimeError("sounddevice not available on this host — use the browser mic instead.")

    print(f"🎙️  Recording for {duration} seconds...")

    audio_data = sd.rec(
        int(duration * SAMPLE_RATE),
        samplerate = SAMPLE_RATE,
        channels   = CHANNELS,
        dtype      = 'int16'
    )
    sd.wait()
    print("✅ Recording complete.")

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    wav.write(tmp.name, SAMPLE_RATE, audio_data)
    tmp.close()
    return tmp.name


# ─────────────────────────────────────────────
# Transcribe audio file → text
# ─────────────────────────────────────────────
def transcribe_audio(audio_file_path: str, language: str = "ar-SA") -> dict:
    """
    Transcribe a WAV file using Google Speech Recognition.

    Args:
        audio_file_path : path to .wav file
        language        : 'ar-SA' (Arabic) or 'ur-PK' (Urdu)

    Returns:
        dict with keys: text, success, error
    """
    if not os.path.exists(audio_file_path):
        return {'text': '', 'success': False, 'error': 'Audio file not found'}

    # ── Log file properties for debugging ───────────────────────
    file_size = os.path.getsize(audio_file_path)
    print(f"🔍 Audio file: {audio_file_path}")
    print(f"🔍 Audio file size: {file_size} bytes ({file_size / 1024:.1f} KB)")

    if file_size == 0:
        print("❌ Audio file is empty (0 bytes) — skipping transcription.")
        return {'text': '', 'success': False, 'error': 'Audio file is empty after conversion.'}

    # ── Log WAV properties via pydub (best-effort) ───────────────
    try:
        from pydub import AudioSegment
        seg = AudioSegment.from_wav(audio_file_path)
        duration_ms = len(seg)
        print(f"🔍 WAV duration  : {duration_ms} ms ({duration_ms / 1000:.2f} s)")
        print(f"🔍 WAV frame rate: {seg.frame_rate} Hz")
        print(f"🔍 WAV channels  : {seg.channels}")
        print(f"🔍 WAV sample width: {seg.sample_width} bytes")
        if duration_ms < 500:
            print("⚠️  WAV is very short (< 0.5 s) — recognition may fail.")
    except Exception as probe_err:
        print(f"⚠️  Could not probe WAV properties: {probe_err}")

    # ── Recognizer settings ──────────────────────────────────────
    # Raised from 300 → 100 so quiet recordings are still accepted;
    # dynamic_energy_threshold will adapt upward if needed.
    recognizer.energy_threshold          = 100
    recognizer.dynamic_energy_threshold  = True
    recognizer.pause_threshold           = 0.8

    try:
        with sr.AudioFile(audio_file_path) as source:
            # Reduce noise — keep duration short so it doesn't eat real speech
            recognizer.adjust_for_ambient_noise(source, duration=0.3)
            print(f"🔍 Energy threshold after noise adjustment: {recognizer.energy_threshold:.1f}")
            audio = recognizer.record(source)

        # Log the size of the raw audio data being sent to Google
        audio_data_len = len(audio.get_raw_data())
        print(f"🔍 Raw audio data sent to Google: {audio_data_len} bytes ({audio_data_len / 1024:.1f} KB)")
        print(f"🔍 Sending to Google Speech API — language: {language}")

        text = recognizer.recognize_google(audio, language=language)
        print(f"📝 Transcribed ({language}): {text}")
        return {'text': text, 'success': True, 'error': None}

    except sr.UnknownValueError:
        print("⚠️  Google could not understand the audio.")
        print(f"   → language={language}, file_size={file_size}B, "
              f"energy_threshold={recognizer.energy_threshold:.1f}")
        return {'text': '', 'success': False, 'error': 'Could not understand audio. Please speak clearly.'}

    except sr.RequestError as e:
        print(f"❌ Google Speech API error: {e}")
        return {'text': '', 'success': False, 'error': f'Speech service error: {str(e)}'}

    except Exception as e:
        print(f"❌ Unexpected transcription error: {e}")
        return {'text': '', 'success': False, 'error': str(e)}


# ─────────────────────────────────────────────
# Transcribe directly from mic (for CLI use)
# ─────────────────────────────────────────────
def transcribe_from_mic(duration: int = 8, language: str = "ar-SA") -> dict:
    """
    Record from mic and immediately transcribe.
    Useful for CLI testing.
    """
    tmp_path = record_audio(duration)
    try:
        result = transcribe_audio(tmp_path, language)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    return result


# ─────────────────────────────────────────────
# CLI test
# ─────────────────────────────────────────────
if __name__ == '__main__':
    print("Testing speech recognition...")
    result = transcribe_from_mic(duration=5, language='ar-SA')
    print("Result:", result)