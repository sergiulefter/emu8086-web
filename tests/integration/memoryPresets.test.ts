import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { AX, BX, CS, SP } from '../../src/cpu/cpu';
import { Machine } from '../../src/debug/machine';

function load(source: string) {
  const result = assemble(source);
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  const machine = new Machine();
  machine.load(result, 'memory_presets.asm');
  return machine;
}

const fixture = () => readFileSync(join(process.cwd(), 'fixtures/memory_presets.asm'), 'utf8');

describe('#MEM loading and execution', () => {
  it('loads both address formats and video memory, then executes unchanged source', () => {
    const machine = load(fixture());
    expect(machine.mem.read16(0x100, 0x200)).toBe(0x1234);
    expect(machine.mem.read16(0x100, 0x202)).toBe(0x5678);
    expect(machine.env.screen.getCell(0, 0)).toMatchObject({ glyph: 'H', fg: 15, bg: 0 });
    expect(machine.historyLength).toBe(0);
    machine.step();
    expect(machine.cpu.regs[AX]).toBe(0x1234);
    machine.step();
    expect(machine.cpu.regs[BX]).toBe(0x5678);
    machine.step();
    expect(machine.mem.read16(0x100, 0x200)).toBe(0);
    expect(machine.step().stop?.reason).toBe('halt');
  });

  it('restores preset bytes with Step Back and reapplies them on reset and reload', () => {
    const machine = load(fixture());
    machine.step(); machine.step(); machine.step();
    machine.stepBack();
    expect(machine.mem.read16(0x100, 0x200)).toBe(0x1234);
    machine.step();
    expect(machine.mem.read16(0x100, 0x200)).toBe(0);
    machine.reset();
    expect(machine.mem.read16(0x100, 0x200)).toBe(0x1234);
    expect(machine.cpu.ip).toBe(0);
    expect(machine.historyLength).toBe(0);
    machine.mem.write8(0x1200, 0xff);
    machine.load(assemble(fixture()), 'memory_presets.asm');
    expect(machine.mem.read16(0x100, 0x200)).toBe(0x1234);
  });

  it('executes the documented RET/HLT preset without injecting an implicit trampoline', () => {
    const machine = load('#make_bin#\n#MEM=0100:FFFE,00FF-0100:FF00,F4#\nret');
    machine.step();
    expect(machine.cpu.ip).toBe(0xff00);
    expect(machine.cpu.regs[SP]).toBe(0);
    expect(machine.step().stop?.reason).toBe('halt');
    const custom = load('#MEM=1200,34#\nhlt');
    expect(custom.mem.read16(0x100, 0xfffe)).toBe(0);
    expect(custom.mem.read8(0x10f00)).toBe(0);
    const defaults = load('ret');
    defaults.step();
    expect(defaults.cpu.ip).toBe(0xff00);
    expect(defaults.step().stop?.reason).toBe('halt');
  });

  it('applies overlapping entries after the image in source order, including repeated directives', () => {
    const machine = load('#MEM=1000,90-1200,01#\n#MEM=1200,02-1200,03#\nhlt\nhlt');
    expect(machine.mem.read8(0x1000)).toBe(0x90);
    expect(machine.mem.read8(0x1200)).toBe(3);
    expect(machine.step().stop).toBeNull();
    expect(machine.step().stop?.reason).toBe('halt');
  });

  it('preserves 20-bit wrapping and treats byte strings as contiguous physical bytes', () => {
    const machine = load('#MEM=FFFF:FFFF,1234-FFFFF,5678-0100:FFFF,ABCD#\nhlt');
    expect(machine.mem.read8(0xffef)).toBe(0x12);
    expect(machine.mem.read8(0xfff0)).toBe(0x34);
    expect(machine.mem.read8(0xfffff)).toBe(0x56);
    expect(machine.mem.read8(0)).toBe(0x78);
    expect(machine.mem.read8(0x10fff)).toBe(0xab);
    expect(machine.mem.read8(0x11000)).toBe(0xcd);
  });

  it('can initialize an interrupt vector and execute a handler from preset bytes', () => {
    const machine = load('#MEM=0180,00030001-0100:0300,B83412CF#\nint 60h\nhlt');
    machine.step();
    expect(machine.cpu.sregs[CS]).toBe(0x100);
    expect(machine.cpu.ip).toBe(0x300);
    machine.step();
    expect(machine.cpu.regs[AX]).toBe(0x1234);
    machine.step();
    expect(machine.cpu.ip).toBe(2);
    expect(machine.step().stop?.reason).toBe('halt');
  });

  it('applies absolute presets independently of load segment and origin, including boot images', () => {
    const bin = load('#make_bin#\n#LOAD_SEGMENT=2000#\n#LOAD_OFFSET=0100#\n#DS=0100#\n#MEM=1200,3412#\norg 100h\nmov ax,[0200h]\nhlt');
    bin.step();
    expect(bin.cpu.regs[AX]).toBe(0x1234);
    const boot = load('#make_boot#\n#MEM=0000:0500,7856#\norg 7c00h\nmov ax,[0500h]\nhlt');
    boot.step();
    expect(boot.cpu.regs[AX]).toBe(0x5678);
  });

  it('clears presets when another program is loaded or the machine is unloaded', () => {
    const machine = load(fixture());
    machine.load(assemble('hlt'), 'plain.asm');
    expect(machine.mem.read16(0x100, 0x200)).toBe(0);
    expect(machine.env.screen.getCell(0, 0).glyph).toBe(' ');
    machine.load(assemble(fixture()), 'memory_presets.asm');
    machine.unload();
    expect(machine.mem.read16(0x100, 0x200)).toBe(0);
  });
});
