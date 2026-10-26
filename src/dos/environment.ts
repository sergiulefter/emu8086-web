/**
 * Minimal PC/DOS environment for coursework programs.
 *
 * Layout follows EMU8086 4.08 (docs/research/EMU8086_DOC_RESEARCH.md §7):
 *  - IVT at 0000:0000; vectors point into a ROM at segment F400 where every
 *    handler is the service trap `FF FF CD nn` followed by `CF` (IRET).
 *    INT 20h lives at F400:0150, INT 21h at F400:0200, INT 10h at F400:0190…
 *    unlisted vectors use the default stub at F400:0100.
 *  - .COM programs load at 0700:0100 with the PSP at 0700:0000 (`CD 20`),
 *    SS:SP = 0700:FFFE holding a 0000 return offset, CX = program size.
 *  - .BIN programs load at 0100:0000 (default.binf) with FF00 on the stack
 *    and a HLT at 0100:FF00 so a final RET halts.
 *
 * All service state that must survive Step Back lives in emulated RAM
 * (cursor, keyboard buffer) or in `ServiceState`, which the debugger
 * snapshots per instruction.
 */
import { AX, BP, BX, CF, CPU, CS, CX, DI, DS, DX, ES, IF, SI, SP, SS, ZF, ROM_SEGMENT } from '../cpu/cpu';
import { Memory, physical } from '../cpu/memory';
import { BDA, TextScreen } from '../devices/vga/textmode';

export const COM_LOAD_SEGMENT = 0x0700;
export const BIN_LOAD_SEGMENT = 0x0100;
const ROM_BASE = ROM_SEGMENT << 4;

/** ROM offsets of each handler stub (EMU8086 4.08 INT_VECT). */
export const HANDLER_OFFSETS: Record<number, number> = {
  0x00: 0x0170, 0x01: 0x0110, 0x03: 0x0120, 0x04: 0x0180, 0x10: 0x0190, 0x11: 0x01d0, 0x12: 0x01a0,
  0x13: 0x01b0, 0x15: 0x01e0, 0x16: 0x01c0, 0x17: 0x0400, 0x1a: 0x0160, 0x20: 0x0150,
  0x21: 0x0200, 0x33: 0x0300,
};
const DEFAULT_HANDLER = 0x0100;
const DEFAULT_VECTOR_ID = 0xff;

// Keyboard buffer in the BIOS data area (standard PC layout).
const KB_HEAD = BDA + 0x1a;
const KB_TAIL = BDA + 0x1c;
const KB_START = 0x1e;
const KB_END = 0x3e;
export const KEYBOARD_CAPACITY = 15;

export type StopReason =
  | 'exit' // DOS program termination (INT 20h, INT 21h/00h, INT 21h/4Ch)
  | 'halt' // HLT
  | 'reboot' // INT 19h
  | 'breakpoint'
  | 'interrupt-error' // CPU exception vectors (divide error, INTO, INT 3/1 without handler)
  | 'unsupported' // service not implemented
  | 'fault' // undefined opcode
  | 'limit'
  | 'user';

export interface StopEvent {
  reason: StopReason;
  message: string;
  exitCode?: number;
}

/** Service state that is not stored in emulated RAM (snapshotted for Step Back). */
export interface ServiceState {
  /** INT 21h/0Ah buffered input in progress. */
  lineInput: { count: number } | null;
  /** INT 21h/0Ch already flushed the keyboard buffer for the call in progress. */
  flushed: boolean;
}

export interface ServiceResult {
  stop?: StopEvent;
  /** The service is blocked waiting for keyboard input; IP was rewound. */
  waiting?: boolean;
  /** Ask the scheduler to pause for this many milliseconds (INT 15h/86h). */
  sleepMs?: number;
}

export interface Clock {
  now(): Date;
}

export class DosEnvironment {
  readonly screen: TextScreen;
  state: ServiceState = { lineInput: null, flushed: false };
  /** Set by the last service call; consumed by the machine after each step. */
  pending: ServiceResult | null = null;
  /** Diagnostic log lines (port I/O, notes). */
  log: (line: string) => void = () => {};
  clock: Clock = { now: () => new Date() };

