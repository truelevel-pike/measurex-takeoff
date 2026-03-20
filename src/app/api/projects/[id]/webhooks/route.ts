import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import {
  registerWebhook,
  unregisterWebhook,
  getWebhooksForProject,
} from '@/lib/webhooks';

// BUG-A5-H05: zod schema for webhook creation body
const WebhookCreateSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith('http'), { message: 'url must be HTTP(S)' }),
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

  const webhook = registerWebhook(id, url, events);
  return NextResponse.json({ webhook }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const paramsResult = ProjectIdSchema.safeParse(await params);
  if (!paramsResult.success) return validationError(paramsResult.error);

  const { searchParams } = new URL(req.url);
  const webhookId = searchParams.get('id');
  if (!webhookId) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  const deleted = unregisterWebhook(webhookId);
  if (!deleted) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
