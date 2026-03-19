/**
 * Example MeasureX plugin.
 *
 * Register this plugin by importing it in your application entry point
 * or calling registerPlugin() directly.
 *
 * Usage:
 *   import { registerPlugin } from '@/lib/plugin-system';
 *   import { auditLogPlugin } from '../docs/example-plugin';
 *   registerPlugin(auditLogPlugin);
 */

import type { MeasureXPlugin } from '@/lib/plugin-system';
import type { Polygon, Classification, DetectedElement, ScaleCalibration } from '@/lib/types';

export const auditLogPlugin: MeasureXPlugin = {
  name: 'audit-log',
  version: '1.0.0',

  onPolygonCreated(polygon: Polygon, projectId: string) {
    console.log(`[audit] Polygon ${polygon.id} created in project ${projectId}`);
  },

  onPolygonDeleted(polygonId: string, projectId: string) {
    console.log(`[audit] Polygon ${polygonId} deleted from project ${projectId}`);
  },

  async onTakeoffCompleted(results: DetectedElement[], projectId: string) {
    console.log(`[audit] Takeoff completed: ${results.length} elements in project ${projectId}`);
  },

  onClassificationCreated(classification: Classification, projectId: string) {
    console.log(`[audit] Classification "${classification.name}" created in project ${projectId}`);
  },

  onScaleSet(scale: ScaleCalibration, projectId: string) {
    console.log(`[audit] Scale set to ${scale.pixelsPerUnit} px/${scale.unit} in project ${projectId}`);
  },
};
