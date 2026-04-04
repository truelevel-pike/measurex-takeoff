/**
 * P3-02: Reusable Material Library
 *
 * Default construction materials with typical costs.
 * Stored in localStorage under 'mx-material-library' so they persist across
 * projects and sessions. Projects import materials into their assemblies.
 */

export interface LibraryMaterial {
  id: string;
  name: string;
  unit: 'sf' | 'lf' | 'ea' | 'cy' | 'sy';
  costPerUnit: number;
  category: string;
  /** True if this is a built-in default (cannot be deleted, but cost can be overridden). */
  isDefault?: boolean;
}

export const DEFAULT_MATERIALS: LibraryMaterial[] = [
  // Walls
  { id: 'drywall', name: 'Drywall (1/2")', unit: 'sf', costPerUnit: 2.50, category: 'Walls', isDefault: true },
  { id: 'paint-int', name: 'Interior Paint (2 coats)', unit: 'sf', costPerUnit: 0.50, category: 'Finishes', isDefault: true },
  // Flooring
  { id: 'carpet', name: 'Carpet (mid-grade)', unit: 'sf', costPerUnit: 4.00, category: 'Flooring', isDefault: true },
  { id: 'hardwood', name: 'Hardwood Flooring', unit: 'sf', costPerUnit: 8.00, category: 'Flooring', isDefault: true },
  { id: 'tile', name: 'Ceramic Tile', unit: 'sf', costPerUnit: 6.00, category: 'Flooring', isDefault: true },
  // Structure
  { id: 'framing', name: 'Framing Lumber (2x4)', unit: 'lf', costPerUnit: 3.50, category: 'Structure', isDefault: true },
  // Trim
  { id: 'baseboard', name: 'Baseboard Trim', unit: 'lf', costPerUnit: 2.00, category: 'Trim', isDefault: true },
  { id: 'crown', name: 'Crown Molding', unit: 'lf', costPerUnit: 4.50, category: 'Trim', isDefault: true },
  // Doors
  { id: 'door-int', name: 'Interior Door', unit: 'ea', costPerUnit: 350, category: 'Doors', isDefault: true },
  { id: 'door-ext', name: 'Exterior Door', unit: 'ea', costPerUnit: 800, category: 'Doors', isDefault: true },
  // Windows
  { id: 'window-std', name: 'Standard Window', unit: 'ea', costPerUnit: 500, category: 'Windows', isDefault: true },
  // Electrical
  { id: 'outlet', name: 'Electrical Outlet', unit: 'ea', costPerUnit: 150, category: 'Electrical', isDefault: true },
  // Insulation
  { id: 'insulation', name: 'Batt Insulation (R-19)', unit: 'sf', costPerUnit: 1.20, category: 'Insulation', isDefault: true },
  // Roofing
  { id: 'roofing', name: 'Asphalt Shingles', unit: 'sf', costPerUnit: 3.00, category: 'Roofing', isDefault: true },
  // Foundation
  { id: 'concrete', name: 'Concrete (foundation)', unit: 'sf', costPerUnit: 12.00, category: 'Foundation', isDefault: true },
];

const STORAGE_KEY = 'mx-material-library';

/** Load materials from localStorage, merged with defaults. */
export function loadMaterialLibrary(): LibraryMaterial[] {
  if (typeof window === 'undefined') return DEFAULT_MATERIALS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_MATERIALS];
    const saved: LibraryMaterial[] = JSON.parse(raw);
    // Merge: defaults first, then any custom additions; allow overrides to default costs.
    const savedById = new Map(saved.map((m) => [m.id, m]));
    const merged = DEFAULT_MATERIALS.map((def) => savedById.has(def.id) ? { ...def, ...savedById.get(def.id) } : def);
    // Append custom materials (non-default IDs not in DEFAULT_MATERIALS)
    const defaultIds = new Set(DEFAULT_MATERIALS.map((d) => d.id));
    const custom = saved.filter((m) => !defaultIds.has(m.id));
    return [...merged, ...custom];
  } catch {
    return [...DEFAULT_MATERIALS];
  }
}

/** Persist material library to localStorage. */
export function saveMaterialLibrary(materials: LibraryMaterial[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
  } catch {
    // Non-fatal
  }
}

export function allCategories(materials: LibraryMaterial[]): string[] {
  return Array.from(new Set(materials.map((m) => m.category))).sort();
}
