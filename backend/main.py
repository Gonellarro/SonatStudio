import os
import json
import httpx
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, create_engine
from sqlalchemy.orm import sessionmaker, Session, declarative_base
import aiofiles

# Config
DATA_DIR = "/app/data"
DATABASE_URL = f"sqlite:///{DATA_DIR}/history.db"

# Defaults
DEFAULT_WHISPER_URL = "http://192.168.1.131:9080/inference"
DEFAULT_LM_STUDIO_URL = "http://192.168.1.131:1234/v1"
DEFAULT_TRANSLATION_MODEL = "aya-expanse-8b"
DEFAULT_SUMMARY_MODEL = "qwen3.5-9b"

# Database setup
Base = declarative_base()

class TranscriptionEntry(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True)
    filename = Column(String)
    transcription = Column(Text)
    translation = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    duration = Column(String, nullable=True)  # Transcription duration
    translation_duration = Column(String, nullable=True)  # Translation duration
    summary_duration = Column(String, nullable=True)  # New: Summary duration
    created_at = Column(DateTime, default=datetime.utcnow)

class SummaryTemplate(Base):
    __tablename__ = "templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    description = Column(String)
    body = Column(Text)

class AppSettings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True)
    whisper_url = Column(String, default=DEFAULT_WHISPER_URL)
    lm_studio_url = Column(String, default=DEFAULT_LM_STUDIO_URL)
    translation_model = Column(String, default=DEFAULT_TRANSLATION_MODEL)
    summary_model = Column(String, default=DEFAULT_SUMMARY_MODEL)
    translation_temp = Column(String, default="0.1")
    summary_temp = Column(String, default="0.3")
    max_chunk_words = Column(Integer, default=400)
    # New Preferences
    default_transcription_lang = Column(String, default="es")
    default_translation_lang = Column(String, default="en")
    auto_translate = Column(Boolean, default=False)
    auto_summarize = Column(Boolean, default=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

# Manual migration
with engine.connect() as conn:
    from sqlalchemy import text
    try:
        conn.execute(text("ALTER TABLE history ADD COLUMN duration VARCHAR"))
    except Exception: pass
    try:
        conn.execute(text("ALTER TABLE history ADD COLUMN translation_duration VARCHAR"))
    except Exception: pass
    try:
        conn.execute(text("ALTER TABLE history ADD COLUMN summary_duration VARCHAR"))
    except Exception: pass
    try:
        conn.execute(text("ALTER TABLE settings ADD COLUMN default_transcription_lang VARCHAR DEFAULT 'es'"))
        conn.execute(text("ALTER TABLE settings ADD COLUMN default_translation_lang VARCHAR DEFAULT 'en'"))
        conn.execute(text("ALTER TABLE settings ADD COLUMN auto_translate BOOLEAN DEFAULT 0"))
        conn.execute(text("ALTER TABLE settings ADD COLUMN auto_summarize BOOLEAN DEFAULT 1"))
        conn.commit()
    except Exception:
        # Ignore errors if columns already exist
        pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_settings(db: Session):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings(
            whisper_url=os.getenv("WHISPER_API_URL", DEFAULT_WHISPER_URL),
            lm_studio_url=os.getenv("LM_STUDIO_URL", DEFAULT_LM_STUDIO_URL),
            translation_model=os.getenv("TRANSLATION_MODEL", DEFAULT_TRANSLATION_MODEL),
            summary_model=os.getenv("SUMMARY_MODEL", DEFAULT_SUMMARY_MODEL),
            translation_temp=os.getenv("TRANSLATION_TEMP", "0.1"),
            summary_temp=os.getenv("SUMMARY_TEMP", "0.3"),
            max_chunk_words=int(os.getenv("MAX_CHUNK_WORDS", 400)),
            default_transcription_lang="es",
            default_translation_lang="en",
            auto_translate=False,
            auto_summarize=True
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

# App
app = FastAPI(title="Sonat Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), lang: str = Form("es"), db: Session = Depends(get_db)):
    # Save file temporarily
    file_uuid = str(uuid.uuid4())
    ext = file.filename.split(".")[-1]
    temp_path = f"/tmp/{file_uuid}.{ext}"
    
    async with aiofiles.open(temp_path, "wb") as f:
        content = await file.read()
        await f.write(content)
        
    try:
        settings = get_settings(db)
        
        # Measure time
        start_time = datetime.now()
        
        # Transcribe
        async with httpx.AsyncClient(timeout=300.0) as client:
            with open(temp_path, "rb") as audio_f:
                files = {"file": (file.filename, audio_f)}
                data = {"language": lang, "response_format": "json"}
                response = await client.post(settings.whisper_url, files=files, data=data)
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Whisper error: {response.text}")
            
            result = response.json()
            text = result.get("text", "").strip()
            
            # Calculate duration
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()
            
            # Format: "12s" or "1m 20s"
            if processing_time < 60:
                duration_str = f"{int(processing_time)}s"
            else:
                minutes = int(processing_time // 60)
                seconds = int(processing_time % 60)
                duration_str = f"{minutes}m {seconds}s"
            
            # Save to History
            entry = TranscriptionEntry(
                uuid=file_uuid,
                filename=file.filename,
                transcription=text,
                duration=duration_str
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            
            return entry
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

async def ensure_model(client: httpx.AsyncClient, lm_studio_url: str, requested_model: str):
    """Checks if the requested model is loaded, if not, it warns but proceeds with the string."""
    try:
        # Normalize URL for models endpoint (usually at /v1/models)
        base_url = lm_studio_url.rstrip('/')
        if not base_url.endswith('/v1'):
            # If it's just the host:port, try adding /v1
            models_url = f"{base_url}/v1/models" if "/v1" not in base_url else f"{base_url}/models"
        else:
            models_url = f"{base_url}/models"
            
        resp = await client.get(models_url)
        if resp.status_code == 200:
            models = [m["id"] for m in resp.json().get("data", [])]
            if requested_model in models:
                return requested_model
            if models:
                print(f"Warning: {requested_model} not detected in active models. Found: {models}")
    except Exception as e:
        print(f"Error checking models at {lm_studio_url}: {str(e)}")
    return requested_model

@app.post("/translate/{entry_uuid}")
async def translate(entry_uuid: str, target_lang: str = "es", source_lang: str = "auto", custom_text: Optional[str] = None, db: Session = Depends(get_db)):
    settings = get_settings(db)
    entry = db.query(TranscriptionEntry).filter(TranscriptionEntry.uuid == entry_uuid).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    text = custom_text if custom_text else entry.transcription
    # Improved chunking for context window
    chunk_size = settings.max_chunk_words or 400
    paragraphs = text.split('\n')
    chunks = []
    current_chunk = []
    current_words = 0
    
    for p in paragraphs:
        p = p.strip()
        if not p: continue
        words = len(p.split())
        if current_words + words > chunk_size and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [p]
            current_words = words
        else:
            current_chunk.append(p)
            current_words += words
            
    if current_chunk:
        chunks.append("\n".join(current_chunk))
    
    translated_chunks = []
    
    try:
        start_time_translate = datetime.now()
        async with httpx.AsyncClient(timeout=300.0) as client:
            model = await ensure_model(client, settings.lm_studio_url, settings.translation_model)
            print(f"Using model: {model} for translation")
            
            for i, chunk in enumerate(chunks):
                source_info = f"from {source_lang} " if source_lang != "auto" else ""
                prompt = f"Translate the following text {source_info}to {target_lang}. Maintain the tone and context. Only respond with the translated text, no extra commentary:\n\n{chunk}"
                
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a professional translator. Provide only the translation, no explanations."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": float(settings.translation_temp or 0.1)
                }
                
                resp = await client.post(f"{settings.lm_studio_url}/chat/completions", json=payload)
                
                if resp.status_code != 200:
                    raise HTTPException(status_code=500, detail=f"LM Studio Error: {resp.text}")
                
                result = resp.json()
                translated_text = result["choices"][0]["message"]["content"].strip()
                translated_chunks.append(translated_text)
            
            # Combine all translated chunks
            final_translation = "\n\n".join(translated_chunks)
            
            # Measure time
            end_time_translate = datetime.now()
            proc_time = (end_time_translate - start_time_translate).total_seconds()
            
            if proc_time < 60:
                trans_duration_str = f"{int(proc_time)}s"
            else:
                trans_duration_str = f"{int(proc_time // 60)}m {int(proc_time % 60)}s"

            entry.translation = final_translation
            entry.translation_duration = trans_duration_str
            db.commit()
            db.refresh(entry)
            
            return entry
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="No se pudo conectar con LM Studio. Verifica que el servidor local (puerto 1234) esté activo.")
    except Exception as e:
        print(f"Translation Crash: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Translation error: {str(e)}")

@app.post("/summarize/{entry_uuid}")
async def summarize(entry_uuid: str, template_name: str = "Resumen General", template_body: str = "", source: str = "transcription", custom_text: Optional[str] = None, db: Session = Depends(get_db)):
    settings = get_settings(db)
    entry = db.query(TranscriptionEntry).filter(TranscriptionEntry.uuid == entry_uuid).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if custom_text:
        text = custom_text
    elif source == "translation" and entry.translation:
        text = entry.translation
    else:
        text = entry.transcription
    
    if not text:
        raise HTTPException(status_code=400, detail="No text available to summarize. Please transcribe or translate first.")
    
    # Summarization prompt logic: Language-aware
    system_instr = (
        "You are an expert summarization assistant. Your task is to extract the most key information following the requested format. "
        "CRITICAL: ALWAYS respond in the SAME LANGUAGE as the text provided for summarization unless otherwise specified."
    )
    
    if template_body:
        prompt = (
            f"Generate a '{template_name}' based on the text below. "
            f"Apply these precise format rules:\n{template_body}\n\n"
            f"--- TEXT TO SUMMARIZE ---\n{text}"
        )
    else:
        prompt = f"Please provide an executive summary of the following text, responding in the same language as the text:\n\n{text}"

    try:
        start_time_sum = datetime.now()
        async with httpx.AsyncClient(timeout=300.0) as client:
            model = await ensure_model(client, settings.lm_studio_url, settings.summary_model)
            
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_instr},
                    {"role": "user", "content": prompt}
                ],
                "temperature": float(settings.summary_temp or 0.3)
            }
            
            resp = await client.post(f"{settings.lm_studio_url}/chat/completions", json=payload)
            
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"LM Studio Error: {resp.text}")
            
            result = resp.json()
            summary_text = result["choices"][0]["message"]["content"].strip()
            
            # Measure time
            proc_time = (datetime.now() - start_time_sum).total_seconds()
            if proc_time < 60:
                sum_duration_str = f"{int(proc_time)}s"
            else:
                sum_duration_str = f"{int(proc_time // 60)}m {int(proc_time % 60)}s"

            entry.summary = summary_text
            entry.summary_duration = sum_duration_str
            db.commit()
            db.refresh(entry)
            
            return entry
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="No se pudo conectar con LM Studio.")
    except Exception as e:
        print(f"Summary Crash: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Summarization error: {str(e)}")

