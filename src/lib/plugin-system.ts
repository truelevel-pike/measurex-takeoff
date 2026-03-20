import type { Polygon, Classification, DetectedElement, ScaleCalibration } from '@/lib/types';

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

export interface MeasureXPlugin {
  name: string;
  version: string;
  onPolygonCreated?: (polygon: Polygon, projectId: string) => void | Promise<void>;
  onPolygonDeleted?: (polygonId: string, projectId: string) => void | Promise<void>;
  onTakeoffCompleted?: (results: DetectedElement[], projectId: string) => void | Promise<void>;
  onClassificationCreated?: (classification: Classification, projectId: string) => void | Promise<void>;
  onScaleSet?: (scale: ScaleCalibration, projectId: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry (HMR-safe singleton via globalThis)
// ---------------------------------------------------------------------------

declare const globalThis: typeof global & {
  __pluginRegistry?: PluginRegistry;
};

type PluginEvent = keyof Omit<MeasureXPlugin, 'name' | 'version'>;

class PluginRegistry {
  private plugins: Map<string, MeasureXPlugin> = new Map();

  register(plugin: MeasureXPlugin): void {
    if (!plugin.name) throw new Error('Plugin must have a name');
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): void {
    this.plugins.delete(name);
  }

  async emit(event: PluginEvent, ...args: unknown[]): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const plugin of this.plugins.values()) {
      const handler = plugin[event] as ((...a: unknown[]) => void | Promise<void>) | undefined;
      if (typeof handler === 'function') {
        try {
          const result = handler.apply(plugin, args);
          if (result && typeof (result as Promise<void>).then === 'function') {
            promises.push(result as Promise<void>);
          }
        } catch (err) {
          console.error(`[plugin:${plugin.name}] error in ${event}:`, err);
        }
      }
    }
    // Await all async handlers; swallow per-plugin errors so one plugin can't break others.
    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[plugin] async handler rejected in ${event}:`, result.reason);
      }
    }
  }

  list(): MeasureXPlugin[] {
    return Array.from(this.plugins.values());
  }
}

// Singleton — survives Next.js HMR reloads
if (!globalThis.__pluginRegistry) {
  globalThis.__pluginRegistry = new PluginRegistry();
}

export const pluginRegistry: PluginRegistry = globalThis.__pluginRegistry;

/** Convenience: register a plugin. */
export function registerPlugin(plugin: MeasureXPlugin): void {
  pluginRegistry.register(plugin);
}

/** Convenience: emit a plugin event to all registered handlers. */
export async function emitPluginEvent(event: PluginEvent, ...args: unknown[]): Promise<void> {
  await pluginRegistry.emit(event, ...args);
}
