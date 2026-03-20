import { NextResponse } from "next/server";
import { rateLimitResponse } from "@/lib/rate-limit";

interface IncomingErrorReport {
  message?: unknown;
  stack?: unknown;
  context?: unknown;
  url?: unknown;
  userAgent?: unknown;
}

interface LoggedErrorReport {
  timestamp: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  url?: string;
  userAgent?: string;
}

// Intentional in-memory storage: this serves as a short-lived error buffer
// for recent error reports. Data is ephemeral and lost on restart by design.
const MAX_ERRORS = 100;
const MAX_STRING_LENGTH = 10_000;
const MAX_URL_LENGTH = 2_000;
const loggedErrors: LoggedErrorReport[] = [];

export async function POST(request: Request) {
  const rlResponse = rateLimitResponse(request);
  if (rlResponse) return rlResponse;

  let payload: IncomingErrorReport;

  try {
    payload = (await request.json()) as IncomingErrorReport;
  } catch {
    return NextResponse.json({ received: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate payload field sizes to prevent oversized payloads from consuming memory
  if (typeof payload.message === "string" && payload.message.length > MAX_STRING_LENGTH) {
    return NextResponse.json({ received: false, error: "message exceeds max length" }, { status: 400 });
  }
  if (typeof payload.stack === "string" && payload.stack.length > MAX_STRING_LENGTH) {
    return NextResponse.json({ received: false, error: "stack exceeds max length" }, { status: 400 });
  }
  if (typeof payload.url === "string" && payload.url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ received: false, error: "url exceeds max length" }, { status: 400 });
  }

  const report: LoggedErrorReport = {
    timestamp: new Date().toISOString(),
    message: typeof payload.message === "string" ? payload.message : "Unknown error",
    stack: typeof payload.stack === "string" ? payload.stack : undefined,
    context: isPlainObject(payload.context) ? payload.context : undefined,
    url: typeof payload.url === "string" ? payload.url : undefined,
    userAgent: typeof payload.userAgent === "string" ? payload.userAgent : undefined,
  };

  loggedErrors.push(report);
  if (loggedErrors.length > MAX_ERRORS) {
    loggedErrors.splice(0, loggedErrors.length - MAX_ERRORS);
  }

  console.error("[mx:error-report]", JSON.stringify(report));
  return NextResponse.json({ received: true });
}

export async function GET(request: Request) {
  // BUG-A5-5-017: require ADMIN_SECRET header auth before returning stored errors
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || request.headers.get('x-admin-secret') !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ errors: loggedErrors.slice(-MAX_ERRORS) });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
