/**
 * Multi-pass 8086 assembler for EMU8086/MASM-style source.
 *
 * Pipeline: lex + parse every line once into statements (the source text is
 * never modified) → iterate address-assignment passes until label values and
 * jump sizes are stable → final pass emits bytes, diagnostics and the
 * source map used by the debugger.
 */
import { lexLine, type Token } from './lexer';
import {
  ExprParser, lookupReg, parseOperand, splitOperands,
  type Expr, type MemOperand, type Operand, type RegOperand, type SymbolKindLookup,
} from './operand';
import {
  AsmError, type AssembleResult, type Diagnostic, type OutputType, type SourceMapEntry, type SymbolInfo,
} from './types';

// ------------------------------------------------------------ statements

interface Stmt {
  line: number;
  /** Column of the mnemonic/directive token (for diagnostics). */
  col: number;
  op: string; // upper-case mnemonic or directive ('' for label-only lines)
  opTok?: Token;
  prefixes: number[];
  args: Token[][];
  endCol: number;
  /** Label defined at this statement (colon label or variable name). */
  label?: { name: string; col: number };
  /** Enclosing PROC type for RET → RETF. */
  procFar: boolean;
  // pass state
  address: number;
  size: number;
  longJump: boolean;
  parsedOps?: Operand[];
}

interface Sym {
  name: string;
  kind: 'label' | 'var' | 'const' | 'proc';
  value: number;
  known: boolean;
  reloc: boolean;
  size: number;
  count: number;
  line: number;
  col: number;
  /** For `=` (redefinable) constants and EQU: the expression. */
  expr?: Expr;
  redefinable?: boolean;
  /** PROC FAR. */
  far?: boolean;
}

interface Val {
  v: number;
  known: boolean;
  reloc: boolean;
}

const DATA_DIRECTIVES: Record<string, number> = { DB: 1, DW: 2, DD: 4 };
const IGNORED_DIRECTIVES = new Set(['NAME', 'TITLE', 'PAGE', 'ASSUME', '.8086', '.186', 'SUBTTL', '.LIST', '.NOLIST']);
const UNSUPPORTED_DIRECTIVES: Record<string, string> = {
  SEGMENT: 'SEGMENT/ENDS (EXE programs) are not supported yet; write a COM program starting with ORG 100h',
  ENDS: 'SEGMENT/ENDS (EXE programs) are not supported yet; write a COM program starting with ORG 100h',
  '.MODEL': 'simplified segment directives (.MODEL/.DATA/.CODE/.STACK) are not supported yet; write a COM program starting with ORG 100h',
  '.DATA': 'simplified segment directives (.MODEL/.DATA/.CODE/.STACK) are not supported yet; write a COM program starting with ORG 100h',
  '.CODE': 'simplified segment directives (.MODEL/.DATA/.CODE/.STACK) are not supported yet; write a COM program starting with ORG 100h',
  '.STACK': 'simplified segment directives (.MODEL/.DATA/.CODE/.STACK) are not supported yet; write a COM program starting with ORG 100h',
  '.STARTUP': '.STARTUP is not supported yet',
  '.EXIT': '.EXIT is not supported yet; use MOV AX, 4C00h / INT 21h',
  INCLUDE: 'INCLUDE is not supported: library files such as emu8086.inc are not bundled (they are proprietary); paste the needed code directly',
  MACRO: 'MACRO definitions are not supported yet',
  ENDM: 'MACRO definitions are not supported yet',
  LOCAL: 'MACRO definitions are not supported yet',
  LABEL: 'the LABEL directive is not supported; use "name:" or a DB/DW variable',
  EXTRN: 'EXTRN/PUBLIC (multi-module programs) are not supported',
  PUBLIC: 'EXTRN/PUBLIC (multi-module programs) are not supported',
  DQ: 'DQ (quad word) is not supported; use DD or DW',
  '.RADIX': '.RADIX is not supported; numbers without a suffix are decimal (use the h, b, o suffixes)',
  DT: 'DT (ten bytes) is not supported',
};

const JCC: Record<string, number> = {
  JO: 0x70, JNO: 0x71, JB: 0x72, JC: 0x72, JNAE: 0x72, JAE: 0x73, JNB: 0x73, JNC: 0x73,
  JE: 0x74, JZ: 0x74, JNE: 0x75, JNZ: 0x75, JBE: 0x76, JNA: 0x76, JA: 0x77, JNBE: 0x77,
  JS: 0x78, JNS: 0x79, JP: 0x7a, JPE: 0x7a, JNP: 0x7b, JPO: 0x7b, JL: 0x7c, JNGE: 0x7c,
  JGE: 0x7d, JNL: 0x7d, JLE: 0x7e, JNG: 0x7e, JG: 0x7f, JNLE: 0x7f,
};
const LOOPS: Record<string, number> = { LOOPNE: 0xe0, LOOPNZ: 0xe0, LOOPE: 0xe1, LOOPZ: 0xe1, LOOP: 0xe2, JCXZ: 0xe3 };
const ALU_OPS: Record<string, number> = { ADD: 0, OR: 1, ADC: 2, SBB: 3, AND: 4, SUB: 5, XOR: 6, CMP: 7 };
const SHIFT_OPS: Record<string, number> = { ROL: 0, ROR: 1, RCL: 2, RCR: 3, SHL: 4, SAL: 4, SHR: 5, SAR: 7 };
const GROUP3: Record<string, number> = { NOT: 2, NEG: 3, MUL: 4, IMUL: 5, DIV: 6, IDIV: 7 };
const NO_OPERAND: Record<string, number[]> = {
  AAA: [0x37], AAS: [0x3f], DAA: [0x27], DAS: [0x2f], CBW: [0x98], CWD: [0x99],
  CLC: [0xf8], STC: [0xf9], CMC: [0xf5], CLD: [0xfc], STD: [0xfd], CLI: [0xfa], STI: [0xfb],
  HLT: [0xf4], NOP: [0x90], WAIT: [0x9b], FWAIT: [0x9b], INTO: [0xce], IRET: [0xcf],
  LAHF: [0x9f], SAHF: [0x9e], PUSHF: [0x9c], POPF: [0x9d],
  MOVSB: [0xa4], MOVSW: [0xa5], CMPSB: [0xa6], CMPSW: [0xa7], STOSB: [0xaa], STOSW: [0xab],
  LODSB: [0xac], LODSW: [0xad], SCASB: [0xae], SCASW: [0xaf], XLATB: [0xd7],
  PUSHA: [0x60], POPA: [0x61],
};
const PREFIXES: Record<string, number> = { REP: 0xf3, REPE: 0xf3, REPZ: 0xf3, REPNE: 0xf2, REPNZ: 0xf2, LOCK: 0xf0 };
const STRING_OPS: Record<string, number> = { MOVS: 0xa4, CMPS: 0xa6, STOS: 0xaa, LODS: 0xac, SCAS: 0xae };
const OTHER_MNEMONICS = [
  'MOV', 'PUSH', 'POP', 'XCHG', 'TEST', 'LEA', 'LDS', 'LES', 'INC', 'DEC', 'JMP', 'CALL', 'RET', 'RETN', 'RETF',
  'INT', 'IN', 'OUT', 'AAM', 'AAD', 'XLAT', 'ESC',
];
export const MNEMONICS = new Set<string>([
  ...Object.keys(JCC), ...Object.keys(LOOPS), ...Object.keys(ALU_OPS), ...Object.keys(SHIFT_OPS),
  ...Object.keys(GROUP3), ...Object.keys(NO_OPERAND), ...Object.keys(PREFIXES), ...Object.keys(STRING_OPS),
  ...OTHER_MNEMONICS,
]);
export const DIRECTIVES = new Set<string>([
  'ORG', 'DB', 'DW', 'DD', 'EQU', 'PROC', 'ENDP', 'END', 'DUP', 'OFFSET', 'PTR', 'BYTE', 'WORD', 'DWORD',
  'SHORT', 'NEAR', 'FAR', ...IGNORED_DIRECTIVES, ...Object.keys(UNSUPPORTED_DIRECTIVES),
]);

const RESERVED = new Set<string>([...MNEMONICS, ...DIRECTIVES, 'MOD', 'SHL', 'SHR', 'AND', 'OR', 'XOR', 'NOT', 'HIGH', 'LOW', 'LENGTH', 'SIZE', 'TYPE', 'SEG']);

