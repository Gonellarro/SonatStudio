'use client';

import React, { useState, useEffect } from 'react';
import { Mic, Upload, History, Languages, Trash2, Loader2, Play, Pause, Download, Sparkles, Plus, Settings, Clock, Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getHistory, deleteEntry, transcribeFile, translateEntry, 
  summarizeEntry, getTemplates, saveTemplate, updateTemplate, deleteTemplate,
  getSettings, updateSettings, resetSettings, AppSettings, TranscriptionEntry, SummaryTemplate
} from '@/lib/api';
import clsx from 'clsx';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'transcribe' | 'translate' | 'summary' | 'history' | 'settings'>('transcribe');
  const [transcribeMode, setTranscribeMode] = useState<'live' | 'upload'>('upload');
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [currentResult, setCurrentResult] = useState<TranscriptionEntry | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [editingSettings, setEditingSettings] = useState<AppSettings | null>(null);
  const [sourceLang, setSourceLang] = useState('es');
  const [targetLang, setTargetLang] = useState('en');

  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SummaryTemplate | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SummaryTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '', body: '' });
  const [summarySource, setSummarySource] = useState<'transcription' | 'translation'>('transcription');
  const [customSummaryText, setCustomSummaryText] = useState('');
  const [customTranslatorText, setCustomTranslatorText] = useState<string | null>(null);

  const LANGUAGES = [
    { code: 'auto', name: 'Auto-detectar' },
    { code: 'es', name: 'Español' },
    { code: 'ca', name: 'Català' },
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
  ];
  
  useEffect(() => {
    loadHistory();
    loadTemplates();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await getSettings();
      setAppSettings(s);
      setEditingSettings(s);
      if (s.default_transcription_lang) setSourceLang(s.default_transcription_lang);
      if (s.default_translation_lang) setTargetLang(s.default_translation_lang);
    } catch (err) {
      console.error("Error loading settings", err);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await getHistory();
      setHistory(data);
      if (!currentResult && data.length > 0) {
        setCurrentResult(data[0]);
      }
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data);
      if (data.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data[0]);
      }
    } catch (err) {
      console.error("Failed to load templates", err);
    }
  };

  const triggerAutomation = async (res: any, flow?: 'translate' | 'summary') => {
    setCurrentResult(res);
    if (flow === 'translate') {
      setCustomTranslatorText(res.summary || res.transcription || '');
      setActiveTab('translate');
      return;
    }
    if (flow === 'summary') {
      setCustomSummaryText(res.translation || res.transcription || '');
      setSummarySource(res.translation ? 'translation' : 'transcription');
      setActiveTab('summary');
      return;
    }

    const isAutoTranslate = !!appSettings?.auto_translate;
    const isAutoSummarize = !!appSettings?.auto_summarize;
    if (isAutoTranslate) {
      setCustomTranslatorText(res.transcription || '');
      setActiveTab('translate');
      setTimeout(() => handleTranslate(res.uuid), 500);
    } else if (isAutoSummarize) {
      setCustomSummaryText(res.transcription || '');
      setActiveTab('summary');
      setTimeout(() => handleSummarize(res.uuid), 500);
    } else {
      setActiveTab('transcribe');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await transcribeFile(file, sourceLang);
      setCurrentResult(res);
      await loadHistory();
      await triggerAutomation(res);
    } catch (err) {
      alert("Error transcribing file");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm("¿Eliminar esta transcripción?")) return;
    try {
      await deleteEntry(uuid);
      if (currentResult?.uuid === uuid) setCurrentResult(null);
      await loadHistory();
    } catch (err) {
      alert("Error deleting entry");
    }
  };

  const handleTranslate = async (uuid: string) => {
    setLoading(true);
    try {
      const res = await translateEntry(uuid, targetLang, sourceLang, customTranslatorText || undefined);
      setHistory(prev => (prev as any).map((e: any) => e.uuid === uuid ? res : e));
      setCurrentResult(res);
      alert("Traducción completada con éxito");
    } catch (err) {
      console.error(err);
      alert("Error llamando a LM Studio.");
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async (uuid: string) => {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      const res = await summarizeEntry(
        uuid,
        selectedTemplate.name,
        selectedTemplate.body,
        summarySource,
        customSummaryText || undefined
      );
      // Explicitly update both history and current result with the fresh data from server
      setHistory(prev => (prev as any).map((e: any) => e.uuid === uuid ? res : e));
      setCurrentResult(res as any);
      setCustomSummaryText(''); // Clear custom text to show fresh result
      await loadHistory(); // Refresh whole history and stats
      alert("Resumen generado con éxito");
      setActiveTab('summary');
    } catch (err) {
      alert("Error al generar el resumen");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTemplate.name || !newTemplate.body) return;
    try {
      if (editingTemplate?.id) {
        await updateTemplate(editingTemplate.id, newTemplate as SummaryTemplate);
      } else {
        await saveTemplate(newTemplate as SummaryTemplate);
      }
      await loadTemplates();
      setNewTemplate({ name: '', description: '', body: '' });
      setEditingTemplate(null);
      setIsAddingTemplate(false);
    } catch (err) {
      alert("Error saving template");
    }
  };

  // Null-safe download helper
  const downloadText = (text: string | null | undefined, title: string, suffix: string = '') => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = title.replace(/\.[^/.]+$/, "");
    a.href = url;
    a.download = `${filename}${suffix}.md`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const displayEntry = currentResult || history[0];

  // Shared table header style
  const thClass = "px-4 py-3 pb-4 text-[10px] uppercase tracking-widest font-bold italic";
  // Shared row action button
  const actionBtn = (color: string) => `p-2 hover:bg-${color}-500/10 rounded-lg text-${color}-500 transition-colors disabled:opacity-30`;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight gradient-text">Sonat Studio</h1>
          <p className="text-muted-foreground mt-1">Local Intelligence on Ryzen 8845HS</p>
        </div>

        <div className="flex bg-secondary p-1 rounded-xl glass border border-white/5">
          {[
            { id: 'transcribe', icon: Mic,      label: 'Transcribir'  },
            { id: 'translate',  icon: Languages, label: 'Traductor'    },
            { id: 'summary',    icon: Sparkles,  label: 'Resumen'      },
            { id: 'history',    icon: History,   label: 'Historial'    },
            { id: 'settings',   icon: Settings,  label: 'Preferencias' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                activeTab === tab.id ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-col gap-6">
        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════════
              TAB: TRANSCRIBIR
          ════════════════════════════════════════ */}
          {activeTab === 'transcribe' && (
            <motion.div
              key="transcribe"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              {/* ── Main Module Container ── */}
              <div className="glass rounded-3xl p-8 border border-white/10 shadow-2xl flex flex-col gap-8">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xl font-bold italic tracking-tight flex items-center gap-2">
                    <Mic className="w-5 h-5 text-emerald-500" /> Módulo de Transcripción
                  </h3>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Mode switcher */}
                  <div className="flex bg-secondary/50 p-1 rounded-xl glass border border-white/5 self-start">
                    {[
                      { id: 'upload', icon: Upload, label: 'Subir Archivo'    },
                      { id: 'live',   icon: Mic,    label: 'Dictado En Vivo'  },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setTranscribeMode(mode.id as any)}
                        className={clsx(
                          "flex items-center gap-2 px-6 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-widest",
                          transcribeMode === mode.id
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/10"
                            : "text-muted-foreground hover:bg-white/5"
                        )}
                      >
                        <mode.icon className="w-3.5 h-3.5" /> {mode.label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {/* Live dictation (TODO) */}
                    {transcribeMode === 'live' ? (
                      <motion.div
                        key="live-mode"
                        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                        className="bg-white/5 rounded-2xl p-8 flex flex-col items-center justify-center gap-8 h-[400px] border border-white/10 shadow-2xl shadow-emerald-500/5 transition-all"
                      >
                        <div className={clsx(
                          "relative w-32 h-32 flex items-center justify-center rounded-full transition-all duration-500",
                          recording
                            ? "bg-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-pulse"
                            : "bg-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.2)]"
                        )}>
                          <button
                            onClick={() => setRecording(!recording)}
                            className={clsx(
                              "z-10 w-24 h-24 rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-xl",
                              recording ? "bg-red-500 shadow-red-500/50" : "bg-emerald-500 shadow-emerald-500/50"
                            )}
                          >
                            {recording ? <Pause className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-white" />}
                          </button>
                          {recording && <div className="absolute inset-0 rounded-full border-4 border-red-500/30 animate-ping" />}
                        </div>
                        <div className="text-center">
                          <h2 className="text-2xl font-semibold mb-2 italic tracking-tight">
                            {recording ? "Escuchando..." : "Dictado en Vivo (TODO)"}
                          </h2>
                          <p className="text-muted-foreground w-64 mx-auto text-sm">
                            Esta función estará disponible próximamente para capturar audio directamente desde el navegador.
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      /* Upload mode */
                      <motion.div
                        key="upload-mode"
                        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                        className="bg-white/5 rounded-2xl p-8 h-[400px] border border-white/10 flex flex-col gap-8 shadow-2xl shadow-emerald-500/5 transition-all"
                      >
                        <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-stretch h-full">
                          <div className="flex flex-col gap-2 w-full lg:w-48 shrink-0">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic px-1">
                              1. Idioma
                            </label>
                            <select
                              value={sourceLang}
                              onChange={(e) => setSourceLang(e.target.value)}
                              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-pointer w-full"
                            >
                              {LANGUAGES.map(l => (
                                <option key={l.code} value={l.code} className="bg-slate-900 text-white">{l.name}</option>
                              ))}
                            </select>

                            {loading && (
                              <div className="mt-auto flex flex-col items-center gap-3 text-emerald-400 animate-pulse text-center">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-[10px] uppercase font-bold italic tracking-tighter">Procesando...</span>
                              </div>
                            )}
                          </div>

                          <label className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors rounded-2xl border-2 border-dashed border-white/10 p-8 group">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                              <Upload className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-semibold mb-2 italic tracking-tight">2. Arrastra archivos aquí</h2>
                            <p className="text-muted-foreground text-sm">MP3, WAV, M4A, FLAC</p>
                            <input type="file" className="hidden" accept="audio/*,video/*" onChange={handleFileUpload} disabled={loading} />
                          </label>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Transcripciones Recientes ── */}
              <div className="glass rounded-3xl p-8 border border-white/10 shadow-2xl flex flex-col gap-6">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xl font-bold italic tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400">Transcripciones</span> Recientes
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-muted-foreground">
                        <th className={thClass}>Nombre</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Duración</th>
                        <th className={thClass}>Creado</th>
                        <th className={thClass + " text-right"}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(history || []).slice(0, 5).map((entry: any) => (
                        <tr key={entry.uuid} className="group hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setCurrentResult(entry)}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-emerald-500/10 rounded-md group-hover:bg-emerald-500/20 transition-colors">
                                <Mic className="w-3 h-3 text-emerald-400" />
                              </div>
                              <span className="text-sm font-medium text-white/80 group-hover:text-white truncate max-w-[200px]">
                                {entry.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {entry.transcription && (
                                <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                  STT
                                </div>
                              )}
                              {entry.translation && (
                                <div className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                  Trad
                                </div>
                              )}
                              {entry.summary && (
                                <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                  Sum
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground font-mono">
                            {entry.duration || "--:--"}
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground font-mono">
                            {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadText(entry.transcription, entry.filename, '_transcription'); }}
                                className="p-2 hover:bg-emerald-500/10 rounded-lg text-emerald-500 transition-colors"
                                title="Descargar Transcripción"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setCurrentResult(entry); setCustomSummaryText(entry.transcription || ''); setActiveTab('summary'); }}
                                className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-400 transition-colors"
                                title="Enviar a Resumen"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setCurrentResult(entry); setCustomTranslatorText(entry.transcription || ''); setActiveTab('translate'); }}
                                className="p-2 hover:bg-purple-500/10 rounded-lg text-purple-400 transition-colors"
                                title="Enviar a Traducción"
                              >
                                <Languages className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              TAB: TRADUCTOR
          ════════════════════════════════════════ */}
          {activeTab === 'translate' && (
            <motion.div
              key="translate"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              {!displayEntry ? (
                <div className="glass rounded-3xl p-12 text-center border border-white/10 min-h-[450px] flex flex-col items-center justify-center">
                  <Languages className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">No hay nada pendiente de traducir.<br/>Sube un archivo primero.</p>
                </div>
              ) : (
                <div className="glass rounded-3xl p-8 border border-white/10 shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                      <Languages className="text-primary w-6 h-6" /> Módulo Traductor
                    </h2>
                    <button
                      onClick={() => handleTranslate(displayEntry.uuid)}
                      disabled={loading || !displayEntry}
                      className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                      Empezar Traducción
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Original */}
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">
                          Idioma Original
                        </label>
                        <select
                          value={sourceLang}
                          onChange={(e) => setSourceLang(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                        >
                          {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code} className="bg-slate-900 text-white">{l.name}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        value={customTranslatorText !== null ? customTranslatorText : (displayEntry.transcription || '')}
                        onChange={(e) => setCustomTranslatorText(e.target.value)}
                        placeholder="Texto a traducir..."
                        className="w-full h-[400px] bg-black/40 border border-white/10 rounded-2xl p-6 text-sm leading-relaxed text-white/70 italic focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none shadow-inner overflow-y-auto"
                      />
                      <button
                        onClick={() => downloadText(displayEntry.transcription, displayEntry.filename, '_transcription')}
                        className="self-end p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-white transition-colors"
                        title="Descargar original"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Translation */}
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-bold text-purple-400 uppercase tracking-widest italic">
                          Idioma a Traducir
                        </label>
                        <select
                          value={targetLang}
                          onChange={(e) => setTargetLang(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                        >
                          {LANGUAGES.filter(l => l.code !== 'auto').map(l => (
                            <option key={l.code} value={l.code} className="bg-slate-900 text-white">{l.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-purple-500/5 p-6 rounded-2xl border border-purple-500/10 h-[400px] shadow-inner overflow-y-auto">
                        <p className="text-sm leading-relaxed text-purple-100/80 font-medium">
                          {displayEntry.translation || (loading ? "Traduciendo..." : "Listo para traducir...")}
                        </p>
                      </div>
                      <button
                        onClick={() => downloadText(displayEntry.translation, displayEntry.filename, '_translation')}
                        className="self-end p-2 hover:bg-purple-500/10 rounded-lg text-purple-400 transition-colors disabled:opacity-30"
                        disabled={!displayEntry.translation}
                        title="Descargar traducción"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Traducciones Recientes ── */}
              <div className="glass rounded-3xl p-8 border border-white/10 shadow-2xl flex flex-col gap-6">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xl font-bold italic tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-400" />
                    <span className="text-purple-400">Traducciones</span> Recientes
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-muted-foreground">
                        <th className={thClass}>Nombre</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Creado</th>
                        <th className={thClass + " text-right"}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(history || []).filter((e: any) => e.translation).slice(0, 5).map((entry: any) => (
                        <tr key={entry.uuid} className="group hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { 
                          setCurrentResult(entry); 
                          setCustomTranslatorText(entry.transcription || '');
                        }}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-purple-500/10 rounded-md group-hover:bg-purple-500/20 transition-colors">
                                <Languages className="w-3 h-3 text-purple-400" />
                              </div>
                              <span className="text-sm font-medium text-white/80 group-hover:text-white truncate max-w-[200px]">
                                {entry.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              <div className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                <Check className="w-2.5 h-2.5" /> Traducido
                              </div>
                              {entry.summary && (
                                <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                  Sum
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground font-mono">
                            {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); triggerAutomation(entry, 'summary'); }}
                                className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-400 transition-colors"
                                title="Resumir esta traducción"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadText(entry.translation, entry.filename, '_translation'); }}
                                className="p-2 hover:bg-purple-500/10 rounded-lg text-purple-400 transition-colors"
                                title="Descargar Traducción"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              TAB: RESUMEN
          ════════════════════════════════════════ */}
          {activeTab === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              <div className="glass rounded-3xl p-8 border border-white/10 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    <Sparkles className="text-amber-400 w-6 h-6" /> Módulo de Resumen
                  </h2>
                  <button
                    onClick={() => displayEntry && handleSummarize(displayEntry.uuid)}
                    disabled={loading || !displayEntry || !selectedTemplate}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 fill-current" />}
                    Generar Resumen
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Col 1: source */}
                  <div className="lg:col-span-2 flex flex-col gap-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic px-1">Fuente</label>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: 'transcription', label: 'Transcript.', icon: Mic },
                        { id: 'translation',   label: 'Traduc.',    icon: Languages },
                      ].map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSummarySource(s.id as any);
                            if (s.id === 'transcription') setCustomSummaryText(displayEntry?.transcription || '');
                            if (s.id === 'translation') setCustomSummaryText(displayEntry?.translation || '');
                          }}
                          className={clsx(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border font-medium text-xs",
                            summarySource === s.id
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-white/5 border-white/5 text-muted-foreground hover:text-white"
                          )}
                        >
                          <s.icon className="w-4 h-4" /> {s.label}
                        </button>
                      ))}
                      <button
                        onClick={() => document.getElementById('summary-file-upload')?.click()}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border border-white/5 bg-white/5 text-muted-foreground hover:text-white font-medium text-xs"
                      >
                        <Upload className="w-4 h-4" /> Subir
                      </button>
                      <input
                        id="summary-file-upload"
                        type="file"
                        className="hidden"
                        accept=".txt,.md,.doc,.docx,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setCustomSummaryText(ev.target?.result as string);
                              setSummarySource('transcription'); // Reset to manual/working mode
                              e.target.value = ''; // Reset input
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Col 2: input */}
                  <div className="lg:col-span-4 flex flex-col gap-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic px-1">Texto a Resumir</label>
                    <textarea
                      value={customSummaryText}
                      onChange={(e) => setCustomSummaryText(e.target.value)}
                      placeholder="Contenido a procesar..."
                      className="w-full h-[400px] bg-black/40 border border-white/10 rounded-2xl p-6 text-sm leading-relaxed text-white/70 italic focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all resize-none shadow-inner overflow-y-auto"
                    />
                  </div>

                  {/* Col 3: templates */}
                  <div className="lg:col-span-2 flex flex-col gap-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Plantillas</label>
                      <button onClick={() => setIsAddingTemplate(true)} className="text-amber-400 hover:text-amber-300 transition-transform hover:rotate-90">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 h-[400px] overflow-y-auto pr-1">
                      {templates.map(t => (
                        <div
                          key={t.id}
                          className={clsx(
                            "relative text-left p-3 rounded-xl transition-all border group cursor-pointer",
                            selectedTemplate?.id === t.id
                              ? "bg-amber-500/10 border-amber-500/30"
                              : "bg-white/5 border-white/5 hover:border-white/10"
                          )}
                          onClick={() => setSelectedTemplate(t)}
                        >
                          <div className="flex justify-between items-start">
                            <h4 className={clsx(
                              "font-bold text-xs mb-0.5",
                              selectedTemplate?.id === t.id ? "text-amber-400" : "text-white/80 group-hover:text-amber-300"
                            )}>
                              {t.name}
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTemplate(t);
                                setNewTemplate({ name: t.name, description: t.description, body: t.body });
                                setIsAddingTemplate(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-md transition-all text-amber-500/50 hover:text-amber-400"
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-tighter opacity-50 truncate">
                            {t.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Col 4: result */}
                  <div className="lg:col-span-4 flex flex-col gap-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic px-1">Resultado del Resumen</label>
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/10 h-[400px] flex flex-col shadow-inner overflow-y-auto relative">
                      <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#0c0c0d] z-10 py-1">
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                          {selectedTemplate?.name || "Selecciona plantilla"}
                        </p>
                        <div className="flex gap-2">
                          {displayEntry?.summary && (
                            <button
                              onClick={() => setActiveTab('translate')}
                              className="p-2 hover:bg-purple-500/10 rounded-lg text-purple-400 transition-all"
                              title="Traducir Resumen"
                            >
                              <Languages className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => downloadText(displayEntry?.summary, displayEntry?.filename || 'summary', '_summary')}
                            className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-400 transition-colors disabled:opacity-30"
                            disabled={!displayEntry?.summary}
                            title="Descargar"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 text-sm leading-relaxed text-white/80 italic whitespace-pre-wrap">
                        {displayEntry?.summary || (loading ? "Generando..." : "Listo para procesar...")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Resúmenes Recientes ── */}
              <div className="glass rounded-3xl p-8 border border-white/10 shadow-2xl flex flex-col gap-6">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xl font-bold italic tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-400">Resúmenes</span> Recientes
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-muted-foreground">
                        <th className={thClass}>Nombre</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Creado</th>
                        <th className={thClass + " text-right"}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(history || []).filter((e: any) => e.summary).slice(0, 5).map((entry: any) => (
                        <tr key={entry.uuid} className="group hover:bg-white/5 transition-colors cursor-pointer" onClick={() => {
                          setCurrentResult(entry);
                          setCustomSummaryText(entry.translation || entry.transcription || '');
                        }}>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-amber-500/10 rounded-md group-hover:bg-amber-500/20 transition-colors">
                                <Sparkles className="w-3 h-3 text-amber-400" />
                              </div>
                              <span className="text-sm font-medium text-white/80 group-hover:text-white truncate max-w-[200px]">
                                {entry.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                <Check className="w-2.5 h-2.5" /> Resumido
                              </div>
                              {entry.translation && (
                                <div className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter">
                                  Trad
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground font-mono">
                            {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); triggerAutomation(entry, 'translate'); }}
                                className="p-2 hover:bg-purple-500/10 rounded-lg text-purple-400 transition-colors"
                                title="Traducir este resumen"
                              >
                                <Languages className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadText(entry.summary, entry.filename, '_summary'); }}
                                className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-400 transition-colors"
                                title="Descargar Resumen"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              TAB: HISTORIAL
          ════════════════════════════════════════ */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              className="glass rounded-3xl border border-white/10 shadow-2xl p-8 flex flex-col gap-6"
            >
              <div className="flex justify-between items-center px-2">
                <h2 className="text-2xl font-bold italic tracking-tight flex items-center gap-2">
                  <History className="w-6 h-6 text-primary" /> Historial de Actividad
                </h2>
                <span className="text-xs text-muted-foreground font-mono">{history.length} entradas</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-muted-foreground">
                      <th className={thClass}>Archivo</th>
                      <th className={thClass}>Proceso</th>
                      <th className={thClass}>Creado</th>
                      <th className={thClass + " text-right"}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(history || []).map((entry: any) => (
                      <tr 
                        key={entry.uuid} 
                        className="group hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => {
                          setCurrentResult(entry);
                          if (entry.summary) setActiveTab('summary');
                          else if (entry.translation) setActiveTab('translate');
                          else setActiveTab('transcribe');
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-white/5 rounded-md">
                              <Mic className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm font-medium text-white/80 truncate max-w-[220px]">{entry.filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {entry.transcription && (
                              <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest leading-none">
                                <Check className="w-2.5 h-2.5" /> STT
                              </div>
                            )}
                            {entry.translation && (
                              <div className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest leading-none">
                                <Languages className="w-2.5 h-2.5" /> Trad
                              </div>
                            )}
                            {entry.summary && (
                              <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest leading-none">
                                <Sparkles className="w-2.5 h-2.5" /> Sum
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground font-mono">
                          {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => downloadText(entry.transcription, entry.filename, '_transcription')}
                              className="p-2 hover:bg-emerald-500/10 rounded-lg text-emerald-500 transition-colors"
                              title="Descargar Transcripción"
                            >
                              <Mic className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => downloadText(entry.translation, entry.filename, '_translation')}
                              className="p-2 hover:bg-purple-500/10 rounded-lg text-purple-400 transition-colors disabled:opacity-30"
                              disabled={!entry.translation}
                              title="Descargar Traducción"
                            >
                              <Languages className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => downloadText(entry.summary, entry.filename, '_summary')}
                              className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-400 transition-colors disabled:opacity-30"
                              disabled={!entry.summary}
                              title="Descargar Resumen"
                            >
                              <Sparkles className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(entry.uuid)}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-red-500/50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              TAB: PREFERENCIAS
          ════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              className="glass rounded-3xl border border-white/10 shadow-2xl p-10 max-w-4xl mx-auto w-full flex flex-col gap-10"
            >
              <div className="flex items-center gap-4">
                <Settings className="w-8 h-8 text-primary" />
                <h2 className="text-3xl font-bold italic tracking-tighter text-white">Preferencias del Sistema</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 {/* Left: APIs (Whisper first, then LM Studio) */}
                 <div className="flex flex-col gap-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground italic border-b border-white/5 pb-2">Servidores de Inferencia (APIs)</h3>
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60">Servidor Whisper Pipeline (STT)</label>
                        <input 
                          type="text"
                          value={editingSettings?.whisper_url || ''}
                          onChange={(e) => setEditingSettings(prev => ({ ...prev!, whisper_url: e.target.value }))}
                          className="bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-emerald-400 font-mono focus:ring-2 focus:ring-primary/40 transition-all font-bold"
                          placeholder="http://localhost:8000"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-primary/60">Servidor LM Studio (Traductor/Resumen)</label>
                        <input 
                          type="text"
                          value={editingSettings?.lm_studio_url || ''}
                          onChange={(e) => setEditingSettings(prev => ({ ...prev!, lm_studio_url: e.target.value }))}
                          className="bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-primary font-mono focus:ring-2 focus:ring-primary/40 transition-all font-bold"
                          placeholder="http://192.168.1.131:1234/v1"
                        />
                      </div>
                    </div>
                 </div>

                 {/* Right: Models (Translation first, then Summary) */}
                 <div className="flex flex-col gap-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground italic border-b border-white/5 pb-2">Modelos Asignados</h3>
                    <div className="flex flex-col gap-6">
                       <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-purple-400/60">Modelo de Traducción</label>
                          <input 
                            type="text"
                            value={editingSettings?.translation_model || ''}
                            onChange={(e) => setEditingSettings(prev => ({ ...prev!, translation_model: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-purple-400 font-mono font-bold"
                          />
                       </div>
                       <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-amber-400/60">Modelo de Resumen</label>
                          <input 
                            type="text"
                            value={editingSettings?.summary_model || ''}
                            onChange={(e) => setEditingSettings(prev => ({ ...prev!, summary_model: e.target.value }))}
                            className="bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-amber-400 font-mono font-bold"
                          />
                       </div>
                    </div>
                 </div>

                 {/* Extra Defaults & Info */}
                 <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 bg-black/20 p-6 rounded-3xl border border-white/5 mt-4">
                    <div className="flex items-center justify-between gap-4 px-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Entrada por defecto</label>
                       <select
                        value={editingSettings?.default_transcription_lang || 'es'}
                        onChange={(e) => setEditingSettings(prev => ({ ...prev!, default_transcription_lang: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:ring-0 transition-all cursor-pointer font-bold appearance-none text-emerald-400"
                       >
                        {LANGUAGES.map(l => (
                          <option key={l.code} value={l.code} className="bg-slate-900 text-white">{l.name}</option>
                        ))}
                       </select>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Salida (Traductor) por defecto</label>
                       <select
                        value={editingSettings?.default_translation_lang || 'en'}
                        onChange={(e) => setEditingSettings(prev => ({ ...prev!, default_translation_lang: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:ring-0 transition-all cursor-pointer font-bold appearance-none text-purple-400"
                       >
                        {LANGUAGES.filter(l => l.code !== 'auto').map(l => (
                          <option key={l.code} value={l.code} className="bg-slate-900 text-white">{l.name}</option>
                        ))}
                       </select>
                    </div>
                 </div>

                 {/* Automation Section */}
                 <div className="md:col-span-2 bg-white/5 rounded-3xl p-8 border border-white/5 flex flex-col gap-8 shadow-inner">
                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                      <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground italic">Automatización Inteligente</h3>
                      <div className="flex gap-2">
                        <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Pipeline Activo</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="flex items-center justify-between p-5 bg-black/20 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-white group-hover:text-primary transition-colors italic">Traductor Automático</span>
                            <span className="text-[9px] text-muted-foreground uppercase font-medium">Disparar al acabar Whisper</span>
                          </div>
                          <button 
                            onClick={() => setEditingSettings(prev => ({ 
                              ...prev!, 
                              auto_translate: !prev?.auto_translate,
                              auto_summarize: prev?.auto_translate ? prev.auto_summarize : false
                            }))}
                            className={clsx(
                              "w-12 h-6 rounded-full relative transition-all duration-300",
                              editingSettings?.auto_translate ? "bg-primary" : "bg-white/10"
                            )}
                          >
                             <div className={clsx(
                               "w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300",
                               editingSettings?.auto_translate ? "right-1" : "left-1"
                             )} />
                          </button>
                       </div>

                       <div className="flex items-center justify-between p-5 bg-black/20 rounded-2xl border border-white/5 group hover:border-amber-400/30 transition-all">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors italic">Generar Resumen Solo</span>
                            <span className="text-[9px] text-muted-foreground uppercase font-medium">Auto-resumen inteligente</span>
                          </div>
                          <button 
                            onClick={() => setEditingSettings(prev => ({ 
                              ...prev!, 
                              auto_summarize: !prev?.auto_summarize,
                              auto_translate: prev?.auto_summarize ? prev.auto_translate : false
                            }))}
                            className={clsx(
                              "w-12 h-6 rounded-full relative transition-all duration-300",
                              editingSettings?.auto_summarize ? "bg-amber-500" : "bg-white/10"
                            )}
                          >
                             <div className={clsx(
                               "w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300",
                               editingSettings?.auto_summarize ? "right-1" : "left-1"
                             )} />
                          </button>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-4 border-t border-white/10 pt-10">
                 <button 
                  onClick={async () => {
                    if (!confirm("¿Restablecer ajustes?")) return;
                    await resetSettings();
                    await loadSettings();
                  }}
                  className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-white transition-all italic"
                 >
                   Restablecer
                 </button>
                 <button 
                  onClick={async () => {
                    if (!editingSettings) return;
                    await updateSettings(editingSettings);
                    setAppSettings(editingSettings);
                    alert("Ajustes guardados correctamente");
                  }}
                  className="px-10 py-3 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all italic"
                 >
                   Guardar Cambios
                 </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Modal: Añadir / Editar Plantilla ── */}
      <AnimatePresence>
        {isAddingTemplate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#121212] w-full max-w-2xl rounded-3xl border border-white/10 p-8 shadow-2xl flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold italic tracking-tight">
                  {editingTemplate ? "Editar Plantilla" : "Nueva Plantilla de Resumen"}
                </h2>
                <button
                  onClick={() => { setIsAddingTemplate(false); setEditingTemplate(null); }}
                  className="text-muted-foreground hover:text-white transition-colors"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Nombre</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                    placeholder="Ej: Reunión de empresa, Resumen ejecutivo..."
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-500/40 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Descripción</label>
                  <input
                    type="text"
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                    placeholder="Breve descripción del formato..."
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-amber-500/40 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Instrucciones para la IA</label>
                  <textarea
                    value={newTemplate.body}
                    onChange={(e) => setNewTemplate({...newTemplate, body: e.target.value})}
                    placeholder="Instruye a la IA sobre cómo generar el resumen..."
                    className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm h-40 focus:ring-2 focus:ring-amber-500/40 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {editingTemplate && (
                  <button
                    onClick={async () => {
                      if (!confirm("¿Eliminar esta plantilla?")) return;
                      await deleteTemplate(editingTemplate.id!);
                      await loadTemplates();
                      setIsAddingTemplate(false);
                      setEditingTemplate(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-red-500/60 hover:text-red-500 transition-colors"
                  >
                    Eliminar
                  </button>
                )}
                <button
                  onClick={handleSaveTemplate}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 transition-all"
                >
                  {editingTemplate ? "Guardar Cambios" : "Crear Plantilla"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
