import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/school-photos/search?q=Complexe+Scolaire+Lumière&city=Kinshasa&country=RDCongo
 *
 * Searches Wikimedia Commons for school-related images and returns
 * the best matching photo URL. Results are cached in-memory.
 */

const MAX_SEARCH_TERM_LENGTH = 120;
const MAX_CACHE_ENTRIES = 200;
const photoCache = new Map<string, string>();

type WikimediaSearchResponse = {
  query?: { search?: Array<{ title?: unknown }> };
};

type WikimediaImageInfoResponse = {
  query?: {
    pages?: Record<string, { imageinfo?: Array<{ thumburl?: unknown; url?: unknown }> }>;
  };
};

function normalizeSearchTerm(value: string | null, maxLength = MAX_SEARCH_TERM_LENGTH) {
  return value?.trim().slice(0, maxLength) || '';
}

function cachePhoto(cacheKey: string, url: string) {
  if (photoCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = photoCache.keys().next().value;
    if (oldestKey) photoCache.delete(oldestKey);
  }
  photoCache.set(cacheKey, url);
}

async function searchWikimedia(query: string): Promise<string | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=5&format=json&origin=*`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EduGest/1.0 (school-management)' },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!res.ok) return null;
    const data = await res.json() as WikimediaSearchResponse;
    const results = data?.query?.search;
    if (!results?.length) return null;

    // Pick the first image result that looks like a photo (jpg/png)
    for (const result of results) {
      const title = typeof result.title === 'string' ? result.title : '';
      if (!title) continue;
      const ext = title.split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) continue;

      // Get the actual image URL via imageinfo
      const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|size&iiurlwidth=400&format=json&origin=*`;
      const infoRes = await fetch(infoUrl, {
        headers: { 'User-Agent': 'EduGest/1.0 (school-management)' },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!infoRes.ok) continue;
      const infoData = await infoRes.json() as WikimediaImageInfoResponse;
      const pages = infoData?.query?.pages;
      if (!pages) continue;
      const page = Object.values(pages)[0];
      const thumb = page?.imageinfo?.[0]?.thumburl;
      const full = page?.imageinfo?.[0]?.url;
      if (typeof thumb === 'string') return thumb;
      if (typeof full === 'string') return full;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = normalizeSearchTerm(searchParams.get('q'));
  const city = normalizeSearchTerm(searchParams.get('city'));
  const country = normalizeSearchTerm(searchParams.get('country'));

  if (!q) {
    return NextResponse.json({ error: 'Missing ?q= parameter' }, { status: 400 });
  }

  // Build cache key
  const cacheKey = `${q}|${city}|${country}`.toLowerCase();

  // Return cached if available
  if (photoCache.has(cacheKey)) {
    return NextResponse.json({ url: photoCache.get(cacheKey), cached: true });
  }

  // Try multiple search queries in order of specificity
  const queries = [
    `${q} school ${city || ''} ${country || ''}`.trim(),
    `school ${city || ''} ${country || ''}`.trim(),
    `école ${city || ''}`.trim(),
    `${q} building`,
  ];

  for (const query of queries) {
    const url = await searchWikimedia(query);
    if (url) {
      cachePhoto(cacheKey, url);
      return NextResponse.json({ url, cached: false, query });
    }
  }

  return NextResponse.json({ url: null, message: 'No photo found' });
}
