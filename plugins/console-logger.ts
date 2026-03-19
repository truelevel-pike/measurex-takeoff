import { registerPlugin } from '@/lib/plugins';

registerPlugin('console-logger', {
  onPolygonCreated: (data) => {
    console.log('[console-logger] onPolygonCreated', data);
  },
  onAITakeoffComplete: (data) => {
    console.log('[console-logger] onAITakeoffComplete', data);
  },
  onExport: (data) => {
    console.log('[console-logger] onExport', data);
  },
});
