/**
 * Renders the brand SVGs into the PNG sizes the app and Android need.
 *
 * Chromium (Edge/Chrome headless) does the rasterising, so no image library or
 * native SVG dependency is required.
 *
 * Usage: node tools/render-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const browser = BROWSERS.find((candidate) => existsSync(candidate));
if (!browser) {
  console.error('render-icons: no Chromium-based browser found');
  process.exit(1);
}

const iconSvg = readFileSync(join(ROOT, 'assets', 'logo.svg'), 'utf8');
const transparentSvg = readFileSync(join(ROOT, 'assets', 'logo-transparent.svg'), 'utf8');

/** A page whose whole viewport is the SVG, for a pixel-exact screenshot. */
const page = (svg, background) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:${background};overflow:hidden}
  svg{display:block;width:100%;height:100%}
</style></head><body>${svg}</body></html>`;

const render = (svg, background, size, outPath) => {
  const htmlPath = join(tmpdir(), `superprod-icon-${size}-${Date.now()}.html`);
  writeFileSync(htmlPath, page(svg, background), 'utf8');
  const profile = join(tmpdir(), `superprod-icon-profile-${process.pid}`);

  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-sandbox',
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        `--window-size=${size},${size}`,
        '--virtual-time-budget=3000',
        `--screenshot=${outPath}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
      ],
      { stdio: 'ignore' },
    );
  } finally {
    try {
      unlinkSync(htmlPath);
    } catch {
      // temp file cleanup is best-effort
    }
  }

  if (!existsSync(outPath)) throw new Error(`render failed for ${outPath}`);
  console.log(`  ${outPath.replace(`${ROOT}/`, '')} (${size}px)`);
};

mkdirSync(join(ROOT, 'public', 'icons'), { recursive: true });
mkdirSync(join(ROOT, 'resources'), { recursive: true });

console.log('render-icons: rendering');

// In-app / PWA icons: blue tile.
render(iconSvg, '#3094de', 192, join(ROOT, 'public', 'icons', 'icon-192.png'));
render(iconSvg, '#3094de', 512, join(ROOT, 'public', 'icons', 'icon-512.png'));

// Android launcher + store assets (Capacitor reads resources/icon.png).
render(iconSvg, '#3094de', 1024, join(ROOT, 'resources', 'icon.png'));

// Maskable icon needs padding so Android's circular crop cannot clip the mark.
const maskable = page(iconSvg, '#3094de').replace(
  '<svg',
  '<svg style="padding:14%;box-sizing:border-box"',
);
mkdirSync(join(ROOT, 'public', 'icons'), { recursive: true });
{
  const htmlPath = join(tmpdir(), `superprod-maskable-${Date.now()}.html`);
  writeFileSync(htmlPath, maskable, 'utf8');
  const outPath = join(ROOT, 'public', 'icons', 'icon-maskable-512.png');
  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-sandbox',
        '--force-device-scale-factor=1',
        `--user-data-dir=${join(tmpdir(), `superprod-mask-${process.pid}`)}`,
        '--window-size=512,512',
        '--virtual-time-budget=3000',
        `--screenshot=${outPath}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
      ],
      { stdio: 'ignore' },
    );
    console.log('  public/icons/icon-maskable-512.png (512px)');
  } finally {
    try {
      unlinkSync(htmlPath);
    } catch {
      // best effort
    }
  }
}

// White mark, for dark surfaces and the splash.
void transparentSvg;

console.log('render-icons: done');
