import { defineConfig, devices } from '@playwright/test';

// A Chromium to use instead of Playwright's own (e.g. one preinstalled in a
// sandbox), from PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173 --strictPort',
		url: 'http://localhost:4173/cubing/',
		reuseExistingServer: !process.env.CI
	},
	use: {
		baseURL: 'http://localhost:4173/cubing/',
		trace: 'on-first-retry',
		launchOptions: {
			executablePath,
			// Software WebGL, for headless browsers without a GPU.
			args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
		}
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	]
});
