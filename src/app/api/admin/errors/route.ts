import { NextResponse } from "next/server";
import { getErrors } from "@/lib/error-tracker";
import { rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // BUG-A5-3-003: Apply rate limiting to prevent aggressive admin polling / reconnaissance.
  const limited = rateLimitResponse(req, 10, 60_000);
  if (limited) return limited;

  // Auth check: require x-admin-key header if ADMIN_KEY is set
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey) {
    const provided = req.headers.get("x-admin-key");
    if (provided !== adminKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const errors = getErrors();
  return NextResponse.json({ errors, count: errors.length });
}
