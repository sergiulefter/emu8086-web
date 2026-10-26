/**
 * CGA/VGA colour text mode, backed directly by emulated RAM at B800:0000.
 *
 * The renderer and the BIOS video services read and write the same bytes the
 * CPU writes; there is no separate output buffer. Each cell is two bytes:
 * character (code page 437) then attribute (bits 0-3 foreground, 4-7
 * background — bit 7 is background intensity, not blink, as in EMU8086,
 * which does not emulate blinking; see docs/adr/ADR-004-vga-text.md).
 */
import type { Memory } from '../../cpu/memory';

export const VIDEO_BASE = 0xb8000;
export const PAGE_SIZE = 0x1000;
export const BDA = 0x400;

// BIOS data area offsets (segment 0040h)
export const BDA_VIDEO_MODE = 0x49;
export const BDA_COLUMNS = 0x4a;
export const BDA_PAGE_SIZE = 0x4c;
export const BDA_PAGE_START = 0x4e;
export const BDA_CURSOR_POS = 0x50; // 8 pages x (col, row)
export const BDA_CURSOR_SHAPE = 0x60; // end line, start line
export const BDA_ACTIVE_PAGE = 0x62;
export const BDA_ROWS_MINUS_ONE = 0x84;

/** Standard 16-colour CGA/VGA text palette. */
export const PALETTE = [
  '#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
  '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF',
];

export const COLOR_NAMES = [
  'black', 'blue', 'green', 'cyan', 'red', 'magenta', 'brown', 'light gray',
  'dark gray', 'light blue', 'light green', 'light cyan', 'light red', 'light magenta', 'yellow', 'white',
];

/** Code page 437 → Unicode. */
export const CP437: string[] = (() => {
  const low = ' ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼';
  const high =
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  const table: string[] = [];
  for (let i = 0; i < 256; i++) {
    if (i < 32) table.push(low[i]);
    else if (i === 127) table.push('⌂');
    else if (i < 128) table.push(String.fromCharCode(i));
    else table.push(high[i - 128]);
  }
  return table;
})();

/** Names used by EMU8086-style memory lists for control characters. */
export const CONTROL_NAMES: Record<number, string> = {
  0: 'NULL', 7: 'BEEP', 8: 'BS', 9: 'TAB', 10: 'LF', 13: 'CR', 27: 'ESC', 255: 'RES',
};

export interface Cell {
  char: number;
  attr: number;
  glyph: string;
  fg: number;
  bg: number;
}

export class TextScreen {
  constructor(readonly mem: Memory) {}

  get columns(): number {
    return this.mem.read8(BDA + BDA_COLUMNS) || 80;
  }

  get rows(): number {
    return (this.mem.read8(BDA + BDA_ROWS_MINUS_ONE) || 24) + 1;
  }

  get activePage(): number {
    return this.mem.read8(BDA + BDA_ACTIVE_PAGE) & 7;
  }

  pageBase(page = this.activePage): number {
    return VIDEO_BASE + page * PAGE_SIZE;
  }

  cellAddress(row: number, col: number, page = this.activePage): number {
    return this.pageBase(page) + (row * this.columns + col) * 2;
  }

  getCell(row: number, col: number, page = this.activePage): Cell {
    const a = this.cellAddress(row, col, page);
    const char = this.mem.read8(a);
    const attr = this.mem.read8(a + 1);
    return { char, attr, glyph: CP437[char], fg: attr & 0x0f, bg: attr >> 4 };
  }