@app.get("/history", response_model=List[dict])
def get_history(db: Session = Depends(get_db)):
    entries = db.query(TranscriptionEntry).order_by(TranscriptionEntry.created_at.desc()).all()
    return [{
        "uuid": e.uuid, 
        "filename": e.filename, 
        "transcription": e.transcription, 
        "translation": e.translation, 
        "summary": e.summary, 
        "duration": e.duration,
        "translation_duration": e.translation_duration,
        "summary_duration": e.summary_duration, # <--- Agregado
        "created_at": e.created_at
    } for e in entries]

@app.delete("/history/{entry_uuid}")
def delete_entry(entry_uuid: str, db: Session = Depends(get_db)):
    entry = db.query(TranscriptionEntry).filter(TranscriptionEntry.uuid == entry_uuid).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return {"status": "deleted"}

@app.get("/templates")
def get_templates(db: Session = Depends(get_db)):
    return db.query(SummaryTemplate).all()

@app.post("/templates")
def create_template(template: dict, db: Session = Depends(get_db)):
    # Check if exists
    existing = db.query(SummaryTemplate).filter(SummaryTemplate.name == template["name"]).first()
    if existing:
        # Update instead of error? User wants to edit.
        existing.description = template["description"]
        existing.body = template["body"]
        db.commit()
        db.refresh(existing)
        return existing
    
    new_t = SummaryTemplate(
        name=template["name"],
        description=template["description"],
        body=template["body"]
    )
    db.add(new_t)
    db.commit()
    db.refresh(new_t)
    return new_t

