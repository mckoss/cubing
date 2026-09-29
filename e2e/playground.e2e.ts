import { expect, test, type Locator, type Page } from '@playwright/test';

// Open the playground at the fastest speed, with an empty local storage
// (each test has its own browser context); returns the page errors seen.
// Instant makes moves at once instead of turning them, for tests that
// play a lot.
async function open(page: Page, { instant = false } = {}): Promise<string[]> {
	const errors: string[] = [];
	page.on('pageerror', (e): void => {
		errors.push(e.message);
	});
	// Say yes to confirm() (discard changes, replace, delete).
	page.on('dialog', (dialog) => void dialog.accept());
	await page.goto(instant ? './playground?instant' : './playground');
	await page.getByRole('button', { name: 'Fastest' }).click();
	return errors;
}

const source = (page: Page): Locator => page.getByTestId('source');
const history = (page: Page): Locator => page.getByTestId('history');
const programName = (page: Page): Locator => page.getByTestId('program-name');

test('starts with the examples, and runs one', async ({ page }) => {
	const errors = await open(page);
	await expect(page).toHaveTitle('Rubikon Playground');
	await expect(programName(page)).toHaveValue('basic');
	await expect(page.getByTestId('position')).toHaveText('1 of 2');
	await page.getByTestId('run').click();
	await expect(page.getByTestId('lets')).toContainText(/main ›\s*insertRight/);
	await expect(page.getByTestId('run-what')).toHaveValue('main');
	// The cube starts solved: basic's main has nothing to do.
	await expect(history(page)).toContainText(
		'The Basic Modern Solution: skipped, its goal already holds'
	);
	await expect(page.getByTestId('status')).toHaveText('Ran main.');
	await expect(page.getByTestId('solved')).toBeVisible();

	// Or run one of its stages by itself.
	await page.getByTestId('run-what').selectOption({ label: 'main › Top Cross' });
	await page.getByTestId('run').click();
	await expect(page.getByTestId('status')).toHaveText('Ran main › Top Cross.');
	await expect(history(page)).toContainText('Top Cross: skipped, its goal already holds');

	// Or play one of its named sequences.
	await expect(page.getByText(/^Named Sequences \(\d+\)$/)).toBeVisible();
	await page.getByTestId('run-what').selectOption({ label: 'the last sequence' });
	await page.getByTestId('run').click();
	await expect(history(page)).toContainText('twistCorner');
	await expect(page.getByTestId('solved')).toBeHidden();
	expect(errors).toEqual([]);
});

test("solves a scramble with basic's main", async ({ page }) => {
	const errors = await open(page, { instant: true });
	await page.getByTestId('scramble').click();
	await expect(history(page)).toContainText('Scramble');
	await expect(page.getByTestId('solved')).toBeHidden();
	await page.getByTestId('run').click();
	await expect(page.getByTestId('status')).toHaveText('Ran main.');
	for (const stage of ['The Basic Modern Solution', 'First Face', 'Bottom Edges', 'Middle']) {
		await expect(history(page).locator(`[data-block="${stage}"]`).first()).toBeVisible();
	}
	await expect(page.getByTestId('solved')).toBeVisible({ timeout: 20_000 });
	expect(errors).toEqual([]);
});

