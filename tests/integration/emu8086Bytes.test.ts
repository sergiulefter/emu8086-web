// Every fixtures/emu8086/*.asm was compiled by the real EMU8086 4.08; NAME.emu8086.com is the executable it
// produced. Our assembler must reproduce each one byte for byte. Add a pair to cover a new behaviour.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../../src/assembler/assembler';

const dir = join(process.cwd(), 'fixtures/emu8086');
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');

describe('byte-for-byte with EMU8086 4.08', () => {
  const names = readdirSync(dir).filter((f) => f.endsWith('.asm')).map((f) => f.slice(0, -4));
  it('has fixtures', () => expect(names.length).toBeGreaterThan(0));
  for (const name of names) {
    it(name, () => {
      const r = assemble(readFileSync(join(dir, `${name}.asm`), 'utf8'));
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(hex(r.bytes)).toBe(hex(readFileSync(join(dir, `${name}.emu8086.com`))));
    });
  }
});
