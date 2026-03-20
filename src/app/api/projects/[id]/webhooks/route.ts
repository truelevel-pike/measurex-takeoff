import { NextResponse } from 'next/server';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import {
  registerWebhook,
  unregisterWebhook,
  getWebhooksForProject,
} from '@/lib/webhooks';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const webhooks = getWebhooksForProject(id);
    return NextResponse.json({ webhooks });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Failed to list webhooks') }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const { url, events } = body;
    if (typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json({ error: 'url must be a valid HTTP(S) URL' }, { status: 400 });
    }
    if (!Array.isArray(events) || events.length === 0 || !events.every((e: unknown) => typeof e === 'string')) {
      return NextResponse.json({ error: 'events must be a non-empty string array' }, { status: 400 });
    }

    const webhook = registerWebhook(id, url, events);
    return NextResponse.json({ webhook }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Failed to register webhook') }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Failed to delete webhook') }, { status: 500 });
  }
}
