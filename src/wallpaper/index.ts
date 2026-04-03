import type { Random } from 'unsplash-js/dist/methods/photos/types';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createApi } from 'unsplash-js';

import { TRACK } from './schema.js';

const wallpaper = new Hono();

const WALLPAPER_AK = process.env.WALLPAPER_AK;
const WALLPAPER_COLLECTIONS = process.env.WALLPAPER_COLLECTIONS;

if (!WALLPAPER_AK) {
  throw new Error('WALLPAPER_AK is required');
}

if (!WALLPAPER_COLLECTIONS) {
  throw new Error('WALLPAPER_COLLECTIONS is required');
}

const unsplash = createApi({ accessKey: WALLPAPER_AK });

wallpaper.get('/random', async (c) => {
  try {
    const result = await unsplash.photos.getRandom({ count: 1, collectionIds: WALLPAPER_COLLECTIONS.split(',') });

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
