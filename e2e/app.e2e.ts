import { expect, test, type Locator, type Page } from '@playwright/test';

// Open the app at the fastest speed; returns the page errors seen.
// Instant makes moves at once instead of turning them (one frame per
// quarter turn, slow with software WebGL), for tests that play a lot.
async function open(page: Page, { instant = false } = {}): Promise<string[]> {
	const errors: string[] = [];
	page.on('pageerror', (e): void => {
		errors.push(e.message);
	});
	await page.goto(instant ? './?instant' : './');
	await page.getByRole('button', { name: 'Fastest' }).click();
	return errors;
}

const permutation = (page: Page): Locator => page.getByTestId('permutation');
const history = (page: Page): Locator => page.getByTestId('history');

test('starts solved', async ({ page }) => {
	const errors = await open(page);
	await expect(page).toHaveTitle("Rubik's Cube Simulator");
	await expect(page.getByTestId('cube')).toBeVisible();
	await expect(permutation(page)).toHaveText('Solved');
	await expect(page.getByTestId('solved')).toBeVisible();
	await expect(history(page)).toContainText('No moves yet');
	expect(errors).toEqual([]);
});

test('move buttons turn the cube and show the permutation', async ({ page }) => {
	await open(page);
	await page.getByTestId('move-R').click();
	await expect(permutation(page)).toHaveText('(ur br dr fr) (urf bru drb frd)');
	await expect(history(page)).toContainText('R');
	await page.getByTestId('move-R-prime').click();
	await expect(permutation(page)).toHaveText('Solved');
});

test('keyboard moves, with Shift for counterclockwise', async ({ page }) => {
	await open(page);
	await page.keyboard.press('f');
	await page.keyboard.press('u');
	await expect(permutation(page)).not.toHaveText('Solved');
	await expect(history(page)).toContainText('F U');
	await page.keyboard.press('Shift+U');
	await page.keyboard.press('Shift+F');
	await expect(permutation(page)).toHaveText('Solved');
	// Moves that undo each other cancel out in the history, as in 2003.
	await expect(history(page)).toContainText('No moves yet');
});

test('slice moves and whole cube turns', async ({ page }) => {
	await open(page);
	await page.keyboard.press('m');
	await expect(permutation(page)).toContainText('(u f d b)');
	await page.keyboard.press('x');
	await page.keyboard.press('Shift+M');
	await page.keyboard.press('Shift+X');
	await expect(permutation(page)).toHaveText('Solved');
});

// Solving plays about 200 moves: instantly, but give it time.
const SOLVE_TIMEOUT = 20_000;

test('scramble, then solve with the Singmaster solver', async ({ page }) => {
	const errors = await open(page, { instant: true });
	await page.getByTestId('scramble').click();
	await expect(history(page)).toContainText('Scramble');
	await expect(page.getByTestId('solved')).toBeHidden();
	await page.getByTestId('solve').click();
	await expect(history(page)).toContainText('David Singmaster Solution');
	await expect(history(page)).toContainText('Solve U Edges');
	await expect(page.getByTestId('solved')).toBeVisible({ timeout: SOLVE_TIMEOUT });
	await expect(permutation(page)).toHaveText('Solved');
	expect(errors).toEqual([]);
});

test('solve with the Basic Modern Solution', async ({ page }) => {
	const errors = await open(page, { instant: true });
	await page.getByTestId('scramble').click();
	await page.getByLabel('Solver').selectOption('Basic Modern Solution');
	await page.getByTestId('solve').click();
	await expect(history(page)).toContainText('Basic Modern Solution');
	await expect(history(page)).toContainText('Middle');
	await expect(page.getByTestId('solved')).toBeVisible({ timeout: SOLVE_TIMEOUT });
	expect(errors).toEqual([]);
});

test("the method section's sequences can be tried", async ({ page }) => {
	await open(page);
	const method = page.getByTestId('method');
	await expect(method.getByRole('heading', { name: 'Middle layer' })).toBeVisible();
	await method.getByRole('button', { name: 'Try it' }).first().click();
	await expect(permutation(page)).not.toHaveText('Solved');
	await expect(history(page)).toContainText('Try It: Down and to the left');
});