  /** Plain-text dump of the visible page (tests, copy). */
  text(page = this.activePage): string {
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let s = '';
      for (let c = 0; c < this.columns; c++) {
        const ch = this.mem.read8(this.cellAddress(r, c, page));
        s += ch === 0 ? ' ' : CP437[ch];
      }
      lines.push(s.replace(/\s+$/, ''));
    }
    return lines.join('\n').replace(/\n+$/, '');
  }

  // --------------------------------------------------------------- cursor
  getCursor(page = this.activePage): { row: number; col: number } {
    const a = BDA + BDA_CURSOR_POS + (page & 7) * 2;
    return { col: this.mem.read8(a), row: this.mem.read8(a + 1) };
  }

  setCursor(row: number, col: number, page = this.activePage): void {
    const a = BDA + BDA_CURSOR_POS + (page & 7) * 2;
    this.mem.write8(a, col);
    this.mem.write8(a + 1, row);
  }

  // ------------------------------------------------------- BIOS primitives
  /** Initialises the BIOS video state for an 80x25 (or 40x25) colour text mode and clears all pages. */
  setMode(mode: number): void {
    const cols = mode <= 1 ? 40 : 80;
    this.mem.write8(BDA + BDA_VIDEO_MODE, mode);
    this.mem.write8(BDA + BDA_COLUMNS, cols);
    this.mem.write8(BDA + BDA_COLUMNS + 1, 0);
    const pageSize = cols === 40 ? 0x800 : 0x1000;
    this.mem.write8(BDA + BDA_PAGE_SIZE, pageSize & 0xff);
    this.mem.write8(BDA + BDA_PAGE_SIZE + 1, pageSize >> 8);
    this.mem.write8(BDA + BDA_PAGE_START, 0);
    this.mem.write8(BDA + BDA_PAGE_START + 1, 0);
    this.mem.write8(BDA + BDA_ROWS_MINUS_ONE, 24);
    this.mem.write8(BDA + BDA_ACTIVE_PAGE, 0);
    this.mem.write8(BDA + BDA_CURSOR_SHAPE, 0x07);
    this.mem.write8(BDA + BDA_CURSOR_SHAPE + 1, 0x06);
    for (let p = 0; p < 8; p++) this.setCursor(0, 0, p);
    for (let a = VIDEO_BASE; a < VIDEO_BASE + 8 * PAGE_SIZE; a += 2) {
      this.mem.write8(a, 0x20);
      this.mem.write8(a + 1, 0x07);
    }
  }

  clearPage(page = this.activePage, attr = 0x07): void {
    const base = this.pageBase(page);
    for (let i = 0; i < this.rows * this.columns; i++) {
      this.mem.write8(base + i * 2, 0x20);
      this.mem.write8(base + i * 2 + 1, attr);
    }
    this.setCursor(0, 0, page);
  }

  /** INT 10h AH=06h/07h. `lines` = 0 clears the window. */
  scroll(up: boolean, lines: number, attr: number, top: number, left: number, bottom: number, right: number, page = this.activePage): void {
    const cols = this.columns;
    bottom = Math.min(bottom, this.rows - 1);
    right = Math.min(right, cols - 1);
    if (top > bottom || left > right) return;
    const height = bottom - top + 1;
    if (lines === 0 || lines > height) lines = height;
    const base = this.pageBase(page);
    const copyRow = (dst: number, src: number) => {
      for (let c = left; c <= right; c++) {
        const s = base + (src * cols + c) * 2;
        const d = base + (dst * cols + c) * 2;
        this.mem.write8(d, this.mem.read8(s));
        this.mem.write8(d + 1, this.mem.read8(s + 1));
      }
    };
    const blankRow = (r: number) => {
      for (let c = left; c <= right; c++) {
        const d = base + (r * cols + c) * 2;
        this.mem.write8(d, 0x20);
        this.mem.write8(d + 1, attr);
      }
    };
    if (up) {
      for (let r = top; r <= bottom - lines; r++) copyRow(r, r + lines);
      for (let r = bottom - lines + 1; r <= bottom; r++) blankRow(r);
    } else {
      for (let r = bottom; r >= top + lines; r--) copyRow(r, r - lines);
      for (let r = top; r < top + lines; r++) blankRow(r);
    }
  }

  /** INT 10h AH=0Eh teletype output: interprets BEL, BS, LF, CR; scrolls at the bottom. */
  teletype(ch: number, page = this.activePage, attr?: number): void {
    let { row, col } = this.getCursor(page);
    const cols = this.columns;
    const rows = this.rows;
    switch (ch) {
      case 7: return; // bell: no audio device
      case 8: if (col > 0) col--; break;
      case 10: row++; break;
      case 13: col = 0; break;
      case 9: {
        const next = (Math.floor(col / 8) + 1) * 8;
        while (col < next && col < cols) {
          this.putChar(row, col, 0x20, page, attr);
          col++;
        }
        break;
      }
      default:
        this.putChar(row, col, ch, page, attr);
        col++;
    }
    if (col >= cols) {
      col = 0;
      row++;
    }
    if (row >= rows) {
      const a = this.mem.read8(this.cellAddress(rows - 1, cols - 1, page) + 1);
      this.scroll(true, 1, a || 0x07, 0, 0, rows - 1, cols - 1, page);
      row = rows - 1;
    }
    this.setCursor(row, col, page);
  }

  putChar(row: number, col: number, ch: number, page = this.activePage, attr?: number): void {
    const a = this.cellAddress(row, col, page);
    this.mem.write8(a, ch);
    if (attr !== undefined) this.mem.write8(a + 1, attr);
  }
}
