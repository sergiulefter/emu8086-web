/**
 * debug.exe-style commands for the "debug log" window (EMU8086 "debug"
 * button). All numbers are hexadecimal without suffix, as in debug.exe.
 *
 *   r            registers + next instruction     r ax [value]   view/set a register
 *   rf           flags (NV UP EI PL NZ NA PO NC)  t [n]          trace n instructions
 *   p            step over                        d [addr] [L n] dump memory (default 128 bytes)
 *   u [addr] [L n]  unassemble                    e addr b1 b2…  enter bytes
 *   ?            help
 */
import { AX, BP, BX, CF, CX, DF, DI, DX, IF, OF, PF, SF, SI, SP, ZF, AF } from '../cpu/cpu';
import { physical } from '../cpu/memory';
import type { EmulatorSession } from './session';
import { hex4 } from './machine';

const REGS: Record<string, number> = { AX, BX, CX, DX, SP, BP, SI, DI };
const SREGS: Record<string, number> = { ES: 0, CS: 1, SS: 2, DS: 3 };

export interface DebugContext {
  session: EmulatorSession;
  /** Last dump / unassemble position for repeated `d` / `u`. */
  dump?: { seg: number; off: number };
  unasm?: { seg: number; off: number };
}

function hex2(v: number) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function parseAddr(ctx: DebugContext, text: string, defSeg: number): { seg: number; off: number } | null {
  const m = ctx.session.machine;
  const t = text.toUpperCase();
  const reg = (s: string): number | null => {
    if (s === 'IP') return m.cpu.ip;
    if (REGS[s] !== undefined) return m.cpu.regs[REGS[s]];
    if (SREGS[s] !== undefined) return m.cpu.sregs[SREGS[s]];
    if (/^[0-9A-F]{1,4}$/.test(s)) return parseInt(s, 16);
    const sym = m.program?.result.symbols.find((x) => x.name === s);
    return sym ? sym.value : null;
  };
  const offExpr = (s: string): number | null => {
    const inner = s.replace(/^\[(.*)\]$/, '$1');
    let total = 0;
    for (const part of inner.split(/(?=[+-])/)) {
      const v = reg(part.replace(/^[+-]/, '').trim());
      if (v === null) return null;
      total += part.trim().startsWith('-') ? -v : v;
    }
    return total & 0xffff;
  };
  const c = t.indexOf(':');
  if (c >= 0) {
    const seg = reg(t.slice(0, c));
    const off = offExpr(t.slice(c + 1));
    return seg === null || off === null ? null : { seg, off };
  }
  const off = offExpr(t);
  return off === null ? null : { seg: defSeg, off };
}

export function registersText(session: EmulatorSession): string {
  const m = session.machine;
  const c = m.cpu;
  const f = c.flags;
  const flags = [
    f & OF ? 'OV' : 'NV', f & DF ? 'DN' : 'UP', f & IF ? 'EI' : 'DI', f & SF ? 'NG' : 'PL',
    f & ZF ? 'ZR' : 'NZ', f & AF ? 'AC' : 'NA', f & PF ? 'PE' : 'PO', f & CF ? 'CY' : 'NC',
  ].join(' ');
  const r = c.regs;
  const d = m.disassembleAt(c.sregs[1], c.ip);
  const bytes = Array.from({ length: d.length }, (_, i) => hex2(m.mem.read8(physical(c.sregs[1], c.ip + i)))).join('');
  return (
    `AX=${hex4(r[AX])}  BX=${hex4(r[BX])}  CX=${hex4(r[CX])}  DX=${hex4(r[DX])}  SP=${hex4(r[SP])}  BP=${hex4(r[BP])}  SI=${hex4(r[SI])}  DI=${hex4(r[DI])}\n` +
    `DS=${hex4(c.sregs[3])}  ES=${hex4(c.sregs[0])}  SS=${hex4(c.sregs[2])}  CS=${hex4(c.sregs[1])}  IP=${hex4(c.ip)}   ${flags}\n` +
    `${hex4(c.sregs[1])}:${hex4(c.ip)} ${bytes.padEnd(14)} ${d.text}`
  );
}

