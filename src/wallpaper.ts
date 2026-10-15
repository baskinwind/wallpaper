import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { createApi } from 'unsplash-js';
import type { AssetExif, AssetLocation } from 'unsplash-js';

type Bindings = {
  WALLPAPER_AK: string;
  WALLPAPER_COLLECTIONS: string;
  WALLPAPER_MIRROR_ORIGIN?: string;
};

const wallpaper = new Hono<{ Bindings: Bindings }>();
const PAGE_SIZE = 30;

function getPreferredCdn(request: Request, mirrorUrl: string | null): 'unsplash' | 'mirror' {
  const { info } = request as Request & {
    info?: { ip_country_id?: string; ip_region_id?: string };
  };
  const country = info?.ip_country_id?.trim().toUpperCase();
  const region = info?.ip_region_id?.trim().toUpperCase();

  // Use ESA's client metadata; unknown locations default to Unsplash.
  return mirrorUrl && country === 'CN' && !['CN-HK', 'CN-MO', 'CN-TW'].includes(region ?? '')
    ? 'mirror'
    : 'unsplash';
}

function getImageUrl(originalUrl: string): string {
  const url = new URL(originalUrl);

  // Preserve regular's parameters; apply the same pixel ratio to both origins.
  url.searchParams.set('dpr', '2');

  return url.toString();
}

function getMirrorUrl(originalUrl: string, mirrorOrigin?: string): string | null {
  if (!mirrorOrigin?.trim()) {
    return null;
  }
  const origin = new URL(mirrorOrigin.trim());
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('WALLPAPER_MIRROR_ORIGIN must be an HTTP(S) origin without a path');
  }
  const url = new URL(originalUrl);
  url.protocol = origin.protocol;
  url.host = origin.host;

  return url.toString();
}

wallpaper.get('/list', zValidator('query', z.object({
  page: z.coerce.number().int().min(1).default(1),
  collection: z.coerce.number().int().min(0).default(0),
})), async (c) => {
  const { WALLPAPER_AK, WALLPAPER_COLLECTIONS, WALLPAPER_MIRROR_ORIGIN } = c.env;
  const collections = [...new Set((WALLPAPER_COLLECTIONS || '').split(',').map((id) => id.trim()).filter(Boolean))];
  if (!WALLPAPER_AK || !collections.length) {
    return c.json({ success: false, message: 'WALLPAPER_AK and WALLPAPER_COLLECTIONS are required' }, 500);
  }
  const { page, collection } = c.req.valid('query');
  if (collection >= collections.length) {
    return c.json({ success: false, message: 'Invalid collection index' }, 400);
  }
  try {
    const api = createApi({ accessKey: WALLPAPER_AK });
    const result = await api.GET('/collections/{collectionId}/photos', {
      params: { path: { collectionId: collections[collection] }, query: { page, per_page: PAGE_SIZE } },
    });
    if (!result.data) {
      return c.json({ success: false, message: 'Unsplash list request failed; check quota and collection access' }, 502);
    }
    const photos = result.data.map((photo) => {
      const url = getImageUrl(photo.urls.regular);
      return {
        id: photo.id,
        description: photo.description,
        thumbnail: photo.urls.thumb,
        url,
        mirror_url: getMirrorUrl(url, WALLPAPER_MIRROR_ORIGIN),
        link: photo.links.html,
        user: { name: photo.user.name, link: photo.user.links.html },
      };
    });
    const totalPages = Number(result.response.headers.get('x-total-pages'));
    const hasMore = totalPages > 0 ? page < totalPages : photos.length === PAGE_SIZE;
    const next = hasMore ? { collection, page: page + 1 }
      : collection + 1 < collections.length ? { collection: collection + 1, page: 1 } : null;
    return c.json({ success: true, data: { photos, next } });
  } catch {
    return c.json({ success: false, message: 'Unable to load wallpaper list' }, 502);
  }
});

wallpaper.get('/random', async (c) => {
  // CDN preference depends on the client, so responses must not be shared from cache.
  c.header('Cache-Control', 'no-store');
  const { WALLPAPER_AK: wallPaperAk, WALLPAPER_COLLECTIONS: wallPaperCollections } = c.env;

  if (!wallPaperAk || !wallPaperCollections) {
    return c.json({ message: 'WALLPAPER_AK and WALLPAPER_COLLECTIONS are required', success: false }, 500);
  }

  const unsplash = createApi({ accessKey: wallPaperAk });

  try {
    const result = await unsplash.GET('/photos/random', {
      params: { query: { count: 1, collections: wallPaperCollections.split(',') } },
    });

    if (result.data) {
      const photo = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!photo) {
        throw new Error('No wallpaper returned');
      }

      // SDK 8's random-photo schema omits fields returned by the API.
      const details = photo as typeof photo & {
        slug?: string;
        alt_description?: string | null;
        exif?: AssetExif;
        location?: AssetLocation;
      };

      const imageUrl = getImageUrl(photo.urls.regular);
      const mirrorUrl = getMirrorUrl(imageUrl, c.env.WALLPAPER_MIRROR_ORIGIN);

      return c.json({
        data: {
          color: photo.color,
          slug: details.slug,
          description: photo.description ?? details.alt_description,
          url: imageUrl,
          mirror_url: mirrorUrl,
          prefer: getPreferredCdn(c.req.raw, mirrorUrl),
          link: photo.links.html,
          download: photo.links.download_location,
          user: {
            name: photo.user.name,
            link: photo.user.links.html,
          },
          exif: details.exif,
          location: details.location,
        },
        success: true,
      });
    }
    throw new Error('Unsplash returned no photo data');
  }
  catch {
    return c.json({
      message: 'get unsplash wallpaper error',
      success: false,
    });
  }
});

wallpaper.post('/track', zValidator('json', z.array(z.string())), async (c) => {
  const { WALLPAPER_AK: wallPaperAk } = c.env;

  if (!wallPaperAk) {
    return c.json({ message: 'WALLPAPER_AK is required', success: false }, 500);
  }

  const unsplash = createApi({ accessKey: wallPaperAk });

  const urls = c.req.valid('json');

  const downloadUrls: string[] = [];

  await Promise.all(urls.map(async (url) => {
    const downloadLocation = new URL(url);
    const match = /^\/photos\/([^/]+)\/download$/.exec(downloadLocation.pathname);
    if (!match) {
      return;
    }
    const res = await unsplash.GET('/photos/{id}/download', {
      params: { path: { id: decodeURIComponent(match[1]) } },
      querySerializer: () => downloadLocation.searchParams.toString(),
    });
    if (res.data?.url) {
      downloadUrls.push(res.data.url);
    }
  }));

  return c.json({
    data: downloadUrls,
    success: true,
  });
});

export { wallpaper };
