/**
 * Expression and operand parsing for the assembler.
 *
 * Operands are parsed into an expression tree in which registers and `[ ]`
 * brackets are ordinary nodes; `classifyOperand` then decides whether the
 * operand is a register, an immediate or a memory reference (MASM rules:
 * a variable name without brackets is a memory reference).
 */
import { AsmError } from './types';
import type { Token } from './lexer';

export const REG8 = ['AL', 'CL', 'DL', 'BL', 'AH', 'CH', 'DH', 'BH'];
export const REG16 = ['AX', 'CX', 'DX', 'BX', 'SP', 'BP', 'SI', 'DI'];
export const SREG = ['ES', 'CS', 'SS', 'DS'];

export interface RegRef {
  name: string;
  code: number;
  size: 1 | 2;
  isSeg: boolean;
}

export function lookupReg(upper: string): RegRef | null {
  let i = REG8.indexOf(upper);
  if (i >= 0) return { name: upper, code: i, size: 1, isSeg: false };
  i = REG16.indexOf(upper);
  if (i >= 0) return { name: upper, code: i, size: 2, isSeg: false };
  i = SREG.indexOf(upper);
  if (i >= 0) return { name: upper, code: i, size: 2, isSeg: true };
  return null;
}

export type Expr =
  | { k: 'num'; v: number; col: number }
  | { k: 'str'; chars: number[]; col: number }
  | { k: 'sym'; name: string; col: number; len: number }
  | { k: 'here'; col: number }
  | { k: 'reg'; reg: RegRef; col: number }
  | { k: 'mem'; e: Expr; col: number }
  | { k: 'seg'; sreg: number; e: Expr; col: number }
  | { k: 'un'; op: string; e: Expr; col: number }
  | { k: 'bin'; op: string; l: Expr; r: Expr; col: number }
  | { k: 'dup'; count: Expr; items: Expr[]; col: number }
  | { k: 'undef'; col: number };

const UNARY_KEYWORDS = new Set(['OFFSET', 'HIGH', 'LOW', 'LENGTH', 'SIZE', 'TYPE', 'SEG']);
const MUL_OPS = new Set(['*', '/', 'MOD', 'SHL', 'SHR']);

export class ExprParser {
  pos = 0;
  constructor(readonly toks: Token[], readonly line: number, readonly endCol: number) {}

  peek(offset = 0): Token | undefined {
    return this.toks[this.pos + offset];
  }

  atEnd(): boolean {
    return this.pos >= this.toks.length;
  }

  error(msg: string, tok?: Token): never {
    const t = tok ?? this.peek();
    throw new AsmError(msg, this.line, t ? t.col : this.endCol, t ? t.text.length : 1);
  }

  expectPunct(p: string): Token {
    const t = this.peek();
    if (!t || t.kind !== 'punct' || t.text !== p) this.error(`expected '${p}'`);
    this.pos++;
    return t;
  }

  isPunct(p: string, offset = 0): boolean {
    const t = this.peek(offset);
    return !!t && t.kind === 'punct' && t.text === p;
  }

  isWord(w: string, offset = 0): boolean {
    const t = this.peek(offset);
    return !!t && t.kind === 'ident' && t.upper === w;
  }

  parse(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let l = this.parseAnd();
    while (this.isWord('OR') || this.isWord('XOR') || this.isPunct('|')) {
      const t = this.peek()!;
      this.pos++;
      const op = t.upper === '|' ? 'OR' : t.upper;
      l = { k: 'bin', op, l, r: this.parseAnd(), col: t.col };
    }
    return l;
  }

  private parseAnd(): Expr {
    let l = this.parseNot();
    while (this.isWord('AND') || this.isPunct('&')) {
      const t = this.peek()!;
      this.pos++;
      l = { k: 'bin', op: 'AND', l, r: this.parseNot(), col: t.col };
    }
    return l;
  }

  /** MASM precedence: NOT binds looser than + and - but tighter than AND. */
  private parseNot(): Expr {
    if (this.isWord('NOT')) {
      const t = this.peek()!;
      this.pos++;
      return { k: 'un', op: 'NOT', e: this.parseNot(), col: t.col };
    }
    return this.parseAdd();
  }

  private parseAdd(): Expr {
    let l = this.parseMul();
    while (this.isPunct('+') || this.isPunct('-')) {
      const t = this.peek()!;
      this.pos++;
      l = { k: 'bin', op: t.text, l, r: this.parseMul(), col: t.col };
    }
    return l;
  }

