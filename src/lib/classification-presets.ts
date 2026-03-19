import type { Classification } from './types';

export interface ClassificationPreset {
  name: string;
  type: Classification['type'];
  color: string;
  keywords: string[];
}

export const PRESET_COUNT_CLASSIFICATIONS: ClassificationPreset[] = [
  // Doors
  { name: 'Doors (Interior)', type: 'count', color: '#8B4513', keywords: ['door', 'interior door', 'single', 'swing', 'single swing door'] },
  { name: 'Doors (Exterior)', type: 'count', color: '#A0522D', keywords: ['exterior door', 'entry door', 'double door', 'double swing'] },

  // Windows & Skylights
  { name: 'Windows', type: 'count', color: '#87CEEB', keywords: ['window', 'casement', 'awning', 'sliding window'] },
  { name: 'Skylights', type: 'count', color: '#7EC8E3', keywords: ['skylight', 'roof window', 'roof light'] },

  // Electrical
  { name: 'Fixtures (Light)', type: 'count', color: '#FFE066', keywords: ['light', 'light fixture', 'luminaire', 'recessed light', 'pendant'] },
  { name: 'Outlets', type: 'count', color: '#FFA726', keywords: ['outlet', 'receptacle', 'plug', 'electrical outlet', 'duplex'] },
  { name: 'Switches', type: 'count', color: '#FFB74D', keywords: ['switch', 'light switch', 'dimmer', 'toggle'] },

  // Plumbing Fixtures
  { name: 'Fixtures (Plumbing)', type: 'count', color: '#B0E0E6', keywords: ['plumbing fixture', 'toilet', 'sink', 'lavatory', 'wc'] },
  { name: 'Toilet', type: 'count', color: '#E0E0E0', keywords: ['toilet', 'wc', 'water closet'] },
  { name: 'Sink', type: 'count', color: '#90CAF9', keywords: ['sink', 'lavatory'] },
  { name: 'Kitchen Sink', type: 'count', color: '#4FC3F7', keywords: ['kitchen sink'] },
  { name: 'Bathtub', type: 'count', color: '#80DEEA', keywords: ['tub', 'bath', 'bathtub'] },

  // Structural
  { name: 'Columns', type: 'count', color: '#9E9E9E', keywords: ['column', 'pillar', 'post', 'structural column'] },
  { name: 'Stairs', type: 'count', color: '#78909C', keywords: ['stair', 'staircase', 'stairwell', 'stairway', 'steps'] },

  // Parking
  { name: 'Parking Space', type: 'count', color: '#FFD700', keywords: ['parking', 'stall', 'parking lot', 'parking spot'] },

  // Furniture
  { name: 'Chair', type: 'count', color: '#DEB887', keywords: ['chair'] },
  { name: 'Office Chair', type: 'count', color: '#C9A96E', keywords: ['office chair', 'task chair', 'desk chair'] },
  { name: 'Table', type: 'count', color: '#A08060', keywords: ['table'] },
  { name: 'Dining Table', type: 'count', color: '#B07040', keywords: ['dining table', 'dining room table'] },
  { name: 'Desk', type: 'count', color: '#8B6914', keywords: ['desk', 'workstation'] },
];
