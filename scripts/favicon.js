// Make the site's icons from its own 3D cube: the solved cube seen from its
// usual corner (three faces), on black.
//
//   npm run build && npm run preview -- --port 4173 &
//   node scripts/favicon.js
//
// Writes static/favicon.png (32px), static/favicon-192.png, and
// static/apple-touch-icon.png (180px).  Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to
// use a preinstalled Chromium.

import { chromium } from '@playwright/test';
import sharp from 'sharp';

const url = process.env.CUBING_URL ?? 'http://localhost:4173/cubing/';

const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
	args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({
	viewport: { width: 1200, height: 900 },
	deviceScaleFactor: 2
});
await page.goto(url);
await page.getByLabel('Labels').uncheck();
// Only the cube: nothing else on the page (the "Solved" badge sits over
// the canvas), and no backgrounds, so the shot is transparent around it.
await page.addStyleTag({
	content:
		'* { background: transparent !important; visibility: hidden; } canvas { visibility: visible; }'
});
await page.waitForTimeout(1000);
const shot = await page.locator('canvas').first().screenshot({ omitBackground: true });
await browser.close();

// Trim to the cube, square it with a margin, and put it on black.
const cube = await sharp(shot).trim().png().toBuffer();
const { width = 0, height = 0 } = await sharp(cube).metadata();
const side = Math.round(Math.max(width, height) * 1.12);
const square = await sharp({
	create: { width: side, height: side, channels: 4, background: '#000000' }
})
	.composite([{ input: cube, gravity: 'center' }])
	.png()
	.toBuffer();

for (const [name, size] of [
	['favicon.png', 32],
	['favicon-192.png', 192],
	['apple-touch-icon.png', 180]
]) {
	await sharp(square).resize(size, size).png().toFile(`static/${name}`);
	console.log(`static/${name}`);
}
