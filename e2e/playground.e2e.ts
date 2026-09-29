import { expect, test, type Locator, type Page } from '@playwright/test';

// Open the playground at the fastest speed, with an empty local storage
// (each test has its own browser context); returns the page errors seen.
async function open(page: Page): Promise<string[]> {
	const errors: string[] = [];
	page.on('pageerror', (e): void => {
		errors.push(e.message);
	});
	// Say yes to confirm() (discard changes, replace, delete).
	page.on('dialog', (dialog) => void dialog.accept());
	await page.goto('./playground');
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
	// basic's last let (twistCorner), inside its main algo.
	await expect(page.getByTestId('lets')).toContainText(/main ›\s*insertRight/);
	await expect(history(page)).toContainText('twistCorner');
	await expect(page.getByTestId('solved')).toBeHidden();
	expect(errors).toEqual([]);
});

test('plays a let, and moves typed in', async ({ page }) => {
	await open(page);
	await source(page).fill("let sexy = R U R' U'\nlet six = (sexy)6\n");
	await page.getByTestId('run').click();
	await expect(page.getByTestId('lets')).toContainText("R U R' U'");
	// Run plays the last let; six times is nothing: back to solved.
	await expect(history(page)).toContainText('six');
	await expect(page.getByTestId('solved')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Play sexy' }).click();
	await expect(history(page)).toContainText("R U R' U'");
	await expect(page.getByTestId('solved')).toBeHidden();

	// Play on from there, and undo it.
	await page.getByLabel('From solved').uncheck();
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
