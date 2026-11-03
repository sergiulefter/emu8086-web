// The ascii codes window reproduces EMU8086 4.08: 8 columns of 32 codes filled top to bottom, control
// codes shown as red names, and a click switching the numbers between decimal and hexadecimal.
import { expect, test } from '@playwright/test';
import { freshApp } from './helpers';

test('ascii codes window matches EMU8086 4.08', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('menuitem', { name: 'ascii codes' }).click();
  const table = page.getByTestId('ascii-table');
  await expect(table.locator('.ascii-cell')).toHaveCount(256);

  // column-major: the first column is 0-31, the second starts at 32
  const cols = table.locator('.ascii-col');
  await expect(cols).toHaveCount(8);
  await expect(cols.nth(0).locator('.ascii-cell').first()).toHaveText('000: null');
  await expect(cols.nth(0).locator('.ascii-cell').last()).toHaveText('031: ▼');
  await expect(cols.nth(1).locator('.ascii-cell').first()).toHaveText('032: spa');
  await expect(table.locator('[data-code="65"]')).toHaveText('065: A');
  await expect(table.locator('[data-code="255"]')).toHaveText('255: res');

  // control names are red, in EMU8086's spelling
  const names = await table.locator('.name').allTextContents();
  expect(names).toEqual(['null', 'beep', 'back', 'tab', 'newl', 'cret', 'spa', 'res']);
  await expect(table.locator('[data-code="7"] .name')).toHaveCSS('color', 'rgb(255, 0, 0)');

  // a click switches to hexadecimal and back
  await table.click();
  await expect(table.locator('[data-code="65"]')).toHaveText('41: A');
  await expect(table.locator('[data-code="255"]')).toHaveText('FF: res');
  await table.click();
  await expect(table.locator('[data-code="65"]')).toHaveText('065: A');
});
