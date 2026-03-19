import { registerPlugin } from '@/lib/plugins';

const webhookUrls: Set<string> = new Set();

export function addWebhook(url: string): void {
  webhookUrls.add(url);
}

export function removeWebhook(url: string): void {
  webhookUrls.delete(url);
}

function forward(event: string, data: unknown): void {
  if (webhookUrls.size === 0) return;

  const body = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString(),
  });

  for (const url of webhookUrls) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      // Fire-and-forget — silently ignore delivery failures
    });
  }
}

registerPlugin('webhook-forwarder', {
  onPolygonCreated: (data) => forward('onPolygonCreated', data),
  onAITakeoffComplete: (data) => forward('onAITakeoffComplete', data),
  onExport: (data) => forward('onExport', data),
});
