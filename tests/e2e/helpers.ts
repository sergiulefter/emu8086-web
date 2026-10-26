import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fixture = (name: string) => readFileSync(join(process.cwd(), 'fixtures', name), 'utf8');

export async function freshApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-win=editor]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Replaces the editor content the way a user pastes code. */
export async function pasteSource(page: Page, text: string): Promise<void> {
  // bring the editor window to the front first, as a user would
  await page.locator('[data-win=editor] .titlebar .ttext').click({ position: { x: 10, y: 8 } });
  const content = page.locator('[data-win=editor] .cm-content');
  await content.click({ position: { x: 40, y: 6 } });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __studio: { currentText(): string } }).__studio.currentText());
}

export async function reg(page: Page, name: string): Promise<string> {
  return page.locator(`[data-win=emulator] input[aria-label="${name}"]`).inputValue();
}

/** Reads bytes of emulated RAM (test inspection only). */
export async function ram(page: Page, address: number, length: number): Promise<number[]> {
  return page.evaluate(([a, n]) => {
    const s = (window as unknown as { __studio: { session: { machine: { mem: { bytes: Uint8Array } } } } }).__studio;
    return Array.from(s.session.machine.mem.bytes.slice(a, a + n));
  }, [address, length]);
}

/** Counts lit (non-black) pixels inside one 80x25 text cell of the screen canvas. */
export async function litPixels(page: Page, row: number, col: number): Promise<number> {
  return page.evaluate(([r, c]) => {
    const canvas = document.querySelector('[data-win=screen] canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const cw = canvas.width / 80;
    const ch = canvas.height / 25;
    const d = ctx.getImageData(c * cw, r * ch, cw, ch).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++;
    return n;
  }, [row, col]);
}

export async function step(page: Page, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: 'single step' }).click();
}
