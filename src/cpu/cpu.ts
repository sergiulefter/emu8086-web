/**
 * Intel 8086 interpreter.
 *
 * One call to `step()` executes exactly one architectural instruction
 * (including its prefixes, and every iteration of a REP-prefixed string
 * instruction). Semantics follow the Intel 8086 Family User's Manual and are
 * validated against the SingleStepTests/8088 hardware-captured suite
 * (see tests/conformance and docs/ADR-001-cpu-engine.md).
 */
import { Memory, physical } from './memory';

export const CF = 0x0001;
export const PF = 0x0004;
export const AF = 0x0010;
export const ZF = 0x0040;
export const SF = 0x0080;
export const TF = 0x0100;
export const IF = 0x0200;
export const DF = 0x0400;
export const OF = 0x0800;

/** Bits that are hard-wired on the 8086: 12-15 and bit 1 read as 1, bits 3/5 as 0. */
const FLAGS_FIXED_ONES = 0xf002;
const FLAGS_WRITABLE = 0x0fd5;

export const AX = 0, CX = 1, DX = 2, BX = 3, SP = 4, BP = 5, SI = 6, DI = 7;
export const ES = 0, CS = 1, SS = 2, DS = 3;

export const REG16_NAMES = ['AX', 'CX', 'DX', 'BX', 'SP', 'BP', 'SI', 'DI'];
export const REG8_NAMES = ['AL', 'CL', 'DL', 'BL', 'AH', 'CH', 'DH', 'BH'];
export const SREG_NAMES = ['ES', 'CS', 'SS', 'DS'];

/** ROM segment holding the emulator's BIOS/DOS service stubs. */
export const ROM_SEGMENT = 0xf400;
const ROM_BASE = ROM_SEGMENT << 4;
const ROM_END = ROM_BASE + 0xffff;

const PARITY = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let bits = 0;
  for (let b = i; b; b >>= 1) bits += b & 1;
  PARITY[i] = bits & 1 ? 0 : PF;
}

export class CpuFault extends Error {
  constructor(message: string, readonly cs: number, readonly ip: number) {
    super(message);
  }
}

export interface PortBus {
  input(port: number, word: boolean): number;
  output(port: number, value: number, word: boolean): void;
}

/**
 * Service hook: invoked when the CPU executes the 4-byte trap `FF FF CD nn`
 * located inside the ROM segment. The interrupt vectors of the emulated
 * machine point at such stubs, so `INT 21h` really pushes FLAGS/CS/IP and
 * jumps through the IVT before the service runs (like EMU8086, whose handlers
 * live at F400:xxxx).
 */
export type ServiceHook = (cpu: CPU, vector: number, stubIp: number) => void;

interface ModRM {
  mod: number;
  reg: number;
  rm: number;
  /** Effective segment (index into sregs, after overrides). */
  seg: number;
  /** Effective offset (memory operands only). */
  ea: number;
}

export class CPU {
  readonly regs = new Uint16Array(8);
  readonly sregs = new Uint16Array(4);
  ip = 0;
  flags = FLAGS_FIXED_ONES;
  halted = false;
  /** Number of instructions completed since reset. */
  instructionCount = 0;

  hook: ServiceHook | null = null;
  ports: PortBus | null = null;

  /** CS:IP of the instruction currently executing (first prefix byte). */
  startCs = 0;
  startIp = 0;

  // Per-instruction decoder state.
  private segOverride = -1;
  private repPrefix = 0;

  constructor(readonly mem: Memory) {}

  reset(): void {
    this.regs.fill(0);
    this.sregs.fill(0);
    this.ip = 0;
    this.flags = FLAGS_FIXED_ONES;
    this.halted = false;
    this.instructionCount = 0;
  }

  // ---------------------------------------------------------------- registers
  get8(r: number): number {
    return r < 4 ? this.regs[r] & 0xff : this.regs[r - 4] >> 8;
  }

  set8(r: number, v: number): void {
    if (r < 4) this.regs[r] = (this.regs[r] & 0xff00) | (v & 0xff);
    else this.regs[r - 4] = (this.regs[r - 4] & 0x00ff) | ((v & 0xff) << 8);
  }

  get cs(): number { return this.sregs[CS]; }
  get ds(): number { return this.sregs[DS]; }
  get ss(): number { return this.sregs[SS]; }
  get es(): number { return this.sregs[ES]; }

  getFlag(mask: number): boolean {
    return (this.flags & mask) !== 0;
  }

  setFlag(mask: number, on: boolean): void {
    if (on) this.flags |= mask;
    else this.flags &= ~mask;
  }

  setFlagsWord(value: number): void {
    this.flags = (value & FLAGS_WRITABLE) | FLAGS_FIXED_ONES;
  }