export interface AssembleOptions {
  /** Upper bound on address-assignment passes. */
  maxPasses?: number;
}

export function assemble(source: string, options: AssembleOptions = {}): AssembleResult {
  return new Assembler(source).run(options.maxPasses ?? 40);
}

class Assembler {
  private readonly lines: string[];
  private readonly stmts: Stmt[] = [];
  private readonly syms = new Map<string, Sym>();
  private readonly textEqu = new Map<string, Token[]>();
  private readonly diags: Diagnostic[] = [];
  private readonly notes: string[] = [];
  private outputType: OutputType | null = null;
  private outputTypeLine = 0;
  private sawOrg100 = false;
  private endLabel: { expr: Expr; line: number; col: number } | null = null;
  private final = false;
  private here = 0;
  private changed = false;
  private readonly symbolKinds: SymbolKindLookup = (name) => {
    const s = this.syms.get(name);
    if (!s) return undefined;
    if (s.kind === 'const' && s.expr) {
      // `alias EQU var` (MASM text equate of a variable) is a memory reference
      const size = this.aliasVarSize(s.expr, new Set([name]));
      if (size) return { kind: 'var', size };
    }
    return { kind: s.kind, size: s.size };
  };

  /** Element size if the expression refers to a variable with a net positive sign (not under OFFSET etc.). */
  private aliasVarSize(e: Expr, seen: Set<string>): number {
    let net = 0;
    let size = 0;
    const walk = (x: Expr, sign: number) => {
      switch (x.k) {
        case 'sym': {
          if (seen.has(x.name)) return;
          const s = this.syms.get(x.name);
          if (!s) return;
          let sz = s.kind === 'var' ? s.size || 1 : 0;
          if (!sz && s.kind === 'const' && s.expr) {
            seen.add(x.name);
            sz = this.aliasVarSize(s.expr, seen);
          }
          if (sz) {
            net += sign;
            if (!size && sign > 0) size = sz;
          }
          return;
        }
        case 'bin':
          if (x.op === '+' || x.op === '-') { walk(x.l, sign); walk(x.r, x.op === '-' ? -sign : sign); }
          return;
        case 'un':
          if (x.op === '-') walk(x.e, -sign);
          else if (x.op === '+') walk(x.e, sign);
          return;
        default:
          return;
      }
    };
    walk(e, 1);
    return net > 0 ? size : 0;
  }
  binf: Record<string, number> = {};

  constructor(source: string) {
    this.lines = source.split(/\r\n|\r|\n/);
  }

  private error(e: unknown, fallbackLine: number): void {
    if (e instanceof AsmError) {
      this.diags.push({ severity: 'error', message: e.message, line: e.line, col: e.col, length: e.length });
    } else {
      this.diags.push({ severity: 'error', message: String(e instanceof Error ? e.message : e), line: fallbackLine, col: 1, length: 1 });
    }
  }

  private warn(message: string, line: number, col: number, length = 1): void {
    if (!this.diags.some((d) => d.line === line && d.message === message)) {
      this.diags.push({ severity: 'warning', message, line, col, length });
    }
  }

  // ------------------------------------------------------------ parsing
  private parseAll(): void {
    const procStack: { name: string; far: boolean; line: number; col: number }[] = [];
    let inComment: string | null = null;
    for (let i = 0; i < this.lines.length; i++) {
      const lineNo = i + 1;
      const text = this.lines[i];
      if (inComment !== null) {
        if (text.includes(inComment)) inComment = null;
        continue;
      }
      const trimmed = text.trim();
      if (trimmed.startsWith('#')) {
        try {
          this.parseHashDirective(trimmed, lineNo, text.indexOf('#') + 1);
        } catch (e) {
          this.error(e, lineNo);
        }
        continue;
      }
      try {
        const { tokens } = lexLine(text, lineNo);
        if (tokens.length === 0) continue;
        const toks = this.substituteTextEqu(tokens);
        if (toks.length >= 2 && toks[0].upper === 'COMMENT') {
          const delim = text.slice(toks[1].col - 1).trim()[0];
          const rest = text.slice(toks[1].col);
          if (!rest.includes(delim)) inComment = delim;
          continue;
        }
        const stop = this.parseStatement(toks, lineNo, text.length + 1, procStack);
        if (stop) break;
      } catch (e) {
        this.error(e, lineNo);
      }
    }
    for (const p of procStack) this.error(new AsmError(`no ENDP for: ${p.name}`, p.line, p.col, p.name.length), p.line);
  }

  private substituteTextEqu(tokens: Token[]): Token[] {
    if (this.textEqu.size === 0) return tokens;
    const out: Token[] = [];
    tokens.forEach((t, idx) => {
      const rep = t.kind === 'ident' && !(idx === 0 && tokens[1]?.upper === 'EQU') ? this.textEqu.get(t.upper) : undefined;
      if (rep) out.push(...rep.map((r) => ({ ...r, col: t.col })));
      else out.push(t);
    });
    return out;
  }

  private parseHashDirective(trimmed: string, line: number, col: number): void {
    const m = /^#\s*([A-Za-z_]+)\s*(?:=\s*([^#]*))?#?/.exec(trimmed);
    if (!m) throw new AsmError(`invalid # directive`, line, col, trimmed.length);
    const key = m[1].toUpperCase();
    const make = /^MAKE_(COM|BIN|BOOT|EXE)$/.exec(key);
    if (make) {
      if (this.outputType) throw new AsmError('output type is set here again!', line, col, trimmed.length);
      if (make[1] === 'EXE') throw new AsmError('#make_exe#: EXE output is not supported yet; use #make_com# with ORG 100h', line, col, trimmed.length);
      this.outputType = make[1] === 'COM' ? 'com' : 'bin';
      this.outputTypeLine = line;
      if (make[1] === 'BOOT') {
        this.binf.LOAD_SEGMENT = 0; this.binf.LOAD_OFFSET = 0x7c00; this.binf.CS = 0; this.binf.IP = 0x7c00;
      }
      return;
    }
    const regKeys = ['LOAD_SEGMENT', 'LOAD_OFFSET', 'AX', 'BX', 'CX', 'DX', 'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH',
      'CS', 'IP', 'DS', 'ES', 'SS', 'SP', 'SI', 'DI', 'BP'];
    if (regKeys.includes(key) && m[2] !== undefined) {
      const v = m[2].trim().replace(/h$/i, '');
      if (!/^[0-9a-f]+$/i.test(v)) throw new AsmError(`#${key}=...#: hexadecimal value expected`, line, col, trimmed.length);
      this.binf[key] = parseInt(v, 16) & 0xffff;
      return;
    }
    if (key === 'FASM' || key === 'MASM' || key === 'START' || key === 'MEM') {
      this.warn(`#${m[1]}# is not supported by emu8086-web and is ignored`, line, col, trimmed.length);
      return;
    }
    throw new AsmError(`unknown # directive: #${m[1]}#`, line, col, trimmed.length);
  }

  private newStmt(line: number, col: number, op: string, endCol: number, procFar: boolean): Stmt {
    return { line, col, op, prefixes: [], args: [], endCol, procFar, address: 0, size: 0, longJump: false };
  }

