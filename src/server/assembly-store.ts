/**
 * Global Assembly + Material Library storage (P3-01 / P3-02).
 *
 * Uses flat JSON files in `data/` (same pattern as project-store.ts file mode).
 * On Vercel these live in /tmp so they reset between invocations; a future
 * migration can move them to Supabase tables when needed.
 *
 * Files:
 *   data/assemblies.json       — global Assembly records
 *   data/assembly_materials.json — AssemblyMaterial line items
 *   data/material_library.json  — MaterialLibraryItem catalog
 */

import fs from 'fs/promises';
import path from 'path';

// ── Path helpers ─────────────────────────────────────────────────────────────

function dataDir(): string {
  // On Vercel cwd() is read-only — use /tmp instead
  const base = process.env.VERCEL === '1' ? '/tmp' : path.resolve(process.cwd(), 'data');
  return base;
}

async function ensureDataDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

function assembliesFile() { return path.join(dataDir(), 'assemblies.json'); }
function assemblyMaterialsFile() { return path.join(dataDir(), 'assembly_materials.json'); }
function materialLibraryFile() { return path.join(dataDir(), 'material_library.json'); }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlobalAssembly {
  id: string;
  name: string;
  classificationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssemblyMaterial {
  id: string;
  assemblyId: string;
  name: string;
  unit: string;
  quantityPerUnit: number;
  unitCost: number;
}

export interface MaterialLibraryItem {
  id: string;
  name: string;
  unit: string;
  defaultUnitCost: number;
  category: string;
  createdAt: string;
}

// ── Seed data ────────────────────────────────────────────────────────────────

const SEED_MATERIALS: MaterialLibraryItem[] = [
  { id: 'mat-2x4',      name: '2x4 Stud',           unit: 'LF',  defaultUnitCost: 0.85,   category: 'Lumber',    createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-drywall',  name: 'Drywall 1/2"',         unit: 'SF',  defaultUnitCost: 0.65,   category: 'Drywall',   createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-concrete', name: 'Concrete',              unit: 'CY',  defaultUnitCost: 145.00, category: 'Concrete',  createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-rebar',    name: 'Rebar #4',              unit: 'LF',  defaultUnitCost: 0.95,   category: 'Concrete',  createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-insul',    name: 'Insulation R-13',       unit: 'SF',  defaultUnitCost: 0.55,   category: 'Insulation',createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-osb',      name: 'OSB 7/16"',             unit: 'SF',  defaultUnitCost: 0.72,   category: 'Lumber',    createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-shingle',  name: 'Roofing Shingle',       unit: 'SQ',  defaultUnitCost: 95.00,  category: 'Roofing',   createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-paint',    name: 'Paint Interior',        unit: 'SF',  defaultUnitCost: 1.20,   category: 'Finishes',  createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-labor-fr', name: 'Labor Framing',         unit: 'HR',  defaultUnitCost: 65.00,  category: 'Labor',     createdAt: '2024-01-01T00:00:00Z' },
  { id: 'mat-labor-fi', name: 'Labor Finishing',       unit: 'HR',  defaultUnitCost: 55.00,  category: 'Labor',     createdAt: '2024-01-01T00:00:00Z' },
];

// ── Assembly CRUD ─────────────────────────────────────────────────────────────

export async function listAssemblies(): Promise<GlobalAssembly[]> {
  await ensureDataDir();
  return readJson<GlobalAssembly[]>(assembliesFile(), []);
}

export async function getAssembly(id: string): Promise<GlobalAssembly | null> {
  const all = await listAssemblies();
  return all.find((a) => a.id === id) ?? null;
}

export async function createGlobalAssembly(
  data: Pick<GlobalAssembly, 'name' | 'classificationId'>,
): Promise<GlobalAssembly> {
  await ensureDataDir();
  const all = await listAssemblies();
  const now = new Date().toISOString();
  const assembly: GlobalAssembly = {
    id: crypto.randomUUID(),
    name: data.name,
    classificationId: data.classificationId,
    createdAt: now,
    updatedAt: now,
  };
  all.push(assembly);
  await writeJson(assembliesFile(), all);
  return assembly;
}

export async function updateGlobalAssembly(
  id: string,
  patch: Partial<Pick<GlobalAssembly, 'name' | 'classificationId'>>,
): Promise<GlobalAssembly | null> {
  await ensureDataDir();
  const all = await listAssemblies();
  const idx = all.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  await writeJson(assembliesFile(), all);
  return all[idx];
}

export async function deleteGlobalAssembly(id: string): Promise<boolean> {
  await ensureDataDir();
  const all = await listAssemblies();
  const before = all.length;
  const filtered = all.filter((a) => a.id !== id);
  if (filtered.length === before) return false;
  await writeJson(assembliesFile(), filtered);
  // Also remove linked materials
  const mats = await listAssemblyMaterials();
  await writeJson(assemblyMaterialsFile(), mats.filter((m) => m.assemblyId !== id));
  return true;
}

export async function linkAssemblyToClassification(
  assemblyId: string,
  classificationId: string,
): Promise<GlobalAssembly | null> {
  return updateGlobalAssembly(assemblyId, { classificationId });
}

export async function getAssemblyForClassification(
  classificationId: string,
): Promise<GlobalAssembly | null> {
  const all = await listAssemblies();
  return all.find((a) => a.classificationId === classificationId) ?? null;
}

// ── AssemblyMaterial CRUD ─────────────────────────────────────────────────────

export async function listAssemblyMaterials(assemblyId?: string): Promise<AssemblyMaterial[]> {
  await ensureDataDir();
  const all = await readJson<AssemblyMaterial[]>(assemblyMaterialsFile(), []);
  return assemblyId ? all.filter((m) => m.assemblyId === assemblyId) : all;
}

export async function addAssemblyMaterial(
  assemblyId: string,
  data: Omit<AssemblyMaterial, 'id' | 'assemblyId'>,
): Promise<AssemblyMaterial> {
  await ensureDataDir();
  const all = await readJson<AssemblyMaterial[]>(assemblyMaterialsFile(), []);
  const mat: AssemblyMaterial = { id: crypto.randomUUID(), assemblyId, ...data };
  all.push(mat);
  await writeJson(assemblyMaterialsFile(), all);
  // Bump assembly updatedAt
  await updateGlobalAssembly(assemblyId, {});
  return mat;
}

export async function updateAssemblyMaterial(
  matId: string,
  patch: Partial<Omit<AssemblyMaterial, 'id' | 'assemblyId'>>,
): Promise<AssemblyMaterial | null> {
  await ensureDataDir();
  const all = await readJson<AssemblyMaterial[]>(assemblyMaterialsFile(), []);
  const idx = all.findIndex((m) => m.id === matId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeJson(assemblyMaterialsFile(), all);
  return all[idx];
}

export async function deleteAssemblyMaterial(matId: string): Promise<boolean> {
  await ensureDataDir();
  const all = await readJson<AssemblyMaterial[]>(assemblyMaterialsFile(), []);
  const before = all.length;
  const filtered = all.filter((m) => m.id !== matId);
  if (filtered.length === before) return false;
  await writeJson(assemblyMaterialsFile(), filtered);
  return true;
}

// ── Material Library CRUD ─────────────────────────────────────────────────────

export async function listMaterialLibrary(category?: string): Promise<MaterialLibraryItem[]> {
  await ensureDataDir();
  let items = await readJson<MaterialLibraryItem[]>(materialLibraryFile(), []);
  // Seed on first access
  if (items.length === 0) {
    items = [...SEED_MATERIALS];
    await writeJson(materialLibraryFile(), items);
  }
  return category ? items.filter((m) => m.category === category) : items;
}

export async function createMaterialLibraryItem(
  data: Omit<MaterialLibraryItem, 'id' | 'createdAt'>,
): Promise<MaterialLibraryItem> {
  await ensureDataDir();
  const all = await listMaterialLibrary();
  const item: MaterialLibraryItem = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
  all.push(item);
  await writeJson(materialLibraryFile(), all);
  return item;
}

export async function updateMaterialLibraryItem(
  id: string,
  patch: Partial<Omit<MaterialLibraryItem, 'id' | 'createdAt'>>,
): Promise<MaterialLibraryItem | null> {
  await ensureDataDir();
  const all = await readJson<MaterialLibraryItem[]>(materialLibraryFile(), []);
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeJson(materialLibraryFile(), all);
  return all[idx];
}

export async function deleteMaterialLibraryItem(id: string): Promise<boolean> {
  await ensureDataDir();
  const all = await readJson<MaterialLibraryItem[]>(materialLibraryFile(), []);
  const before = all.length;
  const filtered = all.filter((m) => m.id !== id);
  if (filtered.length === before) return false;
  await writeJson(materialLibraryFile(), filtered);
  return true;
}
