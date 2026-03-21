import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getAllFlags, setServerFlag, FLAG_NAMES, type FlagName } from '@/lib/feature-flags';
import { rateLimitResponse } from '@/lib/rate-limit';

const SetFlagSchema = z.object({
  flag: z.enum(FLAG_NAMES as [FlagName, ...FlagName[]]),
  value: z.boolean(),
});

export async function GET(req: Request) {
  const rlResponse = rateLimitResponse(req);
  if (rlResponse) return rlResponse;

  return NextResponse.json(getAllFlags());
}

export async function POST(req: Request) {
  try {
    // BUG-A5-5-003: require ADMIN_SECRET header auth for flag mutation
    // BUG-A5-6-022: use constant-time comparison to prevent timing attacks
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const secretBuffer = Buffer.from(adminSecret);
    const headerBuffer = Buffer.from(req.headers.get('x-admin-secret') ?? '');
    if (secretBuffer.length !== headerBuffer.length || !timingSafeEqual(secretBuffer, headerBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const parsed = SetFlagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { flag, value } = parsed.data;
    setServerFlag(flag, value);
    return NextResponse.json({ flag, value });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
