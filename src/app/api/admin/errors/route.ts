import { NextResponse } from "next/server";
import { getErrors } from "@/lib/error-tracker";

export async function GET(req: Request) {
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
