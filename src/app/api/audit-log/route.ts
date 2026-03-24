import { NextResponse } from 'next/server';
import { rateLimitResponse } from '@/lib/rate-limit';

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  resourceId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const entries: AuditEntry[] = [];

export async function GET(request: Request) {
  const rlResp = rateLimitResponse(request, 20, 60_000);
  if (rlResp) return rlResp;
  // BUG-A5-5-018: require auth before exposing audit log data
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || request.headers.get('x-admin-secret') !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ entries: entries.slice(-MAX_ENTRIES) });
}

export async function POST(request: Request) {
  try {
    const rlResp = rateLimitResponse(request, 20, 60_000);
    if (rlResp) return rlResp;
    const body = await request.json();
    const { action, resource, resourceId, metadata } = body;

    if (!action || !resource || !resourceId) {
      return NextResponse.json(
        { error: 'action, resource, and resourceId are required' },
        { status: 400 },
      );
    }

    const MAX_FIELD_LENGTH = 500;
    const actionStr = String(action);
    const resourceStr = String(resource);
    const resourceIdStr = String(resourceId);
    if (
      actionStr.length > MAX_FIELD_LENGTH ||
      resourceStr.length > MAX_FIELD_LENGTH ||
      resourceIdStr.length > MAX_FIELD_LENGTH
    ) {
      return NextResponse.json(
        { error: `action, resource, and resourceId must be under ${MAX_FIELD_LENGTH} characters` },
        { status: 400 },
      );
    }

    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: actionStr,
      resource: resourceStr,
      resourceId: resourceIdStr,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    };

    entries.push(entry);
    // Cap at MAX_ENTRIES
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }

    return NextResponse.json({ ok: true, entry });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
