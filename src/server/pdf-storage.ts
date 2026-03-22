/**
 * Dual-mode PDF binary storage.
 *
 * - Supabase mode: stores/retrieves PDFs from Supabase Storage bucket "pdfs"
 * - File mode: stores/retrieves PDFs from data/uploads/{id}.pdf on local disk
 *
 * On Vercel the filesystem is ephemeral, so production deployments MUST use
 * Supabase mode (SUPABASE_SERVICE_ROLE_KEY set).
 */

import path from 'path';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSafeId } from '@/lib/safe-id';

const BUCKET = 'pdfs';

// ── Mode detection (mirrors project-store.ts) ────────────────────────

function isSupabaseMode(): boolean {
  return (
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    isValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Supabase client (lazy, service-role for Storage) ─────────────────

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _client;
}

function storagePath(projectId: string): string {
  return `${projectId}.pdf`;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Save a PDF buffer for a project.
 * Returns the local file path (always written locally for server-side processing).
 * In Supabase mode, also uploads to Supabase Storage for persistence.
 */
export async function savePDF(projectId: string, buffer: Buffer): Promise<string> {
  assertSafeId(projectId, 'projectId');
  // Always write locally so pdf-processor can read it during this request
  const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `${projectId}.pdf`);
  await fs.writeFile(filePath, buffer);

  if (isSupabaseMode()) {
    const client = getClient();
    const { error } = await client.storage
      .from(BUCKET)
      .upload(storagePath(projectId), buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (error) {
      console.error('[pdf-storage] Supabase upload failed:', error.message);
      throw new Error(`Failed to upload PDF to storage: ${error.message}`);
    }
  }

  return filePath;
}

/**
 * Retrieve a PDF as a Buffer for a project.
 * In file mode, reads from local disk.
 * In Supabase mode, tries local disk first (cache), then fetches from Supabase Storage.
 */
export async function loadPDF(projectId: string): Promise<Buffer | null> {
  assertSafeId(projectId, 'projectId');
  const localPath = path.resolve(process.cwd(), 'data', 'uploads', `${projectId}.pdf`);

  // Try local file first (works in dev and as a cache on serverless)
  try {
    return await fs.readFile(localPath);
  } catch {
    // Not on local disk
  }

  // In Supabase mode, fetch from storage
  if (isSupabaseMode()) {
    const client = getClient();
    const { data, error } = await client.storage
      .from(BUCKET)
      .download(storagePath(projectId));

    if (error || !data) {
      console.error('[pdf-storage] Supabase download failed:', error?.message);
      return null;
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    // Cache locally for subsequent reads in this invocation
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, buffer);
    } catch {
      // Non-fatal: local caching is best-effort
    }

    return buffer;
  }

  return null;
}

/**
 * Get the public Supabase Storage URL for a project's PDF.
 * Returns null when not in Supabase mode or if the URL cannot be constructed.
 */
export function getPDFPublicUrl(projectId: string): string | null {
  if (!isSupabaseMode()) return null;
  const client = getClient();
  const { data } = client.storage.from(BUCKET).getPublicUrl(storagePath(projectId));
  return data?.publicUrl ?? null;
}

/**
 * Get a local file path for the PDF, downloading from Supabase Storage if needed.
 * This is useful for functions that require a file path (like pdf-processor).
 * Returns null if the PDF cannot be found.
 */
export async function getPDFPath(projectId: string): Promise<string | null> {
  assertSafeId(projectId, 'projectId');
  const localPath = path.resolve(process.cwd(), 'data', 'uploads', `${projectId}.pdf`);

  // Check local file first
  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    // Not on local disk
  }

  // In Supabase mode, download and cache locally
  if (isSupabaseMode()) {
    const buffer = await loadPDF(projectId);
    if (buffer) return localPath; // loadPDF already cached it
  }

  return null;
}
