/**
 * Measurement precision settings — persisted in localStorage as "mx-measurement-settings".
 * Used by geometry-engine formatting and the settings panel.
 */

export type UnitSystem = 'imperial' | 'metric';
export type DecimalPlaces = 0 | 1 | 2 | 3;
export type AreaUnit = 'sf' | 'sy' | 'sm' | 'sm2';
export type LinearUnit = 'ft' | 'in' | 'm' | 'cm';
export type ScaleDisplayFormat = 'architectural' | 'engineering' | 'ratio';

export interface MeasurementSettings {
  unit: UnitSystem;
  decimals: DecimalPlaces;
  areaUnit: AreaUnit;
  linearUnit: LinearUnit;
  scaleDisplayFormat: ScaleDisplayFormat;
}

export const DEFAULT_MEASUREMENT_SETTINGS: MeasurementSettings = {
  unit: 'imperial',
  decimals: 1,
  areaUnit: 'sf',
  linearUnit: 'ft',
  scaleDisplayFormat: 'architectural',
};

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sf: 'SF',
  sy: 'SY',
  sm: 'SM',
  sm2: 'm²',
};

export const LINEAR_UNIT_LABELS: Record<LinearUnit, string> = {
  ft: 'ft',
  in: 'in',
  m: 'm',
  cm: 'cm',
};

// Conversion factors from base units (sq ft for area, ft for linear)
const AREA_CONVERSIONS: Record<AreaUnit, number> = {
  sf: 1,
  sy: 1 / 9,        // 1 sq yd = 9 sq ft
  sm: 0.092903,      // 1 sq ft ≈ 0.092903 sq m
  sm2: 0.092903,
};

const LINEAR_CONVERSIONS: Record<LinearUnit, number> = {
  ft: 1,
  in: 12,            // 1 ft = 12 in
  m: 0.3048,         // 1 ft = 0.3048 m
  cm: 30.48,         // 1 ft = 30.48 cm
};

const STORAGE_KEY = 'mx-measurement-settings';

export function loadMeasurementSettings(): MeasurementSettings {
  if (typeof window === 'undefined') return DEFAULT_MEASUREMENT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MEASUREMENT_SETTINGS;
    const parsed = JSON.parse(raw);
    const validUnit = parsed.unit === 'imperial' || parsed.unit === 'metric' ? parsed.unit : DEFAULT_MEASUREMENT_SETTINGS.unit;
    return {
      unit: validUnit,
      decimals: parsed.decimals ?? DEFAULT_MEASUREMENT_SETTINGS.decimals,
      areaUnit: parsed.areaUnit ?? DEFAULT_MEASUREMENT_SETTINGS.areaUnit,
      linearUnit: parsed.linearUnit ?? DEFAULT_MEASUREMENT_SETTINGS.linearUnit,
      scaleDisplayFormat: parsed.scaleDisplayFormat ?? DEFAULT_MEASUREMENT_SETTINGS.scaleDisplayFormat,
    };
  } catch {
    return DEFAULT_MEASUREMENT_SETTINGS;
  }
}

export function saveMeasurementSettings(settings: MeasurementSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Convert a value in sq ft to the target area unit */
export function convertArea(sqFt: number, toUnit: AreaUnit): number {
  return sqFt * AREA_CONVERSIONS[toUnit];
}

/** Convert a value in ft to the target linear unit */
export function convertLinear(ft: number, toUnit: LinearUnit): number {
  return ft * LINEAR_CONVERSIONS[toUnit];
}

/** Format a number with locale-aware commas (e.g. 1412 → "1,412"). */
function formatWithCommas(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format an area value according to measurement settings. */
export function formatArea(sqFtValue: number, settings: MeasurementSettings): string {
  const converted = convertArea(sqFtValue, settings.areaUnit);
  return `${formatWithCommas(converted, settings.decimals)} ${AREA_UNIT_LABELS[settings.areaUnit]}`;
}

/** Format a linear value according to measurement settings. */
export function formatLinear(ftValue: number, settings: MeasurementSettings): string {
  const converted = convertLinear(ftValue, settings.linearUnit);
  return `${formatWithCommas(converted, settings.decimals)} ${LINEAR_UNIT_LABELS[settings.linearUnit]}`;
}

/** Format a count value (always integer). */
export function formatCount(count: number): string {
  return `${count.toLocaleString('en-US')} EA`;
}
