/**
 * Outbound webhook registry — stores registered webhooks in memory (globalThis)
 * and fires HTTP POSTs when matching events occur.
 *
 * Also maintains an in-memory agent event log per project so agents can poll
 * GET /api/projects/:id/webhooks/events to see what events have fired.
 */

import { randomUUID } from 'crypto';

export interface WebhookRegistration {
  id: string;
  projectId: string;
  url: string;
  events: string[];
  createdAt: string;
}

// ── Agent event log ────────────────────────────────────────────────────────
export interface AgentEvent {
  event: string;
  page?: number;
  source?: string;
  timestamp: string;
  projectId: string;
  /** Any extra fields POSTed by the client (e.g. quantities). */
  meta?: Record<string, unknown>;
}

const MAX_EVENTS_PER_PROJECT = 100;

declare const globalThis: typeof global & {
  __webhookRegistry?: Map<string, WebhookRegistration>;
  __agentEventLog?: Map<string, AgentEvent[]>;
};

if (!globalThis.__webhookRegistry) {
  globalThis.__webhookRegistry = new Map();
}
if (!globalThis.__agentEventLog) {
  globalThis.__agentEventLog = new Map();
}

const registry = globalThis.__webhookRegistry;
const agentEventLog = globalThis.__agentEventLog;

/** Append an event to the in-memory log for a project (capped at MAX_EVENTS_PER_PROJECT). */
export function logAgentEvent(
  projectId: string,
  event: string,
  extras: { page?: number; source?: string; meta?: Record<string, unknown> } = {},
): AgentEvent {
  const entry: AgentEvent = {
    event,
    page: extras.page,
    source: extras.source,
    timestamp: new Date().toISOString(),
    projectId,
    meta: extras.meta,
  };
  const log = agentEventLog.get(projectId) ?? [];
  log.push(entry);
  // Keep only the most recent N events per project
  if (log.length > MAX_EVENTS_PER_PROJECT) {
    log.splice(0, log.length - MAX_EVENTS_PER_PROJECT);
  }
  agentEventLog.set(projectId, log);
  return entry;
}

/** Return the last N events for a project (most recent last). */
export function getAgentEvents(projectId: string, limit = 20): AgentEvent[] {
  const log = agentEventLog.get(projectId) ?? [];
  return log.slice(-limit);
}

export function registerWebhook(
  projectId: string,
  url: string,
  events: string[],
): WebhookRegistration {
  // BUG-A5-6-139: validate URL at registration time to block private/internal targets.
  // Wave 19 hotfix: localhost/127.0.0.1/::1 are explicitly allowed for the local agent.
  const parsedUrl = new URL(url);
  const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === '::1';
  if (!isLocalhost && isPrivateUrl(url)) {
    throw new Error('Webhook URL must not target private/internal networks');
  }

  const webhook: WebhookRegistration = {
    id: randomUUID(),
    projectId,
    url,
    events,
    createdAt: new Date().toISOString(),
  };
  registry.set(webhook.id, webhook);
  return webhook;
}

export function unregisterWebhook(id: string): boolean {
  return registry.delete(id);
}

export function getWebhooksForProject(projectId: string): WebhookRegistration[] {
  return Array.from(registry.values()).filter((w) => w.projectId === projectId);
}

// BUG-A5-5-005: block localhost/private IPs to prevent SSRF
export function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '[::1]') return true;
    // IPv4 private ranges
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
      const [a, b] = parts.map(Number);
      if (a === 127) return true;            // 127.0.0.0/8
      if (a === 10) return true;             // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // 169.254.0.0/16
      if (a === 0) return true;              // 0.0.0.0/8
    }
    return false;
  } catch {
    return true; // Block unparseable URLs
  }
}

const SENSITIVE_KEYS = new Set(['apiKey', 'secret', 'token', 'password']);

function redactSensitiveFields(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveFields);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitiveFields(value);
    }
  }
  return result;
}

export async function fireWebhook(
  projectId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const matching = Array.from(registry.values()).filter(
    (w) => w.projectId === projectId && w.events.includes(event),
  );

  if (matching.length === 0) return;

  const sanitizedPayload = redactSensitiveFields(payload);

  const body = JSON.stringify({
    event,
    projectId,
    timestamp: new Date().toISOString(),
    data: sanitizedPayload,
  });

  await Promise.allSettled(
    matching
      .filter((w) => !isPrivateUrl(w.url))
      .map((w) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        return fetch(w.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        })
          .catch(() => {
            // Silently ignore delivery failures — fire-and-forget
          })
          .finally(() => clearTimeout(timeoutId));
      }),
  );
}
