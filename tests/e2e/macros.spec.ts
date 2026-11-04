// include 'emu8086.inc' end to end: the tutorial program reads a number with SCAN_NUM and prints it back
// with PRINT_NUM; the source window keeps a macro call line highlighted while its instructions run.
import { expect, test } from '@playwright/test';
import { freshApp, pasteSource } from './helpers';

const TUTORIAL = [
  "include 'emu8086.inc'",
  'ORG    100h',
  'LEA    SI, msg1',
  'CALL   print_string',
  'CALL   scan_num',
  'MOV    AX, CX',
  'CALL   pthis',
  "DB  13, 10, 'You have entered: ', 0",
  'CALL   print_num',
  'RET',
  "msg1   DB  'Enter the number: ', 0",
  'DEFINE_SCAN_NUM',
  'DEFINE_PRINT_STRING',
  'DEFINE_PRINT_NUM',
  'DEFINE_PRINT_NUM_UNS',
  'DEFINE_PTHIS',
  'END',
].join('\n');

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('emu8086.inc tutorial: SCAN_NUM reads a number typed on the screen, PRINT_NUM prints it', async ({ page }) => {
  await pasteSource(page, TUTORIAL);
  await page.keyboard.press('F5');
  await expect(page.locator('[data-win=emulator]')).toBeVisible();
  await page.keyboard.press('F9');
  await expect(page.locator('[data-win=emulator] .emu-status')).toContainText('waiting for keyboard input');
  await page.getByRole('button', { name: 'screen', exact: true }).click();
  await page.getByTestId('screen').click();
  await page.keyboard.type('-1234');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-win=message]')).toContainText('PROGRAM HAS RETURNED CONTROL');
  const text = await page.evaluate(() => (window as unknown as { __studio: { session: { machine: { env: { screen: { text(): string } } } } } }).__studio.session.machine.env.screen.text());
  expect(text).toContain('Enter the number: -1234');
  expect(text).toContain('You have entered: -1234');
});

test('stepping through a macro call keeps its line highlighted in the source window', async ({ page }) => {
  await pasteSource(page, 'MyMacro MACRO p1, p2, p3\n MOV AX, p1\n MOV BX, p2\n MOV CX, p3\nENDM\nORG 100h\nMyMacro 1, 2, 3\nMyMacro 4, 5, DX\nRET');
  await page.keyboard.press('F5');
  const cur = page.locator('[data-win=source] .src-line.cur');
  for (const line of [7, 7, 7, 8]) {
    await expect(cur).toHaveAttribute('data-line', String(line));
    await page.getByRole('button', { name: 'single step' }).click();
  }
  await expect(page.locator('[data-win=emulator] input[aria-label="IP"]')).toHaveValue('010C');
});
