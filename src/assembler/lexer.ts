/**
 * Line lexer for EMU8086/MASM-style assembly.
 *
 * Numeric notations are recognised natively (never via text rewriting), so the
 * source text — including comments and strings — is never modified:
 *   0B800h  0Fh  162  162d  0000_1111b  17o / 17q  0x1F  'H'  "AB"
 * Underscores are accepted as digit separators inside numbers.
 */
import { AsmError } from './types';

export type TokenKind = 'ident' | 'num' | 'str' | 'punct';

export interface Token {
  kind: TokenKind;
  /** Original spelling. */
  text: string;
  /** Upper-cased spelling for identifiers. */
  upper: string;
  /** Numeric value (num) or character codes (str). */
  value: number;
  chars?: number[];
  /** 1-based column. */
  col: number;
}

const IDENT_START = /[A-Za-z_@?.$]/;
const IDENT_PART = /[A-Za-z0-9_@?.$]/;
const PUNCT = '[](),+-*/:=<>&|!~';

export interface LexedLine {
  tokens: Token[];
  /** Column where a `;` comment begins (1-based), or 0. */
  commentCol: number;
}

export function lexLine(text: string, line: number): LexedLine {
  const tokens: Token[] = [];
  let i = 0;
  let commentCol = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    if (c === ';') {
      commentCol = i + 1;
      break;
    }
    const col = i + 1;
    if (c === "'" || c === '"') {
      const chars: number[] = [];
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === c) {
          if (text[j + 1] === c) {
            chars.push(c.charCodeAt(0));
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        chars.push(text.charCodeAt(j) & 0xff);
        j++;
      }
      if (!closed) throw new AsmError(`unterminated string or character constant (missing closing ${c})`, line, col, text.length - i);
      const spelled = text.slice(i, j + 1);
      tokens.push({ kind: 'str', text: spelled, upper: spelled, value: chars[0] ?? 0, chars, col });
      i = j + 1;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < text.length && /[0-9A-Za-z_]/.test(text[j])) j++;
      const spelled = text.slice(i, j);
      tokens.push({ kind: 'num', text: spelled, upper: spelled.toUpperCase(), value: parseNumber(spelled, line, col), col });
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < text.length && IDENT_PART.test(text[j])) j++;
      const spelled = text.slice(i, j);
      tokens.push({ kind: 'ident', text: spelled, upper: spelled.toUpperCase(), value: 0, col });
      i = j;
      continue;
    }
    if (PUNCT.includes(c)) {
      tokens.push({ kind: 'punct', text: c, upper: c, value: 0, col });
      i++;
      continue;
    }
    throw new AsmError(`unexpected character '${c}'`, line, col, 1);
  }
  return { tokens, commentCol };
}

/** Parses one numeric literal, reporting the exact offending digit on error. */
export function parseNumber(spelled: string, line: number, col: number): number {
  const lower = spelled.toLowerCase();
  const fail = (msg: string, at = 0, len = spelled.length): never => {
    throw new AsmError(msg, line, col + at, len);
  };
  if (spelled.startsWith('_') || spelled.endsWith('_')) fail(`invalid number '${spelled}'`);

  let radix = 10;
  let body = lower;
  let bodyStart = 0;
  let suffixName = 'decimal';
  if (lower.startsWith('0x')) {
    radix = 16;
    body = lower.slice(2);
    bodyStart = 2;
    suffixName = 'hexadecimal';
  } else {
    const last = lower[lower.length - 1];
    if (last === 'h') { radix = 16; suffixName = 'hexadecimal'; body = lower.slice(0, -1); }
    else if (last === 'b' && /^[0-9_]+b$/.test(lower)) { radix = 2; suffixName = 'binary'; body = lower.slice(0, -1); }
    else if (last === 'o' || last === 'q') { radix = 8; suffixName = 'octal'; body = lower.slice(0, -1); }
    else if (last === 'd' && /^[0-9_]+d$/.test(lower)) { radix = 10; body = lower.slice(0, -1); }
  }
  if (body.length === 0) fail(`invalid number '${spelled}'`);
  let value = 0;
  let digits = 0;
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (ch === '_') {
      if (body[k - 1] === '_') fail(`invalid number '${spelled}' (repeated digit separator)`, bodyStart + k, 1);
      continue;
    }
    const d = parseInt(ch, 36);
    if (Number.isNaN(d) || d >= radix) {
      if (radix === 10 && /[a-f]/.test(ch) && /^[0-9a-f_]+$/.test(body)) {
        fail(`invalid number '${spelled}': hexadecimal numbers need an 'h' suffix (e.g. ${spelled}h)`);
      }
      fail(`invalid ${suffixName} digit '${spelled[bodyStart + k]}' in '${spelled}'`, bodyStart + k, 1);
    }
    value = value * radix + d;
    digits++;
  }
  if (digits === 0) fail(`invalid number '${spelled}'`);
  if (value > 0xffffffff) fail(`number '${spelled}' is too large`);
  return value;
}
