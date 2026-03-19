/**
 * Smart trade-based classification grouping.
 * Used by both the QuantitiesPanel (UI rendering) and the store (auto-assign on creation).
 */

export type TradeGroup =
  | 'STRUCTURAL'
  | 'MECHANICAL'
  | 'ARCHITECTURAL'
  | 'SITEWORK'
  | 'OTHER';

export const TRADE_GROUP_ORDER: TradeGroup[] = [
  'STRUCTURAL',
  'MECHANICAL',
  'ARCHITECTURAL',
  'SITEWORK',
  'OTHER',
];

export const TRADE_GROUP_LABELS: Record<TradeGroup, string> = {
  STRUCTURAL: 'Structural',
  MECHANICAL: 'Mechanical',
  ARCHITECTURAL: 'Architectural',
  SITEWORK: 'Sitework',
  OTHER: 'Other',
};

/** Keywords are matched case-insensitively against the classification name. */
const TRADE_KEYWORDS: Record<Exclude<TradeGroup, 'OTHER'>, string[]> = {
  STRUCTURAL: [
    'wall',
    'walls',
    'column',
    'columns',
    'beam',
    'beams',
    'foundation',
    'footing',
    'footings',
    'slab',
    'slabs',
    'structural',
    'concrete',
    'steel',
    'framing',
    'shear',
    'load bearing',
    'retaining',
  ],
  MECHANICAL: [
    'plumbing',
    'hvac',
    'mechanical',
    'electrical',
    'conduit',
    'ductwork',
    'duct',
    'pipe',
    'piping',
    'drain',
    'fixture',
    'fixtures',
    'panel',
    'wiring',
    'sprinkler',
    'fire protection',
    'outlets',
    'lighting',
  ],
  ARCHITECTURAL: [
    'door',
    'doors',
    'window',
    'windows',
    'room',
    'rooms',
    'floor area',
    'ceiling',
    'ceilings',
    'partition',
    'partitions',
    'interior',
    'finish',
    'finishes',
    'flooring',
    'carpet',
    'tile',
    'drywall',
    'millwork',
    'cabinetry',
    'casework',
    'glazing',
    'curtain wall',
    'facade',
    'cladding',
    'insulation',
    'roofing',
    'roof',
  ],
  SITEWORK: [
    'lot',
    'parking',
    'road',
    'roads',
    'fencing',
    'fence',
    'site',
    'sitework',
    'grading',
    'earthwork',
    'paving',
    'pavement',
    'landscaping',
    'utilities',
    'demolition',
    'clearing',
    'drainage',
    'curb',
    'sidewalk',
    'driveway',
  ],
};

/**
 * Determine the trade group for a classification by keyword matching on its name.
 * Groups are checked in TRADE_GROUP_ORDER; the first match wins.
 * Falls back to 'OTHER' if no keywords match.
 */
export function assignTradeGroup(classificationName: string): TradeGroup {
  const lower = classificationName.toLowerCase();
  for (const trade of TRADE_GROUP_ORDER) {
    if (trade === 'OTHER') break;
    const keywords = TRADE_KEYWORDS[trade];
    if (keywords.some((kw) => lower.includes(kw))) {
      return trade;
    }
  }
  return 'OTHER';
}
