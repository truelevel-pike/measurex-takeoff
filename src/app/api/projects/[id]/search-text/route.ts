import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPages, getPolygons, getClassifications, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

const SearchBodySchema = z.object({
  query: z.string(),
});

export interface TextSearchResult {
  pageId: string;
  pageNumber: number;
  pageLabel: string;
  matchType: 'text' | 'polygon';
  snippet: string;
  matchCount: number;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = SearchBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const { query } = bodyResult.data;
    if (!query.trim()) return NextResponse.json({ results: [] });

    const queryLower = query.trim().toLowerCase();

    const [pages, polygons, classifications] = await Promise.all([
      getPages(id),
      getPolygons(id),
      getClassifications(id),
    ]);

    const classificationById = new Map(classifications.map((c) => [c.id, c]));
    const results: TextSearchResult[] = [];

    // 1. Search page text content
    for (const page of pages) {
      if (!page.text) continue;
      const textLower = page.text.toLowerCase();
      if (!textLower.includes(queryLower)) continue;

      // Count occurrences
      // BUG-A5-5-024: cap at 1000 iterations and advance by queryLower.length
      let matchCount = 0;
      let searchFrom = 0;
      const MAX_ITERATIONS = 1000;
      while (matchCount < MAX_ITERATIONS) {
        const idx = textLower.indexOf(queryLower, searchFrom);
        if (idx === -1) break;
        matchCount++;
        searchFrom = idx + queryLower.length;
      }

      // Extract a snippet around the first match
      const firstIdx = textLower.indexOf(queryLower);
      const snippetStart = Math.max(0, firstIdx - 30);
      const snippetEnd = Math.min(page.text.length, firstIdx + query.length + 30);
      const snippet = (snippetStart > 0 ? '…' : '') +
        page.text.slice(snippetStart, snippetEnd).trim() +
        (snippetEnd < page.text.length ? '…' : '');

      results.push({
        pageId: `page-${page.pageNum}`,
        pageNumber: page.pageNum,
        pageLabel: page.name || `Page ${page.pageNum}`,
        matchType: 'text',
        snippet,
        matchCount,
      });
    }

    // 2. Search polygon classification names
    const polygonsByPage = new Map<string, { count: number; classificationName: string }>();
    for (const polygon of polygons) {
      const classification = classificationById.get(polygon.classificationId);
      if (!classification) continue;
      if (!classification.name.toLowerCase().includes(queryLower)) continue;

      const key = `${polygon.pageNumber}-${polygon.classificationId}`;
      const existing = polygonsByPage.get(key);
      if (existing) {
        existing.count++;
      } else {
        polygonsByPage.set(key, { count: 1, classificationName: classification.name });
      }
    }

    for (const [key, { count, classificationName }] of polygonsByPage) {
      const [pageNumStr] = key.split('-');
      const pageNumber = parseInt(pageNumStr, 10);
      const page = pages.find((p) => p.pageNum === pageNumber);

      results.push({
        pageId: `page-${pageNumber}`,
        pageNumber,
        pageLabel: page?.name || `Page ${pageNumber}`,
        matchType: 'polygon',
        snippet: classificationName,
        matchCount: count,
      });
    }

    // Sort by page number, then by match type (text first)
    results.sort((a, b) => a.pageNumber - b.pageNumber || (a.matchType === 'text' ? -1 : 1));

    return NextResponse.json({ results });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