  // ------------------------------------------------------------------ memory
  private fetch8(): number {
    const v = this.mem.read8(physical(this.sregs[CS], this.ip));
    this.ip = (this.ip + 1) & 0xffff;
    return v;
  }

  private fetch16(): number {
    const lo = this.fetch8();
    return lo | (this.fetch8() << 8);
  }

  private read8(seg: number, off: number): number {
    return this.mem.read8(physical(this.sregs[seg], off));
  }

  private write8(seg: number, off: number, v: number): void {
    this.mem.write8(physical(this.sregs[seg], off), v);
  }

  private read16(seg: number, off: number): number {
    return this.mem.read16(this.sregs[seg], off);
  }

  private write16(seg: number, off: number, v: number): void {
    this.mem.write16(this.sregs[seg], off, v);
  }

  push(v: number): void {
    this.regs[SP] = (this.regs[SP] - 2) & 0xffff;
    this.mem.write16(this.sregs[SS], this.regs[SP], v);
  }

  pop(): number {
    const v = this.mem.read16(this.sregs[SS], this.regs[SP]);
    this.regs[SP] = (this.regs[SP] + 2) & 0xffff;
    return v;
  }

  // ------------------------------------------------------------------ ModR/M
  private decodeModRM(): ModRM {
    const b = this.fetch8();
    const mod = b >> 6;
    const reg = (b >> 3) & 7;
    const rm = b & 7;
    if (mod === 3) return { mod, reg, rm, seg: DS, ea: 0 };
    let ea = 0;
    let seg = DS;
    const r = this.regs;
    switch (rm) {
      case 0: ea = r[BX] + r[SI]; break;
      case 1: ea = r[BX] + r[DI]; break;
      case 2: ea = r[BP] + r[SI]; seg = SS; break;
      case 3: ea = r[BP] + r[DI]; seg = SS; break;
      case 4: ea = r[SI]; break;
      case 5: ea = r[DI]; break;
      case 6:
        if (mod === 0) ea = this.fetch16();
        else { ea = r[BP]; seg = SS; }
        break;
      case 7: ea = r[BX]; break;
    }
    if (mod === 1) {
      const d = this.fetch8();
      ea += d & 0x80 ? d - 0x100 : d;
    } else if (mod === 2) {
      ea += this.fetch16();
    }
    if (this.segOverride >= 0) seg = this.segOverride;
    return { mod, reg, rm, seg, ea: ea & 0xffff };
  }

  private readRM8(m: ModRM): number {
    return m.mod === 3 ? this.get8(m.rm) : this.read8(m.seg, m.ea);
  }

  private writeRM8(m: ModRM, v: number): void {
    if (m.mod === 3) this.set8(m.rm, v);
    else this.write8(m.seg, m.ea, v);
  }

  private readRM16(m: ModRM): number {
    return m.mod === 3 ? this.regs[m.rm] : this.read16(m.seg, m.ea);
  }

  private writeRM16(m: ModRM, v: number): void {
    if (m.mod === 3) this.regs[m.rm] = v;
    else this.write16(m.seg, m.ea, v);
  }

  // ------------------------------------------------------------------- flags
  private szp(v: number, word: boolean): void {
    let f = this.flags & ~(SF | ZF | PF);
    if (word) {
      v &= 0xffff;
      if (v & 0x8000) f |= SF;
    } else {
      v &= 0xff;
      if (v & 0x80) f |= SF;
    }
    if (v === 0) f |= ZF;
    f |= PARITY[v & 0xff];
    this.flags = f;
  }

  private alu(op: number, a: number, b: number, word: boolean): number {
    const mask = word ? 0xffff : 0xff;
    const sign = word ? 0x8000 : 0x80;
    let res: number;
    let f = this.flags & ~(CF | PF | AF | ZF | SF | OF);
    switch (op) {
      case 0: // ADD
      case 2: { // ADC
        const c = op === 2 && this.flags & CF ? 1 : 0;
        res = a + b + c;
        if (res > mask) f |= CF;
        if ((a ^ res) & (b ^ res) & sign) f |= OF;
        if ((a ^ b ^ res) & 0x10) f |= AF;
        break;
      }
      case 3: // SBB
      case 5: // SUB
      case 7: { // CMP
        const c = op === 3 && this.flags & CF ? 1 : 0;
        res = a - b - c;
        if (res < 0) f |= CF;
        if ((a ^ b) & (a ^ res) & sign) f |= OF;
        if ((a ^ b ^ res) & 0x10) f |= AF;
        break;
      }
      case 1: res = a | b; break; // OR
      case 4: res = a & b; break; // AND
      default: res = a ^ b; break; // XOR (6)
    }
    res &= mask;
    if (res & sign) f |= SF;
    if (res === 0) f |= ZF;
    f |= PARITY[res & 0xff];
    this.flags = f;
    return res;
  }

