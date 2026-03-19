import { NextResponse } from 'next/server';
import { getPages, initDataDir } from '@/server/project-store';

interface ImageResult {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  title: string;
  source: string;
  pageNumber?: number;
  sheetName?: string;
}

interface ImageSearchBody {
  query?: unknown;
  projectId?: unknown;
}

function asString(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sheetThumbnail(title: string, subline: string, accent = '#00d4ff'): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="640" height="420" fill="url(#g)"/>
  <rect x="20" y="20" width="600" height="380" rx="14" ry="14" fill="none" stroke="${accent}" stroke-opacity="0.6" stroke-width="2"/>
  <g fill="${accent}" fill-opacity="0.85">
    <rect x="44" y="62" width="552" height="6" rx="3"/>
    <rect x="44" y="88" width="490" height="4" rx="2" fill-opacity="0.35"/>
    <rect x="44" y="106" width="420" height="4" rx="2" fill-opacity="0.25"/>
  </g>
  <text x="44" y="182" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="32" font-weight="700">${escapeXml(title)}</text>
  <text x="44" y="220" fill="#9ca3af" font-family="Arial, sans-serif" font-size="18">${escapeXml(subline)}</text>
  <text x="44" y="352" fill="#67e8f9" font-family="Arial, sans-serif" font-size="14">Project Sheet Result</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeConstructionQuery(query: string): string {
  const lower = query.toLowerCase();
  const hasContext =
    lower.includes('construction') ||
    lower.includes('building') ||
    lower.includes('architect') ||
    lower.includes('blueprint');
  return hasContext ? query : `${query} construction building`;
}

async function searchBing(query: string): Promise<ImageResult[]> {
  const key = process.env.BING_IMAGE_SEARCH_KEY;
  if (!key) return [];

  const endpoint = process.env.BING_IMAGE_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/images/search';
  const url = new URL(endpoint);
  url.searchParams.set('q', normalizeConstructionQuery(query));
  url.searchParams.set('safeSearch', 'Moderate');
  url.searchParams.set('count', '24');
  url.searchParams.set('imageType', 'Photo');

  const res = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': key },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  const values = Array.isArray(data?.value) ? data.value : [];

  return values
    .map((item: Record<string, unknown>): ImageResult | null => {
      const thumb = asString(item?.thumbnailUrl);
      const full = asString(item?.contentUrl);
      if (!thumb || !full) return null;
      return {
        id: `bing-${asString(item?.imageId) || crypto.randomUUID()}`,
        thumbUrl: thumb,
        fullUrl: full,
        title: asString(item?.name) || 'Bing image result',
        source: 'Bing',
      };
    })
    .filter((x: ImageResult | null): x is ImageResult => Boolean(x));
}

async function searchGoogleCse(query: string): Promise<ImageResult[]> {
  const key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!key || !cx) return [];

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('num', '10');
  url.searchParams.set('q', normalizeConstructionQuery(query));

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return items
    .map((item: Record<string, unknown>): ImageResult | null => {
      const image = item?.image as Record<string, unknown> | undefined;
      const thumb = asString(image?.thumbnailLink) || asString(item?.link);
      const full = asString(item?.link);
      if (!thumb || !full) return null;
      return {
        id: `google-${asString(item?.cacheId) || crypto.randomUUID()}`,
        thumbUrl: thumb,
        fullUrl: full,
        title: asString(item?.title) || 'Google image result',
        source: 'Google CSE',
      };
    })
    .filter((x: ImageResult | null): x is ImageResult => Boolean(x));
}

async function searchUnsplash(query: string): Promise<ImageResult[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', normalizeConstructionQuery(query));
  url.searchParams.set('per_page', '24');
  url.searchParams.set('orientation', 'landscape');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.results) ? data.results : [];

  return items
    .map((item: Record<string, unknown>): ImageResult | null => {
      const urls = item?.urls as Record<string, unknown> | undefined;
      const thumb = asString(urls?.small);
      const full = asString(urls?.regular) || asString(urls?.full);
      if (!thumb || !full) return null;
      return {
        id: `unsplash-${asString(item?.id) || crypto.randomUUID()}`,
        thumbUrl: thumb,
        fullUrl: full,
        title: asString(item?.alt_description) || asString(item?.description) || 'Unsplash image result',
        source: 'Unsplash',
      };
    })
    .filter((x: ImageResult | null): x is ImageResult => Boolean(x));
}

async function searchProjectSheets(query: string, projectId: string): Promise<ImageResult[]> {
  await initDataDir();
  const pages = await getPages(projectId);
  const q = query.toLowerCase();

  const filtered = pages.filter((page) => {
    const name = asString(page.name).toLowerCase();
    const text = asString(page.text).toLowerCase();
    const token = `page ${page.pageNum}`;
    return !q || name.includes(q) || text.includes(q) || token.includes(q);
  });

  return filtered.slice(0, 24).map((page) => {
    const sheetName = asString(page.name) || `Sheet ${page.pageNum}`;
    const preview = sheetThumbnail(sheetName, `Page ${page.pageNum}`);
    return {
      id: `sheet-${projectId}-${page.pageNum}`,
      thumbUrl: preview,
      fullUrl: preview,
      title: sheetName,
      source: 'Project Sheets',
      pageNumber: page.pageNum,
      sheetName,
    };
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImageSearchBody;
    const query = asString(body?.query);
    const projectId = asString(body?.projectId);

    if (!query) return NextResponse.json({ error: 'Query is required.' }, { status: 400 });

    const bingResults = await searchBing(query);
    if (bingResults.length > 0) return NextResponse.json({ provider: 'Bing', results: bingResults });

    const googleResults = await searchGoogleCse(query);
    if (googleResults.length > 0) return NextResponse.json({ provider: 'Google CSE', results: googleResults });

    const unsplashResults = await searchUnsplash(query);
    if (unsplashResults.length > 0) return NextResponse.json({ provider: 'Unsplash', results: unsplashResults });

    if (projectId) {
      const sheetResults = await searchProjectSheets(query, projectId);
      return NextResponse.json({ provider: 'Project Sheets', results: sheetResults });
    }

    return NextResponse.json({ provider: 'None', results: [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Image search failed.') }, { status: 500 });
  }
}
