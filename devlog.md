# 🛠️ DevLog: Sonat Studio Development Journal

This document records the major technical milestones, architectural decisions, and bug fixes made during the Sonat Studio development process.

---

---

---

## 📅 2026-04-21: Phase 15 (Security, Stability & Quality)
 
### 🛡️ Repository & Data Governance
- **Git History Reset:** Performed a complete history scrub and `git gc` optimization to remove sensitive session data and large legacy binaries. The repository size was reduced from ~500MB to <1MB.
- **Database Reset:** Added a "Reset BBDD" feature in the Settings panel to allow users to clear their local transcription history securely from the UI.
- **Refined .gitignore:** Implemented stricter rules to prevent accidental commits of media files (`.mp3`, `.wav`), databases (`.db`), and environmental caches.
 
### 🏗️ Architectural Stability
- **Large-Scale Text Support:** Refactored `/translate` and `/summarize` API endpoints to use **JSON Request Bodies** instead of query parameters. This eliminates the "Request URI Too Long" (HTTP 500/414) errors when processing massive transcriptions.
- **Timeouts for Heavy Loads:** Increased all backend processing timeouts from 5m to **30m** to guarantee success in long-duration tasks.
 
### 🎙️ Audio Processing & Quality
- **Automatic Audio Chunking:** Implemented a non-destructive segmentation engine. Audios longer than 12 minutes are automatically split into **10-minute chunks** and processed sequentially. This prevents model "context drift" and ensures high accuracy even in 60+ minute recordings.
- **Model Upgrade (Large-v3-Turbo):** Migrated the default STT engine from `medium` to `Large-v3-Turbo`. This dramatically improves Catalan transcription quality and Spanish nuances while maintaining high inference speeds on AMD iGPUs.
- **Hallucination Prevention:** Added the `--no-context` flag to the Whisper server configuration. This fixes the common "infinite loop" bug where the model repeats the same sentence multiple times.
- **Intelligent Auto-detection:** Standardized "Auto (Detection)" as the default language across the frontend and backend, enabling seamless switching between Spanish and Catalan.

## 📅 2026-04-08: Phase 14 (Rebranding & API Harmonization)

### 🏷️ Transition to Sonat Studio
- **Full Rebrand:** Renamed the project from "TypeWhisper" to **Sonat Studio** across the entire codebase, including UI headers, Docker container names, and API titles.
- **Port Standardization:** Updated deployment configuration to map the frontend to **Port 5000** for better service isolation in the local environment.

### 🔧 API Consistency & Bug Fixes
- **Settings Sync:** Resolved a critical build error in the frontend caused by a nomenclature mismatch. The attribute `whisper_api_url` was standardized to `whisper_url` to align with the backend database model and the `AppSettings` TypeScript interface.
- **Documentation:** Synchronized the `README.md` with the current Docker Compose port mapping and branding.

## 📅 2026-04-02: Phase 13 (Architectural Vision & Legacy Cleanup)

### 🚀 Shift to Functional Routing
- **Page-per-Functionality:** Planned the decommissioning of the monolithic `page.tsx` in favor of a dedicated page-per-feature architecture (e.g., `/transcribe`, `/translate`, `/summary`). This will improve application performance, simplify state management, and align with Next.js best practices for scalability.

### 🧹 Decomissioning Deprecated UI
- **Legacy Cleanup:** Identified that the `Sidebar` and the original `Dashboard` concept are "traces of the past" that no longer fit the current product vision. These elements will be prioritized for removal in the next development cycle to ensure a lean, purpose-built user experience.

---

## 📅 2026-04-01: Phase 11 (Standardization & Dashboard Completion)

### 🏗️ Unified Dashboard Architecture
- **Symmetric Sizing:** Standardized all interactive containers (Input, Templates, Results) to a fixed **400px** height. This ensures a "no-jump" navigation experience where the layout remains perfectly static as the user switches between Transcribe, Translate, and Summary tabs.
- **Master Containers:** Refactored each functional tab to reside within a titled "Master Glass Container" (e.g., "Módulo de Transcripción", "Módulo de Resumen"), providing a consistent visual hierarchy and professional branding.

### 🎨 Visual Branding & Emerald Refinement
- **Transcription Identity:** Rebranded the Transcription module with a dedicated **Emerald Green (`emerald-500`)** palette. This distinguishes the core STT task from the Purple (Translation) and Amber (Summary) workflows.
- **Aesthetic Polish:** Updated recording buttons, pulse animations, and drag-and-drop zones with emerald accents and matching shadows for a premium, cohesive look.

### 🌐 Intelligent Cross-Module Routing
- **Context-Aware Text Flow:** Enhanced the `triggerAutomation` engine to intelligently route the most relevant text between modules:
    - *Summarizing Translations:* Automatically picks the translated text as the source for the summary.
    - *Translating Summaries:* Automatically picks the summary result as the source for translation.
