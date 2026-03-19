import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getHistory,
  getProject,
  createPolygon,
  updatePolygon,
  deletePolygon,
  initDataDir,
} from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';

const ParamsSchema = z.object({
  id: z.string().uuid(),
  entryId: z.string().uuid(),
});

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    await initDataDir();
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }
    const { id: projectId, entryId } = parsed.data;

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Find the history entry
    const history = await getHistory(projectId, 200);
    const entry = history.find((h) => h.id === entryId);
    if (!entry) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    if (entry.entityType !== 'polygon') {
      return NextResponse.json(
        { error: `Restore not supported for entity type: ${entry.entityType}` },
        { status: 400 },
      );
    }

    // Restore logic: reverse the action
    switch (entry.actionType) {
      case 'delete': {
        // Polygon was deleted — recreate from beforeData
        const snapshot = entry.beforeData as Record<string, unknown> | null;
        if (!snapshot) {
          return NextResponse.json({ error: 'No snapshot data to restore' }, { status: 400 });
        }
        const polygon = await createPolygon(projectId, {
          id: (snapshot.id as string) || undefined,
          points: snapshot.points as Array<{ x: number; y: number }>,
          classificationId: snapshot.classification_id as string ?? snapshot.classificationId as string,
          pageNumber: (snapshot.page_number as number) ?? (snapshot.pageNumber as number) ?? 1,
          area: (snapshot.area_pixels as number) ?? (snapshot.area as number) ?? 0,
          linearFeet: (snapshot.linear_pixels as number) ?? (snapshot.linearFeet as number) ?? 0,
          isComplete: (snapshot.is_complete as boolean) ?? (snapshot.isComplete as boolean) ?? true,
          label: (snapshot.label as string) ?? undefined,
        });
        broadcastToProject(projectId, 'polygon:created', polygon);
        return NextResponse.json({ restored: true, action: 'recreated', polygon });
      }

      case 'update': {
        // Polygon was updated — revert to beforeData
        const before = entry.beforeData as Record<string, unknown> | null;
        if (!before) {
          return NextResponse.json({ error: 'No before-data to restore' }, { status: 400 });
        }
        const polygonId = entry.entityId;
        if (!polygonId) {
          return NextResponse.json({ error: 'No entity ID' }, { status: 400 });
        }
        const patch = {
          points: before.points as Array<{ x: number; y: number }> | undefined,
          classificationId: (before.classification_id as string) ?? (before.classificationId as string) ?? undefined,
          pageNumber: (before.page_number as number) ?? (before.pageNumber as number) ?? undefined,
          area: (before.area_pixels as number) ?? (before.area as number) ?? undefined,
          linearFeet: (before.linear_pixels as number) ?? (before.linearFeet as number) ?? undefined,
          isComplete: (before.is_complete as boolean) ?? (before.isComplete as boolean) ?? undefined,
          label: (before.label as string) ?? undefined,
        };
        const updated = await updatePolygon(projectId, polygonId, patch);
        if (updated) broadcastToProject(projectId, 'polygon:updated', updated);
        return NextResponse.json({ restored: true, action: 'reverted', polygon: updated });
      }

      case 'create': {
        // Polygon was created — delete it to undo
        const polygonId = entry.entityId;
        if (!polygonId) {
          return NextResponse.json({ error: 'No entity ID' }, { status: 400 });
        }
        const ok = await deletePolygon(projectId, polygonId);
        if (ok) broadcastToProject(projectId, 'polygon:deleted', { id: polygonId });
        return NextResponse.json({ restored: true, action: 'deleted', ok });
      }

      default:
        return NextResponse.json({ error: 'Unknown action type' }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error('[POST /history/restore]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
