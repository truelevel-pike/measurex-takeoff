import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getErrors } from "@/lib/error-tracker";
import { rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // BUG-A5-3-003: Apply rate limiting to prevent aggressive admin polling / reconnaissance.
  const limited = rateLimitResponse(req, 10, 60_000);
  if (limited) return limited;

  // BUG-A5-5-016: require ADMIN_SECRET header auth before returning error data
  // BUG-A5-6-120: use constant-time comparison to prevent timing attacks
  const adminSecret = process.env.ADMIN_SECRET || process.env.ADMIN_KEY;
  if (!adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const headerVal = req.headers.get("x-admin-secret") ?? "";
  const secretBuf = Buffer.from(adminSecret);
  const headerBuf = Buffer.from(headerVal);
  if (secretBuf.length !== headerBuf.length || !timingSafeEqual(secretBuf, headerBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors = getErrors();
  return NextResponse.json({ errors, count: errors.length });
}