  private parseMul(): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (!t) break;
      const op = t.kind === 'punct' ? t.text : t.upper;
      if (!MUL_OPS.has(op)) break;
      this.pos++;
      l = { k: 'bin', op, l, r: this.parseUnary(), col: t.col };
    }
    return l;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (!t) this.error('expression expected');
    if (t.kind === 'punct' && (t.text === '-' || t.text === '+' || t.text === '~')) {
      this.pos++;
      return { k: 'un', op: t.text === '~' ? 'NOT' : t.text, e: this.parseUnary(), col: t.col };
    }
    if (t.kind === 'ident' && UNARY_KEYWORDS.has(t.upper)) {
      this.pos++;
      return { k: 'un', op: t.upper, e: this.parseUnary(), col: t.col };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    // `var[BX]`, `[BX][SI]`: juxtaposed brackets add.
    while (this.isPunct('[')) {
      const t = this.peek()!;
      const inner = this.parsePrimary();
      e = { k: 'bin', op: '+', l: e, r: inner, col: t.col };
    }
    return e;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (!t) this.error('expression expected');
    if (t.kind === 'num') {
      this.pos++;
      return { k: 'num', v: t.value, col: t.col };
    }
    if (t.kind === 'str') {
      this.pos++;
      return { k: 'str', chars: t.chars ?? [], col: t.col };
    }
    if (t.kind === 'punct') {
      if (t.text === '(') {
        this.pos++;
        const e = this.parse();
        this.expectPunct(')');
        return e;
      }
      if (t.text === '[') {
        this.pos++;
        const e = this.parse();
        this.expectPunct(']');
        return { k: 'mem', e, col: t.col };
      }
      this.error(`unexpected '${t.text}'`);
    }
    // identifier
    if (t.upper === '?' ) {
      this.pos++;
      return { k: 'undef', col: t.col };
    }
    if (t.upper === '$') {
      this.pos++;
      return { k: 'here', col: t.col };
    }
    const reg = lookupReg(t.upper);
    if (reg) {
      this.pos++;
      if (reg.isSeg && this.isPunct(':')) {
        this.pos++;
        return { k: 'seg', sreg: reg.code, e: this.parseUnary(), col: t.col };
      }
      return { k: 'reg', reg, col: t.col };
    }
    this.pos++;
    return { k: 'sym', name: t.upper, col: t.col, len: t.text.length };
  }
}

// ----------------------------------------------------------------- operands

export type SizeHint = 0 | 1 | 2 | 4;

export interface RegOperand { kind: 'reg'; reg: RegRef; col: number }
export interface ImmOperand { kind: 'imm'; expr: Expr; col: number }
export interface MemOperand {
  kind: 'mem';
  /** Explicit (PTR / b. / w.) or variable-implied size. */
  size: SizeHint;
  explicitSize: boolean;
  seg: number;
  base: number; // -1 | BX(3) | BP(5)
  index: number; // -1 | SI(6) | DI(7)
  disp: Expr | null;
  col: number;
}
export interface FarOperand { kind: 'far'; seg: Expr; off: Expr; col: number }

export type Operand = (RegOperand | ImmOperand | MemOperand | FarOperand) & {
  /** SHORT / NEAR / FAR qualifiers for jumps and calls. */
  distance?: 'short' | 'near' | 'far';
  ptrSize?: SizeHint;
};

export type SymbolKindLookup = (name: string) => { kind: string; size: number } | undefined;

const PTR_SIZES: Record<string, SizeHint> = { BYTE: 1, WORD: 2, DWORD: 4 };

/** Parses one comma-separated operand. */
export function parseOperand(toks: Token[], line: number, endCol: number, symbols: SymbolKindLookup): Operand {
  const p = new ExprParser(toks, line, endCol);
  const col = toks[0]?.col ?? endCol;
  let ptrSize: SizeHint = 0;
  let distance: Operand['distance'];
  // Qualifiers
  for (;;) {
    const t = p.peek();
    if (!t || t.kind !== 'ident') break;
    if (PTR_SIZES[t.upper] !== undefined && p.isWord('PTR', 1)) {
      ptrSize = PTR_SIZES[t.upper];
      p.pos += 2;
      continue;
    }
    if (t.upper === 'B.' || t.upper === 'W.') {
      ptrSize = t.upper === 'B.' ? 1 : 2;
      p.pos += 1;
      continue;
    }
    if (t.upper === 'SHORT') { distance = 'short'; p.pos++; continue; }
    if ((t.upper === 'NEAR' || t.upper === 'FAR') && p.isWord('PTR', 1)) {
      distance = t.upper === 'NEAR' ? 'near' : 'far';
      if (distance === 'far') ptrSize = 4;
      p.pos += 2;
      continue;
    }
    if (t.upper === 'FAR' || t.upper === 'NEAR') {
      distance = t.upper === 'NEAR' ? 'near' : 'far';
      p.pos++;
      continue;
    }
    break;
  }
  if (p.atEnd()) p.error('operand expected');
  const expr = p.parse();
  // seg:off far pointer literal (JMP 0F000h:0100h)
  if (p.isPunct(':')) {
    p.pos++;
    const off = p.parse();
    if (!p.atEnd()) p.error(`unexpected '${p.peek()!.text}'`);
    return { kind: 'far', seg: expr, off, col, distance: 'far' };
  }
  if (!p.atEnd()) p.error(`unexpected '${p.peek()!.text}' in operand`);
  const op = classify(expr, col, line, symbols, ptrSize);
  op.distance = distance;
  op.ptrSize = ptrSize;
  return op;
}

