/**
 * Plugin system — register named plugins that hook into application events.
 */

export interface PluginHooks {
  onPolygonCreated?: (data: unknown) => void;
  onAITakeoffComplete?: (data: unknown) => void;
  onExport?: (data: unknown) => void;
}

interface PluginEntry {
  name: string;
  hooks: PluginHooks;
}

const plugins: PluginEntry[] = [];

export function registerPlugin(name: string, hooks: PluginHooks): void {
  if (plugins.some((p) => p.name === name)) {
    console.warn(`[plugins] Plugin "${name}" is already registered — skipping duplicate`);
    return;
  }
  plugins.push({ name, hooks });
}

export function triggerHook(hookName: keyof PluginHooks, data: unknown): void {
  for (const plugin of plugins) {
    const fn = plugin.hooks[hookName];
    if (fn) {
      try {
        fn(data);
      } catch {
        // Silently ignore plugin errors
      }
    }
  }
}

export function getRegisteredPlugins(): PluginEntry[] {
  return [...plugins];
}
