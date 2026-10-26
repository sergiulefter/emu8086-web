/**
 * Parses addresses typed into the memory / disassembly address boxes:
 *   0700:0100   B800:0   DS:[BX]   CS:IP   ES:DI   SS:[BP+2]   msg   DS:msg   B8000 (physical)
 */
import type { Machine } from '../debug/machine';
import { AX, BP, BX, CX, DI, DX, SI, SP } from '../cpu/cpu';

const SEGS: Record<string, number> = { ES: 0, CS: 1, SS: 2, DS: 3 };
const REGS: Record<string, number> = { AX, BX, CX, DX, SP, BP, SI, DI };

function num(text: string, m: Machine): number | null {
  const t = text.trim().toUpperCase();
  if (!t) return null;
  if (t === 'IP') return m.cpu.ip;
  if (REGS[t] !== undefined) return m.cpu.regs[REGS[t]];
  if (SEGS[t] !== undefined) return m.cpu.sregs[SEGS[t]];
  if (/^[0-9A-F]+H?$/.test(t)) return parseInt(t.replace(/H$/, ''), 16);
  const sym = m.program?.result.symbols.find((s) => s.name === t);
  return sym ? sym.value : null;
}

function expr(text: string, m: Machine): number | null {
  const inner = text.trim().replace(/^\[(.*)\]$/, '$1');
  let total = 0;
  for (const part of inner.split(/(?=[+-])/)) {
    const neg = part.trim().startsWith('-');
    const v = num(part.replace(/^[+-]/, ''), m);
    if (v === null) return null;
    total += neg ? -v : v;
  }
  return total & 0xffff;
}

export function parseAddress(text: string, m: Machine): { segment: number; offset: number } | null {
  const t = text.trim();
  if (!t) return null;
  const colon = t.indexOf(':');
  if (colon < 0) {
    const u = t.toUpperCase();
    if (/^[0-9A-F]{5}H?$/.test(u)) {
      const a = parseInt(u.replace(/H$/, ''), 16);
      return { segment: (a >> 4) & 0xffff, offset: a & 0xf };
    }
    if (u === 'IP') return { segment: m.cpu.sregs[1], offset: m.cpu.ip };
    const off = expr(t, m);
    return off === null ? null : { segment: m.cpu.sregs[3], offset: off };
  }
  const seg = num(t.slice(0, colon), m);
  const off = expr(t.slice(colon + 1), m);
  if (seg === null || off === null || seg > 0xffff) return null;
  return { segment: seg, offset: off };
}