  /** Returns true when END was reached. */
  private parseStatement(
    toks: Token[], line: number, endCol: number,
    procStack: { name: string; far: boolean; line: number; col: number }[],
  ): boolean {
    let k = 0;
    const procFar = procStack.length > 0 && procStack[procStack.length - 1].far;
    // `label:`
    if (toks.length >= 2 && toks[0].kind === 'ident' && toks[1].kind === 'punct' && toks[1].text === ':' && !lookupReg(toks[0].upper)) {
      const name = toks[0];
      this.checkName(name, line);
      const st = this.newStmt(line, name.col, '', endCol, procFar);
      st.label = { name: name.upper, col: name.col };
      const nextIsData = toks[2] && DATA_DIRECTIVES[toks[2].upper] !== undefined;
      this.defineSymbol(name, line, nextIsData ? 'var' : 'label', nextIsData ? DATA_DIRECTIVES[toks[2].upper] : 0);
      k = 2;
      if (k >= toks.length) {
        this.stmts.push(st);
        return false;
      }
      if (nextIsData) {
        st.op = toks[2].upper;
        st.opTok = toks[2];
        st.col = toks[2].col;
        st.args = splitOperands(toks.slice(3));
        this.stmts.push(st);
        this.setVarCount(name.upper, st);
        return false;
      }
      this.stmts.push(st);
    }
    const first = toks[k];
    if (first.kind !== 'ident') throw new AsmError(`instruction or directive expected, found '${first.text}'`, line, first.col, first.text.length);

    // `name <directive> ...`
    const second = toks[k + 1];
    if (second && (second.kind === 'ident' || (second.kind === 'punct' && second.text === '='))) {
      const d = second.upper;
      if (DATA_DIRECTIVES[d] !== undefined && !MNEMONICS.has(first.upper)) {
        this.checkName(first, line);
        this.defineSymbol(first, line, 'var', DATA_DIRECTIVES[d]);
        const st = this.newStmt(line, second.col, d, endCol, procFar);
        st.opTok = second;
        st.label = { name: first.upper, col: first.col };
        st.args = splitOperands(toks.slice(k + 2));
        this.stmts.push(st);
        this.setVarCount(first.upper, st);
        return false;
      }
      if (d === 'EQU' || d === '=') {
        this.checkName(first, line);
        this.parseEqu(first, toks.slice(k + 2), line, endCol, d === '=');
        return false;
      }
      if (d === 'PROC') {
        this.checkName(first, line);
        const attr = toks[k + 2]?.upper;
        const far = attr === 'FAR';
        if (attr && attr !== 'FAR' && attr !== 'NEAR') throw new AsmError(`PROC type must be NEAR or FAR`, line, toks[k + 2].col, toks[k + 2].text.length);
        this.defineSymbol(first, line, 'proc', 0).far = far;
        const st = this.newStmt(line, first.col, '', endCol, far);
        st.label = { name: first.upper, col: first.col };
        this.stmts.push(st);
        procStack.push({ name: first.upper, far, line, col: first.col });
        return false;
      }
      if (d === 'ENDP') {
        const top = procStack.pop();
        if (!top) throw new AsmError(`ENDP without matching PROC: ${first.text}`, line, first.col, first.text.length);
        if (top.name !== first.upper) {
          procStack.push(top);
          throw new AsmError(`ENDP name '${first.text}' does not match PROC '${top.name}'`, line, first.col, first.text.length);
        }
        return false;
      }
      if (UNSUPPORTED_DIRECTIVES[d] && !MNEMONICS.has(first.upper)) {
        throw new AsmError(UNSUPPORTED_DIRECTIVES[d], line, second.col, second.text.length);
      }
    }

    // Prefixes (REP MOVSB, LOCK ...)
    const prefixes: number[] = [];
    while (toks[k] && PREFIXES[toks[k].upper] !== undefined && toks[k + 1]) {
      prefixes.push(PREFIXES[toks[k].upper]);
      k++;
    }
    const opTok = toks[k];
    if (opTok.kind !== 'ident') throw new AsmError(`instruction expected, found '${opTok.text}'`, line, opTok.col, opTok.text.length);
    const op = opTok.upper;
    const rest = toks.slice(k + 1);

    if (op === 'END') {
      if (rest.length) {
        const p = new ExprParser(rest, line, endCol);
        this.endLabel = { expr: p.parse(), line, col: rest[0].col };
      }
      return true;
    }
    if (IGNORED_DIRECTIVES.has(op)) return false;
    if (UNSUPPORTED_DIRECTIVES[op]) throw new AsmError(UNSUPPORTED_DIRECTIVES[op], line, opTok.col, opTok.text.length);
    if (op === 'PROC' || op === 'ENDP' || op === 'EQU') throw new AsmError(`${op} needs a name before it (e.g. "myproc ${op}")`, line, opTok.col, opTok.text.length);

    const isKnown = MNEMONICS.has(op) || op === 'ORG' || DATA_DIRECTIVES[op] !== undefined;
    if (!isKnown) {
      if (rest.length === 0 && /^[A-Z_.@?$][A-Z0-9_.@?$]*$/.test(op)) {
        throw new AsmError(`unknown instruction or directive '${opTok.text}' (labels must end with ':')`, line, opTok.col, opTok.text.length);
      }
      throw new AsmError(`unknown instruction or directive '${opTok.text}'`, line, opTok.col, opTok.text.length);
    }
    const st = this.newStmt(line, opTok.col, op, endCol, procFar);
    st.opTok = opTok;
    st.prefixes = prefixes;
    st.args = rest.length ? splitOperands(rest) : [];
    if (op === 'ORG') this.checkOrg(st);
    this.stmts.push(st);
    return false;
  }

  private checkOrg(st: Stmt): void {
    if (st.args.length !== 1 || st.args[0].length === 0) throw new AsmError('ORG needs one address operand (e.g. ORG 100h)', st.line, st.col, 3);
    const p = new ExprParser(st.args[0], st.line, st.endCol);
    const e = p.parse();
    if (e.k === 'num' && e.v === 0x100) this.sawOrg100 = true;
  }

  private checkName(t: Token, line: number): void {
    if (RESERVED.has(t.upper) || lookupReg(t.upper)) {
      throw new AsmError(`'${t.text}' is a reserved word and cannot be used as a name`, line, t.col, t.text.length);
    }
    if (/^[0-9]/.test(t.text)) throw new AsmError(`names cannot start with a digit: '${t.text}'`, line, t.col, t.text.length);
  }

  private defineSymbol(t: Token, line: number, kind: Sym['kind'], size: number): Sym {
    const existing = this.syms.get(t.upper);
    if (existing) throw new AsmError(`duplicate declaration of: ${t.text} (first declared on line ${existing.line})`, line, t.col, t.text.length);
    const s: Sym = { name: t.upper, kind, value: 0, known: false, reloc: kind !== 'const', size, count: 1, line, col: t.col };
    this.syms.set(t.upper, s);
    return s;
  }

  private setVarCount(name: string, st: Stmt): void {
    const s = this.syms.get(name);
    if (!s) return;
    // Element count = number of top-level items (DUP counts are resolved during passes).
    s.count = 0;
    (st as Stmt & { varName?: string }).varName = name;
  }

  private parseEqu(name: Token, rhs: Token[], line: number, endCol: number, redefinable: boolean): void {
    if (rhs.length === 0) throw new AsmError(`${redefinable ? '=' : 'EQU'} needs a value`, line, name.col, name.text.length);
    let expr: Expr | null = null;
    try {
      const p = new ExprParser(rhs, line, endCol);
      expr = p.parse();
      if (!p.atEnd()) expr = null;
      if (expr && containsRegOrMem(expr)) expr = null;
    } catch {
      expr = null;
    }
    if (expr && expr.k === 'str' && expr.chars.length > 2) expr = null; // a string equate is text
    if (!expr) {
      if (redefinable) throw new AsmError(`'=' needs a numeric expression`, line, rhs[0].col, rhs[0].text.length);
      this.textEqu.set(name.upper, rhs);
      return;
    }
    const existing = this.syms.get(name.upper);
    if (existing) {
      if (!(redefinable && existing.redefinable)) {
        throw new AsmError(`duplicate declaration of: ${name.text} (first declared on line ${existing.line})`, line, name.col, name.text.length);
      }
    }
    // Constants are evaluated in source order during passes via a pseudo-statement.
    const sym: Sym = existing ?? { name: name.upper, kind: 'const', value: 0, known: false, reloc: false, size: 0, count: 1, line, col: name.col, redefinable };
    if (!redefinable) sym.expr = expr;
    this.syms.set(name.upper, sym);
    const st = this.newStmt(line, name.col, '=CONST', endCol, false);
    st.label = { name: name.upper, col: name.col };
    (st as Stmt & { constExpr?: Expr }).constExpr = expr;
    this.stmts.push(st);
  }