  private inc(v: number, word: boolean): number {
    const cf = this.flags & CF;
    const r = this.alu(0, v, 1, word);
    this.flags = (this.flags & ~CF) | cf;
    return r;
  }

  private dec(v: number, word: boolean): number {
    const cf = this.flags & CF;
    const r = this.alu(5, v, 1, word);
    this.flags = (this.flags & ~CF) | cf;
    return r;
  }

  /** Rotate/shift group (D0-D3). Executes `count` single-bit steps like the 8086 microcode. */
  private shift(op: number, v: number, count: number, word: boolean): number {
    if (count === 0) return v;
    const bits = word ? 16 : 8;
    const mask = word ? 0xffff : 0xff;
    const msb = word ? 0x8000 : 0x80;
    let cf = (this.flags & CF) !== 0;
    let of = (this.flags & OF) !== 0;
    let af = (this.flags & AF) !== 0;
    for (let i = 0; i < count; i++) {
      switch (op) {
        case 0: { // ROL
          cf = (v & msb) !== 0;
          v = ((v << 1) | (cf ? 1 : 0)) & mask;
          of = ((v & msb) !== 0) !== cf;
          break;
        }
        case 1: { // ROR
          cf = (v & 1) !== 0;
          v = (v >> 1) | (cf ? msb : 0);
          of = ((v & msb) !== 0) !== ((v & (msb >> 1)) !== 0);
          break;
        }
        case 2: { // RCL
          const out = (v & msb) !== 0;
          v = ((v << 1) | (cf ? 1 : 0)) & mask;
          cf = out;
          of = ((v & msb) !== 0) !== cf;
          break;
        }
        case 3: { // RCR
          const out = (v & 1) !== 0;
          v = (v >> 1) | (cf ? msb : 0);
          cf = out;
          of = ((v & msb) !== 0) !== ((v & (msb >> 1)) !== 0);
          break;
        }
        case 4: // SHL / SAL
        case 6: { // SETMO on the 8086 is undocumented; SAL alias here is overridden below
          cf = (v & msb) !== 0;
          v = (v << 1) & mask;
          of = ((v & msb) !== 0) !== cf;
          af = (v & 0x10) !== 0;
          break;
        }
        case 5: { // SHR
          of = (v & msb) !== 0;
          cf = (v & 1) !== 0;
          v >>= 1;
          af = false;
          break;
        }
        case 7: { // SAR
          cf = (v & 1) !== 0;
          v = (v >> 1) | (v & msb);
          of = false;
          af = false;
          break;
        }
      }
    }
    if (op === 6) {
      // Undocumented SETMO: operand becomes all ones.
      v = mask;
      cf = false;
      of = false;
      af = false;
    }
    void bits;
    this.setFlag(CF, cf);
    this.setFlag(OF, of);
    if (op >= 4) {
      this.setFlag(AF, af);
      this.szp(v, word);
    }
    return v;
  }

  // ------------------------------------------------------------- interrupts
  interrupt(vector: number): void {
    this.push(this.flags);
    this.flags &= ~(IF | TF);
    this.push(this.sregs[CS]);
    this.push(this.ip);
    this.ip = this.mem.read16(0, vector * 4);
    this.sregs[CS] = this.mem.read16(0, vector * 4 + 2);
  }

  private condition(cc: number): boolean {
    const f = this.flags;
    let r: boolean;
    switch (cc >> 1) {
      case 0: r = (f & OF) !== 0; break; // O
      case 1: r = (f & CF) !== 0; break; // B
      case 2: r = (f & ZF) !== 0; break; // E
      case 3: r = (f & (CF | ZF)) !== 0; break; // BE
      case 4: r = (f & SF) !== 0; break; // S
      case 5: r = (f & PF) !== 0; break; // P
      case 6: r = ((f & SF) !== 0) !== ((f & OF) !== 0); break; // L
      default: r = (f & ZF) !== 0 || ((f & SF) !== 0) !== ((f & OF) !== 0); break; // LE
    }
    return cc & 1 ? !r : r;
  }

  private jumpRel8(take: boolean): void {
    const d = this.fetch8();
    if (take) this.ip = (this.ip + (d & 0x80 ? d - 0x100 : d)) & 0xffff;
  }

  private fault(message: string): never {
    // Roll IP back so the faulting instruction stays current in the debugger.
    this.ip = this.startIp;
    this.sregs[CS] = this.startCs;
    throw new CpuFault(message, this.startCs, this.startIp);
  }

