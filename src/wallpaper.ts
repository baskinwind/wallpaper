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

wallpaper.get('/random', async (c) => {
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

      const imageUrl = photo.urls.regular;

      return c.json({
        data: {
          color: photo.color,
          slug: details.slug,
          description: photo.description ?? details.alt_description,
          url: imageUrl,
          mirror_url: getMirrorUrl(imageUrl, c.env.WALLPAPER_MIRROR_ORIGIN),
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
