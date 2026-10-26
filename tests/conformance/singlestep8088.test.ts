/**
 * Hardware-captured conformance tests (SingleStepTests/8088 v2, MIT licence).
 * Opt-in: `npm run test:conformance` (downloads ~730 MB into .cache/).
 * CONFORMANCE_LIMIT=n limits tests per opcode file (default 0 = all tests).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { CPU, AX, BX, CX, DX, SP, BP, SI, DI, ES, CS, SS, DS, CpuFault } from '../../src/cpu/cpu';
import { Memory } from '../../src/cpu/memory';

const dir = join(process.cwd(), '.cache', '8088-tests', 'v2');
const enabled = process.env.CONFORMANCE === '1' && existsSync(join(dir, 'metadata.json'));
const limit = Number(process.env.CONFORMANCE_LIMIT ?? 0);
const only = process.env.CONFORMANCE_ONLY?.split(',');

interface Regs { [k: string]: number }
interface TestCase {
  name: string;
  bytes: number[];
  initial: { regs: Regs; ram: [number, number][] };
  final: { regs: Regs; ram: [number, number][] };
}
interface OpMeta { status: string; ['flags-mask']?: number; reg?: Record<string, OpMeta> }

const REGMAP: [string, (c: CPU) => number, (c: CPU, v: number) => void][] = [
  ['ax', (c) => c.regs[AX], (c, v) => (c.regs[AX] = v)],
  ['bx', (c) => c.regs[BX], (c, v) => (c.regs[BX] = v)],
  ['cx', (c) => c.regs[CX], (c, v) => (c.regs[CX] = v)],
  ['dx', (c) => c.regs[DX], (c, v) => (c.regs[DX] = v)],
  ['sp', (c) => c.regs[SP], (c, v) => (c.regs[SP] = v)],
  ['bp', (c) => c.regs[BP], (c, v) => (c.regs[BP] = v)],
  ['si', (c) => c.regs[SI], (c, v) => (c.regs[SI] = v)],
  ['di', (c) => c.regs[DI], (c, v) => (c.regs[DI] = v)],
  ['cs', (c) => c.sregs[CS], (c, v) => (c.sregs[CS] = v)],
  ['ds', (c) => c.sregs[DS], (c, v) => (c.sregs[DS] = v)],
  ['es', (c) => c.sregs[ES], (c, v) => (c.sregs[ES] = v)],
  ['ss', (c) => c.sregs[SS], (c, v) => (c.sregs[SS] = v)],
  ['ip', (c) => c.ip, (c, v) => (c.ip = v)],
  ['flags', (c) => c.flags, (c, v) => (c.flags = v)],
];

function runFile(file: string, mask: number): string[] {
  const tests: TestCase[] = JSON.parse(gunzipSync(readFileSync(join(dir, file))).toString());
  const mem = new Memory();
  const cpu = new CPU(mem);
  const failures: string[] = [];
  const n = limit > 0 ? Math.min(limit, tests.length) : tests.length;
  for (let i = 0; i < n; i++) {
    const t = tests[i];
    cpu.reset();
    for (const [name, , set] of REGMAP) set(cpu, t.initial.regs[name]);
    for (const [a, v] of t.initial.ram) mem.bytes[a] = v;
    let error = '';
    try {
      cpu.step();
    } catch (e) {
      error = e instanceof CpuFault ? `fault: ${e.message}` : String(e);
    }
    const problems: string[] = [];
    if (error) problems.push(error);
    for (const [name, get] of REGMAP) {
      const expected = t.final.regs[name] ?? t.initial.regs[name];
      const actual = get(cpu);
      const m = name === 'flags' ? mask : 0xffff;
      if ((expected & m) !== (actual & m)) problems.push(`${name}: expected ${expected.toString(16)} got ${actual.toString(16)}`);
    }
    // Divide errors push microcode-intermediate (architecturally undefined) flags:
    // compare that stacked word under the same undefined-flag mask.
    const stackedFlags = new Map<number, number>();
    const divide = /^(div|idiv|aam)/.test(t.name);
    if (divide && t.final.regs.sp !== undefined) {
      const ss = t.final.regs.ss ?? t.initial.regs.ss;
      const base = ss * 16;
      stackedFlags.set((base + ((t.final.regs.sp + 4) & 0xffff)) & 0xfffff, mask & 0xff);
      stackedFlags.set((base + ((t.final.regs.sp + 5) & 0xffff)) & 0xfffff, mask >> 8);
    }
    for (const [a, v] of t.final.ram) {
      const m = stackedFlags.get(a) ?? 0xff;
      if ((mem.bytes[a] & m) !== (v & m)) problems.push(`ram[${a.toString(16)}]: expected ${v.toString(16)} got ${mem.bytes[a].toString(16)}`);
    }
    for (const [a] of t.initial.ram) mem.bytes[a] = 0;
    for (const [a] of t.final.ram) mem.bytes[a] = 0;
    if (problems.length) {
      failures.push(`#${i} ${t.name} [${t.bytes.map((b) => b.toString(16)).join(' ')}]: ${problems.join('; ')}`);
    }
  }
  return failures;
}

describe.skipIf(!enabled)('SingleStepTests 8088 conformance', () => {
  const meta = enabled ? JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')).opcodes as Record<string, OpMeta> : {};
  const files = enabled ? readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort() : [];
  for (const file of files) {
    const [op, ext] = file.replace('.json.gz', '').split('.');
    if (only && !only.includes(op) && !only.includes(`${op}.${ext}`)) continue;
    const m = meta[op];
    const entry = ext !== undefined ? m?.reg?.[ext] : m;
    if (!entry || entry.status === 'undefined' || entry.status === 'prefix') continue;
    it(`${file} (${entry.status})`, () => {
      const failures = runFile(file, entry['flags-mask'] ?? 0xffff);
      expect(failures.slice(0, 5), `${failures.length} failures`).toEqual([]);
    });
  }
});