  // ------------------------------------------------------------ string ops
  private stringOp(op: number): void {
    const word = (op & 1) === 1;
    const delta = (this.flags & DF ? -1 : 1) * (word ? 2 : 1);
    const srcSeg = this.segOverride >= 0 ? this.segOverride : DS;
    const r = this.regs;
    const rep = this.repPrefix;
    const isCompare = op === 0xa6 || op === 0xa7 || op === 0xae || op === 0xaf;
    for (;;) {
      if (rep && r[CX] === 0) break;
      switch (op & 0xfe) {
        case 0xa4: // MOVS
          if (word) this.write16(ES, r[DI], this.read16(srcSeg, r[SI]));
          else this.write8(ES, r[DI], this.read8(srcSeg, r[SI]));
          r[SI] += delta;
          r[DI] += delta;
          break;
        case 0xa6: { // CMPS
          const a = word ? this.read16(srcSeg, r[SI]) : this.read8(srcSeg, r[SI]);
          const b = word ? this.read16(ES, r[DI]) : this.read8(ES, r[DI]);
          this.alu(7, a, b, word);
          r[SI] += delta;
          r[DI] += delta;
          break;
        }
        case 0xaa: // STOS
          if (word) this.write16(ES, r[DI], r[AX]);
          else this.write8(ES, r[DI], r[AX] & 0xff);
          r[DI] += delta;
          break;
        case 0xac: // LODS
          if (word) r[AX] = this.read16(srcSeg, r[SI]);
          else this.set8(0, this.read8(srcSeg, r[SI]));
          r[SI] += delta;
          break;
        case 0xae: { // SCAS
          const b = word ? this.read16(ES, r[DI]) : this.read8(ES, r[DI]);
          this.alu(7, word ? r[AX] : r[AX] & 0xff, b, word);
          r[DI] += delta;
          break;
        }
      }
      if (!rep) break;
      r[CX]--;
      if (isCompare) {
        const zf = (this.flags & ZF) !== 0;
        if (rep === 0xf3 && !zf) break;
        if (rep === 0xf2 && zf) break;
      }
    }
  }

  // ------------------------------------------------------------- step
  step(): void {
    if (this.halted) return;
    this.startCs = this.sregs[CS];
    this.startIp = this.ip;
    this.segOverride = -1;
    this.repPrefix = 0;
    const trapBefore = (this.flags & TF) !== 0;
    let op: number;
    let inhibitTrap = false;
    // Prefixes
    for (;;) {
      op = this.fetch8();
      if (op === 0x26 || op === 0x2e || op === 0x36 || op === 0x3e) this.segOverride = (op >> 3) & 3;
      else if (op === 0xf2 || op === 0xf3) this.repPrefix = op;
      else if (op === 0xf0 || op === 0xf1) { /* LOCK: no effect on a single CPU */ }
      else break;
    }
    const r = this.regs;
    const s = this.sregs;

    if (op < 0x40 && (op & 7) < 6) {
      // ALU group: ADD OR ADC SBB AND SUB XOR CMP
      const aluOp = op >> 3;
      const form = op & 7;
      const store = aluOp !== 7;
      switch (form) {
        case 0: {
          const m = this.decodeModRM();
          const v = this.alu(aluOp, this.readRM8(m), this.get8(m.reg), false);
          if (store) this.writeRM8(m, v);
          break;
        }
        case 1: {
          const m = this.decodeModRM();
          const v = this.alu(aluOp, this.readRM16(m), r[m.reg], true);
          if (store) this.writeRM16(m, v);
          break;
        }
        case 2: {
          const m = this.decodeModRM();
          const v = this.alu(aluOp, this.get8(m.reg), this.readRM8(m), false);
          if (store) this.set8(m.reg, v);
          break;
        }
        case 3: {
          const m = this.decodeModRM();
          const v = this.alu(aluOp, r[m.reg], this.readRM16(m), true);
          if (store) r[m.reg] = v;
          break;
        }
        case 4: {
          const v = this.alu(aluOp, r[AX] & 0xff, this.fetch8(), false);
          if (store) this.set8(0, v);
          break;
        }
        case 5: {
          const v = this.alu(aluOp, r[AX], this.fetch16(), true);
          if (store) r[AX] = v;
          break;
        }
      }
    } else {
      switch (op) {
        case 0x06: case 0x0e: case 0x16: case 0x1e:
          this.push(s[(op >> 3) & 3]);
          break;
        case 0x07: case 0x0f: case 0x17: case 0x1f:
          s[(op >> 3) & 3] = this.pop();
          inhibitTrap = true;
          break;
        case 0x27: case 0x2f: { // DAA / DAS
          const al = r[AX] & 0xff;
          const oldCf = (this.flags & CF) !== 0;
          const oldAf = (this.flags & AF) !== 0;
          const sub = op === 0x2f;
          let v = al;
          let af = false;
          let cf = false;
          if ((al & 0x0f) > 9 || oldAf) {
            v = sub ? v - 6 : v + 6;
            af = true;
          }
          if (al > (oldAf ? 0x9f : 0x99) || oldCf) {
            v = sub ? v - 0x60 : v + 0x60;
            cf = true;
          }
          v &= 0xff;
          this.set8(0, v);
          this.setFlag(AF, af);
          this.setFlag(CF, cf);
          this.szp(v, false);
          break;
        }
        case 0x37: case 0x3f: { // AAA / AAS
          const al = r[AX] & 0xff;
          if ((al & 0x0f) > 9 || this.flags & AF) {
            if (op === 0x37) {
              this.set8(0, al + 6);
              this.set8(4, (r[AX] >> 8) + 1);
            } else {
              this.set8(0, al - 6);
              this.set8(4, (r[AX] >> 8) - 1);
            }
            this.flags |= AF | CF;
          } else {
            this.flags &= ~(AF | CF);
          }
          this.set8(0, r[AX] & 0x0f);
          break;
        }
        default:
          if (op >= 0x40 && op <= 0x47) r[op & 7] = this.inc(r[op & 7], true);
          else if (op >= 0x48 && op <= 0x4f) r[op & 7] = this.dec(r[op & 7], true);
          else if (op >= 0x50 && op <= 0x57) {
            if ((op & 7) === SP) { r[SP] = (r[SP] - 2) & 0xffff; this.write16(SS, r[SP], r[SP]); }
            else this.push(r[op & 7]);
          } else if (op >= 0x58 && op <= 0x5f) r[op & 7] = this.pop();
          else if (op >= 0x60 && op <= 0x7f) this.jumpRel8(this.condition(op & 0x0f));
          else if (op >= 0x91 && op <= 0x97) { const t = r[AX]; r[AX] = r[op & 7]; r[op & 7] = t; }
          else if (op >= 0xb0 && op <= 0xb7) this.set8(op & 7, this.fetch8());
          else if (op >= 0xb8 && op <= 0xbf) r[op & 7] = this.fetch16();
          else if (op >= 0xd8 && op <= 0xdf) {
            // ESC (coprocessor escape): no 8087 present; operand is decoded and read only.
            const m = this.decodeModRM();
            if (m.mod !== 3) this.read8(m.seg, m.ea);
          } else this.executeRest(op);
      }
    }

    this.instructionCount++;
    if (trapBefore && !inhibitTrap && !this.halted) this.interrupt(1);
  }

