"""
speech.py — Audio recording & transcription for HifzMate
Uses: sounddevice + scipy for recording, SpeechRecognition for transcription
"""

import os
import tempfile
import subprocess

import speech_recognition as sr
import sounddevice as sd
import scipy.io.wavfile as wav


recognizer = sr.Recognizer()

SAMPLE_RATE = 16000
CHANNELS = 1


# ─────────────────────────────────────────────
# Convert uploaded audio to WAV
# ─────────────────────────────────────────────
def convert_to_wav(input_file: str) -> str:
    """
    Converts any audio format (webm/mp3/ogg/mp4)
    into a WAV file compatible with SpeechRecognition.
    """

    output_file = input_file + ".wav"

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_file,
            "-ar",
            "16000",
            "-ac",
            "1",
            output_file
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    return output_file


# ─────────────────────────────────────────────
# Record live from microphone
# ─────────────────────────────────────────────
def record_audio(duration: int = 8) -> str:
    """
    Record audio from microphone.
    Returns path to temporary WAV file.
    """

    print(f"🎙️ Recording for {duration} seconds...")

    audio_data = sd.rec(
        int(duration * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="int16"
    )

    sd.wait()

    print("✅ Recording complete.")

    tmp = tempfile.NamedTemporaryFile(
        suffix=".wav",
        delete=False
    )

    wav.write(tmp.name, SAMPLE_RATE, audio_data)

    tmp.close()

    return tmp.name


# ─────────────────────────────────────────────
# Transcribe Audio
# ─────────────────────────────────────────────
def transcribe_audio(audio_file_path: str,
                     language: str = "ar-SA") -> dict:
    """
    Transcribe audio file using Google Speech Recognition.

    Returns:
    {
        "text": "...",
        "success": True/False,
        "error": None/string
    }
    """

    if not os.path.exists(audio_file_path):
        return {
            "text": "",
            "success": False,
            "error": "Audio file not found"
        }

    try:

        recognizer.energy_threshold = 300
        recognizer.dynamic_energy_threshold = True
        recognizer.pause_threshold = 0.8

        with sr.AudioFile(audio_file_path) as source:

            recognizer.adjust_for_ambient_noise(
                source,
                duration=0.3
            )

            audio = recognizer.record(source)

        text = recognizer.recognize_google(
            audio,
            language=language
        )

        print(f"📝 Transcribed ({language}): {text}")

        return {
            "text": text,
            "success": True,
            "error": None
        }

    except sr.UnknownValueError:

        print("⚠️ Could not understand audio.")

        return {
            "text": "",
            "success": False,
            "error": "Could not understand audio. Please speak clearly."
        }

    except sr.RequestError as e:

        print(f"❌ Speech API error: {e}")

        return {
            "text": "",
            "success": False,
            "error": f"Speech service error: {str(e)}"
        }

    except Exception as e:

        print(f"❌ Unexpected error: {e}")

        return {
            "text": "",
            "success": False,
            "error": str(e)
        }


# ─────────────────────────────────────────────
# Record + Transcribe
# ─────────────────────────────────────────────
def transcribe_from_mic(duration: int = 8,
                        language: str = "ar-SA") -> dict:

    tmp_path = record_audio(duration)

    try:
        result = transcribe_audio(
            tmp_path,
            language
        )

    finally:

        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return result


# ─────────────────────────────────────────────
# CLI Test
# ─────────────────────────────────────────────
if __name__ == "__main__":

    print("Testing speech recognition...")

    result = transcribe_from_mic(
        duration=5,
        language="ar-SA"
    )

    print(result)