#!/bin/bash
mkdir -p models
MODEL="ggml-medium.bin"
if [ ! -f "models/$MODEL" ]; then
    echo "Downloading $MODEL..."
    wget -O "models/$MODEL" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL"
else
    echo "$MODEL already exists."
fi
