/**
 * Source preprocessor: INCLUDE files and MACRO … ENDM expansion, run before the assembler parses lines.
 *
 * Behaviour reproduces EMU8086 4.08 (checked against its .list/.symbol output and error messages):
 *  - a macro must be defined above its first use; defining the same name twice is an error;
 *  - `name MACRO p1, p2` … `ENDM` (or `name ENDM`); parameter names are case-insensitive;
 *  - arguments are separated by commas and/or blanks; quotes keep a string (with its commas and blanks)
 *    together; missing arguments are empty and extra arguments are ignored;
 *  - substitution is textual (`M 5+5` with `x*2` gives `5+5*2`) and applies to every identifier except the
 *    instruction name and text inside quotes;
 *  - `LOCAL a, b` renames those labels to `A_LOC<n>TMP`, where n is a global counter that advances once for
 *    every LOCAL line expanded;
 *  - INCLUDE accepts a quoted or bare file name.
 * Every produced line keeps the line number of the user's source line it came from (the macro call or the
 * INCLUDE line), so diagnostics, the source map and the debugger point at that line, as in EMU8086.
 */
import type { Diagnostic } from './types';

export interface SourceLine {
  /** Text to assemble. */
  text: string;
  /** 1-based line in the user's source this line belongs to. */
  line: number;
  /** Set when the line was produced by a macro call or an included file. */
  from?: { kind: 'macro' | 'include'; name: string };
}

export interface PreprocessResult {
  lines: SourceLine[];
  diagnostics: Diagnostic[];
  /** User source lines that are macro calls or INCLUDE lines (their code comes from elsewhere). */
  expandedLines: Map<number, { name: string; col: number; length: number }>;
}

/** Files that INCLUDE can open, keyed by lower-case file name. */
export type IncludeFiles = Record<string, string>;

interface Macro {
  name: string;
  params: string[];
  body: { text: string }[];
}

type SegKind = 'ident' | 'num' | 'str' | 'ws' | 'comment' | 'other';
interface Seg { kind: SegKind; text: string; col: number }

const IDENT_START = /[A-Za-z_@?.$]/;
const IDENT_PART = /[A-Za-z0-9_@?.$]/;
/** Words that follow a symbol name (so the first word is a name, not an instruction). */
const NAME_FOLLOWERS = new Set(['DB', 'DW', 'DD', 'DQ', 'DT', 'EQU', 'PROC', 'ENDP', 'LABEL', 'MACRO', 'ENDM', 'SEGMENT', 'ENDS', '=']);
const MAX_DEPTH = 64;

/** Splits a line into identifiers, numbers, strings, blanks, a comment and other characters. */
function scan(text: string): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const col = i + 1;
    if (c === ';') { segs.push({ kind: 'comment', text: text.slice(i), col }); break; }
    if (c === ' ' || c === '\t') {
      let j = i; while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
      segs.push({ kind: 'ws', text: text.slice(i, j), col }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && !(text[j] === c && text[j + 1] !== c)) j += text[j] === c ? 2 : 1;
      j = Math.min(j + 1, text.length);
      segs.push({ kind: 'str', text: text.slice(i, j), col }); i = j; continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i; while (j < text.length && /[0-9A-Za-z_]/.test(text[j])) j++;
      segs.push({ kind: 'num', text: text.slice(i, j), col }); i = j; continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1; while (j < text.length && IDENT_PART.test(text[j])) j++;
      segs.push({ kind: 'ident', text: text.slice(i, j), col }); i = j; continue;
    }
    segs.push({ kind: 'other', text: c, col }); i++;
  }
  return segs;
}

const significant = (segs: Seg[]) => segs.filter((s) => s.kind !== 'ws' && s.kind !== 'comment');
const upper = (s: Seg | undefined) => (s && (s.kind === 'ident' || s.kind === 'other') ? s.text.toUpperCase() : '');

/** Index (in `sig`) of the instruction or directive word, skipping a `label:` or a symbol name. */
function mnemonicIndex(sig: Seg[]): number {
  if (sig[0]?.kind !== 'ident') return -1;
  if (sig[1]?.text === ':') return sig[2]?.kind === 'ident' ? 2 : -1;
  if (NAME_FOLLOWERS.has(upper(sig[1]))) return 1;
  return 0;
}

/** Macro arguments: separated by commas and/or blanks; quoted strings stay whole; empty pieces are dropped. */
function splitArgs(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => { if (cur !== '') out.push(cur); cur = ''; };
  for (const s of scan(text)) {
    if (s.kind === 'comment') break;
    if (s.kind === 'ws' || s.text === ',') flush();
    else cur += s.text;
  }
  flush();
  return out;
}

/** File name after INCLUDE: 'name', "name", <name> or a bare name, without a trailing comment. */
function includeName(rest: string): string {
  const raw = rest.trim();
  const q = raw[0];
  if (q === "'" || q === '"') { const end = raw.indexOf(q, 1); return (end < 0 ? raw.slice(1) : raw.slice(1, end)).trim(); }
  if (q === '<') { const end = raw.indexOf('>'); return (end < 0 ? raw.slice(1) : raw.slice(1, end)).trim(); }
  return raw.replace(/;.*$/, '').trim();
}

