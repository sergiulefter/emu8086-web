// Step-by-step comparison with the real EMU8086 4.08. Each fixtures/traces/NAME.emu8086.log was recorded by
// typing `r` and then `t` (single step) in EMU8086's "debug log - debug.exe emulation" window until the program
// ended. Here the same program is stepped through our debug command and every step must show the same registers,
// flags and next instruction, prefixes (REPE, ES:) and REP iterations included.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../../src/assembler/assembler';
import { runDebugCommand, type DebugContext } from '../../src/debug/debugCommands';
import { EmulatorSession } from '../../src/debug/session';

const dir = join(process.cwd(), 'fixtures/traces');
const noSched = { schedule: () => 0, cancel: () => {}, now: () => 0 };

interface Step { regs: string; ins: string }

/** Steps of a debug log: register line + flags line, and the next instruction (blanks collapsed). */
function parse(log: string): Step[] {
  const steps: Step[] = [];
  let cur: string[] | null = null;
  for (const raw of log.replace(/^﻿/, '').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('-')) { cur = []; continue; }
    if (!cur) continue;
    cur.push(l.replace(/\s+/g, ' '));
    if (cur.length === 3) { steps.push({ regs: `${cur[0]} | ${cur[1]}`, ins: cur[2] }); cur = null; }
  }
  return steps;
}

// EMU8086 debug-log display bugs we deliberately do not copy (the program runs correctly in both):
//  - right after an INT returns, short-jump targets are shown 100h too high (JMP 020Ah for a jump to 010Ah);
//  - the value note of [BX + DI] + disp16 uses a wrong address (DS:0454 for 0200h + 0020h + 1234h).
const KNOWN_DISPLAY_BUGS: Record<string, number[]> = { e_int21: [11, 17, 23], b_forms: [9] };
const shortJumpBug = (real: string, ours: string) =>
  /^(\S+ \S+ (?:JMP|LOOP\w*|J\w+)) 0([0-9A-F]+)h$/.exec(real)?.[2] === (parseInt(/ 0([0-9A-F]+)h$/.exec(ours)?.[1] ?? '0', 16) + 0x100).toString(16).toUpperCase();

describe('single-stepping matches EMU8086 4.08', () => {
  const names = readdirSync(dir).filter((f) => f.endsWith('.asm')).map((f) => f.slice(0, -4));
  it('has recorded traces', () => expect(names.length).toBeGreaterThanOrEqual(12));
  for (const name of names) {
    it(name, () => {
      const real = parse(readFileSync(join(dir, `${name}.emu8086.log`), 'utf8'));
      const session = new EmulatorSession(noSched);
      session.load(assemble(readFileSync(join(dir, `${name}.asm`), 'utf8')), `${name}.asm`);
      const ctx: DebugContext = { session };
      let log = `-r\n${runDebugCommand(ctx, 'r')}\n`;
      for (let i = 1; i < real.length; i++) log += `-t\n${runDebugCommand(ctx, 't')}\n`;
      const ours = parse(log);
      expect(ours.length).toBe(real.length);
      for (let i = 0; i < real.length; i++) {
        expect(ours[i].regs, `${name} step ${i}: registers/flags`).toBe(real[i].regs);
        const knownBug = (KNOWN_DISPLAY_BUGS[name] ?? []).includes(i) || shortJumpBug(real[i].ins, ours[i].ins);
        if (!knownBug) expect(ours[i].ins, `${name} step ${i}: next instruction`).toBe(real[i].ins);
      }
    });
  }
});
