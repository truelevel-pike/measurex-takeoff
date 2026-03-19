export interface ClassificationTemplate {
  name: string;
  color: string;
  type: string; // e.g., "area", "linear", "count"
}

export interface TemplateSet {
  name: string;
  templates: ClassificationTemplate[];
}

export const CLASSIFICATION_LIBRARY: TemplateSet[] = [
  {
    name: 'Residential',
    templates: [
      { name: 'Foundation', color: '#8B4513', type: 'area' },
      { name: 'Framing', color: '#D2691E', type: 'area' },
      { name: 'Roofing', color: '#708090', type: 'area' },
      { name: 'Insulation', color: '#F4A460', type: 'area' },
      { name: 'Drywall', color: '#F5F5DC', type: 'area' },
      { name: 'Flooring', color: '#DEB887', type: 'area' },
      { name: 'Windows & Doors', color: '#87CEEB', type: 'count' },
    ],
  },
  {
    name: 'Commercial',
    templates: [
      { name: 'Structural Steel', color: '#808080', type: 'linear' },
      { name: 'Concrete', color: '#A9A9A9', type: 'area' },
      { name: 'Masonry', color: '#BC8F8F', type: 'area' },
      { name: 'Curtain Wall', color: '#ADD8E6', type: 'area' },
      { name: 'MEP Rough-In', color: '#98FB98', type: 'area' },
      { name: 'Suspended Ceiling', color: '#FFFACD', type: 'area' },
      { name: 'Exterior Cladding', color: '#778899', type: 'area' },
      { name: 'Parking', color: '#D3D3D3', type: 'area' },
    ],
  },
  {
    name: 'Site Work',
    templates: [
      { name: 'Clearing', color: '#228B22', type: 'area' },
      { name: 'Grading', color: '#8FBC8F', type: 'area' },
      { name: 'Excavation', color: '#CD853F', type: 'area' },
      { name: 'Paving', color: '#696969', type: 'area' },
      { name: 'Landscaping', color: '#32CD32', type: 'area' },
      { name: 'Drainage', color: '#4169E1', type: 'linear' },
      { name: 'Fencing', color: '#8B8000', type: 'linear' },
    ],
  },
];
