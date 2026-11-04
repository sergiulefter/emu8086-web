// Stepping a REP string instruction as EMU8086 4.08 shows it: the prefix is its own line and step (one byte
// highlighted), each MOVSB step copies one element and returns to the prefix until CX is 0.
import { expect, test } from '@playwright/test';
import { freshApp, pasteSource, reg, step } from './helpers';

test('REP MOVSB: REPE and MOVSB are separate steps; each iteration returns to the prefix', async ({ page }) => {
  await freshApp(page);
  await pasteSource(page, 'ORG 100h\nLEA SI, s\nLEA DI, d\nMOV CX, 3\nCLD\nREP MOVSB\nRET\ns DB 1,2,3\nd DB 0,0,0');
  await page.getByRole('button', { name: 'emulate', exact: true }).click();
  const cur = page.locator('[data-testid=disassembly-list] .row.cur');
  await step(page, 4);
  await expect(cur).toHaveText('REPE');
  await expect(page.locator('[data-testid=memory-list] .row.cur')).toHaveCount(1);
  await expect(page.locator('[data-testid=disassembly-list] .row').filter({ hasText: /^MOVSB$/ })).toHaveCount(1);
  await step(page);
  expect(await reg(page, 'IP')).toBe('010B');
  await expect(cur).toHaveText('MOVSB');
  await step(page);
  expect(await reg(page, 'IP')).toBe('010A'); // back to the prefix
  expect(await reg(page, 'CL')).toBe('02');
  await step(page, 6); // two more REPE/MOVSB pairs (CX 2 -> 0), then REPE + MOVSB with CX = 0 fall through
  expect(await reg(page, 'CL')).toBe('00');
  expect(await reg(page, 'IP')).toBe('010C');
  await expect(cur).toHaveText('RET');
});