  // --------------------------------------------------------- evaluation
  private evaluate(e: Expr, line: number): Val {
    switch (e.k) {
      case 'num': return { v: e.v, known: true, reloc: false };
      case 'str': {
        if (e.chars.length === 0) throw new AsmError('empty character constant', line, e.col);
        if (e.chars.length > 2) throw new AsmError(`string '${String.fromCharCode(...e.chars)}' is too long for a numeric value (max 2 characters)`, line, e.col, e.chars.length + 2);
        const v = e.chars.length === 1 ? e.chars[0] : (e.chars[0] << 8) | e.chars[1];
        return { v, known: true, reloc: false };
      }
      case 'here': return { v: this.here, known: true, reloc: true };
      case 'undef': return { v: 0, known: true, reloc: false };
      case 'sym': {
        const s = this.syms.get(e.name);
        if (!s) {
          if (this.final) {
            const hexHint = /^[A-F][0-9A-F_]*H$/.test(e.name)
              ? `; hexadecimal numbers must start with a digit: write 0${e.name.slice(0, -1)}h`
              : '';
            throw new AsmError(`undefined symbol '${e.name}'${hexHint}`, line, e.col, e.len);
          }
          return { v: 0, known: false, reloc: false };
        }
        if (!s.known && this.final) throw new AsmError(`symbol '${e.name}' has no value here (forward reference to a constant)`, line, e.col, e.len);
        return { v: s.value, known: s.known, reloc: s.reloc };
      }
      case 'reg': throw new AsmError(`register ${e.reg.name} is not allowed in this expression`, line, e.col, e.reg.name.length);
      case 'mem': throw new AsmError('memory reference is not allowed in this expression', line, e.col);
      case 'seg': throw new AsmError('segment override is not allowed in this expression', line, e.col);
      case 'dup': throw new AsmError('DUP is only allowed in DB/DW/DD', line, e.col);
      case 'un': {
        if (e.op === 'LENGTH' || e.op === 'SIZE' || e.op === 'TYPE') {
          if (e.e.k !== 'sym') throw new AsmError(`${e.op} needs a variable name`, line, e.col);
          const s = this.syms.get(e.e.name);
          if (!s) {
            if (this.final) throw new AsmError(`undefined symbol '${e.e.name}'`, line, e.e.col, e.e.len);
            return { v: 0, known: false, reloc: false };
          }
          const v = e.op === 'LENGTH' ? s.count : e.op === 'SIZE' ? s.count * s.size : s.size;
          return { v, known: true, reloc: false };
        }
        if (e.op === 'SEG') throw new AsmError('SEG is not supported (COM programs have a single segment; use CS)', line, e.col, 3);
        const a = this.evaluate(e.e, line);
        let v = a.v;
        switch (e.op) {
          case '-': v = -a.v; break;
          case '+': break;
          case 'NOT': v = ~a.v; break;
          case 'OFFSET': break;
          case 'HIGH': v = (a.v >> 8) & 0xff; break;
          case 'LOW': v = a.v & 0xff; break;
        }
        return { v, known: a.known, reloc: e.op === 'OFFSET' ? a.reloc : a.reloc && (e.op === '+') };
      }
      case 'bin': {
        const a = this.evaluate(e.l, line);
        const b = this.evaluate(e.r, line);
        let v: number;
        switch (e.op) {
          case '+': v = a.v + b.v; break;
          case '-': v = a.v - b.v; break;
          case '*': v = a.v * b.v; break;
          case '/':
          case 'MOD':
            if (b.known && b.v === 0) {
              if (this.final) throw new AsmError('division by zero in expression', line, e.col);
              v = 0;
            } else v = e.op === '/' ? Math.trunc(a.v / (b.v || 1)) : a.v % (b.v || 1);
            break;
          case 'SHL': v = a.v << b.v; break;
          case 'SHR': v = a.v >>> b.v; break;
          case 'AND': v = a.v & b.v; break;
          case 'OR': v = a.v | b.v; break;
          case 'XOR': v = a.v ^ b.v; break;
          default: throw new AsmError(`unsupported operator ${e.op}`, line, e.col);
        }
        // label - label is an absolute distance; label + n stays relocatable
        const reloc = e.op === '-' ? a.reloc !== b.reloc : e.op === '+' ? a.reloc || b.reloc : a.reloc || b.reloc;
        return { v, known: a.known && b.known, reloc };
      }
    }
  }

  // ------------------------------------------------------------- passes
  run(maxPasses: number): AssembleResult {
    this.parseAll();
    const parseErrors = this.diags.some((d) => d.severity === 'error');
    let origin = -1;
    let pass = 0;
    // Address-assignment passes.
    for (; pass < maxPasses; pass++) {
      this.changed = false;
      this.runPass();
      if (!this.changed && pass > 0) break;
    }
    if (pass >= maxPasses) {
      this.diags.push({ severity: 'error', message: `addresses did not stabilise after ${maxPasses} passes`, line: 1, col: 1, length: 1 });
    }
    // Final emission pass.
    this.final = true;
    const image = new Map<number, number>();
    const sourceMap: SourceMapEntry[] = [];
    this.runPass((st, bytes) => {
      if (bytes.length === 0) return;
      if (origin < 0) origin = st.address;
      for (let i = 0; i < bytes.length; i++) {
        const a = st.address + i;
        if (a > 0xffff) {
          throw new AsmError('code/data exceeds the 64 KB segment', st.line, st.col);
        }
        if (image.has(a)) throw new AsmError(`overlapping output at offset ${a.toString(16).toUpperCase()}h (check ORG)`, st.line, st.col);
        image.set(a, bytes[i]);
      }
      sourceMap.push({ line: st.line, address: st.address, length: bytes.length, isData: DATA_DIRECTIVES[st.op] !== undefined });
    });

    // Output type
    let outputType: OutputType = this.outputType ?? (this.sawOrg100 ? 'com' : 'bin');
    if (this.outputType === 'com' && !this.sawOrg100) {
      this.diags.push({ severity: 'error', message: 'COM file not built, aborted - ORG 100h not found!', line: this.outputTypeLine || 1, col: 1, length: 1 });
    }
    let start = Infinity;
    let end = -1;
    for (const a of image.keys()) {
      if (a < start) start = a;
      if (a + 1 > end) end = a + 1;
    }
    if (end < 0) {
      start = outputType === 'com' ? 0x100 : 0;
      end = start;
    }
    if (outputType === 'com' && start < 0x100) {
      const st = sourceMap.find((m) => m.address < 0x100);
      this.diags.push({ severity: 'error', message: 'code or data placed before ORG 100h (offset < 100h) cannot be part of a COM file', line: st?.line ?? 1, col: 1, length: 1 });
    }
    const imgOrigin = outputType === 'com' ? 0x100 : start;
    const bytes = new Uint8Array(Math.max(0, end - imgOrigin));
    for (const [a, v] of image) if (a >= imgOrigin) bytes[a - imgOrigin] = v;

    let entry = imgOrigin;
    if (this.endLabel) {
      try {
        const v = this.evaluate(this.endLabel.expr, this.endLabel.line);
        entry = v.v & 0xffff;
        if (outputType === 'com' && entry !== 0x100) {
          throw new AsmError('wrong entry point! COM programs must start at offset 100h (END label must be the first instruction)', this.endLabel.line, this.endLabel.col);
        }
      } catch (e) {
        this.error(e, this.endLabel.line);
      }
    }
    if (outputType === 'bin' && this.binf.IP !== undefined) entry = this.binf.IP;
    const symbols: SymbolInfo[] = [...this.syms.values()].map((s) => ({
      name: s.name, kind: s.kind, value: s.value & 0xffff, size: s.size, count: s.count, line: s.line,
    }));
    this.diags.sort((a, b) => a.line - b.line || a.col - b.col);
    const ok = !parseErrors && !this.diags.some((d) => d.severity === 'error');
    if (!ok) outputType = outputType ?? 'com';
    return {
      ok,
      diagnostics: this.diags,
      outputType,
      origin: imgOrigin,
      bytes,
      entry,
      sourceMap,
      symbols,
      notes: this.notes,
      binf: this.binf,
    } as AssembleResult;
  }

