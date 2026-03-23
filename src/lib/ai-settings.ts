export interface AiSettings {
  defaultModel: string;
  defaultScaleUnit: 'ft' | 'm';
  autoRunScaleDetection: boolean;
  openaiApiKey: string;
  agentWebhookUrl: string;
}

// BUG-A8-5-001 fix: split storage keys — non-sensitive settings persist to
// localStorage (survive tab close) but the OpenAI API key lives only in
// sessionStorage (cleared when the tab / browser session ends, never survives
// XSS data exfil to persistent storage).
const STORAGE_KEY = 'mx-ai-settings';
const SESSION_KEY = 'mx-ai-key'; // sessionStorage — cleared on tab close

const DEFAULT_SETTINGS: AiSettings = {
  defaultModel: 'claude-sonnet-4-6',
  defaultScaleUnit: 'ft',
  autoRunScaleDetection: true,
  openaiApiKey: '',
  agentWebhookUrl: '',
};

export function loadAiSettings(): AiSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    // Load non-sensitive settings from localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    let base = { ...DEFAULT_SETTINGS };
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = {
          defaultModel: typeof parsed.defaultModel === 'string' ? parsed.defaultModel : DEFAULT_SETTINGS.defaultModel,
          defaultScaleUnit: parsed.defaultScaleUnit === 'ft' || parsed.defaultScaleUnit === 'm' ? parsed.defaultScaleUnit : DEFAULT_SETTINGS.defaultScaleUnit,
          autoRunScaleDetection: typeof parsed.autoRunScaleDetection === 'boolean' ? parsed.autoRunScaleDetection : DEFAULT_SETTINGS.autoRunScaleDetection,
          openaiApiKey: '',
          agentWebhookUrl: typeof parsed.agentWebhookUrl === 'string' ? parsed.agentWebhookUrl : DEFAULT_SETTINGS.agentWebhookUrl,
        };
      }
    }
    // Load API key from sessionStorage (cleared on tab close)
    const sessionKey = sessionStorage.getItem(SESSION_KEY);
    base.openaiApiKey = typeof sessionKey === 'string' ? sessionKey : '';
    // If agentWebhookUrl wasn't in the settings blob, fall back to the legacy localStorage key
    if (!base.agentWebhookUrl) {
      const legacyUrl = localStorage.getItem('mx-agent-webhook-url');
      if (typeof legacyUrl === 'string' && legacyUrl) base.agentWebhookUrl = legacyUrl;
    }
    return base;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  if (typeof window === 'undefined') return;
  // Non-sensitive prefs → localStorage (persistent)
  // agentWebhookUrl is also stored here (it's a local config URL, not a secret)
  const withoutKey = { ...settings, openaiApiKey: '' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutKey));
  // Sync agentWebhookUrl to the key used by page.tsx for dispatch
  if (settings.agentWebhookUrl) {
    localStorage.setItem('mx-agent-webhook-url', settings.agentWebhookUrl);
  } else {
    localStorage.removeItem('mx-agent-webhook-url');
  }
  // API key → sessionStorage only (clears on tab close, never in localStorage)
  if (settings.openaiApiKey) {
    sessionStorage.setItem(SESSION_KEY, settings.openaiApiKey);
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

/** Call on sign-out to purge any cached key from sessionStorage. */
export function clearAiKey(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STORAGE_KEY);
}
