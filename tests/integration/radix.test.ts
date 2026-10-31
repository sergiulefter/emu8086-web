import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { AX, BP, BX, CX, DI, DX, SI } from '../../src/cpu/cpu';
import { Machine } from '../../src/debug/machine';

it('executes unchanged .RADIX source with the register values documented by EMU8086', () => {
  const source = readFileSync(join(process.cwd(), 'fixtures/radix.asm'), 'utf8');
  const result = assemble(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.ok).toBe(true);
  const machine = new Machine();
  machine.load(result, 'radix.asm');
  for (const [register, value] of [[AX, 5], [BX, 0x101], [CX, 20], [DX, 16], [SI, 0xabce], [DI, 123], [BP, 5]]) {
    expect(machine.step().executed).toBe(true);
    expect(machine.cpu.regs[register]).toBe(value);
    expect(machine.stopEvent).toBeNull();
  }
  for (let i = 0; i < 5 && !machine.stopEvent; i++) machine.step();
  expect(machine.stopEvent).toMatchObject({ reason: 'exit' });
});
