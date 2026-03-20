import { NextResponse } from "next/server";

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

const loggedErrors: LoggedErrorReport[] = [];
const MAX_LOGGED_ERRORS = 100;

export async function POST(request: Request) {
  let payload: IncomingErrorReport;

  try {
    payload = (await request.json()) as IncomingErrorReport;
  } catch {
    return NextResponse.json({ received: false, error: "Invalid JSON body" }, { status: 400 });
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
  if (loggedErrors.length > MAX_LOGGED_ERRORS) {
    loggedErrors.splice(0, loggedErrors.length - MAX_LOGGED_ERRORS);
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
  return NextResponse.json({ errors: loggedErrors.slice(-MAX_LOGGED_ERRORS) });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
