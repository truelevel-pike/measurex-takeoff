import type { Classification } from './types';

export type ClassificationPresetCategory = 'RESIDENTIAL' | 'COMMERCIAL' | 'SITE_WORK';

export interface ClassificationPreset {
  name: string;
  type: Classification['type'];
  color: string;
}

export interface ClassificationPresetCollection {
  id: ClassificationPresetCategory;
  label: string;
  presets: ClassificationPreset[];
}

export const CLASSIFICATION_PRESET_COLLECTIONS: ClassificationPresetCollection[] = [
  {
    id: 'RESIDENTIAL',
    label: 'Residential',
    presets: [
      { name: 'Foundation', type: 'area', color: '#8B5E3C' },
      { name: 'Slab on Grade', type: 'area', color: '#A47551' },
      { name: 'Framing', type: 'linear', color: '#C97A40' },
      { name: 'Exterior Walls', type: 'area', color: '#5D7EA8' },
      { name: 'Roof', type: 'area', color: '#3F5166' },
      { name: 'Windows', type: 'count', color: '#6FB1D6' },
      { name: 'Doors', type: 'count', color: '#8C5A3C' },
      { name: 'Insulation', type: 'area', color: '#B8A97A' },
      { name: 'Drywall', type: 'area', color: '#D7D2C8' },
      { name: 'Flooring', type: 'area', color: '#A68A64' },
      { name: 'Paint', type: 'area', color: '#C57F5A' },
      { name: 'Plumbing Fixtures', type: 'count', color: '#4FA3B5' },
      { name: 'Electrical Fixtures', type: 'count', color: '#F2C14E' },
    ],
  },
  {
    id: 'COMMERCIAL',
    label: 'Commercial',
    presets: [
      { name: 'Concrete', type: 'area', color: '#7C8A99' },
      { name: 'Structural Steel', type: 'linear', color: '#5E6B78' },
      { name: 'Metal Decking', type: 'area', color: '#8A9AA8' },
      { name: 'Roofing', type: 'area', color: '#3E4C59' },
      { name: 'Exterior Glazing', type: 'area', color: '#5DA9D6' },
      { name: 'Curtain Wall', type: 'area', color: '#4B8BB8' },
      { name: 'Mechanical', type: 'linear', color: '#6C9A8B' },
      { name: 'Electrical', type: 'linear', color: '#E2B84B' },
      { name: 'Plumbing', type: 'linear', color: '#4C96A8' },
      { name: 'Fire Protection', type: 'linear', color: '#D65A4A' },
      { name: 'Interior Partitions', type: 'area', color: '#9C8C7A' },
      { name: 'Ceiling', type: 'area', color: '#C7C3B8' },
      { name: 'Flooring', type: 'area', color: '#7A6751' },
    ],
  },
  {
    id: 'SITE_WORK',
    label: 'Site Work',
    presets: [
      { name: 'Demolition', type: 'area', color: '#A05A4A' },
      { name: 'Earthwork', type: 'area', color: '#8B6B4A' },
      { name: 'Grading', type: 'area', color: '#9A7B54' },
      { name: 'Paving', type: 'area', color: '#4E5966' },
      { name: 'Concrete Flatwork', type: 'area', color: '#7A8794' },
      { name: 'Utilities', type: 'linear', color: '#2E8FA3' },
      { name: 'Landscaping', type: 'area', color: '#5C8D4E' },
      { name: 'Fencing', type: 'linear', color: '#7F6A4D' },
      { name: 'Retaining Walls', type: 'linear', color: '#6D5A48' },
    ],
  },
];