@app.put("/templates/{template_id}")
def update_template(template_id: int, template: dict, db: Session = Depends(get_db)):
    db_t = db.query(SummaryTemplate).filter(SummaryTemplate.id == template_id).first()
    if not db_t:
        raise HTTPException(status_code=404, detail="Template not found")
    db_t.name = template["name"]
    db_t.description = template["description"]
    db_t.body = template["body"]
    db.commit()
    db.refresh(db_t)
    return db_t

def init_templates():
    db = SessionLocal()
    if db.query(SummaryTemplate).count() == 0:
        defaults = [
            {"name": "Reunión empresas", "description": "Enfoque en acuerdos y próximos pasos", "body": "Extrae los puntos clave de la reunión, las decisiones tomadas y los responsables de cada tarea."},
            {"name": "Reunión alumnos", "description": "Enfoque pedagógico y dudas", "body": "Resume los conceptos explicados, las preguntas frecuentes de los alumnos y las tareas pendientes."},
            {"name": "Acta formal", "description": "Estructura rígida oficial", "body": "Genera un acta formal con: Asistentes, Orden del día, Desarrollo de la sesión y Acuerdos."},
            {"name": "Resumen ejecutivo", "description": "Breve y conciso para directivos", "body": "Crea un resumen de máximo 3 párrafos resaltando el impacto estratégico y resultados."}
        ]
        for t in defaults:
            db.add(SummaryTemplate(**t))
        db.commit()
    db.close()

