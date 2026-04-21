# Sonat Studio 🎙️✨

**Sonat Studio** is a high-performance, web-based dictation and processing tool designed specifically for local infrastructure with **AMD GPUs (Vulkan)**. It combines the power of low-latency transcription (Whisper) with local LLMs (transcription, translation, and summarization) via LM Studio.

## 🚀 Vision
A "hands-free" audio processing pipeline that transcribes, translates, and summarizes your recordings completely on-device, preserving privacy and maximizing the performance of your local hardware.

---

## 🏗️ Architecture

-   **Frontend:** React / Next.js with Framer Motion for a premium, sleek UI.
-   **Backend:** FastAPI (Python) orchestrating audio processing, database management, and LLM communication.
-   **Whisper Service:** `whisper-server-vulkan` (Cockerized) for GPU-accelerated speech-to-text.
-   **AI Engine:** LM Studio (API compatible) for local translation and summarization tasks.
-   **Database:** SQLite for persistent history and application preferences.

---

## 📋 Features

-   **AMD Vulkan Acceleration:** Native support for high-speed STT on AMD iGPUs (780M/880M) and dGPUs.
-   **Smart Automation:** Mutually exclusive "Auto-Translate" and "Auto-Summarize" workflows.
-   **Native Markdown Export:** All results are saved directly as `.md` files, perfect for Obsidian and Notion.
-   **UI de lujo:** Glassmorphism and dark mode design for professional productivity.
-   **Cloud Ghost Mode:** Built-in placeholders for future Google Gemini and OpenAI integrations.
-   **Automatic Migrations:** Backend ensures the database schema is always up to date.

---

## 🛠️ Setup & Usage

### 1. Requirements
-   **Docker & Docker Compose** installed on your Linux system.
-   **AMD GPU Drivers** (Mesa/Vulkan) for transcription acceleration.
-   **LM Studio** running locally or on your network (with the API server enabled).

### 2. Configuration
Edit your `.env` file in the root directory:
```env
WHISPER_API_URL=http://<YOUR_IP>:9080/inference
LM_STUDIO_URL=http://<YOUR_IP>:1234/v1
TRANSLATION_MODEL=aya-expanse-8b
SUMMARY_MODEL=qwen3.5-9b
```

### 3. Launch
```bash
docker compose up -d --build
```
Access the application at `http://localhost:5000`.

---

## 📂 Project Structure
-   `frontend/`: The Next.js application.
-   `backend/`: FastAPI server and database logic.
-   `data/`: Persistent storage for history.
-   `models/`: Whisper models (.bin).
-   `docker-compose.yml`: Services orchestration.

---

## 📝 License
Proprietary / Development by Antigravity (Google DeepMind Team).
