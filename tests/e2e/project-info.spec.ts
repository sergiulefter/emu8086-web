import { expect, test } from '@playwright/test';
import { editorText, freshApp, pasteSource, ram, reg } from './helpers';

test('project information survives mounting and the guide preserves an unsaved program', async ({ page }) => {
  await freshApp(page);
  await pasteSource(page, 'org 100h\nmov ax, 42\nret');
  const info = page.getByRole('contentinfo', { name: 'About emu8086-web' });
  await expect(info).toContainText('free online Intel 8086 assembler, emulator and debugger');
  await expect(info.getByRole('link', { name: 'GitHub', exact: true })).toBeVisible();
  const [guide] = await Promise.all([
    page.waitForEvent('popup'),
    info.getByRole('link', { name: 'Getting started' }).click(),
  ]);
  await expect(guide.getByRole('heading', { level: 1 })).toHaveText('Your first 8086 program, in the browser.');
  expect(new URL(guide.url()).pathname).toBe('/guide/');
  expect(await editorText(page)).toBe('org 100h\nmov ax, 42\nret');
  const area = await page.locator('.desktop').boundingBox();
  const taskbar = await page.locator('.taskbar').boundingBox();
  const footer = await info.boundingBox();
  expect(area!.y + area!.height).toBeLessThanOrEqual(taskbar!.y + 1);
  expect(taskbar!.y + taskbar!.height).toBeLessThanOrEqual(footer!.y + 1);
  await guide.close();
});

test('both guide programs run and the debugger keyboard shortcuts work', async ({ page }) => {
  await page.goto('/guide/');
  // Read the selectable code text, as a reader copying the highlighted example would.
  const firstProgram = await page.locator('#first-program-source').innerText();
  const textOutputProgram = await page.locator('#text-output-source').innerText();
  await freshApp(page);
  await pasteSource(page, firstProgram);
  await page.keyboard.press('F5');
  await expect(page.locator('[data-win=emulator]')).toBeVisible();
  await page.keyboard.press('F8');
  expect(`${await reg(page, 'AH')}${await reg(page, 'AL')}`).toBe('0002');
  await page.keyboard.press('F8');
  expect(`${await reg(page, 'AH')}${await reg(page, 'AL')}`).toBe('0005');
  await page.keyboard.press('F6');
  expect(`${await reg(page, 'AH')}${await reg(page, 'AL')}`).toBe('0002');

  await pasteSource(page, textOutputProgram);
  await page.keyboard.press('F5');
  await page.keyboard.press('F9');
  await expect(page.locator('[data-win=message]')).toContainText('PROGRAM HAS RETURNED CONTROL');
  const output = await ram(page, 0xb8000, 'Hello from emu8086-web!'.length * 2);
  expect(output.filter((_, index) => index % 2 === 0).map((byte) => String.fromCharCode(byte)).join('')).toBe('Hello from emu8086-web!');
});

test('the mobile description and guide are readable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toContainText('Linux, Windows and macOS');
  await expect(page.locator('noscript strong')).toBeVisible();
  const [guide] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Getting started' }).click(),
  ]);
  await expect(guide.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(guide.locator('#first-program-source')).toBeVisible();
  expect(await guide.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
