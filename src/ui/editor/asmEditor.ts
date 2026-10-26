/**
 * CodeMirror 6 configuration for the source editor and helpers shared with
 * the read-only "original source code" window.
 */
import { EditorState, RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration, EditorView, GutterMarker, drawSelection, gutter, highlightActiveLine, keymap, lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { DIRECTIVES, MNEMONICS } from '../../assembler/assembler';
import { lookupReg } from '../../assembler/operand';
import type { Diagnostic } from '../../assembler/types';

// ------------------------------------------------------------ tokenizer
export type TokenClass = 'ins' | 'reg' | 'num' | 'str' | 'com' | 'dir' | 'lbl' | 'txt';

export function classifyWord(word: string): TokenClass {
  const u = word.toUpperCase();
  if (MNEMONICS.has(u)) return 'ins';
  if (lookupReg(u)) return 'reg';
  if (DIRECTIVES.has(u) || u.startsWith('#') || u === 'B.' || u === 'W.') return 'dir';
  return 'lbl';
}

/** Splits one line into coloured spans (used by the source window and listings). */
export function tokenizeLine(line: string): { cls: TokenClass; text: string }[] {
  const out: { cls: TokenClass; text: string }[] = [];
  let i = 0;
  const push = (cls: TokenClass, text: string) => {
    if (text) out.push({ cls, text });
  };
  while (i < line.length) {
    const c = line[i];
    if (c === ';') { push('com', line.slice(i)); break; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j++;
      push('str', line.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < line.length && /[0-9A-Za-z_]/.test(line[j])) j++;
      push('num', line.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_@?.$#]/.test(c)) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_@?.$#]/.test(line[j])) j++;
      const w = line.slice(i, j);
      push(classifyWord(w), w);
      i = j;
      continue;
    }
    let j = i;
    while (j < line.length && !/[;'"0-9A-Za-z_@?.$#]/.test(line[j])) j++;
    push('txt', line.slice(i, j));
    i = j;
  }
  return out;
}

const asmStream = StreamLanguage.define<null>({
  name: 'asm8086',
  startState: () => null,
  token(stream: StringStream) {
    if (stream.eatSpace()) return null;
    const ch = stream.peek()!;
    if (ch === ';') {
      stream.skipToEnd();
      return 'comment';
    }
    if (ch === "'" || ch === '"') {
      stream.next();
      while (!stream.eol()) if (stream.next() === ch) break;
      return 'string';
    }
    if (stream.match(/^[0-9][0-9A-Za-z_]*/)) return 'number';
    const m = stream.match(/^[A-Za-z_@?.$#][A-Za-z0-9_@?.$#]*/) as RegExpMatchArray | null;
    if (m) {
      switch (classifyWord(m[0])) {
        case 'ins': return 'keyword';
        case 'reg': return 'atom';
        case 'dir': return 'meta';
        default: return 'variableName';
      }
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: ';' } },
});

const asmHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000c0' },
  { tag: tags.atom, color: '#800000' },
  { tag: tags.number, color: '#000000' },
  { tag: tags.string, color: '#a00000' },
  { tag: tags.comment, color: '#008000' },
  { tag: tags.meta, color: '#000080' },
]);

// ------------------------------------------------------------ diagnostics
export const setDiagnosticsEffect = StateEffect.define<Diagnostic[]>();

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setDiagnosticsEffect)) {
        const doc = tr.state.doc;
        const ranges = [];
        for (const d of e.value) {
          if (d.line < 1 || d.line > doc.lines) continue;
          const line = doc.line(d.line);
          const from = Math.min(line.from + Math.max(0, d.col - 1), line.to);
          let to = Math.min(from + Math.max(1, d.length), line.to);
          const cls = d.severity === 'error' ? 'cm-asm-error' : 'cm-asm-warning';
          ranges.push(Decoration.line({ class: `${cls}-line` }).range(line.from));
          if (to <= from) {
            if (line.to > line.from) {
              ranges.push(Decoration.mark({ class: cls, attributes: { title: d.message } }).range(line.from, line.to));
            }
          } else {
            if (to === from) to = from + 1;
            ranges.push(Decoration.mark({ class: cls, attributes: { title: d.message } }).range(from, to));
          }
        }
        deco = Decoration.set(ranges, true);
      }
    }
    if (tr.docChanged) {
      // Diagnostics refer to the compiled text; drop them once the user edits.
      return Decoration.none;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ------------------------------------------------------------ bookmarks
class BookmarkMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-bookmark';
    el.textContent = '■';
    return el;
  }
}
const bookmarkMarker = new BookmarkMarker();
export const toggleBookmarkEffect = StateEffect.define<number>(); // position
export const clearBookmarksEffect = StateEffect.define<null>();

