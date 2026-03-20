import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import {
  registerWebhook,
  unregisterWebhook,
  getWebhooksForProject,
  isPrivateUrl,
} from '@/lib/webhooks';

// BUG-A5-6-112: max webhooks per project
const MAX_WEBHOOKS_PER_PROJECT = 10;

// BUG-A5-H05: zod schema for webhook creation body
// BUG-A5-6-109: require https:// protocol for SSRF protection
const WebhookCreateSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith('https://'), { message: 'url must use https:// protocol' }),
  events: z.array(z.string().min(1)).min(1, 'events must be a non-empty string array'),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const paramsResult = ProjectIdSchema.safeParse(await params);
  if (!paramsResult.success) return validationError(paramsResult.error);
  const { id } = paramsResult.data;
  const webhooks = getWebhooksForProject(id);
  return NextResponse.json({ webhooks });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // BUG-A5-6-108: require admin secret to prevent unauthenticated SSRF via webhook registration
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.get('x-admin-secret') !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paramsResult = ProjectIdSchema.safeParse(await params);
  if (!paramsResult.success) return validationError(paramsResult.error);
  const { id } = paramsResult.data;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const bodyResult = WebhookCreateSchema.safeParse(body);
  if (!bodyResult.success) return validationError(bodyResult.error);
  const { url, events } = bodyResult.data;

  // BUG-A5-6-109: check for private/internal URLs to prevent SSRF
  if (isPrivateUrl(url)) {
    return NextResponse.json({ error: 'Webhook URL must not target private/internal networks' }, { status: 400 });
  }

  // BUG-A5-6-112: limit webhooks per project
  const existing = getWebhooksForProject(id);
  if (existing.length >= MAX_WEBHOOKS_PER_PROJECT) {
    return NextResponse.json({ error: `Maximum of ${MAX_WEBHOOKS_PER_PROJECT} webhooks per project` }, { status: 400 });
  }

  const webhook = registerWebhook(id, url, events);
  return NextResponse.json({ webhook }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // BUG-A5-6-110: require admin secret for DELETE
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.get('x-admin-secret') !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paramsResult = ProjectIdSchema.safeParse(await params);
  if (!paramsResult.success) return validationError(paramsResult.error);
  const { id } = paramsResult.data;

  const { searchParams } = new URL(req.url);
  const webhookId = searchParams.get('id');
  if (!webhookId) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  // BUG-A5-6-111: verify webhook belongs to this project before deleting
  const projectWebhooks = getWebhooksForProject(id);
  const belongsToProject = projectWebhooks.some((w) => w.id === webhookId);
  if (!belongsToProject) {
    return NextResponse.json({ error: 'Webhook not found for this project' }, { status: 404 });
  }

  const deleted = unregisterWebhook(webhookId);
  if (!deleted) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