export function runDebugCommand(ctx: DebugContext, line: string): string {
  const m = ctx.session.machine;
  const c = m.cpu;
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] ?? '').toLowerCase();
  const arg = parts.slice(1);
  const lengthArg = (def: number) => {
    const i = arg.findIndex((a) => a.toLowerCase() === 'l');
    if (i >= 0 && arg[i + 1]) return parseInt(arg[i + 1], 16) || def;
    const j = arg.findIndex((a) => /^l[0-9a-f]+$/i.test(a));
    return j >= 0 ? parseInt(arg[j].slice(1), 16) || def : def;
  };
  const firstAddr = (defSeg: number) => (arg[0] && arg[0].toLowerCase() !== 'l' && !/^l[0-9a-f]+$/i.test(arg[0]) ? parseAddr(ctx, arg[0], defSeg) : undefined);

  switch (cmd) {
    case '':
      return '';
    case '?':
      return [
        'r            show registers       r ax 1234   set a register',
        'rf           show flags           rf cy zr    set flags (NC/CY, NZ/ZR, PL/NG, NV/OV, PO/PE, NA/AC, DI/EI, UP/DN)',
        't [n]        trace n instructions p           step over',
        'd [addr] [l n]  dump memory       u [addr] [l n]  unassemble',
        'e addr b1 b2 ...  enter bytes     cls         clear the log',
        'numbers are hexadecimal; addr is seg:off, off, ds:[bx], or a variable name.',
      ].join('\n');
    case 'r': {
      if (!arg.length) return registersText(ctx.session);
      const name = arg[0].toUpperCase();
      if (name === 'F') return runDebugCommand(ctx, `rf ${arg.slice(1).join(' ')}`);
      if (arg.length < 2) {
        const v = name === 'IP' ? c.ip : REGS[name] !== undefined ? c.regs[REGS[name]] : SREGS[name] !== undefined ? c.sregs[SREGS[name]] : null;
        return v === null ? `unknown register: ${arg[0]}` : `${name} ${hex4(v)}`;
      }
      const v = parseInt(arg[1], 16);
      if (!/^[0-9a-f]{1,4}$/i.test(arg[1])) return `invalid value: ${arg[1]}`;
      if (name === 'IP') c.ip = v;
      else if (REGS[name] !== undefined) c.regs[REGS[name]] = v;
      else if (SREGS[name] !== undefined) c.sregs[SREGS[name]] = v;
      else return `unknown register: ${arg[0]}`;
      ctx.session.revision++;
      return `${name} ${hex4(v)}`;
    }
    case 'rf': {
      const map: Record<string, [number, boolean]> = {
        NC: [CF, false], CY: [CF, true], NZ: [ZF, false], ZR: [ZF, true], PL: [SF, false], NG: [SF, true],
        NV: [OF, false], OV: [OF, true], PO: [PF, false], PE: [PF, true], NA: [AF, false], AC: [AF, true],
        DI: [IF, false], EI: [IF, true], UP: [DF, false], DN: [DF, true],
      };
      for (const a of arg) {
        const e = map[a.toUpperCase()];
        if (!e) return `unknown flag: ${a}`;
        c.setFlag(e[0], e[1]);
      }
      if (arg.length) ctx.session.revision++;
      return registersText(ctx.session).split('\n')[1].replace(/^.*IP=\w+\s+/, '');
    }
    case 't': {
      const n = arg[0] ? parseInt(arg[0], 16) || 1 : 1;
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        if (!m.canStep) { out.push(m.stopEvent ? `program terminated: ${m.stopEvent.message.split('\n')[0]}` : 'no program loaded'); break; }
        ctx.session.step();
        if (m.waiting) { out.push('waiting for keyboard input (type in the emulator screen)'); break; }
        out.push(registersText(ctx.session));
      }
      return out.join('\n\n');
    }
    case 'p': {
      if (!m.canStep) return 'no program to step';
      ctx.session.stepOver();
      return ctx.session.running ? 'stepping over (running)...' : registersText(ctx.session);
    }
    case 'd': {
      const given = firstAddr(c.sregs[3]);
      if (given === null) return `invalid address: ${arg[0]}`;
      const a = given ?? ctx.dump ?? { seg: c.sregs[3], off: 0x100 };
      const len = Math.min(lengthArg(0x80), 0x1000);
      const begin = a.off;
      const stop = Math.min(begin + len, 0x10000);
      const lines: string[] = [];
      for (let row = begin & ~0xf; row < stop; row += 16) {
        const bytes: string[] = [];
        let ascii = '';
        for (let k = 0; k < 16; k++) {
          const o = row + k;
          if (o >= begin && o < stop) {
            const b = m.mem.read8(physical(a.seg, o));
            bytes.push(hex2(b));
            ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
          } else {
            bytes.push('  ');
            ascii += ' ';
          }
        }
        lines.push(`${hex4(a.seg)}:${hex4(row)}  ${bytes.slice(0, 8).join(' ')}-${bytes.slice(8).join(' ')}   ${ascii}`);
      }
      const off = stop & 0xffff;
      ctx.dump = { seg: a.seg, off };
      return lines.join('\n');
    }
    case 'u': {
      const given = firstAddr(c.sregs[1]);
      if (given === null) return `invalid address: ${arg[0]}`;
      const a = given ?? ctx.unasm ?? { seg: c.sregs[1], off: c.ip };
      const n = Math.min(lengthArg(0x20), 0x400);
      const lines: string[] = [];
      let off = a.off;
      let used = 0;
      while (used < n) {
        const d = m.disassembleAt(a.seg, off);
        const bytes = Array.from({ length: d.length }, (_, i) => hex2(m.mem.read8(physical(a.seg, off + i)))).join('');
        lines.push(`${hex4(a.seg)}:${hex4(off)} ${bytes.padEnd(14)} ${d.text}`);
        off = (off + d.length) & 0xffff;
        used += d.length;
      }
      ctx.unasm = { seg: a.seg, off };
      return lines.join('\n');
    }
    case 'e': {
      if (arg.length < 2) return 'usage: e address byte [byte...]';
      const a = parseAddr(ctx, arg[0], c.sregs[3]);
      if (!a) return `invalid address: ${arg[0]}`;
      const values: number[] = [];
      for (const b of arg.slice(1)) {
        if (/^'.*'$/.test(b)) for (const ch of b.slice(1, -1)) values.push(ch.charCodeAt(0) & 0xff);
        else if (/^[0-9a-f]{1,2}$/i.test(b)) values.push(parseInt(b, 16));
        else return `invalid byte: ${b}`;
      }
      values.forEach((v, i) => m.mem.write8(physical(a.seg, a.off + i), v));
      ctx.session.revision++;
      return `${values.length} byte(s) written at ${hex4(a.seg)}:${hex4(a.off)}`;
    }
    default:
      return `unknown command: ${cmd} (type ? for help)`;
  }
}
