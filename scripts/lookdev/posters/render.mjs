// Renders the clubhouse posters (row 65) to blender/textures/posters.png with headless Chrome.
//   node scripts/lookdev/posters/render.mjs   (needs puppeteer-core, not a project dependency:
//   run a copy from a folder that has it, passing this folder: node render.mjs <repo>/scripts/lookdev/posters)
import puppeteer from 'puppeteer-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 384, deviceScaleFactor: 1 });
await page.goto(`file://${resolve(here, 'posters.html')}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(here, '../../../blender/textures/posters.png') });
await browser.close();
console.log('posters.png written');