export const bookmarksField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearBookmarksEffect)) set = RangeSet.empty;
      if (e.is(toggleBookmarkEffect)) {
        const lineStart = tr.state.doc.lineAt(e.value).from;
        let exists = false;
        set.between(lineStart, lineStart, () => { exists = true; });
        set = exists
          ? set.update({ filter: (from) => from !== lineStart })
          : set.update({ add: [bookmarkMarker.range(lineStart)], sort: true });
      }
    }
    return set;
  },
});

export function bookmarkLines(state: EditorState): number[] {
  const out: number[] = [];
  const it = state.field(bookmarksField).iter();
  while (it.value) {
    out.push(state.doc.lineAt(it.from).number);
    it.next();
  }
  return out;
}

export function jumpBookmark(view: EditorView, which: 'next' | 'prev' | 'first' | 'last'): boolean {
  const lines = bookmarkLines(view.state);
  if (!lines.length) return false;
  const cur = view.state.doc.lineAt(view.state.selection.main.head).number;
  let target: number | undefined;
  if (which === 'first') target = lines[0];
  else if (which === 'last') target = lines[lines.length - 1];
  else if (which === 'next') target = lines.find((l) => l > cur) ?? lines[0];
  else target = [...lines].reverse().find((l) => l < cur) ?? lines[lines.length - 1];
  const pos = view.state.doc.line(target).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  return true;
}

// ------------------------------------------------------------ comments
export function commentBlock(view: EditorView, add: boolean): boolean {
  const { state } = view;
  const changes: { from: number; to?: number; insert?: string }[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    const last = state.doc.lineAt(r.to).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      if (add) changes.push({ from: line.from, insert: ';' });
      else {
        const m = /^\s*;/.exec(line.text);
        if (m) changes.push({ from: line.from + m[0].length - 1, to: line.from + m[0].length });
      }
    }
  }
  view.dispatch({ changes });
  return true;
}

export function changeCase(view: EditorView, upper: boolean): boolean {
  const { state } = view;
  view.dispatch(state.changeByRange((r) => {
    const text = state.sliceDoc(r.from, r.to);
    return { changes: { from: r.from, to: r.to, insert: upper ? text.toUpperCase() : text.toLowerCase() }, range: r };
  }));
  return true;
}

// ------------------------------------------------------------ setup
const theme = EditorView.theme({
  '&': { backgroundColor: '#ffffff', color: '#000' },
  '.cm-scroller': { fontFamily: "'IBM VGA 8x14', 'Courier New', monospace", fontSize: '14px', lineHeight: '14px' },
  '.cm-content': { padding: '2px 0', caretColor: '#000' },
  '.cm-line': { padding: '0 4px' },
  '.cm-gutters': { backgroundColor: '#ececec', color: '#808080', borderRight: '1px solid #d4d4d4' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 6px', minWidth: '26px' },
  '.cm-bookmarks': { width: '14px', backgroundColor: '#dcdcdc' },
  '.cm-bookmark': { color: '#1a5fc8', fontSize: '10px', textAlign: 'center' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-cursor': { borderLeftWidth: '2px', borderLeftColor: '#000' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#3399ff55 !important' },
  '.cm-asm-error': { textDecoration: 'underline wavy #e00000', textUnderlineOffset: '2px' },
  '.cm-asm-warning': { textDecoration: 'underline wavy #c08000', textUnderlineOffset: '2px' },
  '.cm-asm-error-line': { backgroundColor: '#ffe8e8' },
  '.cm-asm-warning-line': { backgroundColor: '#fff6dc' },
  '.cm-panels': { fontFamily: 'var(--ui-font)', fontSize: '12px', backgroundColor: '#f0f0f0' },
});

export interface EditorCallbacks {
  onChange(): void;
  onCursor(line: number, col: number): void;
  extraKeys: Parameters<typeof keymap.of>[0];
}

export function createEditorState(text: string, cb: EditorCallbacks): EditorState {
  const extensions: Extension[] = [
    gutter({
      class: 'cm-bookmarks',
      markers: (v) => v.state.field(bookmarksField),
      initialSpacer: () => bookmarkMarker,
    }),
    lineNumbers({ formatNumber: (n) => (n < 100 ? String(n).padStart(2, '0') : String(n)) }),
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    asmStream,
    syntaxHighlighting(asmHighlight),
    diagnosticsField,
    bookmarksField,
    theme,
    keymap.of([
      ...cb.extraKeys,
      { key: 'Tab', run: (v) => (v.state.selection.ranges.some((r) => !r.empty) ? indentMore(v) : (v.dispatch(v.state.replaceSelection('\t')), true)) },
      { key: 'Shift-Tab', run: indentLess },
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorState.tabSize.of(8),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.onChange();
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        cb.onCursor(line.number, head - line.from + 1);
      }
    }),
  ];
  return EditorState.create({ doc: text, extensions });
}
