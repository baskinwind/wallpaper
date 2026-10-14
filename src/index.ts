import { Hono } from 'hono';
import type { ExecutionContext } from 'hono';
import { cors } from 'hono/cors';
import { wallpaper } from './wallpaper.js';

type Bindings = {
  WALLPAPER_AK: string;
  WALLPAPER_COLLECTIONS: string;
  WALLPAPER_MIRROR_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['POST', 'GET', 'DELETE', 'PUT', 'OPTIONS'],
    maxAge: 600,
    credentials: true,
  }),
);

app.route('/wallpaper', wallpaper);

app.get('/health', (c) => c.json({ success: true }));

// ESA passes bindings third; Hono expects bindings second.
export default {
  fetch(request: Request, context: ExecutionContext, env: Bindings) {
    return app.fetch(request, env, context);
  },
};

