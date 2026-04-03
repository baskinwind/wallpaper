import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { wallpaper } from './wallpaper/index.js';

const app = new Hono();

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

const port = Number(process.env.SERVER_PORT);

serve({ fetch: app.fetch, port: port }, () => {
  console.log(`connect server runner on port ${port}`);
});