  private runPass(emit?: (st: Stmt, bytes: number[]) => void): void {
    let lc = 0;
    for (const st of this.stmts) {
      st.address = lc;
      this.here = lc;
      if (st.label && st.op !== '=CONST') {
        const s = this.syms.get(st.label.name);
        if (s && (s.value !== lc || !s.known)) {
          s.value = lc;
          s.known = true;
          this.changed = true;
        }
      }
      try {
        if (st.op === '=CONST') {
          const s = this.syms.get(st.label!.name)!;
          const cst = st as Stmt & { constExpr: Expr; prevValue?: number; prevKnown?: boolean };
          const v = this.evaluate(cst.constExpr, st.line);
          // compare with this statement's value in the previous pass ('=' may redefine the symbol later)
          if (cst.prevValue !== v.v || cst.prevKnown !== v.known) this.changed = true;
          cst.prevValue = v.v;
          cst.prevKnown = v.known;
          s.value = v.v;
          s.known = v.known;
          s.reloc = v.reloc;
          continue;
        }
        if (st.op === 'ORG') {
          const v = this.evaluate(new ExprParser(st.args[0], st.line, st.endCol).parse(), st.line);
          if (!v.known) throw new AsmError('ORG address must be known (no forward references)', st.line, st.col, 3);
          if (v.v < 0 || v.v > 0xffff) throw new AsmError('ORG address out of range', st.line, st.col, 3);
          lc = v.v;
          continue;
        }
        if (st.op === '') continue;
        const bytes = this.encode(st);
        if (bytes.length !== st.size) {
          st.size = bytes.length;
          this.changed = true;
        }
        if (emit) emit(st, bytes);
        lc += bytes.length;
      } catch (e) {
        if (this.final) this.error(e, st.line);
        else if (e instanceof AsmError && !/undefined symbol|has no value/.test(e.message)) {
          // Structural errors do not depend on pass; report them once in the final pass.
        }
        lc += st.size;
      }
    }
  }

  // ------------------------------------------------------------ encoding
  private operands(st: Stmt): Operand[] {
    if (!st.parsedOps) {
      st.parsedOps = st.args.map((a, i) => {
        if (a.length === 0) {
          const at = i === 0 ? st.endCol : st.args[i - 1][st.args[i - 1].length - 1]?.col ?? st.endCol;
          throw new AsmError(`missing operand ${i + 1} for ${st.op}`, st.line, at, 1);
        }
        return parseOperand(a, st.line, st.endCol, this.symbolKinds);
      });
    }
    return st.parsedOps;
  }

  private val(e: Expr, line: number): Val {
    return this.evaluate(e, line);
  }

  private expectCount(st: Stmt, ops: Operand[], n: number | number[]): void {
    const allowed = Array.isArray(n) ? n : [n];
    if (!allowed.includes(ops.length)) {
      const want = allowed.map((x) => (x === 0 ? 'no operands' : `${x} operand${x > 1 ? 's' : ''}`)).join(' or ');
      throw new AsmError(`wrong parameters: ${st.op} takes ${want}`, st.line, st.col, st.op.length);
    }
  }

  private imm(st: Stmt, o: Operand, size: 1 | 2): number {
    if (o.kind !== 'imm') throw new AsmError('immediate value expected', st.line, o.col);
    const v = this.val(o.expr, st.line);
    if (this.final && v.known) {
      if (size === 1 && (v.v < -128 || v.v > 255)) {
        throw new AsmError(`operands do not match: second operand is over 8 bits (value ${v.v})`, st.line, o.col, 1);
      }
      if (size === 2 && (v.v < -32768 || v.v > 0xffff)) {
        throw new AsmError(`value ${v.v} does not fit in 16 bits`, st.line, o.col, 1);
      }
    }
    return v.v & (size === 1 ? 0xff : 0xffff);
  }

  /** ModR/M + displacement bytes (segment prefix handled by caller). */
  private modrm(st: Stmt, regField: number, o: RegOperand | MemOperand): number[] {
    if (o.kind === 'reg') return [0xc0 | (regField << 3) | o.reg.code];
    const r = regField << 3;
    if (o.base < 0 && o.index < 0) {
      const d = o.disp ? this.val(o.disp, st.line).v & 0xffff : 0;
      return [r | 6, d & 0xff, d >> 8];
    }
    const rmTable: Record<string, number> = { '3,6': 0, '3,7': 1, '5,6': 2, '5,7': 3, '-1,6': 4, '-1,7': 5, '5,-1': 6, '3,-1': 7 };
    const rm = rmTable[`${o.base},${o.index}`];
    if (!o.disp) {
      if (rm === 6) return [0x40 | r | rm, 0]; // [BP] needs disp8 = 0
      return [r | rm];
    }
    const v = this.val(o.disp, st.line);
    const d = v.v & 0xffff;
    if (v.known && !v.reloc && v.v === 0 && rm !== 6) return [r | rm];
    if (v.known && !v.reloc && v.v >= -128 && v.v <= 127) return [0x40 | r | rm, v.v & 0xff];
    return [0x80 | r | rm, d & 0xff, d >> 8];
  }

  private segPrefix(o: Operand): number[] {
    return o.kind === 'mem' && o.seg >= 0 ? [0x26 | (o.seg << 3)] : [];
  }

  private memSize(st: Stmt, m: MemOperand, other?: Operand): 1 | 2 {
    const otherSize = other && other.kind === 'reg' ? other.reg.size : 0;
    if (m.size === 4) throw new AsmError('DWORD operands are only valid for far JMP/CALL', st.line, m.col);
    if (m.size && otherSize && m.size !== otherSize) {
      const which = m.explicitSize ? 'the PTR size' : 'the variable size';
      throw new AsmError(`operands do not match: ${which} (${m.size === 1 ? 'byte' : 'word'}) differs from register ${other!.kind === 'reg' ? other!.reg.name : ''} (${otherSize === 1 ? 'byte' : 'word'})`, st.line, m.col);
    }
    const size = (m.size || otherSize) as 0 | 1 | 2;
    if (!size) {
      throw new AsmError('operand size is unknown: use BYTE PTR / WORD PTR (or b. / w.), e.g. MOV BYTE PTR [BX], 5', st.line, m.col);
    }
    return size;
  }

  private regOrMem(st: Stmt, o: Operand, what: string): asserts o is RegOperand | MemOperand {
    if (o.kind !== 'reg' && o.kind !== 'mem') throw new AsmError(`${what}: register or memory operand expected`, st.line, o.col);
  }

  private encode(st: Stmt): number[] {
    const op = st.op;
    if (DATA_DIRECTIVES[op] !== undefined) return this.encodeData(st, DATA_DIRECTIVES[op]);
    const pre = st.prefixes;
    const body = this.encodeInstruction(st);
    return pre.length ? [...pre, ...body] : body;
  }

  private encodeData(st: Stmt, size: number): number[] {
    const out: number[] = [];
    let count = 0;
    const emitValue = (e: Expr, toks: Token[]) => {
      if (e.k === 'str' && (size === 1 || e.chars.length > 2)) {
        if (size !== 1) throw new AsmError(`DW cannot be used to declare strings (use DB)`, st.line, e.col);
        out.push(...e.chars);
        count += e.chars.length;
        return;
      }
      const v = this.val(e, st.line);
      if (this.final && v.known) {
        if (size === 1 && (v.v < -128 || v.v > 255)) throw new AsmError(`value ${v.v} does not fit in a byte (DB)`, st.line, toks[0]?.col ?? e.col);
        if (size === 2 && (v.v < -32768 || v.v > 0xffff)) throw new AsmError(`value ${v.v} does not fit in a word (DW)`, st.line, toks[0]?.col ?? e.col);
      }
      for (let i = 0; i < size; i++) out.push((v.v >> (8 * i)) & 0xff);
      count++;
    };
    const items = (groups: Token[][], depth: number) => {
      for (const g of groups) {
        if (g.length === 0) throw new AsmError(`missing value in ${st.op} list`, st.line, st.col);
        const dupIdx = g.findIndex((t) => t.upper === 'DUP');
        if (dupIdx >= 0) {
          const countExpr = new ExprParser(g.slice(0, dupIdx), st.line, st.endCol).parse();
          const n = this.val(countExpr, st.line);
          if (!n.known) throw new AsmError('DUP count must be a known constant', st.line, g[0].col);
          if (n.v < 0 || n.v > 0x10000) throw new AsmError('DUP count out of range', st.line, g[0].col);
          const open = g[dupIdx + 1];
          const close = g[g.length - 1];
          if (!open || open.text !== '(' || close.text !== ')') throw new AsmError('DUP needs parentheses: n DUP(value)', st.line, g[dupIdx].col, 3);
          const inner = splitOperands(g.slice(dupIdx + 2, g.length - 1));
          const before = count;
          const startLen = out.length;
          items(inner, depth + 1);
          const chunk = out.slice(startLen);
          const chunkCount = count - before;
          if (startLen + chunk.length * n.v > 0x10000) {
            throw new AsmError('DUP data exceeds the 64 KB segment', st.line, g[0].col, g[dupIdx].col - g[0].col + 3);
          }
          for (let i = 1; i < n.v; i++) {
            out.push(...chunk);
            count += chunkCount;
          }
          if (n.v === 0) {
            out.length = startLen;
            count = before;
          }
          continue;
        }
        const p = new ExprParser(g, st.line, st.endCol);
        const e = p.parse();
        if (!p.atEnd()) {
          const t = p.peek()!;
          throw new AsmError(`unexpected '${t.text}' in ${st.op} list (missing comma?)`, st.line, t.col, t.text.length);
        }
        emitValue(e, g);
      }
    };
    if (st.args.length === 0) throw new AsmError(`${st.op} needs at least one value`, st.line, st.col, st.op.length);
    items(st.args, 0);
    const varName = (st as Stmt & { varName?: string }).varName ?? st.label?.name;
    if (varName) {
      const s = this.syms.get(varName);
      if (s && s.kind === 'var') s.count = count;
    }
    return out;
  }

