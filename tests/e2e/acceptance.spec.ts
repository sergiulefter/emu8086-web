import { expect, test } from '@playwright/test';
import { editorText, fixture, freshApp, litPixels, pasteSource, ram, reg, step } from './helpers';

test.beforeEach(async ({ page }) => freshApp(page));

test('T001: professor H program pasted unchanged, emulated, stepped and terminated', async ({ page }) => {
  const src = fixture('T001_professor_H.asm');
  await pasteSource(page, src);
  expect(await editorText(page)).toBe(src);

  await page.keyboard.press('F5');
  const emu = page.locator('[data-win=emulator]');
  await expect(emu).toBeVisible();
  await expect(emu.locator('.ttext')).toHaveText('emulator: noname.com_');
  await expect(page.locator('[data-win=source]')).toBeVisible();
  expect(await reg(page, 'CS')).toBe('0700');
  expect(await reg(page, 'IP')).toBe('0100');

  await step(page, 6);
  expect(await reg(page, 'AH')).toBe('B8');
  expect(await reg(page, 'AL')).toBe('00');
  expect(await reg(page, 'CH')).toBe('0F');
  expect(await reg(page, 'CL')).toBe('48');
  expect(await reg(page, 'BH') + (await reg(page, 'BL'))).toBe('0000');
  expect(await reg(page, 'DS')).toBe('B800');
  expect(await ram(page, 0xb8000, 2)).toEqual([0x48, 0x0f]);

  // the virtual screen opened by itself and shows a bright white H at (0,0) only
  const screen = page.locator('[data-win=screen]');
  await expect(screen).toBeVisible();
  await expect(screen.locator('.ttext')).toHaveText('emulator screen (80x25 chars)');
  expect(await litPixels(page, 0, 0)).toBeGreaterThan(10);
  expect(await litPixels(page, 0, 1)).toBe(0);
  expect(await litPixels(page, 1, 0)).toBe(0);

  // RET -> PSP INT 20h -> F400:0150 service -> termination message
  await step(page, 3);
  const msg = page.locator('[data-win=message]');
  await expect(msg).toContainText('PROGRAM HAS RETURNED CONTROL');
  await expect(msg).toContainText('TO THE OPERATING SYSTEM');
  expect(await reg(page, 'CS')).toBe('F400');
  expect(await reg(page, 'IP')).toBe('0154');
  expect(await reg(page, 'SP')).toBe('FFFA');
  await msg.getByRole('button', { name: 'OK' }).click();
  await expect(msg).toBeHidden();
  // screen content stays visible after termination
  expect(await litPixels(page, 0, 0)).toBeGreaterThan(10);
});

test('T002: diagonal HELLO via run', async ({ page }) => {
  await pasteSource(page, fixture('T002_diagonal_HELLO.asm'));
  await page.getByRole('button', { name: 'emulate', exact: true }).click();
  await page.getByRole('button', { name: 'run', exact: true }).click();
  await expect(page.locator('[data-win=message]')).toContainText('PROGRAM HAS RETURNED CONTROL');
  for (let i = 0; i < 5; i++) {
    expect(await litPixels(page, i, i)).toBeGreaterThan(10);
    expect(await litPixels(page, i, i + 1)).toBe(0);
  }
  for (const [off, ch] of [[0, 0x48], [162, 0x45], [324, 0x4c], [486, 0x4c], [648, 0x4f]]) {
    expect(await ram(page, 0xb8000 + off, 2)).toEqual([ch, 0x0f]);
  }
});

test('T003: source line highlight follows single steps; org and comment are never current', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.keyboard.press('F5');
  const cur = page.locator('[data-win=source] .src-line.cur');
  const expected = [3, 4, 7, 8, 9, 10, 12];
  for (let i = 0; i < expected.length; i++) {
    await expect(cur).toHaveAttribute('data-line', String(expected[i]));
    if (i < expected.length - 1) await page.keyboard.press('F8');
  }
  // memory list shows the written bytes when pointed at B800:0000
  const box = page.getByLabel('memory address');
  await box.fill('B800:0000');
  await box.press('Enter');
  await expect(page.getByTestId('memory-list')).toContainText('B8000: 48 072 H');
  await expect(page.getByTestId('memory-list')).toContainText('B8001: 0F 015');
});

test('T004c: HLT reports a halt, not a DOS exit', async ({ page }) => {
  await pasteSource(page, fixture('T004c_hlt.asm'));
  await page.keyboard.press('F5');
  await page.keyboard.press('F8');
  await expect(page.locator('[data-win=message]')).toContainText('the emulator is halted.');
});

test('T005/J4: invalid binary digit shows line/column and blocks emulation', async ({ page }) => {
  await pasteSource(page, fixture('T005_invalid_binary.asm'));
  await page.keyboard.press('F5');
  const status = page.getByTestId('assembler-status');
  await expect(status).toContainText("(2) invalid binary digit '2' in '0000_1112b'");
  await expect(status).toContainText('[col 17]');
  await expect(page.locator('[data-win=emulator]')).toBeHidden();
  await expect(status.getByRole('button', { name: 'run' })).toBeDisabled();
  // clicking the error moves the editor cursor to the offending digit
  await status.getByText("invalid binary digit").click();
  await expect(page.locator('[data-win=editor] .statusbar')).toContainText('line: 2');
  await expect(page.locator('[data-win=editor] .statusbar')).toContainText('col: 17');
});

