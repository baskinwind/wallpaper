import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outputPath = resolve('src/wallpaper/generated-env.ts');

const values = {
  WALLPAPER_AK: process.env.WALLPAPER_AK,
  WALLPAPER_COLLECTIONS: process.env.WALLPAPER_COLLECTIONS,
};

const serialize = (value) => value ? JSON.stringify(value) : 'undefined';

const content = `// This file is generated during ESA builds. Do not put real values in git.
export const generatedWallpaperEnv = {
  WALLPAPER_AK: ${serialize(values.WALLPAPER_AK)},
  WALLPAPER_COLLECTIONS: ${serialize(values.WALLPAPER_COLLECTIONS)},
} as const;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content);
