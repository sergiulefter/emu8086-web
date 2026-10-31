import { expect, test } from '@playwright/test';
import { editorText, fixture, freshApp, pasteSource, reg, step } from './helpers';

test('pastes, compiles, and runs .RADIX source without changing its notation', async ({ page }) => {
  await freshApp(page);
  const source = fixture('radix.asm');
  await pasteSource(page, source);
  await page.keyboard.press('F5');
  await expect(page.locator('[data-win=emulator]')).toBeVisible();
  expect(await editorText(page)).toBe(source);

  await step(page, 7);
  expect(await reg(page, 'AH') + await reg(page, 'AL')).toBe('0005');
  expect(await reg(page, 'BH') + await reg(page, 'BL')).toBe('0101');
  expect(await reg(page, 'CH') + await reg(page, 'CL')).toBe('0014');
  expect(await reg(page, 'DH') + await reg(page, 'DL')).toBe('0010');
  expect(await reg(page, 'SI')).toBe('ABCE');
  expect(await reg(page, 'DI')).toBe('007B');
  expect(await reg(page, 'BP')).toBe('0005');

  await page.getByRole('button', { name: 'run', exact: true }).click();
  await expect(page.locator('[data-win=message]')).toContainText('PROGRAM HAS RETURNED CONTROL');
  expect(await editorText(page)).toBe(source);
});