  private executeRest(op: number): void {
    const r = this.regs;
    const s = this.sregs;
    switch (op) {
      case 0x80: case 0x81: case 0x82: case 0x83: {
        const m = this.decodeModRM();
        const word = (op & 1) === 1;
        if (word) {
          const a = this.readRM16(m);
          let b: number;
          if (op === 0x83) { const i = this.fetch8(); b = i & 0x80 ? i | 0xff00 : i; }
          else b = this.fetch16();
          const v = this.alu(m.reg, a, b, true);
          if (m.reg !== 7) this.writeRM16(m, v);
        } else {
          const a = this.readRM8(m);
          const v = this.alu(m.reg, a, this.fetch8(), false);
          if (m.reg !== 7) this.writeRM8(m, v);
        }
        break;
      }
      case 0x84: { const m = this.decodeModRM(); this.alu(4, this.readRM8(m), this.get8(m.reg), false); break; }
      case 0x85: { const m = this.decodeModRM(); this.alu(4, this.readRM16(m), r[m.reg], true); break; }
      case 0x86: {
        const m = this.decodeModRM();
        const a = this.readRM8(m);
        this.writeRM8(m, this.get8(m.reg));
        this.set8(m.reg, a);
        break;
      }
      case 0x87: {
        const m = this.decodeModRM();
        const a = this.readRM16(m);
        this.writeRM16(m, r[m.reg]);
        r[m.reg] = a;
        break;
      }
      case 0x88: { const m = this.decodeModRM(); this.writeRM8(m, this.get8(m.reg)); break; }
      case 0x89: { const m = this.decodeModRM(); this.writeRM16(m, r[m.reg]); break; }
      case 0x8a: { const m = this.decodeModRM(); this.set8(m.reg, this.readRM8(m)); break; }
      case 0x8b: { const m = this.decodeModRM(); r[m.reg] = this.readRM16(m); break; }
      case 0x8c: { const m = this.decodeModRM(); this.writeRM16(m, s[m.reg & 3]); break; }
      case 0x8d: {
        const m = this.decodeModRM();
        if (m.mod === 3) this.fault('LEA with a register operand is undefined on the 8086');
        r[m.reg] = m.ea;
        break;
      }
      case 0x8e: { const m = this.decodeModRM(); s[m.reg & 3] = this.readRM16(m); break; }
      case 0x8f: {
        const m = this.decodeModRM();
        const v = this.pop();
        this.writeRM16(m, v);
        break;
      }
      case 0x90: break; // NOP (XCHG AX,AX)
      case 0x98: r[AX] = r[AX] & 0x80 ? r[AX] | 0xff00 : r[AX] & 0xff; break; // CBW
      case 0x99: r[DX] = r[AX] & 0x8000 ? 0xffff : 0; break; // CWD
      case 0x9a: { // CALL far ptr16:16
        const off = this.fetch16();
        const seg = this.fetch16();
        this.push(s[CS]);
        this.push(this.ip);
        s[CS] = seg;
        this.ip = off;
        break;
      }
      case 0x9b: break; // WAIT: no coprocessor, never busy
      case 0x9c: this.push(this.flags); break;
      case 0x9d: this.setFlagsWord(this.pop()); break;
      case 0x9e: this.flags = (this.flags & 0xff00) | ((r[AX] >> 8) & 0xd5) | 0x02; break; // SAHF
      case 0x9f: this.set8(4, this.flags & 0xff); break; // LAHF
      case 0xa0: case 0xa1: case 0xa2: case 0xa3: {
        const off = this.fetch16();
        const seg = this.segOverride >= 0 ? this.segOverride : DS;
        if (op === 0xa0) this.set8(0, this.read8(seg, off));
        else if (op === 0xa1) r[AX] = this.read16(seg, off);
        else if (op === 0xa2) this.write8(seg, off, r[AX] & 0xff);
        else this.write16(seg, off, r[AX]);
        break;
      }
      case 0xa4: case 0xa5: case 0xa6: case 0xa7: case 0xaa: case 0xab:
      case 0xac: case 0xad: case 0xae: case 0xaf:
        this.stringOp(op);
        break;
      case 0xa8: this.alu(4, r[AX] & 0xff, this.fetch8(), false); break;
      case 0xa9: this.alu(4, r[AX], this.fetch16(), true); break;
      case 0xc0: case 0xc2: { // RET imm16 (C0 is an 8086 alias)
        const n = this.fetch16();
        this.ip = this.pop();
        r[SP] = (r[SP] + n) & 0xffff;
        break;
      }
      case 0xc1: case 0xc3: this.ip = this.pop(); break; // RET
      case 0xc4: case 0xc5: { // LES / LDS
        const m = this.decodeModRM();
        if (m.mod === 3) this.fault(`${op === 0xc4 ? 'LES' : 'LDS'} with a register operand is undefined on the 8086`);
        r[m.reg] = this.read16(m.seg, m.ea);
        s[op === 0xc4 ? ES : DS] = this.read16(m.seg, (m.ea + 2) & 0xffff);
        break;
      }
      case 0xc6: { const m = this.decodeModRM(); this.writeRM8(m, this.fetch8()); break; }
      case 0xc7: { const m = this.decodeModRM(); this.writeRM16(m, this.fetch16()); break; }
      case 0xc8: case 0xca: { // RETF imm16
        const n = this.fetch16();
        this.ip = this.pop();
        s[CS] = this.pop();
        r[SP] = (r[SP] + n) & 0xffff;
        break;
      }
      case 0xc9: case 0xcb: // RETF
        this.ip = this.pop();
        s[CS] = this.pop();
        break;
      case 0xcc: this.interrupt(3); break;
      case 0xcd: this.interrupt(this.fetch8()); break;
      case 0xce: if (this.flags & OF) this.interrupt(4); break;
      case 0xcf: // IRET
        this.ip = this.pop();
        s[CS] = this.pop();
        this.setFlagsWord(this.pop());
        break;
      case 0xd0: case 0xd1: case 0xd2: case 0xd3: {
        const m = this.decodeModRM();
        const word = (op & 1) === 1;
        const count = op & 2 ? r[CX] & 0xff : 1;
        if (word) this.writeRM16(m, this.shift(m.reg, this.readRM16(m), count, true));
        else this.writeRM8(m, this.shift(m.reg, this.readRM8(m), count, false));
        break;
      }
      case 0xd4: { // AAM
        const base = this.fetch8();
        if (base === 0) {
          // The 8086 microcode updates SZP from a zero result before trapping.
          this.szp(0, false);
          this.divideError();
          break;
        }
        const al = r[AX] & 0xff;
        this.set8(4, Math.floor(al / base));
        this.set8(0, al % base);
        this.szp(r[AX] & 0xff, false);
        break;
      }
      case 0xd5: { // AAD
        const base = this.fetch8();
        const v = this.alu(0, r[AX] & 0xff, ((r[AX] >> 8) * base) & 0xff, false);
        r[AX] = v;
        break;
      }
      case 0xd6: this.set8(0, this.flags & CF ? 0xff : 0); break; // SALC (undocumented)
      case 0xd7: { // XLAT
        const seg = this.segOverride >= 0 ? this.segOverride : DS;
        this.set8(0, this.read8(seg, (r[BX] + (r[AX] & 0xff)) & 0xffff));
        break;
      }
      case 0xe0: case 0xe1: case 0xe2: { // LOOPNE / LOOPE / LOOP
        r[CX]--;
        const zf = (this.flags & ZF) !== 0;
        const take = r[CX] !== 0 && (op === 0xe2 || (op === 0xe1 ? zf : !zf));
        this.jumpRel8(take);
        break;
      }
      case 0xe3: this.jumpRel8(r[CX] === 0); break; // JCXZ
      case 0xe4: this.set8(0, this.portIn(this.fetch8(), false)); break;
      case 0xe5: r[AX] = this.portIn(this.fetch8(), true); break;
      case 0xe6: this.portOut(this.fetch8(), r[AX] & 0xff, false); break;
      case 0xe7: this.portOut(this.fetch8(), r[AX], true); break;
      case 0xec: this.set8(0, this.portIn(r[DX], false)); break;
      case 0xed: r[AX] = this.portIn(r[DX], true); break;
      case 0xee: this.portOut(r[DX], r[AX] & 0xff, false); break;
      case 0xef: this.portOut(r[DX], r[AX], true); break;
      case 0xe8: { // CALL rel16
        const d = this.fetch16();
        this.push(this.ip);
        this.ip = (this.ip + d) & 0xffff;
        break;
      }
      case 0xe9: { const d = this.fetch16(); this.ip = (this.ip + d) & 0xffff; break; }
      case 0xea: { const off = this.fetch16(); s[CS] = this.fetch16(); this.ip = off; break; }
      case 0xeb: this.jumpRel8(true); break;
      case 0xf4: this.halted = true; break; // HLT
      case 0xf5: this.flags ^= CF; break;
      case 0xf6: case 0xf7: this.group3(op === 0xf7); break;
      case 0xf8: this.flags &= ~CF; break;
      case 0xf9: this.flags |= CF; break;
      case 0xfa: this.flags &= ~IF; break;
      case 0xfb: this.flags |= IF; break;
      case 0xfc: this.flags &= ~DF; break;
      case 0xfd: this.flags |= DF; break;
      case 0xfe: {
        const m = this.decodeModRM();
        if (m.reg === 0) this.writeRM8(m, this.inc(this.readRM8(m), false));
        else if (m.reg === 1) this.writeRM8(m, this.dec(this.readRM8(m), false));
        else this.fault(`undefined opcode FE /${m.reg}`);
        break;
      }
      case 0xff: this.group5(); break;
      default:
        this.fault(`unknown opcode ${op.toString(16).toUpperCase().padStart(2, '0')}h`);
    }
  }

