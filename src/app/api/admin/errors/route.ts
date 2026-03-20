import { NextResponse } from "next/server";
import { getErrors } from "@/lib/error-tracker";
import { rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // BUG-A5-3-003: Apply rate limiting to prevent aggressive admin polling / reconnaissance.
  const limited = rateLimitResponse(req, 10, 60_000);
  if (limited) return limited;

  // BUG-A5-5-016: require ADMIN_SECRET header auth before returning error data
  const adminSecret = process.env.ADMIN_SECRET || process.env.ADMIN_KEY;
  if (!adminSecret || req.headers.get("x-admin-secret") !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors = getErrors();
  return NextResponse.json({ errors, count: errors.length });
}