  private encodeInstruction(st: Stmt): number[] {
    const op = st.op;
    const ops = this.operands(st);
    const L = st.line;

    if (NO_OPERAND[op]) {
      if (op === 'PUSHA' || op === 'POPA') {
        this.warn(`${op} is an 80186 instruction (accepted for EMU8086 compatibility)`, L, st.col, op.length);
      }
      if (op === 'XLATB' && ops.length === 1) return [...this.segPrefix(ops[0]), 0xd7];
      this.expectCount(st, ops, 0);
      return [...NO_OPERAND[op]];
    }
    if (JCC[op] !== undefined) return this.encodeJcc(st, ops, JCC[op]);
    if (LOOPS[op] !== undefined) return this.encodeLoop(st, ops, LOOPS[op]);
    if (ALU_OPS[op] !== undefined) return this.encodeAlu(st, ops, ALU_OPS[op]);
    if (SHIFT_OPS[op] !== undefined) return this.encodeShift(st, ops, SHIFT_OPS[op]);
    if (GROUP3[op] !== undefined) {
      this.expectCount(st, ops, 1);
      const o = ops[0];
      if (o.kind === 'imm' && op === 'IMUL') throw new AsmError('IMUL with immediate operands is an 80186 instruction; on the 8086 use IMUL reg/mem', L, o.col);
      this.regOrMem(st, o, op);
      const size = o.kind === 'reg' ? o.reg.size : this.memSize(st, o);
      if (o.kind === 'reg' && o.reg.isSeg) throw new AsmError(`${op} cannot use a segment register`, L, o.col);
      return [...this.segPrefix(o), size === 1 ? 0xf6 : 0xf7, ...this.modrm(st, GROUP3[op], o)];
    }
    if (STRING_OPS[op] !== undefined) return this.encodeStringOp(st, ops, STRING_OPS[op]);
    if (PREFIXES[op] !== undefined) {
      this.expectCount(st, ops, 0);
      return [PREFIXES[op]];
    }

    switch (op) {
      case 'MOV': return this.encodeMov(st, ops);
      case 'PUSH':
      case 'POP': {
        this.expectCount(st, ops, 1);
        const o = ops[0];
        const push = op === 'PUSH';
        if (o.kind === 'reg') {
          if (o.reg.isSeg) {
            if (!push && o.reg.code === 1) throw new AsmError('POP CS is not allowed', L, o.col);
            return [(push ? 0x06 : 0x07) | (o.reg.code << 3)];
          }
          if (o.reg.size !== 2) throw new AsmError(`${op} needs a 16-bit operand (${o.reg.name} is 8-bit)`, L, o.col);
          return [(push ? 0x50 : 0x58) + o.reg.code];
        }
        if (o.kind === 'mem') {
          if (o.size === 1) throw new AsmError(`${op} needs a 16-bit operand`, L, o.col);
          return [...this.segPrefix(o), push ? 0xff : 0x8f, ...this.modrm(st, push ? 6 : 0, o)];
        }
        if (o.kind === 'imm' && push) {
          this.warn('PUSH immediate is an 80186 instruction (accepted for EMU8086 compatibility)', L, st.col, 4);
          const v = this.imm(st, o, 2);
          return [0x68, v & 0xff, v >> 8];
        }
        throw new AsmError(`${op}: register or memory operand expected`, L, o.col);
      }
      case 'XCHG': {
        this.expectCount(st, ops, 2);
        let [a, b] = ops;
        this.regOrMem(st, a, op);
        this.regOrMem(st, b, op);
        if (a.kind === 'mem' && b.kind === 'mem') throw new AsmError('XCHG cannot exchange two memory operands', L, b.col);
        if ((a.kind === 'reg' && a.reg.isSeg) || (b.kind === 'reg' && b.reg.isSeg)) throw new AsmError('XCHG cannot use segment registers', L, a.col);
        if (a.kind === 'reg' && b.kind === 'reg') {
          if (a.reg.size !== b.reg.size) throw new AsmError(`operands do not match: ${a.reg.name} and ${b.reg.name} have different sizes`, L, b.col);
          if (a.reg.size === 2 && a.reg.code === 0) return [0x90 + b.reg.code];
          if (a.reg.size === 2 && b.reg.code === 0) return [0x90 + a.reg.code];
          // XCHG r/m, reg: the first register goes in r/m (MASM form)
          return [a.reg.size === 1 ? 0x86 : 0x87, ...this.modrm(st, b.reg.code, a)];
        }
        if (a.kind === 'mem') [a, b] = [b, a];
        const ra = a as RegOperand;
        if (b.kind === 'reg') throw new AsmError('XCHG: invalid operands', L, b.col);
        const size = this.memSize(st, b, ra);
        return [...this.segPrefix(b), size === 1 ? 0x86 : 0x87, ...this.modrm(st, ra.reg.code, b)];
      }
      case 'TEST': {
        this.expectCount(st, ops, 2);
        let [a, b] = ops;
        if (a.kind === 'imm') [a, b] = [b, a];
        this.regOrMem(st, a, op);
        if (a.kind === 'reg' && a.reg.isSeg) throw new AsmError('TEST cannot use segment registers', L, a.col);
        if (b.kind === 'imm') {
          const size = a.kind === 'reg' ? a.reg.size : this.memSize(st, a);
          if (a.kind === 'reg' && a.reg.code === 0) {
            return size === 1 ? [0xa8, this.imm(st, b, 1)] : [0xa9, ...le16(this.imm(st, b, 2))];
          }
          const im = size === 1 ? [this.imm(st, b, 1)] : le16(this.imm(st, b, 2));
          return [...this.segPrefix(a), size === 1 ? 0xf6 : 0xf7, ...this.modrm(st, 0, a), ...im];
        }
        this.regOrMem(st, b, op);
        if (a.kind === 'mem' && b.kind === 'mem') throw new AsmError('TEST cannot use two memory operands', L, b.col);
        // TEST r/m, reg: with two registers the first goes in r/m (MASM form).
        const reg = (b.kind === 'reg' ? b : a) as RegOperand;
        const rm = b.kind === 'reg' ? a : b;
        if (rm.kind === 'reg' && rm.reg.size !== reg.reg.size) throw new AsmError('operands do not match: different register sizes', L, rm.col);
        const size = rm.kind === 'reg' ? rm.reg.size : this.memSize(st, rm as MemOperand, reg);
        return [...this.segPrefix(rm), size === 1 ? 0x84 : 0x85, ...this.modrm(st, reg.reg.code, rm as RegOperand | MemOperand)];
      }
      case 'LEA':
      case 'LDS':
      case 'LES': {
        this.expectCount(st, ops, 2);
        const [a, bRaw] = ops;
        if (a.kind !== 'reg' || a.reg.size !== 2 || a.reg.isSeg) throw new AsmError(`${op}: first operand must be a 16-bit general register`, L, a.col);
        let b = bRaw;
        if (b.kind === 'imm') b = { kind: 'mem', size: 0, explicitSize: false, seg: -1, base: -1, index: -1, disp: b.expr, col: b.col };
        if (b.kind !== 'mem') throw new AsmError(`${op}: second operand must be a memory reference`, L, b.col);
        const opc = op === 'LEA' ? 0x8d : op === 'LDS' ? 0xc5 : 0xc4;
        return [...this.segPrefix(b), opc, ...this.modrm(st, a.reg.code, b)];
      }
      case 'INC':
      case 'DEC': {
        this.expectCount(st, ops, 1);
        const o = ops[0];
        this.regOrMem(st, o, op);
        const dec = op === 'DEC' ? 1 : 0;
        if (o.kind === 'reg') {
          if (o.reg.isSeg) throw new AsmError(`${op} cannot use a segment register`, L, o.col);
          if (o.reg.size === 2) return [0x40 + dec * 8 + o.reg.code];
          return [0xfe, 0xc0 | (dec << 3) | o.reg.code];
        }
        const size = this.memSize(st, o);
        return [...this.segPrefix(o), size === 1 ? 0xfe : 0xff, ...this.modrm(st, dec, o)];
      }
      case 'JMP': return this.encodeJmpCall(st, ops, false);
      case 'CALL': return this.encodeJmpCall(st, ops, true);
      case 'RET':
      case 'RETN':
      case 'RETF': {
        this.expectCount(st, ops, [0, 1]);
        const far = op === 'RETF' || (st.procFar && op === 'RET');
        if (ops.length === 0) return [far ? 0xcb : 0xc3];
        return [far ? 0xca : 0xc2, ...le16(this.imm(st, ops[0], 2))];
      }
      case 'INT': {
        this.expectCount(st, ops, 1);
        const n = this.imm(st, ops[0], 1);
        if (n < 0 || n > 255) throw new AsmError('interrupt number must be 0..255', L, ops[0].col);
        return n === 3 ? [0xcc] : [0xcd, n];
      }
      case 'IN':
      case 'OUT': {
        this.expectCount(st, ops, 2);
        const [a, b] = op === 'IN' ? ops : [ops[1], ops[0]];
        if (a.kind !== 'reg' || a.reg.code !== 0 || a.reg.isSeg) throw new AsmError(`${op}: the data operand must be AL or AX`, L, a.col);
        const w = a.reg.size === 2 ? 1 : 0;
        if (b.kind === 'reg' && b.reg.name === 'DX') return [(op === 'IN' ? 0xec : 0xee) | w];
        if (b.kind === 'imm') {
          const port = this.imm(st, b, 1);
          return [(op === 'IN' ? 0xe4 : 0xe6) | w, port];
        }
        throw new AsmError(`${op}: port must be an 8-bit constant or DX`, L, b.col);
      }
      case 'AAM':
      case 'AAD': {
        this.expectCount(st, ops, [0, 1]);
        const base = ops.length ? this.imm(st, ops[0], 1) : 10;
        return [op === 'AAM' ? 0xd4 : 0xd5, base];
      }
      case 'XLAT': {
        this.expectCount(st, ops, [0, 1]);
        return [...(ops.length ? this.segPrefix(ops[0]) : []), 0xd7];
      }
      case 'ESC':
        throw new AsmError('ESC (coprocessor) instructions are not supported', L, st.col, 3);
    }
    throw new AsmError(`unknown instruction '${op}'`, L, st.col, op.length);
  }

