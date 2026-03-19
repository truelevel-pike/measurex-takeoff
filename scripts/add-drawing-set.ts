import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Check existing columns
const r = await supabase.from('mx_pages').select('*').limit(1);
if (r.data && r.data.length > 0) {
  console.log('Existing mx_pages columns:', Object.keys(r.data[0]).join(', '));
  if ('drawing_set' in r.data[0]) {
    console.log('drawing_set already exists!');
    process.exit(0);
  }
}
console.log('drawing_set column missing. Trying to add via exec_sql RPC...');

const r2 = await supabase.rpc('exec_sql', { sql: 'alter table mx_pages add column if not exists drawing_set text' });
console.log('exec_sql result:', JSON.stringify(r2));

// Verify
const r3 = await supabase.from('mx_pages').select('drawing_set').limit(0);
console.log('Verify drawing_set:', r3.error ? `ERROR: ${r3.error.message}` : 'Column exists!');
