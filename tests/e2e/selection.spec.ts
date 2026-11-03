// Clicking the memory list and the disassembly, replaying a session recorded on EMU8086 4.08:
// the clicked bytes turn yellow, overlap with CS:IP turns green, the selection survives steps,
// the address boxes and the source window follow the selection until the next step.
import { expect, test, type Page } from '@playwright/test';
import { freshApp, pasteSource } from './helpers';

const SOURCE = ['org 100h', '', 'LEA SI,x', 'MOV AL,[SI]', ...Array(5).fill('\nINC SI\nMOV AL,[SI]'), '', 'ret', 'x DB  1,2,3,4,5'].join('\n');

const memRow = (page: Page, addr: string) => page.locator('[data-testid=memory-list] .row', { hasText: `${addr}:` });
const disRows = (page: Page) => page.locator('[data-testid=disassembly-list] .row');
const memBox = (page: Page) => page.getByLabel('memory address');
const disBox = (page: Page) => page.getByLabel('disassembly address');

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await pasteSource(page, SOURCE);
  await page.getByRole('button', { name: 'emulate', exact: true }).click();
  await expect(memRow(page, '07100')).toHaveClass(/\bcur\b/);
});

test('CS:IP is the first memory row; the ROM trap shows as 2-byte BIOS DI; the boxes show CS:IP', async ({ page }) => {
  const firstRow = () => page.locator('[data-testid=memory-list] .row').first();
  await expect(firstRow()).toHaveText(/^07100:/); // no rows above CS:IP after loading, as in EMU8086
  for (let i = 0; i < 14; i++) await page.getByRole('button', { name: 'single step' }).click();
  // F400:0150: the list jumps with CS:IP on the first row; only FF FF is the current "instruction"
  await expect(firstRow()).toHaveText(/^F4150:/);
  await expect(page.locator('[data-testid=memory-list] .row.cur')).toHaveCount(2);
  await expect(disRows(page).nth(0)).toHaveText('BIOS DI');
  await expect(disRows(page).nth(1)).toHaveText('INT 020h');
  await expect(disRows(page).nth(2)).toHaveText('IRET');
  // the trap runs in one step; both boxes then show CS:IP, not the first listed line
  await page.getByRole('button', { name: 'single step' }).click();
  await expect(page.getByTestId('message-box')).toContainText('PROGRAM HAS RETURNED CONTROL');
  await expect(memBox(page)).toHaveValue('F400:0154');
  await expect(disBox(page)).toHaveValue('F400:0154');
  await expect(disRows(page).nth(2)).toHaveClass(/\bcur\b/);
});

test('memory click selects one byte, re-anchors the disassembly and marks the source line', async ({ page }) => {
  await memRow(page, '07105').click();
  await expect(memRow(page, '07105')).toHaveClass(/\bpick\b/);
  await expect(memRow(page, '07104')).not.toHaveClass(/\bpick\b/);
  await expect(memBox(page)).toHaveValue('0700:0105');
  await expect(disBox(page)).toHaveValue('0700:0105');
  await expect(disRows(page).first()).toHaveText('INC SI');
  await expect(disRows(page).first()).toHaveClass(/\bpick\b/);
  await expect(page.locator('[data-win=source] .src-line.pick')).toHaveAttribute('data-line', '6');
  // CS:IP is untouched
  for (const a of ['07100', '07101', '07102']) await expect(memRow(page, a)).toHaveClass(/\bcur\b/);

  // a byte in the middle of an instruction: the disassembly decodes from that byte
  await memRow(page, '07104').click();
  await expect(disRows(page).first()).toHaveText('ADD AL, 046h');
});

test('the selection survives steps, turns green under CS:IP, and the boxes return to CS:IP', async ({ page }) => {
  await memRow(page, '07104').click();
  await page.getByRole('button', { name: 'single step' }).click();
  await expect(memRow(page, '07104')).toHaveClass(/\bcur\b.*\bpick\b/);
  await expect(memBox(page)).toHaveValue('0700:0103');
  await expect(disBox(page)).toHaveValue('0700:0103');
  await expect(disRows(page).first()).toHaveText('MOV AL, [SI]');
  await expect(page.locator('[data-win=source] .src-line.pick')).toHaveCount(0);

  await page.getByRole('button', { name: 'single step' }).click();
  await expect(memRow(page, '07104')).toHaveClass(/\bpick\b/);
  await expect(memRow(page, '07104')).not.toHaveClass(/\bcur\b/);
  await expect(memRow(page, '07105')).toHaveClass(/\bcur\b/);
});

test('disassembly click selects every byte of the instruction; scrolling keeps it on its address', async ({ page }) => {
  await disRows(page).nth(5).click(); // MOV AL, [SI] at 0109
  await expect(disRows(page).nth(5)).toHaveClass(/\bpick\b/);
  for (const a of ['07109', '0710A']) await expect(memRow(page, a)).toHaveClass(/\bpick\b/);
  await expect(memRow(page, '07106')).not.toHaveClass(/\bpick\b/);
  await expect(memBox(page)).toHaveValue('0700:0109');
  await expect(disBox(page)).toHaveValue('0700:0109');

  // arrow keys scroll the memory view by a row; the box then shows the first visible row
  const list = page.getByTestId('memory-list');
  await list.focus();
  const before = await list.evaluate((el) => el.scrollTop);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(before + 28);
  const top = await list.evaluate((el) => Math.ceil(el.scrollTop / 14));
  await expect(memBox(page)).toHaveValue(`0700:${top.toString(16).toUpperCase().padStart(4, '0')}`);
  for (const a of ['07109', '0710A']) await expect(memRow(page, a)).toHaveClass(/\bpick\b/);
});
