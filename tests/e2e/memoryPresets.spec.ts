import { expect, test } from '@playwright/test';
import { editorText, fixture, freshApp, pasteSource, ram, reg, step } from './helpers';

test.beforeEach(async ({ page }) => freshApp(page));

test('loads #MEM source unchanged and restores presets on Step Back, reset and reload', async ({ page }) => {
  const source = fixture('memory_presets.asm');
  await pasteSource(page, source);
  await page.keyboard.press('F5');
  await expect(page.locator('[data-win=emulator]')).toBeVisible();
  expect(await editorText(page)).toBe(source);
  expect(await ram(page, 0x1200, 4)).toEqual([0x34, 0x12, 0x78, 0x56]);
  expect(await ram(page, 0xb8000, 2)).toEqual([0x48, 0x0f]);

  await step(page, 2);
  expect(await reg(page, 'AH') + await reg(page, 'AL')).toBe('1234');
  expect(await reg(page, 'BH') + await reg(page, 'BL')).toBe('5678');
  await step(page);
  expect(await ram(page, 0x1200, 2)).toEqual([0, 0]);
  await page.getByRole('button', { name: 'step back', exact: true }).click();
  expect(await ram(page, 0x1200, 2)).toEqual([0x34, 0x12]);
  await step(page);
  await page.getByRole('button', { name: 'reset', exact: true }).click();
  expect(await ram(page, 0x1200, 2)).toEqual([0x34, 0x12]);
  expect(await reg(page, 'IP')).toBe('0000');

  await step(page, 3);
  expect(await ram(page, 0x1200, 2)).toEqual([0, 0]);
  await page.getByRole('button', { name: 'reload', exact: true }).click();
  expect(await ram(page, 0x1200, 2)).toEqual([0x34, 0x12]);
  await page.getByRole('button', { name: 'run', exact: true }).click();
  await expect(page.locator('[data-win=message]')).toContainText('the emulator is halted');
  expect(await editorText(page)).toBe(source);
});

test('a malformed #MEM directive blocks compilation and reports its source line', async ({ page }) => {
  await pasteSource(page, '#make_bin#\n#MEM=0100:0200,0G#\nhlt');
  await page.keyboard.press('F5');
  const status = page.getByTestId('assembler-status');
  await expect(status).toContainText('(2) #MEM: byte strings must contain hexadecimal digits only');
  await expect(status).toContainText('[col 17]');
  await expect(status.getByRole('button', { name: 'run' })).toBeDisabled();
  await expect(page.locator('[data-win=emulator]')).toBeHidden();
});