function containsMemSyntax(e: Expr, symbols: SymbolKindLookup): { bracket: boolean; reg: boolean; varSize: number } {
  // Variables are counted with their sign: `end_var - start_var` cancels out and
  // is a constant distance (MASM), while `var`, `var + 2` or `var[BX]` is memory.
  const res = { bracket: false, reg: false, varSize: 0 };
  let net = 0;
  let firstSize = 0;
  const walk = (x: Expr, inOffset: boolean, sign: number) => {
    switch (x.k) {
      case 'mem': res.bracket = true; walk(x.e, inOffset, sign); break;
      case 'reg': res.reg = true; break;
      case 'seg': res.bracket = true; walk(x.e, inOffset, sign); break;
      case 'sym': {
        if (inOffset) break;
        const s = symbols(x.name);
        if (s && s.kind === 'var') {
          net += sign;
          if (!firstSize && sign > 0) firstSize = s.size || 1;
        }
        break;
      }
      case 'un':
        walk(x.e, inOffset || ['OFFSET', 'LENGTH', 'SIZE', 'TYPE', 'SEG', 'HIGH', 'LOW', 'NOT'].includes(x.op), x.op === '-' ? -sign : sign);
        break;
      case 'bin':
        if (x.op === '+' || x.op === '-') {
          walk(x.l, inOffset, sign);
          walk(x.r, inOffset, x.op === '-' ? -sign : sign);
        } else {
          walk(x.l, inOffset, sign);
          walk(x.r, inOffset, sign);
        }
        break;
      default: break;
    }
  };
  walk(e, false, 1);
  if (net !== 0) res.varSize = firstSize || 1;
  return res;
}

function classify(expr: Expr, col: number, line: number, symbols: SymbolKindLookup, ptrSize: SizeHint): Operand {
  if (expr.k === 'reg') return { kind: 'reg', reg: expr.reg, col };
  const info = containsMemSyntax(expr, symbols);
  if (!info.bracket && !info.reg && !info.varSize) return { kind: 'imm', expr, col };

  // Memory operand: flatten the additive structure.
  let seg = -1;
  let base = -1;
  let index = -1;
  const disp: { e: Expr; neg: boolean }[] = [];
  const bad = (msg: string, at: number): never => {
    throw new AsmError(msg, line, at, 2);
  };
  const collect = (x: Expr, neg: boolean) => {
    switch (x.k) {
      case 'mem': collect(x.e, neg); return;
      case 'seg':
        if (seg >= 0) bad('more than one segment override', x.col);
        seg = x.sreg;
        collect(x.e, neg);
        return;
      case 'bin':
        if (x.op === '+') { collect(x.l, neg); collect(x.r, neg); return; }
        if (x.op === '-') { collect(x.l, neg); collect(x.r, !neg); return; }
        break;
      case 'reg': {
        const r = x.reg;
        if (neg) bad(`register ${r.name} cannot be subtracted in an address`, x.col);
        if (r.isSeg || r.size !== 2 || ![3, 5, 6, 7].includes(r.code)) {
          bad(`${r.name} cannot be used for addressing on the 8086; only BX, BP, SI and DI (e.g. [BX], [BP+SI+2])`, x.col);
        }
        if (r.code === 3 || r.code === 5) {
          if (base >= 0) bad(`only one base register (BX or BP) is allowed in an address`, x.col);
          base = r.code;
        } else {
          if (index >= 0) bad(`only one index register (SI or DI) is allowed in an address`, x.col);
          index = r.code;
        }
        return;
      }
      default:
        break;
    }
    if (hasReg(x)) bad('invalid use of a register inside an address expression', x.col);
    disp.push({ e: x, neg });
  };
  collect(expr, false);
  let d: Expr | null = null;
  for (const t of disp) {
    const term: Expr = t.neg ? { k: 'un', op: '-', e: t.e, col: t.e.col } : t.e;
    d = d ? { k: 'bin', op: '+', l: d, r: term, col: term.col } : term;
  }
  const size = (ptrSize || info.varSize) as SizeHint;
  return { kind: 'mem', size, explicitSize: ptrSize !== 0, seg, base, index, disp: d, col };
}

function hasReg(e: Expr): boolean {
  switch (e.k) {
    case 'reg': return true;
    case 'mem': case 'seg': case 'un': return hasReg(e.e);
    case 'bin': return hasReg(e.l) || hasReg(e.r);
    default: return false;
  }
}

/** Splits operand tokens on top-level commas. */
export function splitOperands(toks: Token[]): Token[][] {
  const out: Token[][] = [];
  let cur: Token[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.kind === 'punct') {
      if (t.text === '[' || t.text === '(') depth++;
      else if (t.text === ']' || t.text === ')') depth--;
      else if (t.text === ',' && depth === 0) {
        out.push(cur);
        cur = [];
        continue;
      }
    }
    cur.push(t);
  }
  out.push(cur);
  return out;
}
