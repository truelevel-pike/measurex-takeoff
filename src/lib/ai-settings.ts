export interface AiSettings {
  defaultModel: string;
  defaultScaleUnit: 'ft' | 'm';
  autoRunScaleDetection: boolean;
  openaiApiKey: string;
}

const STORAGE_KEY = 'mx-ai-settings';

const DEFAULT_SETTINGS: AiSettings = {
  defaultModel: 'claude-sonnet-4-6',
  defaultScaleUnit: 'ft',
  autoRunScaleDetection: true,
  openaiApiKey: '',
};

export function loadAiSettings(): AiSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  if (typeof window === 'undefined') return;
  // WARNING: Never store the full API key in localStorage — only persist the
  // last 4 characters for display purposes (e.g. "sk-...Ab1Z").
  const redacted = { ...settings };
  if (redacted.openaiApiKey && redacted.openaiApiKey.length > 4) {
    redacted.openaiApiKey = `...${redacted.openaiApiKey.slice(-4)}`;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(redacted));
}
