/**
 * Rasterises `scripts/og-image.html` into `public/og-image.png` (1200x630).
 *
 * Social scrapers will not render SVG, so the OG image has to be a bitmap. Rather
 * than hand-maintaining one in a design tool, the card is authored as HTML in the
 * app's own design language and screenshotted with the locally installed Chrome.
 *
 * Usage: npm run og:image --workspace web
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, 'og-image.html');
const output = resolve(here, '..', 'public', 'og-image.png');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH to a browser binary and retry.');
  process.exit(1);
}

const profile = join(tmpdir(), `macrosync-og-${process.pid}`);
mkdirSync(dirname(output), { recursive: true });

try {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      `--user-data-dir=${profile}`,
      // Give the webfonts a moment to land before the shot is taken.
      '--virtual-time-budget=6000',
      `--screenshot=${output}`,
      pathToFileURL(source).href,
    ],
    { stdio: 'inherit' },
  );
  console.log(`og-image written to ${output}`);
} finally {
  rmSync(profile, { recursive: true, force: true });
}