  constructor(readonly mem: Memory, readonly cpu: CPU) {
    this.screen = new TextScreen(mem);
    cpu.hook = (c, vector, stubIp) => this.service(c, vector, stubIp);
  }

  // ------------------------------------------------------------- setup
  /** Clears RAM and builds IVT, BIOS data area, ROM stubs and the video state. */
  initMachine(): void {
    this.mem.clear();
    this.state = { lineInput: null, flushed: false };
    this.pending = null;
    const stub = (offset: number, vector: number) => {
      this.mem.load(ROM_BASE + offset, [0xff, 0xff, 0xcd, vector, 0xcf]);
    };
    stub(DEFAULT_HANDLER, DEFAULT_VECTOR_ID);
    for (const [v, off] of Object.entries(HANDLER_OFFSETS)) stub(off, Number(v));
    for (let v = 0; v < 256; v++) {
      const off = HANDLER_OFFSETS[v] ?? DEFAULT_HANDLER;
      this.mem.load(v * 4, [off & 0xff, off >> 8, ROM_SEGMENT & 0xff, ROM_SEGMENT >> 8]);
    }
    // INT 19h: reboot vector FFFF:0000 (as in EMU8086), with its own trap.
    this.mem.load(0x19 * 4, [0x00, 0x00, 0xff, 0xff]);
    this.mem.load(0xffff0, [0xff, 0xff, 0xcd, 0x19, 0xcf]);

    // BIOS data area
    const w16 = (a: number, v: number) => this.mem.load(a, [v & 0xff, v >> 8]);
    w16(BDA + 0x10, 0x0021); // equipment: 80x25 colour, 1 floppy
    w16(BDA + 0x13, 0x0280); // 640 KB conventional memory
    w16(KB_HEAD, KB_START);
    w16(KB_TAIL, KB_START);
    this.mem.journal = null;
    this.screen.setMode(3);
  }

  /** Builds the PSP and stack for a .COM image and sets the CPU registers. */
  loadCom(image: Uint8Array, entry = 0x100): void {
    const seg = COM_LOAD_SEGMENT;
    const base = seg << 4;
    const psp = new Uint8Array(0x100);
    psp[0] = 0xcd; psp[1] = 0x20; // INT 20h: a final RET lands here
    psp[2] = 0x00; psp[3] = 0xa0; // first segment beyond the program (A000h)
    psp[0x50] = 0xcd; psp[0x51] = 0x21; psp[0x52] = 0xcb; // INT 21h / RETF (DOS dispatcher)
    psp[0x80] = 0; psp[0x81] = 0x0d; // empty command tail
    this.mem.load(base, psp);
    this.mem.load(base + 0x100, image);
    this.mem.load(base + 0xfffe, [0, 0]); // return offset 0000 → PSP INT 20h
    const c = this.cpu;
    c.reset();
    c.sregs[CS] = c.sregs[DS] = c.sregs[ES] = c.sregs[SS] = seg;
    c.ip = entry;
    c.regs[SP] = 0xfffe;
    c.regs[CX] = image.length & 0xffff; // EMU8086 4.08 passes the program size in CX
    c.setFlagsWord(IF);
  }