test('shows trace lines, unless Show trace is off', async ({ page }) => {
	await open(page);
	await page.getByTestId('new').click();
	await source(page).fill('algo main {\n  do R\n  trace("after R: {cube}")\n  do R\'\n}\n');
	await page.getByTestId('run').click();
	const line = history(page).locator('[data-note="trace"]');
	await expect(line).toHaveText(/^after R: \(/);
	await page.getByTestId('show-trace').uncheck();
	await expect(line).toBeHidden();
	await page.getByTestId('show-trace').check();
	await expect(line).toBeVisible();
});

test('marks the move playing in the history, and stops at each algo', async ({ page }) => {
	await open(page);
	await page.getByTestId('new').click();
	await source(page).fill(
		'from basic import lift\nalgo main "Demo" {\n  do R\n  trace("lifting")\n  do lift(/df/r) U\n}\n'
	);
	await page.getByTestId('step-through').check();
	await page.getByTestId('run').click();
	const moves = history(page).locator('.move');
	const lift = history(page).locator('[data-block="Lift a piece to the top"]');
	const note = history(page).locator('[data-note="trace"]');
	const stage = page.getByTestId('stage');

	// Paused at the start: every move and the trace line dimmed.
	await expect(moves).toHaveText(['R', 'F2', 'U']);
	await expect(history(page).locator('.move.ahead')).toHaveCount(3);
	await expect(note).toHaveClass(/\bahead\b/);
	// Counted as the history shows them (F2 is one move), in the singular
	// for one.
	await expect(page.getByTestId('to-go')).toHaveText('3 moves to go');
	await expect(lift.locator('h4')).toContainText(/\b1 move · 2 quarter turns\b/);

	// Next algo stops where lift starts: R played, the trace line with it.
	await page.getByTestId('next-algo').click();
	await expect(stage).toHaveText('Lift a piece to the top: move 1 of 1');
	await expect(history(page).locator('[aria-current]')).toHaveText('R');
	await expect(note).not.toHaveClass(/\bahead\b/);
	await expect(lift).toHaveClass(/\bahead\b/);

	// The next move is lift's F2: it's marked, and so are lift and main.
	await page.getByTestId('next-move').click();
	await expect(lift.locator('[aria-current]')).toHaveText('F2');
	await expect(lift).toHaveClass(/\bcurrent\b/);
	await expect(history(page).locator('[data-block="Demo"]')).toHaveClass(/\bcurrent\b/);
	await expect(history(page).locator('.move.ahead')).toHaveText(['U']);
	await expect(page.getByTestId('to-go')).toHaveText('1 move to go');

	// Played through: nothing marked or dimmed.
	await page.getByTestId('play-pause').click();
	await expect(page.getByTestId('play-pause')).toBeHidden();
	await expect(history(page).locator('[aria-current], .ahead')).toHaveCount(0);
});

test('Next move stops where an algo starts, though it turns the same face', async ({ page }) => {
	await open(page);
	await page.getByTestId('new').click();
	await source(page).fill('algo main {\n  do U\n  algo "Again" { do U }\n}\n');
	await page.getByTestId('step-through').check();
	await page.getByTestId('run').click();
	await expect(history(page).locator('.move')).toHaveText(['U', 'U']);
	await page.getByTestId('next-move').click();
	await expect(history(page).locator('.move.ahead')).toHaveCount(1);
	await expect(page.getByTestId('stage')).toHaveText('Again: move 1 of 1');
});

test('shows the current permutation', async ({ page }) => {
	await open(page);
	const permutation = page.getByTestId('permutation');
	await expect(permutation).toHaveText('Solved');
	await page.getByTestId('play-line').fill('R');
	await page.getByTestId('play').click();
	await expect(permutation).toHaveText('(ur br dr fr) (urf bru drb frd)');
	await page.getByTestId('reset').click();
	await expect(permutation).toHaveText('Solved');
});

test('shows runtime errors at their line', async ({ page }) => {
	await open(page);
	await page.getByTestId('new').click();
	await source(page).fill('algo main {\n  do R\n  do nope\n}\n');
	await page.getByTestId('run').click();
	await expect(page.getByTestId('error')).toContainText('3:6');
	await expect(page.getByTestId('error')).toContainText('Unknown name: nope');
	await expect(page.locator('.error-line')).toHaveText('3');
});

test('plays a let, and moves typed in', async ({ page }) => {
	await open(page, { instant: true });
	await source(page).fill("let sexy = R U R' U'\nlet six = (sexy)6\n");
	await page.getByTestId('run').click();
	await expect(page.getByTestId('lets')).toContainText("R U R' U'");
	// Without algos, Run plays the last named sequence; six times is
	// nothing: back to solved.
	await expect(history(page)).toContainText('six');
	// The history counts the moves; the status line doesn't.
	await expect(page.getByTestId('status')).toHaveText('Played six.');
	await expect(page.getByTestId('solved')).toBeVisible();
	await page.getByRole('button', { name: 'Play sexy' }).click();
	await expect(history(page)).toContainText("R U R' U'");
	await expect(page.getByTestId('solved')).toBeHidden();

	// Play on from there, and undo it.
	await page.getByTestId('play-line').fill("sexy'");
	await page.getByTestId('play-line').press('Enter');
	await expect(page.getByTestId('solved')).toBeVisible();
	await expect(history(page)).toContainText("sexy'");
});

test('shows errors at their line', async ({ page }) => {
	await open(page);
	await source(page).fill('let one = R U\n\nlet two = R nope\n');
	await page.getByTestId('run').click();
	await expect(page.getByTestId('error')).toContainText('3:13');
	await expect(page.getByTestId('error')).toContainText('Unknown name: nope');
	await expect(page.locator('.error-line')).toHaveText('3');
	// The error is selected in the editor.
	const selected = await source(page).evaluate((el: HTMLTextAreaElement) =>
		el.value.slice(el.selectionStart, el.selectionEnd)
	);
	expect(selected).toBe('n');

	await page.getByTestId('play-line').fill('R (U');
	await page.getByTestId('play').click();
	await expect(page.getByTestId('play-error')).toContainText('1:');
});

test('saves, pages through, renames, and deletes programs', async ({ page }) => {
	await open(page);
	await page.getByTestId('new').click();
	await expect(programName(page)).toHaveValue('untitled');
	await programName(page).fill('mine');
	await source(page).fill('let t = R U');
	await expect(page.getByTestId('dirty')).toBeVisible();
	await page.getByTestId('save').click();
	await expect(page.getByTestId('dirty')).toBeHidden();
	await expect(page.getByTestId('position')).toHaveText('3 of 3');

	// Pages go by name: basic, cfop, mine.
	await page.getByTestId('next').click();
	await expect(programName(page)).toHaveValue('basic');
	await page.getByTestId('prev').click();
	await expect(programName(page)).toHaveValue('mine');
	await expect(source(page)).toHaveValue('let t = R U');

	// Kept after a reload, which opens the last program.
	await page.reload();
	await expect(programName(page)).toHaveValue('mine');

	await page.getByTestId('rename-mine').click();
	await page.getByTestId('rename-input').fill('yours');
	await page.getByTestId('rename-input').press('Enter');
	await expect(programName(page)).toHaveValue('yours');
	await expect(page.getByTestId('open-yours')).toBeVisible();

	await page.getByTestId('delete-cfop').click();
	await expect(page.getByTestId('open-cfop')).toBeHidden();
	await expect(page.getByTestId('position')).toHaveText('2 of 2');
});

test('asks before leaving unsaved changes', async ({ page }) => {
	const asked: string[] = [];
	page.on('dialog', (dialog) => {
		asked.push(dialog.message());
		void dialog.dismiss();
	});
	await page.goto('./playground');
	await source(page).fill('let t = R U');
	await page.getByRole('link', { name: "Rubik's Cube Simulator" }).first().click();
	await expect.poll(() => asked).toEqual(['Discard the changes to basic?']);
	await expect(page).toHaveTitle('Rubikon Playground');
	await expect(source(page)).toHaveValue('let t = R U');
});

test('imports another program from the library', async ({ page }) => {
	await open(page);
	await page.getByTestId('new').click();
	await source(page).fill('from cfop import sune\nlet twice = (sune)2');
	await page.getByTestId('run').click();
	await expect(page.getByTestId('lets')).toContainText('twice');
	await expect(history(page)).toContainText('twice');
});

test('fits the screen without scrolling sideways', async ({ page }) => {
	await open(page);
	await page.getByTestId('run').click();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('the simulator links to the playground', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('link', { name: 'Rubikon Playground' }).click();
	await expect(page).toHaveTitle('Rubikon Playground');
});

test('Cube Racing shows the built-in benchmarks', async ({ page }) => {
	const errors = await open(page);
	const racing = page.getByTestId('racing');
	await expect(racing.getByRole('heading', { name: 'Cube Racing' })).toBeVisible();
	const builtIn = racing.getByTestId('race-built-in');
	await expect(builtIn).toHaveCount(3);
	await expect(builtIn.nth(0)).toContainText('basic');
	await expect(builtIn.nth(1)).toContainText('Basic Modern Solution (TypeScript)');
	await expect(builtIn.nth(2)).toContainText('Singmaster (TypeScript)');
	await expect(racing.getByTestId('race-histogram')).toContainText('basic');
	// The open program races by default.
	await expect(racing.getByTestId('race-what')).toHaveValue('open');
	expect(errors).toEqual([]);
});

test('races a program, and shows the cubes it could not solve', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e): void => {
		errors.push(e.message);
	});
	page.on('dialog', (dialog) => void dialog.accept());
	// A short race (20 cubes), for tests.
	await page.goto('./playground?instant&raceCount=20');
	const racing = page.getByTestId('racing');

	// basic solves them all.
	await racing.getByTestId('race').click();
	await expect(racing.getByTestId('race-status')).toHaveText('Raced basic: 20 of 20 solved.', {
		timeout: 30_000
	});
	const mine = racing.getByTestId('race-mine');
	await expect(mine).toHaveCount(1);
	await expect(mine).toContainText('20 cubes');
	// Focus goes back to Race when it's over.
	await expect(racing.getByTestId('race')).toBeFocused();
	await expect(mine.getByTestId('race-unsolved')).toHaveCount(0);

	await expect(racing.getByTestId('race-bars')).toHaveAttribute(
		'aria-label',
		/^Moves to solve, from \d+ to \d+; most cubes/
	);

	// A program that does nothing solves none: the race stops early.
	await page.getByTestId('new').click();
	await source(page).fill('algo main goal solved(cube) {\n  do ()\n}\n');
	await racing.getByTestId('race-seed').fill('7');
	await racing.getByTestId('race').click();
	await expect(racing.getByTestId('race-status')).toHaveText(
		'Stopped after 10 unsolved cubes in a row: untitled raced 0 of 10 solved, 10 not.'
	);
	await expect(mine).toHaveCount(2);
	await expect(mine.first().getByTestId('race-stopped')).toBeVisible();
	const unsolved = mine.first().getByTestId('race-unsolved');
	await expect(unsolved).toHaveText(/^10/);
	await unsolved.click();
	const failures = racing.getByTestId('race-failures');
	await expect(failures.locator('li')).toHaveCount(10);
	await expect(failures.locator('li').first()).toContainText('Goal not reached: main');

	// Load a cube it failed on, and run the program on it.
	await failures.getByTestId('load-cube').nth(2).click();
	await expect(history(page)).toContainText('Race cube 3 (seed 7)');
	await expect(page.getByTestId('status')).toHaveText('Loaded cube 3 of seed 7: Run to watch it.');
	await expect(page.getByTestId('solved')).toBeHidden();
	await page.getByTestId('run').click();
	await expect(page.getByTestId('error')).toContainText('Goal not reached: main');

	// The results are kept, and can be cleared.
	await page.reload();
	await expect(mine).toHaveCount(2);
	await racing.getByTestId('race-clear').click();
	await expect(mine).toHaveCount(0);
	await expect(racing.getByTestId('race-built-in')).toHaveCount(3);
	expect(errors).toEqual([]);
});

test('a race can be cancelled', async ({ page }) => {
	await open(page);
	const racing = page.getByTestId('racing');
	await racing.getByTestId('race').click();
	await expect(racing.getByTestId('race-progress')).toBeVisible();
	await racing.getByTestId('race-cancel').click();
	await expect(racing.getByTestId('race-status')).toHaveText('Race cancelled.');
	await expect(racing.getByTestId('race')).toBeFocused();
	await expect(racing.getByTestId('race-mine')).toHaveCount(0);
});
