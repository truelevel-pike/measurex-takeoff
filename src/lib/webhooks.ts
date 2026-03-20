/**
 * Outbound webhook registry — stores registered webhooks in memory (globalThis)
 * and fires HTTP POSTs when matching events occur.
 */

import { randomUUID } from 'crypto';

export interface WebhookRegistration {
  id: string;
  projectId: string;
  url: string;
  events: string[];
  createdAt: string;
}

declare const globalThis: typeof global & {
  __webhookRegistry?: Map<string, WebhookRegistration>;
};

if (!globalThis.__webhookRegistry) {
  globalThis.__webhookRegistry = new Map();
}

const registry = globalThis.__webhookRegistry;

export function registerWebhook(
  projectId: string,
  url: string,
  events: string[],
): WebhookRegistration {
  // BUG-A5-6-139: validate URL at registration time to block private/internal targets
  if (isPrivateUrl(url)) {
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