  /** Loads a .BIN image using EMU8086's default.binf conventions, overridable via #LOAD_SEGMENT=…# etc. */
  loadBin(image: Uint8Array, origin: number, binf: Record<string, number>, entry = origin): void {
    const loadSeg = binf.LOAD_SEGMENT ?? binf.CS ?? BIN_LOAD_SEGMENT;
    const loadOff = binf.LOAD_OFFSET ?? origin;
    this.mem.load(physical(loadSeg, loadOff), image);
    const c = this.cpu;
    c.reset();
    const cs = binf.CS ?? loadSeg;
    c.sregs[CS] = cs;
    c.sregs[DS] = binf.DS ?? cs;
    c.sregs[ES] = binf.ES ?? cs;
    c.sregs[SS] = binf.SS ?? cs;
    c.ip = binf.IP ?? (loadOff + entry - origin) & 0xffff; // END label selects the entry point
    c.regs[SP] = binf.SP ?? 0xfffe;
    for (const [name, idx] of [['AX', AX], ['BX', BX], ['CX', CX], ['DX', DX], ['SI', SI], ['DI', DI], ['BP', BP]] as const) {
      if (binf[name] !== undefined) c.regs[idx] = binf[name];
    }
    for (const [name, idx] of [['AL', 0], ['CL', 1], ['DL', 2], ['BL', 3], ['AH', 4], ['CH', 5], ['DH', 6], ['BH', 7]] as const) {
      if (binf[name] !== undefined) c.set8(idx, binf[name]);
    }
    if (binf.SS === undefined && binf.SP === undefined && binf.LOAD_SEGMENT === undefined) {
      // default.binf: MEM=0100:FFFE,00FF-0100:FF00,F4 — a final RET reaches HLT.
      this.mem.load(physical(c.sregs[SS], 0xfffe), [0x00, 0xff]);
      this.mem.load(physical(c.sregs[SS], 0xff00), [0xf4]);
    }
    c.setFlagsWord(IF);
  }

  // ---------------------------------------------------------- keyboard
  keyboardCount(): number {
    const head = this.mem.read16(0x40, 0x1a);
    const tail = this.mem.read16(0x40, 0x1c);
    const n = (tail - head) / 2;
    return n < 0 ? n + (KB_END - KB_START) / 2 : n;
  }

  keyboardContents(): number[] {
    const out: number[] = [];
    let head = this.mem.read16(0x40, 0x1a);
    const tail = this.mem.read16(0x40, 0x1c);
    while (head !== tail) {
      out.push(this.mem.read16(0x40, head));
      head += 2;
      if (head >= KB_END) head = KB_START;
    }
    return out;
  }

  /** Inserts a key (ASCII + scan code) into the BIOS keyboard buffer. Returns false if full. */
  pushKey(ascii: number, scan: number): boolean {
    const head = this.mem.read16(0x40, 0x1a);
    const tail = this.mem.read16(0x40, 0x1c);
    let next = tail + 2;
    if (next >= KB_END) next = KB_START;
    if (next === head) return false;
    const saved = this.mem.journal;
    this.mem.journal = null; // external event: not part of the instruction being undone
    this.mem.write16(0x40, tail, (scan << 8) | (ascii & 0xff));
    this.mem.write16(0x40, 0x1c, next);
    this.mem.journal = saved;
    return true;
  }

  /**
   * Empties the BIOS keyboard buffer. A user action (flush button) is an
   * external event and is not journaled; a flush performed by a DOS service
   * (INT 21h/0Ch) is part of the instruction and is undone by Step Back.
   */
  flushKeyboard(external = true): void {
    const saved = this.mem.journal;
    if (external) this.mem.journal = null;
    this.mem.write16(0x40, 0x1c, this.mem.read16(0x40, 0x1a));
    this.mem.journal = saved;
  }

  private peekKey(): number | null {
    const head = this.mem.read16(0x40, 0x1a);
    const tail = this.mem.read16(0x40, 0x1c);
    return head === tail ? null : this.mem.read16(0x40, head);
  }

  private popKey(): number | null {
    const head = this.mem.read16(0x40, 0x1a);
    const tail = this.mem.read16(0x40, 0x1c);
    if (head === tail) return null;
    const key = this.mem.read16(0x40, head);
    let next = head + 2;
    if (next >= KB_END) next = KB_START;
    this.mem.write16(0x40, 0x1a, next);
    return key;
  }

  // ---------------------------------------------------------- services
  private setReturnFlag(mask: number, on: boolean): void {
    // FLAGS pushed by INT sit at SS:SP+4; IRET will restore them.
    const c = this.cpu;
    const off = (c.regs[SP] + 4) & 0xffff;
    const f = this.mem.read16(c.ss, off);
    this.mem.write16(c.ss, off, on ? f | mask : f & ~mask);
  }

