// Help opens the bundled EMU8086 4.08 documentation; menus list the same items as EMU8086 4.08.
import { expect, test } from '@playwright/test';
import { editorText, freshApp, pasteSource } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('F1, the help button and help → documentation open the EMU8086 documentation in another window', async ({ page }) => {
  for (const open of [
    () => page.keyboard.press('F1'),
    () => page.getByRole('button', { name: 'help', exact: true }).click(),
    async () => {
      await page.getByRole('menuitem', { name: 'help' }).click();
      await page.getByRole('menuitem', { name: 'documentation and tutorials' }).click();
    },
  ]) {
    const [popup] = await Promise.all([page.waitForEvent('popup'), open()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe('/documentation/');
    await expect.poll(() => popup.frame({ name: 'bigwindow' })?.url() ?? '').toMatch(/\/documentation\/help\.html$/);
    await expect(popup.frame({ name: 'bigwindow' })!.locator('body')).toContainText('Assembly Language Tutorials');
    await expect(popup.frame({ name: 'notice' })!.locator('body')).toContainText('EMU8086.COM');
    await popup.close();
  }
});

test('documentation pages and images load from /documentation/', async ({ page }) => {
  const res = await page.goto('/documentation/8086_instruction_set.html');
  expect(res?.status()).toBe(200);
  await expect(page.locator('body')).toContainText('MOV');
  expect((await page.request.get('/documentation/img/array.gif')).headers()['content-type']).toBe('image/gif');
});

test('editor menus match EMU8086 4.08', async ({ page }) => {
  await page.getByRole('menuitem', { name: 'help' }).click();
  await page.getByRole('menuitem', { name: 'check for an update...' }).click();
  await expect(page.getByText('every time the page is loaded it is the latest version')).toBeVisible();
  await page.keyboard.press('Enter');

  await page.getByRole('menuitem', { name: 'assembler' }).click();
  await expect(page.getByRole('menuitem', { name: 'fasm' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('menuitem', { name: 'set output directory...' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  await page.getByRole('menuitem', { name: 'edit' }).click();
  await page.getByRole('menuitem', { name: 'advanced editor macros' }).click();
  await expect(page.getByRole('menuitem', { name: 'Play Macro 10' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('menuitem', { name: 'Record new Keystroke Macro' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
});

test('edit → advanced: show line numbers, tabify / untabify, display whitespace', async ({ page }) => {
  await pasteSource(page, '        mov ax, 1\n    ret');
  const gutter = page.locator('[data-win=editor] .cm-lineNumbers');
  await expect(gutter).toBeVisible();
  const advanced = async (item: string) => {
    await page.getByRole('menuitem', { name: 'edit' }).click();
    await page.getByRole('menuitem', { name: 'advanced ▸', exact: true }).click(); // clicking opens the submenu too
    await page.getByRole('menuitem', { name: new RegExp(`^(✓\\s*)?${item}$`) }).click();
  };
  await advanced('show line numbers');
  await expect(gutter).toHaveCount(0);
  await advanced('show line numbers');
  await expect(gutter).toBeVisible();

  await page.locator('[data-win=editor] .cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await advanced('tabify selection');
  expect(await editorText(page)).toBe('\tmov ax, 1\n    ret');
  await page.keyboard.press('ControlOrMeta+a');
  await advanced('untabify selection');
  expect(await editorText(page)).toBe('        mov ax, 1\n    ret');

  await advanced('display whitespace');
  await expect(page.locator('[data-win=editor] .cm-highlightSpace').first()).toBeVisible();
});

test('emulator help and virtual devices menus match EMU8086 4.08', async ({ page }) => {
  await pasteSource(page, 'org 100h\nret');
  await page.getByRole('button', { name: 'emulate', exact: true }).click();
  const emu = page.locator('[data-win=emulator]');
  await emu.getByRole('menuitem', { name: 'virtual devices' }).click();
  for (const d of ['LED_Display.exe', 'Printer.exe', 'Robot.exe', 'Simple.exe', 'Stepper_motor.exe', 'Thermometer.exe', 'Traffic_Lights.exe', 'VGA_STATE.exe']) {
    await expect(page.getByRole('menuitem', { name: d })).toHaveAttribute('aria-disabled', 'true');
  }
  await page.keyboard.press('Escape');
  await emu.getByRole('menuitem', { name: 'help' }).click();
  await expect(page.getByRole('menuitem', { name: 'check for an update...' })).toBeVisible();
  await page.keyboard.press('Escape');
});