- **Smarter History Actions:** Added cross-navigation icons (Sparkles/Languages) to all "Recent" tables, turning the history into a launchpad for multi-stage processing.

### 🔧 Feature Restoration
- **Template Editing:** Restored "Settings" (gear) icons to individual summary templates, re-enabling direct management.
- **Manual Uploads:** Re-implemented `FileReader` logic and hidden file inputs for the Summary module, allowing users to upload text files directly for summarization without needing to transcribe first.

---

## 📅 2026-04-01: Phase 10 (Process Tracking & UI Integration)

### 📊 Enhanced Performance Metrics
- **Processing Duration Tracking:** Added `translation_duration` and `summary_duration` columns to the `history` table. The backend now measures and persists the exact time taken by LM Studio for each task.
- **Real-time Logging:** Updated `/translate` and `/summarize` endpoints to calculate durations using `datetime.now()` and return formatted strings (e.g., "15s", "1m 30s") to the frontend.

### 🎨 Modular UI Expansion
- **Premium Recent Tables:** Integrated "Traducciones Recientes" and "Resúmenes Recientes" tables into their respective tabs. Each table mirrors the premium glassmorphism design of the transcription history.
- **Cross-module Workflow:** Implemented quick-action buttons that allow users to send a translation directly to the summary module, or a summary back to the translator, with a single click.
- **Status Indicators:** Added color-coded status badges (Púrpura for translations, Ámbar for summaries) with success icons for improved visual feedback.

### 🔧 Bug Fixes & Stability
- **JSX Parser Fix:** Resolved a critical layout-breaking syntax error in `page.tsx` caused by redundant closing `</div>` tags during UI injection.
- **API Consistency:** Sychronized `lib/api.ts` with the new backend fields to maintain frontend type-safety and data parity.

---

## 📅 2026-03-31: Phase 8 & 9 (Automation & Refinement)

### ✅ Finalization of UI/UX Refinements
- **Mutual Exclusivity Logic:** Implemented a system in `page.tsx` that ensures "Auto-Translate" and "Auto-Summarize" toggles are mutually exclusive, preventing workflow conflicts in the post-transcription automation pipeline.
- **Ghost Cloud Mode:** Styled the "Cloud Models" (Gemini/OpenAI) section in the preferences panel to indicate future implementation (TODO) while keeping the visual layout professional.
- **Native Markdown Export:** Switched all text download results from `.txt` to `.md` (Markdown) for better compatibility with Obsidian and Notion. MIME type updated to `text/markdown`.

### 🗄️ Backend & Infrastructure Sync
- **Automatic SQLite Migrations:** Implemented a manual migration mechanism in `main.py` to add missing columns (`default_transcription_lang`, `auto_translate`, etc.) to the existing `settings` table without data loss.
- **CORS Middleware Fix:** Updated `main.py` CORS configuration to allow cross-origin requests from the React frontend in Docker environments, specifically disabling `allow_credentials=True` when `allow_origins=["*"]`.
- **Environment Parity:** Sychronized `.env` as the "Source of Truth" for initial server settings, ensuring consistency across the `docker-compose` stack.
- **Cleanup:** Removed redundant files (`transcribe.sh`, `curl.txt`, `nginx.conf`, etc.) to declutter the project root.

---

## 📅 2026-03-30: Phase 7 (Core Integration)

### 🚀 Initial Deployment
- **WhisperVulkan Container:** Successfully containerized the AMD-optimized Whisper server.
- **FastAPI Bridge:** Developed the backend to proxy requests between the frontend and LM Studio/Whisper.
- **Persistent Preferences:** Introduced the `AppSettings` model to store API URLs, model names, and temperatures.
- **Responsive Frontend:** Created the initial dashboard with recording, history management, and template-based summarization.

---

## 🏗️ Technical Stack Details
- **Frontend:** Next.js 14, TailwindCSS, Lucide Icons, Framer Motion.
- **Backend:** FastAPI, SQLAlchemy (SQLite), Requests.
- **Services:** Docker Compose, Whisper-Vulkan.
- **Acceleration:** AMD ROCm/Vulkan.

---

---

## ⚠️ Known Issues & Technical Debt
- **Summarization Language Bias:** Despite the updated system prompt, some local models (like Qwen3.5-9b) may persist in summarizing in Spanish if the initial instructions are in Spanish or if the model's primary training data for summarizers is Spanish-heavy. Needs adjustment of the prompt weights or using a more neutral template structure. 
- **TypeScript/Linting:** Existing `page.tsx` file has multiple missing module declarations and implicit 'any' types that should be addressed for better IDE stability.

---

## 📝 Roadmap (Planned)
- [ ] Integration of Speaker Diarization (tinydiarize).
- [ ] Real-browser audio recording (MediaRecorder API).
- [ ] Google Gemini fallback for large-context summarization.
- [ ] Search engine integration for "Augmented Summaries".