  private wait(c: CPU, stubIp: number): void {
    c.ip = stubIp; // re-execute the trap once a key arrives
    this.pending = { waiting: true };
  }

  private stop(reason: StopReason, message: string, exitCode?: number): void {
    this.pending = { stop: { reason, message, exitCode } };
  }

  private unsupported(what: string): void {
    this.stop('unsupported', `${what} is not supported by 8086 Studio. Execution stopped (no fake result was produced).`);
  }

  private service(c: CPU, vector: number, stubIp: number): void {
    this.pending = null;
    const ah = c.regs[AX] >> 8;
    switch (vector) {
      case 0x20: this.stop('exit', 'PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM', 0); return;
      case 0x21: this.int21(c, ah, stubIp); return;
      case 0x10: this.int10(c, ah); return;
      case 0x16: this.int16(c, ah, stubIp); return;
      case 0x19: this.stop('reboot', 'program requested reboot. the emulator halted.'); return;
      case 0x11: c.regs[AX] = this.mem.read16(0x40, 0x10); return;
      case 0x12: c.regs[AX] = this.mem.read16(0x40, 0x13); return;
      case 0x1a: {
        if (ah !== 0) { this.unsupported(`INT 1Ah function ${hex2(ah)}h`); return; }
        const d = this.clock.now();
        const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
        const ticks = Math.floor(secs * 18.2065) >>> 0;
        c.regs[CX] = (ticks >>> 16) & 0xffff;
        c.regs[DX] = ticks & 0xffff;
        c.set8(0, 0);
        return;
      }
      case 0x15: {
        if (ah === 0x86) {
          const us = c.regs[CX] * 0x10000 + c.regs[DX];
          this.pending = { sleepMs: us / 1000 };
          this.setReturnFlag(CF, false);
          return;
        }
        this.unsupported(`INT 15h function ${hex2(ah)}h`);
        return;
      }
      case 0x00: this.stop('interrupt-error', 'divide error (INT 0): division by zero or the quotient is too large for the destination register'); return;
      case 0x04: this.stop('interrupt-error', 'overflow (INT 4 raised by INTO)'); return;
      case 0x03: this.stop('interrupt-error', 'breakpoint interrupt (INT 3) with no handler installed'); return;
      case 0x01: this.stop('interrupt-error', 'single-step trap (INT 1, TF=1) with no handler installed'); return;
      case DEFAULT_VECTOR_ID: {
        // Identify the original INT nn from the return address on the stack.
        const retIp = this.mem.read16(c.ss, c.regs[SP]);
        const retCs = this.mem.read16(c.ss, (c.regs[SP] + 2) & 0xffff);
        const opc = this.mem.read8(physical(retCs, retIp - 2));
        const n = opc === 0xcd ? this.mem.read8(physical(retCs, retIp - 1)) : -1;
        this.unsupported(n >= 0 ? `INT ${hex2(n)}h` : 'this interrupt');
        return;
      }
      default:
        this.unsupported(`INT ${hex2(vector)}h function ${hex2(ah)}h`);
    }
  }

  private int16(c: CPU, ah: number, stubIp: number): void {
    switch (ah) {
      case 0x00:
      case 0x10: {
        const key = this.popKey();
        if (key === null) { this.wait(c, stubIp); return; }
        c.regs[AX] = key;
        return;
      }
      case 0x01:
      case 0x11: {
        const key = this.peekKey();
        if (key === null) this.setReturnFlag(ZF, true);
        else {
          c.regs[AX] = key;
          this.setReturnFlag(ZF, false);
        }
        return;
      }
      case 0x02: c.set8(0, 0); return;
      default: this.unsupported(`INT 16h function ${hex2(ah)}h`);
    }
  }

