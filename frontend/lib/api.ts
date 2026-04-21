import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export const apiClient = axios.create({
  baseURL: API_URL,
});

export interface TranscriptionEntry {
  uuid: string;
  filename: string;
  transcription: string;
  translation: string | null;
  summary: string | null;
  duration: string | null;
  translation_duration: string | null; // New field
  summary_duration: string | null; // New field
  created_at: string;
}

export interface SummaryTemplate {
  id?: number;
  name: string;
  description: string;
  body: string;
}

export interface AppSettings {
  whisper_url: string;
  lm_studio_url: string;
  translation_model: string;
  summary_model: string;
  translation_temp: string;
  summary_temp: string;
  max_chunk_words: number;
  default_transcription_lang: string;
  default_translation_lang: string;
  auto_translate: boolean;
  auto_summarize: boolean;
}

export const getHistory = async () => {
  const resp = await apiClient.get<TranscriptionEntry[]>('/history');
  return resp.data;
};

export const deleteEntry = async (uuid: string) => {
  await apiClient.delete(`/history/${uuid}`);
};

export const resetHistory = async () => {
  await apiClient.delete('/history');
};


export const transcribeFile = async (file: File, lang: string = 'es') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('lang', lang);
  const resp = await apiClient.post<TranscriptionEntry>('/transcribe', formData);
  return resp.data;
};

export const translateEntry = async (uuid: string, targetLang: string = 'en', sourceLang: string = 'auto', customText?: string) => {
  const resp = await apiClient.post<TranscriptionEntry>(`/translate/${uuid}`, null, {
    params: {
      target_lang: targetLang,
      source_lang: sourceLang,
      custom_text: customText
    }
  });
  return resp.data;
};

export const summarizeEntry = async (uuid: string, templateName: string, templateBody: string, source: string = 'transcription', customText?: string) => {
  const resp = await apiClient.post(`/summarize/${uuid}`, null, {
    params: {
      template_name: templateName,
      template_body: templateBody,
      source: source,
      custom_text: customText
    }
  });
  return resp.data;
};

export const getTemplates = async () => {
  const resp = await apiClient.get<SummaryTemplate[]>('/templates');
  return resp.data;
};

export const saveTemplate = async (template: SummaryTemplate) => {
  const resp = await apiClient.post<SummaryTemplate>('/templates', template);
  return resp.data;
};

export const updateTemplate = async (id: number, template: SummaryTemplate) => {
  const resp = await apiClient.put<SummaryTemplate>(`/templates/${id}`, template);
  return resp.data;
};

export const deleteTemplate = async (id: number) => {
  await apiClient.delete(`/templates/${id}`);
};

export const getSettings = async () => {
  const resp = await apiClient.get<AppSettings>('/settings');
  return resp.data;
};

export const updateSettings = async (settings: Partial<AppSettings>) => {
  const resp = await apiClient.post<AppSettings>('/settings', settings);
  return resp.data;
};

export const resetSettings = async () => {
  const resp = await apiClient.post<AppSettings>('/settings/reset');
  return resp.data;
};