export function preprocess(source: string, includes: IncludeFiles = {}): PreprocessResult {
  const lines: SourceLine[] = [];
  const diagnostics: Diagnostic[] = [];
  const expandedLines = new Map<number, { name: string; col: number; length: number }>();
  const macros = new Map<string, Macro>();
  let localCounter = 0;

  const error = (message: string, line: number, col = 1, length = 1) =>
    diagnostics.push({ severity: 'error', message, line, col, length });

  /**
   * Processes lines in order. `origin` fixes the user line number for lines that do not come from the user's
   * source (included files, macro bodies); `from` labels them.
   */
  const run = (texts: string[], origin: number | null, from: SourceLine['from'], depth: number, firstLine = 1): void => {
    let inComment: string | null = null;
    let def: { macro: Macro; line: number; nest: number } | null = null;
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const line = origin ?? firstLine + i;
      const emit = (t: string) => lines.push(from ? { text: t, line, from } : { text: t, line });

      // collecting a macro body
      if (def) {
        const sig = significant(scan(text));
        const w0 = upper(sig[0]);
        const w1 = upper(sig[1]);
        if (w1 === 'MACRO') def.nest++;
        else if (w0 === 'ENDM' || w1 === 'ENDM') {
          if (def.nest === 0) { macros.set(def.macro.name.toUpperCase(), def.macro); def = null; continue; }
          def.nest--;
        }
        def.macro.body.push({ text });
        continue;
      }
      // COMMENT <delim> … <delim> blocks pass through untouched (the assembler skips them)
      if (inComment !== null) {
        if (text.includes(inComment)) inComment = null;
        emit(text);
        continue;
      }
      const segs = scan(text);
      const sig = significant(segs);
      if (upper(sig[0]) === 'COMMENT') {
        const rest = text.slice(sig[0].col - 1 + sig[0].text.length).trimStart();
        if (rest && !rest.slice(1).includes(rest[0])) inComment = rest[0];
        emit(text);
        continue;
      }
      const w0 = upper(sig[0]);
      const w1 = upper(sig[1]);

      if (w0 === 'INCLUDE') {
        const name = includeName(text.slice(sig[0].col - 1 + sig[0].text.length));
        const content = includes[name.toLowerCase()] ?? includes[name.toLowerCase().replace(/^.*[\\/]/, '')];
        if (origin === null) expandedLines.set(line, { name, col: sig[0].col, length: text.trimEnd().length - sig[0].col + 1 });
        if (content === undefined) {
          error(`cannot open include file: ${name || '(no name)'} (emu8086-web provides ${Object.keys(includes).join(', ') || 'no include files'})`, line, sig[0].col, text.trimEnd().length - sig[0].col + 1);
        } else if (depth >= MAX_DEPTH) {
          error(`INCLUDE nested too deeply: ${name}`, line, sig[0].col);
        } else {
          run(content.split(/\r\n|\r|\n/), line, { kind: 'include', name }, depth + 1);
        }
        continue;
      }
      if (w1 === 'MACRO' && sig[0].kind === 'ident') {
        const name = sig[0].text;
        if (macros.has(name.toUpperCase())) error('MACRO name already in use!', line, sig[0].col, name.length);
        const params = sig.slice(2).filter((s) => s.kind === 'ident').map((s) => s.text.toUpperCase());
        def = { macro: { name, params, body: [] }, line, nest: 0 };
        continue;
      }
      if (w0 === 'ENDM' || w1 === 'ENDM') { error('ENDM without MACRO', line, sig[w0 === 'ENDM' ? 0 : 1].col, 4); continue; }
      if (w0 === 'LOCAL') { error('LOCAL can only be used inside a MACRO', line, sig[0].col, 5); continue; }

      const m = mnemonicIndex(sig);
      const macro = m >= 0 ? macros.get(upper(sig[m])) : undefined;
      if (!macro) { emit(text); continue; }

      // macro call: a label on the call line stays a label; the body is expanded in its place
      const callCol = sig[0].col;
      if (origin === null) expandedLines.set(line, { name: macro.name, col: callCol, length: text.replace(/;.*$/, '').trimEnd().length - callCol + 1 });
      if (depth >= MAX_DEPTH) { error(`macro ${macro.name} expands too deeply (does it call itself?)`, line, sig[m].col, sig[m].text.length); continue; }
      if (m === 2) emit(`${sig[0].text}:`);
      const args = splitArgs(text.slice(sig[m].col - 1 + sig[m].text.length));
      const params = new Map(macro.params.map((p, k) => [p, args[k] ?? '']));
      const locals = new Map<string, string>();
      const body: string[] = [];
      for (const b of macro.body) {
        const bsegs = scan(b.text);
        const bsig = significant(bsegs);
        if (upper(bsig[0]) === 'LOCAL') {
          localCounter++;
          for (const s of bsig.slice(1)) if (s.kind === 'ident') locals.set(s.text.toUpperCase(), `${s.text.toUpperCase()}_LOC${localCounter}TMP`);
          continue;
        }
        const mi = mnemonicIndex(bsig);
        const exempt = mi >= 0 ? bsig[mi] : undefined;
        body.push(bsegs.filter((s) => s.kind !== 'comment').map((s) => {
          if (s.kind !== 'ident' || s === exempt) return s.text;
          const key = s.text.toUpperCase();
          return locals.get(key) ?? params.get(key) ?? s.text;
        }).join('').trimEnd());
      }
      run(body, line, { kind: 'macro', name: macro.name }, depth + 1);
    }
    if (def) error(`no ENDM for MACRO ${def.macro.name}`, origin ?? def.line, 1, def.macro.name.length);
  };

  run(source.split(/\r\n|\r|\n/), null, undefined, 0);
  return { lines, diagnostics, expandedLines };
}
