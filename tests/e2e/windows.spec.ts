import { expect, test, type Locator } from '@playwright/test';
import { fixture, freshApp, pasteSource } from './helpers';

test.beforeEach(async ({ page }) => freshApp(page));

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

test('T007: editor, emulator, screen, source and value viewer coexist and behave as windows', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.keyboard.press('F5');
  await page.getByRole('button', { name: 'screen', exact: true }).click();
  await page.getByLabel('AL', { exact: true }).dblclick();
  for (const id of ['editor', 'emulator', 'screen', 'source', 'viewer']) {
    await expect(page.locator(`[data-win=${id}]`)).toBeVisible();
  }

  // drag the emulator by its title bar
  const emu = page.locator('[data-win=emulator]');
  const before = await box(emu);
  const title = emu.locator('.titlebar .ttext');
  const t = await box(title);
  await page.mouse.move(t.x + 20, t.y + 10);
  await page.mouse.down();
  await page.mouse.move(t.x + 80, t.y + 50, { steps: 5 });
  await page.mouse.up();
  const after = await box(emu);
  expect(Math.round(after.x - before.x)).toBe(60);
  expect(Math.round(after.y - before.y)).toBe(40);

  // focus brings a window to the front
  await page.locator('[data-win=editor] .titlebar .ttext').click();
  const zEditor = await page.locator('[data-win=editor]').evaluate((e) => Number(getComputedStyle(e).zIndex));
  const zEmu = await emu.evaluate((e) => Number(getComputedStyle(e).zIndex));
  expect(zEditor).toBeGreaterThan(zEmu);
  await expect(page.locator('[data-win=editor]')).toHaveClass(/active/);

  // resize the screen window from its bottom-right corner
  const scr = page.locator('[data-win=screen]');
  const sb = await box(scr);
  const corner = scr.locator('.rs.se');
  const cb = await box(corner);
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x - 100, cb.y - 50, { steps: 5 });
  await page.mouse.up();
  const sa = await box(scr);
  expect(Math.round(sb.width - sa.width)).toBeGreaterThan(90);

  // minimize and restore from the task bar; CPU state is unchanged
  await page.locator('.taskbar').getByRole('button', { name: /^emulator:/ }).click();
  await expect(emu).toHaveClass(/active/);
  await emu.getByRole('button', { name: 'Minimize' }).click();
  await expect(emu).toBeHidden();
  await page.locator('.taskbar').getByRole('button', { name: /emulator: noname.com_/ }).click();
  await expect(emu).toBeVisible();
  await expect(emu.locator('input[aria-label="IP"]')).toHaveValue('0100');

  // maximize / restore
  await emu.getByRole('button', { name: 'Maximize' }).click();
  const max = await box(emu);
  expect(max.x).toBe(0);
  await emu.getByRole('button', { name: 'Restore' }).click();
  expect((await box(emu)).width).toBeLessThan(max.width);

  // close and reopen the source window
  const src = page.locator('[data-win=source]');
  await page.locator('.taskbar').getByRole('button', { name: 'original source code' }).click();
  await src.getByRole('button', { name: 'Close' }).click();
  await expect(src).toBeHidden();
  await emu.getByRole('button', { name: 'source', exact: true }).click();
  await expect(src).toBeVisible();
  await expect(src.locator('.src-line.cur')).toHaveAttribute('data-line', '3');
});

test('menus open, navigate and run real commands', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.getByRole('menuitem', { name: 'assembler' }).click();
  await page.getByRole('menuitem', { name: 'compile and load in the emulator' }).click();
  const emu = page.locator('[data-win=emulator]');
  await expect(emu).toBeVisible();
  await emu.getByRole('menuitem', { name: 'debug' }).click();
  await page.getByRole('menuitem', { name: 'single step' }).click();
  await expect(emu.locator('input[aria-label="IP"]')).toHaveValue('0103');
  await emu.getByRole('menuitem', { name: 'view' }).click();
  await page.getByRole('menuitem', { name: 'flags', exact: true }).click();
  await expect(page.getByTestId('flags')).toContainText('IF 1');
  // unsupported items are visibly disabled, not fake
  await emu.getByRole('menuitem', { name: 'virtual drive' }).click();
  await expect(page.getByRole('menuitem', { name: 'boot from virtual floppy' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
});

test('compile shows the assembler status dialog without starting the emulator', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.getByRole('button', { name: 'compile', exact: true }).click();
  const st = page.getByTestId('assembler-status');
  await expect(st).toContainText('noname.com is assembled successfully into 15 bytes.');
  await expect(page.locator('[data-win=emulator]')).toBeHidden();
  await st.getByRole('button', { name: 'run' }).click();
  await expect(page.locator('[data-win=emulator]')).toBeVisible();
});

test('new file from the code template dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'new', exact: true }).click();
  await page.getByText('BIN template').click();
  await page.getByRole('button', { name: 'OK' }).click();
  const text = await page.evaluate(() => (window as any).__studio.currentText());
  expect(text).toContain('#make_bin#');
});

test('a closed emulator can be restored from the task bar with its state intact', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.keyboard.press('F5');
  await page.keyboard.press('F8');
  await page.keyboard.press('F8');
  const emu = page.locator('[data-win=emulator]');
  await expect(emu.locator('input[aria-label="IP"]')).toHaveValue('0105');
  await emu.getByRole('button', { name: 'Close' }).click();
  await expect(emu).toBeHidden();
  const task = page.locator('.taskbar').getByRole('button', { name: /^emulator: noname\.com_/ });
  await expect(task).toHaveClass(/minimized/);
  await task.click();
  await expect(emu).toBeVisible();
  await expect(emu.locator('input[aria-label="IP"]')).toHaveValue('0105');
  await expect(emu).toHaveClass(/active/);
});

test('windows menu can show any closed window', async ({ page }) => {
  await page.locator('.taskbar').getByRole('button', { name: /windows/ }).click();
  await page.getByRole('menuitem', { name: 'show' }).hover();
  await page.getByRole('menuitem', { name: 'flags', exact: true }).click();
  await expect(page.locator('[data-win=flags]')).toBeVisible();
});
