/**
 * Expression evaluator for the multi base calculator.
 * Operators (C precedence): unary - ~ ; * / % ; + - ; << >> ; & ; ^ ; |
 * Numbers use assembler notation: 15, 0Fh, 0x0F, 1111b, 17o.
 */
import { parseNumber } from '../assembler/lexer';

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9A-Za-z_]/.test(src[j])) j++;
      out.push({ t: 'num', v: parseNumber(src.slice(i, j), 1, i + 1) });
      i = j;
      continue;
    }
    if (c === "'" && src[i + 2] === "'") {
      out.push({ t: 'num', v: src.charCodeAt(i + 1) });
      i += 3;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<<' || two === '>>') { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%&|^~()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`unexpected '${c}'`);
  }
  return out;
}

const LEVELS = [['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

export function evaluate(src: string): number {
  const toks = lex(src);
  let p = 0;
  const peekOp = () => (toks[p]?.t === 'op' ? (toks[p].v as string) : null);
  const parseLevel = (lvl: number): number => {
    if (lvl === LEVELS.length) return parseUnary();
    let v = parseLevel(lvl + 1);
    while (peekOp() && LEVELS[lvl].includes(peekOp()!)) {
      const op = toks[p++].v as string;
      const r = parseLevel(lvl + 1);
      switch (op) {
        case '|': v |= r; break;
        case '^': v ^= r; break;
        case '&': v &= r; break;
        case '<<': v <<= r; break;
        case '>>': v >>= r; break;
        case '+': v = (v + r) | 0; break;
        case '-': v = (v - r) | 0; break;
        case '*': v = Math.imul(v, r); break;
        case '/': if (r === 0) throw new Error('division by zero'); v = Math.trunc(v / r); break;
        case '%': if (r === 0) throw new Error('division by zero'); v %= r; break;
      }
    }
    return v;
  };
  const parseUnary = (): number => {
    const op = peekOp();
    if (op === '-') { p++; return -parseUnary() | 0; }
    if (op === '~') { p++; return ~parseUnary(); }
    if (op === '+') { p++; return parseUnary(); }
    if (op === '(') {
      p++;
      const v = parseLevel(0);
      if (peekOp() !== ')') throw new Error("missing ')'");
      p++;
      return v;
    }
    const t = toks[p++];
    if (!t || t.t !== 'num') throw new Error('number expected');
    return t.v | 0;
  };
  const v = parseLevel(0);
  if (p < toks.length) throw new Error(`unexpected '${String(toks[p].v)}'`);
  return v;
}

export function formatIn(v: number, base: 'dec' | 'hex' | 'oct' | 'bin', bits: 8 | 16 | 32): string {
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  const u = (v & mask) >>> 0;
  switch (base) {
    case 'dec': return String(v);
    case 'hex': { const h = u.toString(16).toUpperCase(); return (/^[A-F]/.test(h) ? '0' : '') + h + 'h'; }
    case 'oct': return u.toString(8) + 'o';
    case 'bin': return u.toString(2).padStart(bits === 32 ? 1 : bits, '0') + 'b';
  }
}