  private portIn(port: number, word: boolean): number {
    return this.ports ? this.ports.input(port & 0xffff, word) & (word ? 0xffff : 0xff) : word ? 0xffff : 0xff;
  }

  private portOut(port: number, value: number, word: boolean): void {
    this.ports?.output(port & 0xffff, value, word);
  }

  private divideError(): void {
    this.interrupt(0);
  }

  private group3(word: boolean): void {
    const m = this.decodeModRM();
    const r = this.regs;
    switch (m.reg) {
      case 0: case 1: // TEST
        if (word) this.alu(4, this.readRM16(m), this.fetch16(), true);
        else this.alu(4, this.readRM8(m), this.fetch8(), false);
        break;
      case 2: // NOT
        if (word) this.writeRM16(m, ~this.readRM16(m) & 0xffff);
        else this.writeRM8(m, ~this.readRM8(m) & 0xff);
        break;
      case 3: // NEG
        if (word) this.writeRM16(m, this.alu(5, 0, this.readRM16(m), true));
        else this.writeRM8(m, this.alu(5, 0, this.readRM8(m), false));
        break;
      case 4: { // MUL
        if (word) {
          const p = r[AX] * this.readRM16(m);
          r[AX] = p & 0xffff;
          r[DX] = Math.floor(p / 0x10000) & 0xffff;
          this.mulFlags(r[DX] !== 0, r[DX], true);
        } else {
          const p = (r[AX] & 0xff) * this.readRM8(m);
          r[AX] = p;
          this.mulFlags((p & 0xff00) !== 0, p >> 8, false);
        }
        break;
      }
      case 5: { // IMUL
        if (word) {
          const p = sx16(r[AX]) * sx16(this.readRM16(m));
          r[AX] = p & 0xffff;
          r[DX] = (p >> 16) & 0xffff;
          this.mulFlags(p !== sx16(p & 0xffff), r[DX], true);
        } else {
          const p = sx8(r[AX] & 0xff) * sx8(this.readRM8(m));
          r[AX] = p & 0xffff;
          this.mulFlags(p !== sx8(p & 0xff), (p >> 8) & 0xff, false);
        }
        break;
      }
      case 6: { // DIV
        if (word) {
          const d = this.readRM16(m);
          const n = r[DX] * 0x10000 + r[AX];
          if (d === 0) { this.divideError(); break; }
          const q = Math.floor(n / d);
          if (q > 0xffff) { this.divideError(); break; }
          r[DX] = n % d;
          r[AX] = q;
        } else {
          const d = this.readRM8(m);
          const n = r[AX];
          if (d === 0) { this.divideError(); break; }
          const q = Math.floor(n / d);
          if (q > 0xff) { this.divideError(); break; }
          r[AX] = ((n % d) << 8) | q;
        }
        break;
      }
      case 7: { // IDIV
        if (word) {
          const d = sx16(this.readRM16(m));
          const n = (r[DX] << 16) | r[AX];
          if (d === 0) { this.divideError(); break; }
          let q = Math.trunc(n / d);
          if (q > 0x7fff || q < -0x7fff) { this.divideError(); break; }
          if (this.repPrefix) q = -q; // undocumented 8086/8088 quirk: REP negates the quotient
          r[AX] = q & 0xffff;
          r[DX] = (n % d) & 0xffff;
        } else {
          const d = sx8(this.readRM8(m));
          const n = sx16(r[AX]);
          if (d === 0) { this.divideError(); break; }
          let q = Math.trunc(n / d);
          if (q > 0x7f || q < -0x7f) { this.divideError(); break; }
          if (this.repPrefix) q = -q; // undocumented 8086/8088 quirk: REP negates the quotient
          r[AX] = ((n % d) & 0xff) << 8 | (q & 0xff);
        }
        break;
      }
    }
  }

