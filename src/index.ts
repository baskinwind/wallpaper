import { Hono } from 'hono';
import type { ExecutionContext } from 'hono';
import { cors } from 'hono/cors';
import { wallpaper } from './wallpaper.js';
import { adminPage } from './admin.js';

type Bindings = {
  WALLPAPER_AK: string;
  WALLPAPER_COLLECTIONS: string;
  WALLPAPER_MIRROR_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    // Credentialed requests require a concrete origin, even when all origins are allowed.
    origin: (origin) => origin,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
    credentials: true,
  }),
);

app.route('/wallpaper', wallpaper);
app.get('/admin', (c) => c.html(adminPage));

app.get('/health', (c) => c.json({ success: true }));

// Temporary diagnostics; remove after verifying ESA's incoming request metadata.
app.get('/debug/esa', (c) => {
  const request = c.req.raw as Request & { info?: unknown };
  const headerNames: string[] = [];
  const headers: Record<string, string> = {};
  const diagnosticHeaders = new Set([
    'ali-ip-country', 'ali-ip-city', 'ali-real-client-ip',
    'x-forwarded-for', 'x-real-ip', 'x-alicdn-security-xff',
    'cf-ipcountry', 'cf-connecting-ip',
  ]);
  request.headers.forEach((value, name) => {
    headerNames.push(name);
    if (diagnosticHeaders.has(name.toLowerCase())) {
      headers[name] = value;
    }
  });

  c.header('Cache-Control', 'no-store');
  return c.json({
    success: true,
    data: {
      request_info: request.info ?? null,
      request_properties: Object.getOwnPropertyNames(request),
      header_names: headerNames.sort(),
      headers,
    },
  });
});

// ESA passes bindings third; Hono expects bindings second.
export default {
  fetch(request: Request, context: ExecutionContext, env: Bindings) {
    return app.fetch(request, env, context);
  },
};