init_templates()

@app.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    db_t = db.query(SummaryTemplate).filter(SummaryTemplate.id == template_id).first()
    if db_t:
        db.delete(db_t)
        db.commit()
    return {"status": "deleted"}

@app.get("/settings")
def get_app_settings(db: Session = Depends(get_db)):
    return get_settings(db)

@app.post("/settings/reset")
def reset_app_settings(db: Session = Depends(get_db)):
    db.query(AppSettings).delete()
    db.commit()
    return get_settings(db)

@app.post("/settings")
def update_app_settings(new_settings: dict, db: Session = Depends(get_db)):
    db_s = get_settings(db)
    db_s.whisper_url = new_settings.get("whisper_url", db_s.whisper_url)
    db_s.lm_studio_url = new_settings.get("lm_studio_url", db_s.lm_studio_url)
    db_s.translation_model = new_settings.get("translation_model", db_s.translation_model)
    db_s.summary_model = new_settings.get("summary_model", db_s.summary_model)
    db_s.translation_temp = new_settings.get("translation_temp", db_s.translation_temp)
    db_s.summary_temp = new_settings.get("summary_temp", db_s.summary_temp)
    db_s.max_chunk_words = new_settings.get("max_chunk_words", db_s.max_chunk_words)
    # New assignments
    db_s.default_transcription_lang = new_settings.get("default_transcription_lang", db_s.default_transcription_lang)
    db_s.default_translation_lang = new_settings.get("default_translation_lang", db_s.default_translation_lang)
    db_s.auto_translate = new_settings.get("auto_translate", db_s.auto_translate)
    db_s.auto_summarize = new_settings.get("auto_summarize", db_s.auto_summarize)
    db.commit()
    db.refresh(db_s)
    return db_s