  private mulFlags(overflow: boolean, high: number, word: boolean): void {
    this.setFlag(CF, overflow);
    this.setFlag(OF, overflow);
    // SF/ZF/PF/AF are architecturally undefined; the 8086 derives them from the high half.
    this.szp(high, word);
  }

  private group5(): void {
    const b = this.mem.read8(physical(this.sregs[CS], this.ip));
    // Emulator service trap `FF FF CD nn`, honoured only inside the BIOS ROM segment.
    const here = physical(this.startCs, this.startIp);
    if (b === 0xff && this.hook && here >= ROM_BASE && here <= ROM_END &&
        this.mem.read8(physical(this.sregs[CS], this.ip + 1)) === 0xcd) {
      this.ip = (this.ip + 2) & 0xffff;
      const vector = this.fetch8();
      this.hook(this, vector, this.startIp);
      return;
    }
    const m = this.decodeModRM();
    const r = this.regs;
    const s = this.sregs;
    switch (m.reg) {
      case 0: this.writeRM16(m, this.inc(this.readRM16(m), true)); break;
      case 1: this.writeRM16(m, this.dec(this.readRM16(m), true)); break;
      case 2: { const t = this.readRM16(m); this.push(this.ip); this.ip = t; break; }
      case 3: { // CALL far m16:16
        if (m.mod === 3) this.fault('CALL FAR with a register operand is undefined on the 8086');
        const off = this.read16(m.seg, m.ea);
        const seg = this.read16(m.seg, (m.ea + 2) & 0xffff);
        this.push(s[CS]);
        this.push(this.ip);
        s[CS] = seg;
        this.ip = off;
        break;
      }
      case 4: this.ip = this.readRM16(m); break;
      case 5: { // JMP far m16:16
        if (m.mod === 3) this.fault('JMP FAR with a register operand is undefined on the 8086');
        this.ip = this.read16(m.seg, m.ea);
        s[CS] = this.read16(m.seg, (m.ea + 2) & 0xffff);
        break;
      }
      case 6: case 7: // PUSH r/m16 (/7 is an 8086 alias)
        if (m.mod === 3 && m.rm === SP) {
          r[SP] = (r[SP] - 2) & 0xffff;
          this.write16(SS, r[SP], r[SP]);
        } else {
          this.push(this.readRM16(m));
        }
        break;
    }
  }
}

function sx8(v: number): number {
  return v & 0x80 ? v - 0x100 : v;
}

function sx16(v: number): number {
  return v & 0x8000 ? v - 0x10000 : v;
}
