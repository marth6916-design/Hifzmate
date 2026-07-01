#!/bin/bash
set -e

echo "=== Installing Python dependencies ==="
pip install -r requirements.txt

echo "=== Verifying ffmpeg ==="
which ffmpeg && ffmpeg -version || echo "WARNING: ffmpeg not found in PATH"
which ffprobe && ffprobe -version || echo "WARNING: ffprobe not found in PATH"

echo "=== Build complete ==="