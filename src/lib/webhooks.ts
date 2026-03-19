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

export async function fireWebhook(
  projectId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const matching = Array.from(registry.values()).filter(
    (w) => w.projectId === projectId && w.events.includes(event),
  );

  if (matching.length === 0) return;

  const body = JSON.stringify({
    event,
    projectId,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  await Promise.allSettled(
    matching.map((w) =>
      fetch(w.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {
        // Silently ignore delivery failures — fire-and-forget
      }),
    ),
  );
}