  private encodeMov(st: Stmt, ops: Operand[]): number[] {
    this.expectCount(st, ops, 2);
    const [a, b] = ops;
    const L = st.line;
    if (a.kind === 'imm' || a.kind === 'far') throw new AsmError('MOV: the destination cannot be an immediate value', L, a.col);
    if (b.kind === 'far') throw new AsmError('MOV: invalid source operand', L, b.col);
    if (a.kind === 'reg' && a.reg.isSeg) {
      if (a.reg.code === 1) throw new AsmError('MOV: CS cannot be a destination (use a far JMP to change CS)', L, a.col);
      if (b.kind === 'imm') {
        throw new AsmError(`wrong parameters: cannot use segment register with an immediate value; load a general register first (e.g. MOV AX, value / MOV ${a.reg.name}, AX)`, L, b.col);
      }
      if (b.kind === 'reg' && (b.reg.isSeg || b.reg.size !== 2)) throw new AsmError(`MOV ${a.reg.name}: source must be a 16-bit general register or memory`, L, b.col);
      if (b.kind === 'mem' && b.size === 1) throw new AsmError('operands do not match: segment registers are 16-bit', L, b.col);
      return [...this.segPrefix(b), 0x8e, ...this.modrm(st, a.reg.code, b as RegOperand | MemOperand)];
    }
    if (b.kind === 'reg' && b.reg.isSeg) {
      if (a.kind === 'reg' && a.reg.size !== 2) throw new AsmError(`operands do not match: ${a.reg.name} is 8-bit, ${b.reg.name} is 16-bit`, L, a.col);
      if (a.kind === 'mem' && a.size === 1) throw new AsmError('operands do not match: segment registers are 16-bit', L, a.col);
      return [...this.segPrefix(a), 0x8c, ...this.modrm(st, b.reg.code, a)];
    }
    if (a.kind === 'reg') {
      const size = a.reg.size;
      if (b.kind === 'imm') {
        return size === 1 ? [0xb0 + a.reg.code, this.imm(st, b, 1)] : [0xb8 + a.reg.code, ...le16(this.imm(st, b, 2))];
      }
      if (b.kind === 'reg') {
        if (b.reg.size !== size) throw new AsmError(`operands do not match: ${a.reg.name} is ${size * 8}-bit, ${b.reg.name} is ${b.reg.size * 8}-bit`, L, b.col);
        return [size === 1 ? 0x8a : 0x8b, ...this.modrm(st, a.reg.code, b)];
      }
      this.memSize(st, b, a);
      if (a.reg.code === 0 && b.base < 0 && b.index < 0) {
        const d = b.disp ? this.val(b.disp, L).v & 0xffff : 0;
        return [...this.segPrefix(b), size === 1 ? 0xa0 : 0xa1, ...le16(d)];
      }
      return [...this.segPrefix(b), size === 1 ? 0x8a : 0x8b, ...this.modrm(st, a.reg.code, b)];
    }
    // a is memory
    if (b.kind === 'mem') throw new AsmError('MOV cannot copy memory to memory; use a register in between', L, b.col);
    if (b.kind === 'reg') {
      const size = this.memSize(st, a, b);
      if (b.reg.code === 0 && a.base < 0 && a.index < 0) {
        const d = a.disp ? this.val(a.disp, L).v & 0xffff : 0;
        return [...this.segPrefix(a), size === 1 ? 0xa2 : 0xa3, ...le16(d)];
      }
      return [...this.segPrefix(a), size === 1 ? 0x88 : 0x89, ...this.modrm(st, b.reg.code, a)];
    }
    const size = this.memSize(st, a);
    const im = size === 1 ? [this.imm(st, b, 1)] : le16(this.imm(st, b, 2));
    return [...this.segPrefix(a), size === 1 ? 0xc6 : 0xc7, ...this.modrm(st, 0, a), ...im];
  }

  private encodeAlu(st: Stmt, ops: Operand[], n: number): number[] {
    this.expectCount(st, ops, 2);
    const [a, b] = ops;
    const L = st.line;
    const name = st.op;
    if (a.kind === 'imm' || a.kind === 'far') throw new AsmError(`${name}: the destination cannot be an immediate value`, L, a.col);
    if ((a.kind === 'reg' && a.reg.isSeg) || (b.kind === 'reg' && b.reg.isSeg)) throw new AsmError(`${name} cannot use segment registers`, L, a.col);
    if (b.kind === 'far') throw new AsmError(`${name}: invalid operand`, L, b.col);
    if (b.kind === 'imm') {
      const size = a.kind === 'reg' ? a.reg.size : this.memSize(st, a);
      if (a.kind === 'reg' && a.reg.code === 0) {
        return size === 1 ? [0x04 | (n << 3), this.imm(st, b, 1)] : [0x05 | (n << 3), ...le16(this.imm(st, b, 2))];
      }
      if (size === 1) return [...this.segPrefix(a), 0x80, ...this.modrm(st, n, a), this.imm(st, b, 1)];
      this.imm(st, b, 2); // range check
      const v = this.val(b.expr, L);
      const w = v.v & 0xffff;
      if (v.known && !v.reloc && (w <= 0x7f || w >= 0xff80)) {
        return [...this.segPrefix(a), 0x83, ...this.modrm(st, n, a), v.v & 0xff];
      }
      return [...this.segPrefix(a), 0x81, ...this.modrm(st, n, a), ...le16(this.imm(st, b, 2))];
    }
    if (a.kind === 'reg' && b.kind === 'reg') {
      if (a.reg.size !== b.reg.size) throw new AsmError(`operands do not match: ${a.reg.name} is ${a.reg.size * 8}-bit, ${b.reg.name} is ${b.reg.size * 8}-bit`, L, b.col);
      return [(n << 3) | (a.reg.size === 1 ? 2 : 3), ...this.modrm(st, a.reg.code, b)];
    }
    if (a.kind === 'reg' && b.kind === 'mem') {
      const size = this.memSize(st, b, a);
      return [...this.segPrefix(b), (n << 3) | (size === 1 ? 2 : 3), ...this.modrm(st, a.reg.code, b)];
    }
    if (a.kind === 'mem' && b.kind === 'reg') {
      const size = this.memSize(st, a, b);
      return [...this.segPrefix(a), (n << 3) | (size === 1 ? 0 : 1), ...this.modrm(st, b.reg.code, a)];
    }
    throw new AsmError(`${name} cannot use two memory operands; use a register in between`, L, b.col);
  }