test('the top cross is shown in pictures', async ({ page }) => {
	await open(page);
	const steps = page.getByTestId('top-cross-steps');
	await expect(steps.getByRole('img')).toHaveCount(4);
	for (const name of ['Dot', 'L', 'Line', 'Cross']) {
		await expect(steps.getByText(name, { exact: true })).toBeVisible();
	}
	// All four patterns fit on one line, even on a phone.
	const tops = await steps
		.getByRole('img')
		.evaluateAll((imgs) => imgs.map((img) => Math.round(img.getBoundingClientRect().top)));
	expect(new Set(tops).size).toBe(1);
});

test('each sequence shows the case it solves', async ({ page }) => {
	await open(page);
	const diagrams = page.locator('svg.case');
	await expect(diagrams).toHaveCount(7);
	for (const label of await diagrams.evaluateAll((svgs) =>
		svgs.map((svg) => svg.getAttribute('aria-label'))
	)) {
		expect(label).toBeTruthy();
	}
});

test('step through a solution by move and by algo', async ({ page }) => {
	await open(page, { instant: true });
	for (const key of ['r', 'u', 'f', 'Shift+L']) {
		await page.keyboard.press(key);
	}
	// Wait for those moves to finish.
	await expect(page.getByTestId('play-pause')).toBeHidden();
	await page.getByTestId('step-through').check();
	await page.getByTestId('solve').click();
	const stage = page.getByTestId('stage');

	// Paused at the start: nothing moves until asked.
	await expect(page.getByTestId('play-pause')).toHaveText('Play');
	const before = await permutation(page).innerText();
	await page.waitForTimeout(500);
	await expect(permutation(page)).toHaveText(before);

	// The history shows the solution's moves, all dimmed until played.
	const solution = history(page).locator('[data-block="David Singmaster Solution"]');
	const ahead = solution.locator('.move.ahead');
	const count = await ahead.count();
	expect(count).toBeGreaterThan(2);
	await expect(solution.locator('[aria-current]')).toHaveCount(0);

	await page.getByTestId('next-move').click();
	await expect(permutation(page)).not.toHaveText(before);
	await expect(stage).toContainText('Solve U Edges: move 2 of');
	// The move just played is marked, in its block, and no longer dimmed.
	const current = solution.locator('[aria-current="step"]');
	await expect(current).toHaveText(await solution.locator('.move').first().innerText());
	await expect(ahead).toHaveCount(count - 1);
	await expect(solution.locator('[data-block="Solve U Edges"].current')).toBeVisible();

	await page.getByTestId('next-move').click();
	await expect(ahead).toHaveCount(count - 2);
	await expect(current).toHaveText(await solution.locator('.move').nth(1).innerText());

	await page.getByTestId('next-algo').click();
	await expect(stage).toContainText('Solve U Corners: move 1 of');

	await page.getByTestId('play-pause').click();
	await expect(page.getByTestId('solved')).toBeVisible({ timeout: SOLVE_TIMEOUT });
});

test('solves after slice moves', async ({ page }) => {
	await open(page, { instant: true });
	for (const key of ['m', 'r', 'e', 'Shift+S', 'u']) {
		await page.keyboard.press(key);
	}
	await page.getByTestId('solve').click();
	await expect(history(page)).toContainText('Place Centers');
	await expect(page.getByTestId('solved')).toBeVisible({ timeout: SOLVE_TIMEOUT });
});

test('catalog Try It makes the effect shown', async ({ page }) => {
	await open(page);
	const row = page
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name: 'P2(f,u)', exact: true }) });
	const effect = await row.locator('.effect').innerText();
	await row.getByRole('button', { name: 'Try it' }).click();
	await expect(permutation(page)).toHaveText(effect);
	await expect(history(page)).toContainText('Try It: P2(f,u)');
});

test('reset returns to solved', async ({ page }) => {
	await open(page);
	await page.getByTestId('scramble').click();
	await page.getByTestId('reset').click();
	await expect(permutation(page)).toHaveText('Solved');
	await expect(history(page)).toContainText('No moves yet');
});

test('flip and labels', async ({ page }) => {
	const errors = await open(page);
	await page.getByTestId('flip').click();
	await page.getByLabel('Labels').uncheck();
	await page.getByTestId('move-U').click();
	await expect(permutation(page)).not.toHaveText('Solved');
	expect(errors).toEqual([]);
});

test('fits the screen without scrolling sideways', async ({ page }) => {
	await open(page);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
