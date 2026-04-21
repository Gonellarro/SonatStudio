# whisper.cpp v1.7.6 — Backend Vulkan para AMD Radeon 780M (gfx1103)
# Basado en Ubuntu 24.04 con driver Mesa RADV (ya incluido en el host)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── Dependencias ────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    git \
    cmake \
    build-essential \
    libvulkan-dev \
    vulkan-tools \
    glslc \
    mesa-vulkan-drivers \
    libgl1-mesa-dri \
    ffmpeg \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Clonar exactamente v1.7.6 ───────────────────────────────────────────────
# v1.7.3+ incluye el fix del bug de soft_max en Vulkan (PR #2633)
# v1.8.x rompe la detección de GPU AMD — NO usar latest
RUN git clone --depth 1 --branch v1.7.6 \
    https://github.com/ggml-org/whisper.cpp.git /whisper

WORKDIR /whisper

# ─── Compilar con Vulkan + servidor HTTP ─────────────────────────────────────
RUN cmake -B build \
    -DGGML_VULKAN=ON \
    -DWHISPER_BUILD_SERVER=ON \
    -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release -j$(nproc)

EXPOSE 8080

# ─── ICD Vulkan correcto para Mesa en Ubuntu 24.04 ───────────────────────────
# Dentro del contenedor el fichero se llama radeon_icd.json (sin x86_64)
ENV VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.json
# Forzar GPU AMD (device 0), ignorar llvmpipe (device 1 = CPU Vulkan)
ENV GGML_VK_VISIBLE_DEVICES=0

CMD ["./build/bin/whisper-server", \
     "--model",    "models/ggml-medium-q5_0.bin", \
     "--host",     "0.0.0.0", \
     "--port",     "8080", \
     "--language", "auto", \
     "--threads",  "4", \
     "--convert"]