  private encodeShift(st: Stmt, ops: Operand[], n: number): number[] {
    this.expectCount(st, ops, 2);
    const [a, b] = ops;
    const L = st.line;
    this.regOrMem(st, a, st.op);
    if (a.kind === 'reg' && a.reg.isSeg) throw new AsmError(`${st.op} cannot use a segment register`, L, a.col);
    const size = a.kind === 'reg' ? a.reg.size : this.memSize(st, a);
    const base = size === 1 ? 0xd0 : 0xd1;
    if (b.kind === 'reg') {
      if (b.reg.name !== 'CL') throw new AsmError(`${st.op}: the count must be 1, a constant, or CL`, L, b.col);
      return [...this.segPrefix(a), base | 2, ...this.modrm(st, n, a)];
    }
    if (b.kind !== 'imm') throw new AsmError(`${st.op}: the count must be 1, a constant, or CL`, L, b.col);
    const v = this.val(b.expr, L);
    if (!v.known && !this.final) return [...this.segPrefix(a), base, ...this.modrm(st, n, a)];
    if (v.v < 1 || v.v > 31) throw new AsmError(`${st.op}: shift count must be between 1 and 31 (or CL)`, L, b.col);
    const one = [...this.segPrefix(a), base, ...this.modrm(st, n, a)];
    if (v.v > 1 && this.final) {
      this.notes.push(`line ${L}: ${st.op} with count ${v.v} assembled as ${v.v} x "${st.op} ..., 1" (8086 has no immediate shift count)`);
    }
    const out: number[] = [];
    for (let i = 0; i < v.v; i++) out.push(...one);
    return out;
  }

  private encodeStringOp(st: Stmt, ops: Operand[], base: number): number[] {
    const L = st.line;
    if (ops.length === 0) throw new AsmError(`${st.op} needs operands; or use ${st.op}B / ${st.op}W`, L, st.col, st.op.length);
    let size: 0 | 1 | 2 = 0;
    let srcSeg: number[] = [];
    for (const o of ops) {
      if (o.kind !== 'mem') throw new AsmError(`${st.op}: memory operands expected`, L, o.col);
      if (o.size === 1 || o.size === 2) size = o.size;
    }
    if (!size) throw new AsmError('operand size is unknown: use BYTE PTR or WORD PTR', L, ops[0].col);
    const srcIndex = base === 0xa4 || base === 0xa6 ? 1 : base === 0xac ? 0 : -1;
    if (base === 0xa6) {
      // CMPS source is the first operand
      const src = ops[0] as MemOperand;
      if (src.seg >= 0 && src.seg !== 3) srcSeg = [0x26 | (src.seg << 3)];
    } else if (srcIndex >= 0 && ops[srcIndex]) {
      const src = ops[srcIndex] as MemOperand;
      if (src.seg >= 0 && src.seg !== 3) srcSeg = [0x26 | (src.seg << 3)];
    }
    return [...srcSeg, base | (size === 2 ? 1 : 0)];
  }

  private jumpTarget(st: Stmt, o: Operand): Val {
    if (o.kind !== 'imm') throw new AsmError(`${st.op}: label or address expected`, st.line, o.col);
    return this.val(o.expr, st.line);
  }

  private encodeJcc(st: Stmt, ops: Operand[], opcode: number): number[] {
    this.expectCount(st, ops, 1);
    const t = this.jumpTarget(st, ops[0]);
    const addr = st.address + st.prefixes.length;
    if (!st.longJump) {
      const rel = t.v - (addr + 2);
      if (!t.known || (rel >= -128 && rel <= 127)) return [opcode, rel & 0xff];
      if (ops[0].distance === 'short') {
        throw new AsmError(`condition jump out of range by ${rel > 0 ? rel - 127 : -128 - rel} bytes`, st.line, ops[0].col);
      }
      st.longJump = true;
      this.changed = true;
    }
    const rel16 = (t.v - (addr + 5)) & 0xffff;
    if (this.final) {
      this.notes.push(`line ${st.line}: ${st.op} target is out of short range; replaced with the opposite jump + JMP (5 bytes)`);
    }
    return [opcode ^ 1, 3, 0xe9, rel16 & 0xff, rel16 >> 8];
  }

  private encodeLoop(st: Stmt, ops: Operand[], opcode: number): number[] {
    this.expectCount(st, ops, 1);
    const t = this.jumpTarget(st, ops[0]);
    const addr = st.address + st.prefixes.length;
    const rel = t.v - (addr + 2);
    if (this.final && t.known && (rel < -128 || rel > 127)) {
      throw new AsmError(`${st.op} target is out of range by ${rel > 0 ? rel - 127 : -128 - rel} bytes (limit is -128..+127)`, st.line, ops[0].col);
    }
    return [opcode, rel & 0xff];
  }

  private encodeJmpCall(st: Stmt, ops: Operand[], call: boolean): number[] {
    this.expectCount(st, ops, 1);
    const o = ops[0];
    const L = st.line;
    if (o.kind === 'far') {
      const seg = this.val(o.seg, L).v & 0xffff;
      const off = this.val(o.off, L).v & 0xffff;
      return [call ? 0x9a : 0xea, ...le16(off), ...le16(seg)];
    }
    if (o.kind === 'reg') {
      if (o.reg.size !== 2 || o.reg.isSeg) throw new AsmError(`${st.op}: register must be a 16-bit general register`, L, o.col);
      return [0xff, 0xc0 | ((call ? 2 : 4) << 3) | o.reg.code];
    }
    if (o.kind === 'mem') {
      const far = o.distance === 'far' || o.size === 4;
      return [...this.segPrefix(o), 0xff, ...this.modrm(st, (call ? 2 : 4) + (far ? 1 : 0), o)];
    }
    if (o.distance === 'far') throw new AsmError(`far ${st.op} to a label needs an explicit segment (${st.op} segment:offset)`, L, o.col);
    const t = this.jumpTarget(st, o);
    const addr = st.address + st.prefixes.length;
    if (call && o.kind === 'imm' && o.expr.k === 'sym' && this.syms.get(o.expr.name)?.far) {
      // same-segment FAR PROC: PUSH CS + near CALL, so its RETF returns here (MASM does the same)
      return [0x0e, 0xe8, ...le16((t.v - (addr + 4)) & 0xffff)];
    }
    if (call) return [0xe8, ...le16((t.v - (addr + 3)) & 0xffff)];
    if (o.distance !== 'near' && !st.longJump) {
      const rel = t.v - (addr + 2);
      if (!t.known || (rel >= -128 && rel <= 127)) return [0xeb, rel & 0xff];
      if (o.distance === 'short') throw new AsmError(`short jump out of range by ${rel > 0 ? rel - 127 : -128 - rel} bytes`, L, o.col);
      st.longJump = true;
      this.changed = true;
    }
    return [0xe9, ...le16((t.v - (addr + 3)) & 0xffff)];
  }
}

function le16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}

function containsRegOrMem(e: Expr): boolean {
  switch (e.k) {
    case 'reg': case 'mem': case 'seg': return true;
    case 'un': return containsRegOrMem(e.e);
    case 'bin': return containsRegOrMem(e.l) || containsRegOrMem(e.r);
    default: return false;
  }
}
