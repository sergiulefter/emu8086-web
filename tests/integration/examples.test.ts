import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/assembler';
import { Machine } from '../../src/debug/machine';
import { EXAMPLES, TEMPLATES } from '../../src/examples';

describe('bundled examples assemble and run to a normal exit', () => {
  for (const ex of EXAMPLES) {
    it(ex.name, () => {
      const r = assemble(ex.source);
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const m = new Machine();
      m.load(r, ex.fileName);
      const keys = [...(ex.input ?? '')];
      let stop = null;
      for (let i = 0; i < 200_000 && !stop; i++) {
        const o = m.step();
        stop = o.stop;
        if (o.waiting) {
          const k = keys.shift();
          if (k === undefined) throw new Error('example waits for more input than provided');
          m.env.pushKey(k.charCodeAt(0), 0);
        }
      }
      expect(stop?.reason).toBe('exit');
      if (ex.expectScreen !== undefined) expect(m.env.screen.text()).toBe(ex.expectScreen);
    });
  }

  it('templates assemble', () => {
    expect(assemble(TEMPLATES.com).ok).toBe(true);
    const bin = assemble(TEMPLATES.bin);
    expect(bin.ok).toBe(true);
    const m = new Machine();
    m.load(bin, 'bin.asm');
    expect(m.cpu.sregs[1]).toBe(0x500);
    expect(m.step().stop?.reason).toBe('halt');
    const boot = assemble(TEMPLATES.boot);
    expect(boot.ok).toBe(true);
    m.load(boot, 'boot.asm');
    expect(m.cpu.ip).toBe(0x7c00);
    expect(m.mem.read8(0x7c00)).toBe(0xf4);
  });
});