test('T008/J5: endless loop stays responsive, stops and resets', async ({ page }) => {
  await pasteSource(page, fixture('T008_loop_forever.asm'));
  await page.keyboard.press('F5');
  const run = page.getByRole('button', { name: 'run', exact: true });
  await run.click();
  await expect(run).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600);
  // UI still reacts while running
  await page.getByRole('button', { name: 'flags', exact: true }).click();
  await expect(page.locator('[data-win=flags]')).toBeVisible();
  await expect(page.locator('[data-win=emulator] .emu-status')).toContainText('running...');
  await run.click();
  await expect(run).toHaveAttribute('aria-pressed', 'false');
  const count = await page.evaluate(() => (window as any).__studio.session.machine.cpu.instructionCount);
  expect(count).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'reset', exact: true }).click();
  expect(await reg(page, 'IP')).toBe('0100');
  expect(await page.evaluate(() => (window as any).__studio.session.machine.cpu.instructionCount)).toBe(0);
});

test('T008: execution limit stops a runaway program with a useful message', async ({ page }) => {
  await page.evaluate(() => (window as any).__studio.updateSettings({ instructionLimit: 100000 }));
  await pasteSource(page, fixture('T008_loop_forever.asm'));
  await page.keyboard.press('F5');
  await page.keyboard.press('F9');
  await expect(page.locator('[data-win=message]')).toContainText('execution limit reached: 100,000 instructions');
});

test('T008: a failed compile does not run the stale program', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.keyboard.press('F5');
  await pasteSource(page, 'org 100h\nmov ax, \nret');
  await page.locator('.taskbar').getByRole('button', { name: /^emulator:/ }).click();
  await page.getByRole('button', { name: 'reload' }).click();
  await expect(page.getByTestId('assembler-status')).toContainText('there are errors!');
});

test('T009: extended value viewer for AX=00F7h', async ({ page }) => {
  await pasteSource(page, 'org 100h\nmov ax, 00F7h\nret');
  await page.keyboard.press('F5');
  await page.keyboard.press('F8');
  await page.getByLabel('AL', { exact: true }).dblclick();
  const vv = page.getByTestId('value-viewer');
  await expect(vv).toBeVisible();
  await expect(vv.getByLabel('H hex')).toHaveValue('00');
  await expect(vv.getByLabel('L hex')).toHaveValue('F7');
  await expect(vv.getByLabel('L bin')).toHaveValue('11110111');
  await expect(vv.getByLabel('L oct')).toHaveValue('367');
  await expect(vv.getByLabel('L unsigned')).toHaveValue('247');
  await expect(vv.getByLabel('L signed')).toHaveValue('-9');
  await expect(vv.getByLabel('L ascii')).toHaveValue('≈');
  await expect(vv.getByLabel('unsigned 16')).toHaveValue('247');
  await expect(vv.getByLabel('signed 16', { exact: true })).toHaveValue('247');
  // editing in another base updates the register live
  await vv.getByLabel('signed 16', { exact: true }).fill('-2');
  await vv.getByLabel('signed 16', { exact: true }).press('Enter');
  expect(await reg(page, 'AH')).toBe('FF');
  expect(await reg(page, 'AL')).toBe('FE');
});

test('T010: step back restores B800 bytes and registers; forward reproduces them', async ({ page }) => {
  await pasteSource(page, fixture('T001_professor_H.asm'));
  await page.keyboard.press('F5');
  const back = page.getByRole('button', { name: 'step back' });
  await expect(back).toBeDisabled();
  await step(page, 6);
  expect(await ram(page, 0xb8000, 2)).toEqual([0x48, 0x0f]);
  await back.click();
  expect(await ram(page, 0xb8000, 2)).toEqual([0x20, 0x07]);
  expect(await reg(page, 'IP')).toBe('010C');
  expect(await litPixels(page, 0, 0)).toBe(0);
  await page.keyboard.press('F8');
  expect(await ram(page, 0xb8000, 2)).toEqual([0x48, 0x0f]);
  expect(await reg(page, 'IP')).toBe('010E');
});

test('keyboard input typed on the emulator screen reaches the program', async ({ page }) => {
  await page.getByRole('menuitem', { name: 'file' }).first().click();
  await page.getByRole('menuitem', { name: 'examples' }).hover();
  await page.getByRole('menuitem', { name: 'simple i/o' }).click();
  await page.keyboard.press('F5');
  await page.keyboard.press('F9');
  await expect(page.locator('[data-win=emulator] .emu-status')).toContainText('waiting for keyboard input');
  await page.getByRole('button', { name: 'screen', exact: true }).click();
  await page.getByTestId('screen').click();
  await page.keyboard.type('ok');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-win=message]')).toContainText('PROGRAM HAS RETURNED CONTROL');
  const text = await page.evaluate(() => (window as any).__studio.session.machine.env.screen.text());
  expect(text).toBe('OK');
});

test('breakpoint set from the source window stops run', async ({ page }) => {
  await pasteSource(page, fixture('T002_diagonal_HELLO.asm'));
  await page.keyboard.press('F5');
  await page.locator('[data-win=source] .src-line[data-line="13"] .ln').click();
  await page.keyboard.press('F9');
  await expect(page.locator('[data-win=message]')).toContainText('break point encountered at: 0700:011C');
  await expect(page.locator('[data-win=source] .src-line.cur')).toHaveAttribute('data-line', '13');
});
