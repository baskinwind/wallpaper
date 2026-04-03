import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { wallpaper } from './wallpaper/index.js';

type Bindings = {
  WALLPAPER_AK: string;
  WALLPAPER_COLLECTIONS: string;
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

export default app;

