// Make the site's icons from its own 3D cube: the solved cube seen from its
// usual corner (three faces), on black.
//
//   npm run build:favicon
//
// That builds the site, then this script serves it (vite preview), shoots
// the cube with Playwright, and writes static/favicon.png (32px),
// static/favicon-192.png, and static/apple-touch-icon.png (180px).  Set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a preinstalled Chromium.

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { spawn } from 'node:child_process';

const port = 4174;
const url = `http://localhost:${port}/cubing/`;

// Serve the build, and wait until it answers.
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
	stdio: 'ignore',
	detached: true
});
server.unref();
for (let tries = 0; ; tries++) {
	try {
		await fetch(url);
		break;
	} catch (e) {
		if (tries > 60) {
			process.kill(-server.pid);
			throw e;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

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
process.kill(-server.pid);

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
