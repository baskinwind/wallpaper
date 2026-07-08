import type { Random } from 'unsplash-js/dist/methods/photos/types';

import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { env } from 'hono/adapter';
import { createApi } from 'unsplash-js';

import { generatedWallpaperEnv } from './generated-env.js';
import { TRACK } from './schema.js';

type Bindings = {
  WALLPAPER_AK: string;
  WALLPAPER_COLLECTIONS: string;
};

const wallpaper = new Hono<{ Bindings: Bindings }>();

function getWallpaperEnv(c: Context<{ Bindings: Bindings }>): Partial<Bindings> {
  const bindings = env<Partial<Bindings>>(c, 'workerd') || {};
  const processEnv = env<Partial<Bindings>>(c, 'edge-light') || {};

  return {
    WALLPAPER_AK: bindings.WALLPAPER_AK ?? processEnv.WALLPAPER_AK ?? generatedWallpaperEnv.WALLPAPER_AK,
    WALLPAPER_COLLECTIONS: bindings.WALLPAPER_COLLECTIONS ?? processEnv.WALLPAPER_COLLECTIONS ?? generatedWallpaperEnv.WALLPAPER_COLLECTIONS,
  };
}

wallpaper.get('/random', async (c) => {
  const { WALLPAPER_AK: wallPaperAk, WALLPAPER_COLLECTIONS: wallPaperCollections } = getWallpaperEnv(c);

  if (!wallPaperAk || !wallPaperCollections) {
    return c.json({ message: 'WALLPAPER_AK and WALLPAPER_COLLECTIONS are required', success: false }, 500);
  }

  const unsplash = createApi({ accessKey: wallPaperAk });

  try {
    const result = await unsplash.photos.getRandom({ count: 1, collectionIds: wallPaperCollections.split(',') });

    if (result.type === 'success') {
      const photo = (result.response as Random[])[0];

      return c.json({
        data: {
          color: photo.color,
          slug: (photo as any).slug,
          description: photo.description ?? photo.alt_description,
          url: photo.urls.regular + '&q=60&dpr=2&auto=format&fit=crop',
          link: photo.links.html,
          download: photo.links.download_location,
          user: {
            name: photo.user.name,
            link: photo.user.links.html,
          },
          exif: photo.exif,
          location: photo.location,
        },
        success: true,
      });
    }
  }
  catch {
    return c.json({
      message: 'get unsplash wallpaper error',
      success: false,
    });
  }
});

wallpaper.post('/track', zValidator('json', TRACK), async (c) => {
  const { WALLPAPER_AK: wallPaperAk } = getWallpaperEnv(c);

  if (!wallPaperAk) {
    return c.json({ message: 'WALLPAPER_AK is required', success: false }, 500);
  }

  const unsplash = createApi({ accessKey: wallPaperAk });

  const urls = c.req.valid('json');

  const downloadUrls: string[] = [];

  await Promise.all(urls.map(async (url) => {
    const res = await unsplash.photos.trackDownload({ downloadLocation: url });
    if (res.response?.url) {
      downloadUrls.push(res.response.url);
    }
  }));

  return c.json({
    data: downloadUrls,
    success: true,
  });
});

export { wallpaper };
