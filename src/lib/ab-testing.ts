/**
 * A/B Testing Framework — register experiments with weighted variants,
 * assign stable variants per session via localStorage.
 */

const isClient = typeof window !== 'undefined';
const STORAGE_KEY = 'mx-ab-variants';

export interface Variant {
  name: string;
  weight: number;
}

export interface Experiment {
  name: string;
  variants: Variant[];
}

export interface ExperimentWithVariant extends Experiment {
  assignedVariant: string | null;
}

const registry = new Map<string, Experiment>();

/** Register an experiment with weighted variants. */
export function defineExperiment(
  name: string,
  variants: string[],
  weights: number[],
): void {
  registry.set(name, {
    name,
    variants: variants.map((v, i) => ({ name: v, weight: weights[i] ?? 1 })),
  });
}

/** Read persisted variant assignments from localStorage or cookie string. */
function loadAssignments(cookieString?: string): Record<string, string> {
  // Try localStorage first (client-side)
  if (isClient) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, string>;
    } catch {
      // ignore
    }
  }

  // Fallback: parse cookie (server-side or if localStorage empty)
  if (cookieString) {
    const match = cookieString
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STORAGE_KEY}=`));
    if (match) {
      try {
        return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('='))) as Record<string, string>;
      } catch {
        // ignore
      }
    }
  }

  return {};
}

function saveAssignments(assignments: Record<string, string>): void {
  if (!isClient) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // ignore
  }
}

/** Pick a variant based on weights using Math.random(). */
function pickVariant(experiment: Experiment): string | null {
  if (!experiment.variants.length) return null;
  const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const v of experiment.variants) {
    rand -= v.weight;
    if (rand <= 0) return v.name;
  }
  return experiment.variants[experiment.variants.length - 1].name;
}

/**
 * Returns a stable variant for the given experiment in the current session.
 * Assigns one if not yet set.
 */
export function getVariant(experimentName: string): string | null {
  const experiment = registry.get(experimentName);
  if (!experiment) return null;

  const assignments = loadAssignments();
  if (assignments[experimentName]) return assignments[experimentName];

  const variant = pickVariant(experiment);
  if (!variant) return null;
  assignments[experimentName] = variant;
  saveAssignments(assignments);
  return variant;
}

/**
 * Returns all registered experiments with their current assigned variant.
 * Optionally accepts a cookie string for server-side resolution.
 */
export function getAllExperiments(cookieString?: string): ExperimentWithVariant[] {
  const assignments = loadAssignments(cookieString);
  return Array.from(registry.values()).map((exp) => ({
    ...exp,
    assignedVariant: assignments[exp.name] ?? null,
  }));
}

// ── Default experiments ─────────────────────────────────────────────

defineExperiment('ONBOARDING_FLOW', ['control', 'simplified'], [1, 1]);
defineExperiment('AI_TAKEOFF_UX', ['button', 'sidebar'], [1, 1]);
