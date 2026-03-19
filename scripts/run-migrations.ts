/**
 * Database migration runner for MeasureX Takeoff.
 * Reads SQL files from supabase/migrations/ and applies them in sorted order.
 *
 * Prerequisites:
 *   1. Run 000_bootstrap.sql in Supabase SQL Editor (creates _migrations table + _exec_sql function)
 *   2. Set env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npm run migrate
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// ── env ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── read migration files ──────────────────────────────────────────

const migrationsDir = path.resolve(
  import.meta.dirname ?? ".",
  "../supabase/migrations"
);

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && f !== "000_bootstrap.sql")
  .sort();

// ── bootstrap check ───────────────────────────────────────────────

async function checkBootstrap(): Promise<boolean> {
  // Verify _exec_sql function exists by running a no-op query
  const { error } = await supabase.rpc("_exec_sql", {
    sql_text: "SELECT 1",
  });

  if (error) {
    const bootstrapPath = path.join(migrationsDir, "000_bootstrap.sql");
    console.error("\n⚠️  Bootstrap required.");
    console.error(
      "The _migrations table and _exec_sql function do not exist yet.\n"
    );
    console.error("Run the following file in the Supabase SQL Editor:");
    console.error(`  ${bootstrapPath}\n`);
    console.error("Then re-run: npm run migrate\n");
    return false;
  }
  return true;
}

// ── get applied migrations ────────────────────────────────────────

async function getAppliedMigrations(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("_migrations")
    .select("name");

  if (error) {
    console.error("Failed to read _migrations table:", error.message);
    process.exit(1);
  }

  return new Set((data ?? []).map((row: { name: string }) => row.name));
}

// ── apply a single migration ──────────────────────────────────────

async function applyMigration(fileName: string): Promise<boolean> {
  const filePath = path.join(migrationsDir, fileName);
  const sql = fs.readFileSync(filePath, "utf-8");

  // Execute the SQL via the _exec_sql function
  const { error: execError } = await supabase.rpc("_exec_sql", {
    sql_text: sql,
  });

  if (execError) {
    console.error(`  ❌ Failed to apply ${fileName}: ${execError.message}`);
    return false;
  }

  // Record the migration
  const { error: insertError } = await supabase
    .from("_migrations")
    .insert({ name: fileName });

  if (insertError) {
    console.error(
      `  ⚠️  SQL applied but failed to record ${fileName}: ${insertError.message}`
    );
    return false;
  }

  return true;
}

// ── main ──────────────────────────────────────────────────────────

async function main() {
  console.log("\n🗄️  MeasureX Takeoff — Migration Runner\n");

  // Check bootstrap
  const ready = await checkBootstrap();
  if (!ready) process.exit(1);

  // Get already-applied migrations
  const applied = await getAppliedMigrations();

  let appliedCount = 0;
  let failedCount = 0;

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      console.log(`  ⏭️  Already applied: ${file}`);
      continue;
    }

    console.log(`  ▶️  Applying ${file}...`);
    const ok = await applyMigration(file);
    if (ok) {
      console.log(`  ✅ Applied: ${file}`);
      appliedCount++;
    } else {
      failedCount++;
      // Stop on first failure to avoid partial state
      console.error(`\n  Stopping due to failure. Fix the issue and re-run.\n`);
      process.exit(1);
    }
  }

  console.log(
    `\nDone. ${appliedCount} migration(s) applied.` +
      (failedCount > 0 ? ` ${failedCount} failed.` : "") +
      ` ${applied.size} previously applied.\n`
  );
}

main().catch((err) => {
  console.error("Migration runner error:", err);
  process.exit(1);
});
