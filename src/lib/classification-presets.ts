import type { Classification } from './types';

export interface ClassificationPreset {
  name: string;
  type: Classification['type'];
  color: string;
  keywords: string[];
}

export const PRESET_COUNT_CLASSIFICATIONS: ClassificationPreset[] = [
  // Doors
  { name: 'Single Door', type: 'count', color: '#8B4513', keywords: ['door', 'single', 'swing', 'single swing door'] },
  { name: 'Double Door', type: 'count', color: '#A0522D', keywords: ['double door', 'double swing', 'double swing door'] },

  // Windows
  { name: 'Window', type: 'count', color: '#87CEEB', keywords: ['window', 'casement', 'awning', 'sliding window'] },

  // Plumbing Fixtures
  { name: 'Toilet', type: 'count', color: '#E0E0E0', keywords: ['toilet', 'wc', 'water closet'] },
  { name: 'Sink', type: 'count', color: '#B0E0E6', keywords: ['sink', 'lavatory'] },
  { name: 'Kitchen Sink', type: 'count', color: '#4FC3F7', keywords: ['kitchen sink'] },
  { name: 'Bathtub', type: 'count', color: '#80DEEA', keywords: ['tub', 'bath', 'bathtub'] },

  // Parking
  { name: 'Parking Space', type: 'count', color: '#FFD700', keywords: ['parking', 'stall', 'parking lot', 'parking spot'] },

  // Furniture
  { name: 'Chair', type: 'count', color: '#DEB887', keywords: ['chair'] },
  { name: 'Office Chair', type: 'count', color: '#C9A96E', keywords: ['office chair', 'task chair', 'desk chair'] },
  { name: 'Table', type: 'count', color: '#A08060', keywords: ['table'] },
  { name: 'Dining Table', type: 'count', color: '#B07040', keywords: ['dining table', 'dining room table'] },
  { name: 'Desk', type: 'count', color: '#8B6914', keywords: ['desk', 'workstation'] },
];
