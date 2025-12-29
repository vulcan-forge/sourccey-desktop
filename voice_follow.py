import json
import queue
import sys
import subprocess
from pathlib import Path

import sounddevice as sd
from vosk import Model, KaldiRecognizer

# =========================
# Configuration
# =========================

SAMPLE_RATE = 16000
CHANNELS = 1
DEVICE_INDEX = None  # Set to mic index if needed

TRIGGER_WORD = "hello"

VOSK_MODEL_PATH = Path.home() / ".cache" / "vosk" / "vosk-model-small-en-us-0.15"

RESPONSE_TEXT = (
    "Hello! My name is Sourccey! Is there anything I can do for you?"
)

# =========================
# Audio queue
# =========================

audio_queue = queue.Queue()

def audio_callback(indata, frames, time, status):
    if status:
        print(f"Audio status: {status}", file=sys.stderr)
    audio_queue.put(bytes(indata))

# =========================
# Speech output
# =========================

def speak(text: str):
    subprocess.run([
        "espeak-ng",
        "-v", "en-us+f3",
        "-p", "65",
        "-s", "165",
        "-a", "190",
        text
    ])

# =========================
# Main
# =========================

def main():
    print("Loading Vosk model...")

    if not VOSK_MODEL_PATH.exists():
        print(f"ERROR: Vosk model not found at {VOSK_MODEL_PATH}")
        sys.exit(1)

    model = Model(str(VOSK_MODEL_PATH))

    # Grammar-restricted recognition (command mode)
    grammar = '["hello"]'
    recognizer = KaldiRecognizer(model, SAMPLE_RATE, grammar)

    print("Listening... Say 'Hello'")

    with sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        blocksize=8000,
        dtype="int16",
        channels=CHANNELS,
        callback=audio_callback,
        device=DEVICE_INDEX,
    ):
        while True:
            data = audio_queue.get()

            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                text = result.get("text", "").lower().strip()

                if not text:
                    continue

                print(f"Heard: {text}")

                if TRIGGER_WORD in text:
                    print("👋 Greeting detected")
                    speak(RESPONSE_TEXT)

                    # Optional: prevent retrigger spam
                    recognizer.Reset()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopping voice listener.")