  private int10(c: CPU, ah: number): void {
    const s = this.screen;
    const r = c.regs;
    const al = r[AX] & 0xff;
    const bh = r[BX] >> 8;
    const bl = r[BX] & 0xff;
    const dh = r[DX] >> 8;
    const dl = r[DX] & 0xff;
    switch (ah) {
      case 0x00:
        if ((al & 0x7f) > 3 && (al & 0x7f) !== 7) {
          this.unsupported(`video mode ${hex2(al)}h (graphics modes)`);
          return;
        }
        s.setMode((al & 0x7f) === 7 ? 3 : al & 0x7f);
        return;
      case 0x01:
        this.mem.write8(BDA + 0x60, r[CX] & 0xff);
        this.mem.write8(BDA + 0x61, r[CX] >> 8);
        return;
      case 0x02: s.setCursor(dh, dl, bh & 7); return;
      case 0x03: {
        const cur = s.getCursor(bh & 7);
        r[DX] = (cur.row << 8) | cur.col;
        r[CX] = (this.mem.read8(BDA + 0x61) << 8) | this.mem.read8(BDA + 0x60);
        return;
      }
      case 0x05: this.mem.write8(BDA + 0x62, al & 7); return;
      case 0x06:
      case 0x07:
        s.scroll(ah === 0x06, al, bh, r[CX] >> 8, r[CX] & 0xff, dh, dl);
        return;
      case 0x08: {
        const cur = s.getCursor(bh & 7);
        const cell = s.getCell(cur.row, cur.col, bh & 7);
        r[AX] = (cell.attr << 8) | cell.char;
        return;
      }
      case 0x09:
      case 0x0a: {
        const cur = s.getCursor(bh & 7);
        let row = cur.row;
        let col = cur.col;
        for (let i = 0; i < r[CX]; i++) {
          if (row >= s.rows) break;
          s.putChar(row, col, al, bh & 7, ah === 0x09 ? bl : undefined);
          if (++col >= s.columns) { col = 0; row++; }
        }
        return;
      }
      case 0x0e: s.teletype(al); return;
      case 0x0f:
        r[AX] = (s.columns << 8) | this.mem.read8(BDA + 0x49);
        c.set8(7, s.activePage);
        return;
      case 0x10:
        if (al === 0x03) return; // blink/intensity toggle: blinking is not emulated (as in EMU8086)
        this.unsupported(`INT 10h function 10h/${hex2(al)}h`);
        return;
      case 0x13: {
        const updateCursor = (al & 1) !== 0;
        const withAttr = (al & 2) !== 0;
        const page = bh & 7;
        const saved = s.getCursor(page);
        s.setCursor(dh, dl, page);
        let off = r[BP];
        for (let i = 0; i < r[CX]; i++) {
          const ch = this.mem.read8(physical(c.es, off++));
          let attr = bl;
          if (withAttr) attr = this.mem.read8(physical(c.es, off++));
          if (ch === 7 || ch === 8 || ch === 10 || ch === 13) s.teletype(ch, page);
          else s.teletype(ch, page, attr);
        }
        if (!updateCursor) s.setCursor(saved.row, saved.col, page);
        return;
      }
      default:
        this.unsupported(`INT 10h function ${hex2(ah)}h`);
    }
  }

  private int21(c: CPU, ah: number, stubIp: number): void {
    const r = c.regs;
    const s = this.screen;
    switch (ah) {
      case 0x00: this.stop('exit', 'PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM', 0); return;
      case 0x4c: {
        const code = r[AX] & 0xff;
        this.stop('exit', 'PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM', code);
        return;
      }
      case 0x01:
      case 0x07:
      case 0x08: {
        const key = this.popKey();
        if (key === null) { this.wait(c, stubIp); return; }
        const ch = key & 0xff;
        if (ah === 0x01) this.echo(ch);
        c.set8(0, ch);
        return;
      }
      case 0x02: {
        const ch = r[DX] & 0xff;
        s.teletype(ch);
        c.set8(0, ch);
        return;
      }
      case 0x06: {
        const dl = r[DX] & 0xff;
        if (dl === 0xff) {
          const key = this.popKey();
          if (key === null) {
            c.set8(0, 0);
            this.setReturnFlag(ZF, true);
          } else {
            c.set8(0, key & 0xff);
            this.setReturnFlag(ZF, false);
          }
        } else {
          s.teletype(dl);
          c.set8(0, dl);
        }
        return;
      }
      case 0x09: {
        let off = r[DX];
        for (let n = 0; ; n++) {
          if (n > 2000) {
            this.stop('unsupported', "INT 21h/09h: byte 24h ('$') not found after 2000 bytes; the string must end with '$'");
            return;
          }
          const ch = this.mem.read8(physical(c.ds, off));
          if (ch === 0x24) break;
          s.teletype(ch);
          off = (off + 1) & 0xffff;
        }
        c.set8(0, 0x24);
        return;
      }
      case 0x0a: this.bufferedInput(c, stubIp); return;
      case 0x0b: c.set8(0, this.peekKey() === null ? 0x00 : 0xff); return;
      case 0x0c: {
        // Flush once on entry; when re-executed after waiting for a key, keep the buffer.
        const fn = r[AX] & 0xff;
        if (!this.state.flushed) this.flushKeyboard(false);
        if ([0x01, 0x06, 0x07, 0x08, 0x0a].includes(fn)) {
          if (!this.state.flushed) this.state = { ...this.state, flushed: true };
          this.int21(c, fn, stubIp);
          if (!this.pending?.waiting) this.state = { ...this.state, flushed: false };
        } else c.set8(0, 0);
        return;
      }
      case 0x25: {
        const v = r[AX] & 0xff;
        this.mem.write16(0, v * 4, r[DX]);
        this.mem.write16(0, v * 4 + 2, c.ds);
        return;
      }
      case 0x35: {
        const v = r[AX] & 0xff;
        r[BX] = this.mem.read16(0, v * 4);
        c.sregs[ES] = this.mem.read16(0, v * 4 + 2);
        return;
      }
      case 0x2a: {
        const d = this.clock.now();
        r[CX] = d.getFullYear();
        r[DX] = ((d.getMonth() + 1) << 8) | d.getDate();
        c.set8(0, d.getDay());
        return;
      }
      case 0x2c: {
        const d = this.clock.now();
        r[CX] = (d.getHours() << 8) | d.getMinutes();
        r[DX] = (d.getSeconds() << 8) | Math.floor(d.getMilliseconds() / 10);
        return;
      }
      default:
        this.unsupported(`INT 21h function ${hex2(ah)}h`);
    }
  }

  private echo(ch: number): void {
    if (ch === 13) {
      this.screen.teletype(13);
      return;
    }
    this.screen.teletype(ch);
  }

  /** INT 21h/0Ah. Characters are stored as typed; byte 1 tracks the count until Enter. */
  private bufferedInput(c: CPU, stubIp: number): void {
    const ds = c.ds;
    const base = c.regs[DX];
    const max = this.mem.read8(physical(ds, base));
    if (!this.state.lineInput) this.state = { ...this.state, lineInput: { count: 0 } };
    let count = this.state.lineInput!.count;
    for (;;) {
      const key = this.popKey();
      if (key === null) {
        // only a real change creates a new state object (an unchanged retry is not a step)
        if (this.state.lineInput?.count !== count) this.state = { ...this.state, lineInput: { count } };
        this.wait(c, stubIp);
        return;
      }
      const ch = key & 0xff;
      if (ch === 13) {
        this.mem.write8(physical(ds, base + 2 + count), 13);
        this.mem.write8(physical(ds, base + 1), count);
        this.screen.teletype(13);
        this.state = { ...this.state, lineInput: null };
        return;
      }
      if (ch === 8) {
        if (count > 0) {
          count--;
          this.screen.teletype(8);
          this.screen.teletype(0x20);
          this.screen.teletype(8);
        }
        continue;
      }
      if (ch === 0 || max === 0) continue;
      if (count >= max - 1) continue; // buffer full: only Enter is accepted
      this.mem.write8(physical(ds, base + 2 + count), ch);
      count++;
      this.screen.teletype(ch);
    }
  }
}

export function hex2(v: number): string {
  return (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export { ROM_BASE };
