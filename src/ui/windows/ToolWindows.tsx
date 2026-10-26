import { useLayoutEffect, useRef, useState } from 'react';
import { Window } from './Window';
import { Icons } from '../icons';
import { store, useStore, type Watch } from '../store';
import { tokenizeLine } from '../editor/asmEditor';
import { hex4 } from '../../debug/machine';
import { physical } from '../../cpu/memory';
import { AF, AX, BP, BX, CF, CX, DF, DI, DX, IF, OF, PF, SF, SI, SP, ZF } from '../../cpu/cpu';
import { CP437 } from '../../devices/vga/textmode';
import { assemble } from '../../assembler/assembler';

// ============================================================ original source
export function SourceWindow() {
  const s = useStore();
  const m = s.session.machine;
  const cur = m.program ? m.currentSourceLine() ?? m.lastLine : null;
  const ref = useRef<HTMLDivElement>(null);
  const text = s.loadedSource;
  const lines = text ? text.split(/\r?\n/) : [];
  const bpLines = new Set<number>();
  if (m.program) {
    for (const e of m.program.result.sourceMap) {
      if (m.breakpoints.has(physical(m.program.loadSegment, e.address))) bpLines.add(e.line);
    }
  }
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !cur) return;
    const top = (cur - 1) * 14;
    if (top < el.scrollTop || top + 14 > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [cur, s.wins.source.open]);
  return (
    <Window id="source" title="original source code" icon={<Icons.appSource />} minW={200} minH={120}>
      <div className="src-list sunken" ref={ref} data-testid="source-list">
        {!text && <div style={{ padding: 6, fontFamily: 'var(--ui-font)', fontSize: 12 }}>original source code is not available.</div>}
        {lines.map((line, i) => {
          const n = i + 1;
          return (
            <div key={i} className={`src-line ${n === cur ? 'cur' : ''} ${bpLines.has(n) ? 'bp' : ''}`} data-line={n}>
              <span
                className="ln"
                title="click to toggle a break point on this line"
                onClick={() => {
                  const a = m.addressOfLine(n);
                  if (a !== null) store.toggleBreakpointAt(a);
                }}
              >
                {String(n).padStart(2, '0')}
              </span>
              <span className="tx">
                {tokenizeLine(line.replace(/\t/g, '        ')).map((t, k) => (
                  <span key={k} className={`t-${t.cls}`}>{t.text}</span>
                ))}
                {line === '' ? ' ' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </Window>
  );
}

// ============================================================ value viewer
const WORD_REGS = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'IP', 'CS', 'DS', 'ES', 'SS'];
const REG_INDEX: Record<string, number> = { AX, BX, CX, DX, SI, DI, BP, SP };
const SREG_INDEX: Record<string, number> = { ES: 0, CS: 1, SS: 2, DS: 3 };

function readWatch(w: Watch): number {
  const c = store.session.machine.cpu;
  if (w.kind === 'mem') return store.session.machine.mem.read16(w.segment, w.offset);
  if (w.name === 'IP') return c.ip;
  if (SREG_INDEX[w.name] !== undefined) return c.sregs[SREG_INDEX[w.name]];
  return c.regs[REG_INDEX[w.name]];
}

function writeWatch(w: Watch, v: number, byteOnly: boolean): void {
  const m = store.session.machine;
  const c = m.cpu;
  if (w.kind === 'mem') {
    if (byteOnly) m.mem.write8(physical(w.segment, w.offset), v);
    else m.mem.write16(w.segment, w.offset, v);
  } else if (w.name === 'IP') c.ip = v;
  else if (SREG_INDEX[w.name] !== undefined) c.sregs[SREG_INDEX[w.name]] = v;
  else c.regs[REG_INDEX[w.name]] = v;
  store.session.revision++;
  store.emit();
}

function Field({ value, parse, label, wide }: { value: string; parse: (s: string) => number | null; label: string; wide?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const ok = parse(draft.trim()) !== null;
    setBad(!ok);
    if (ok) setDraft(null);
  };
  return (
    <input
      className="sunken"
      aria-label={label}
      value={draft ?? value}
      style={{ color: bad ? '#c00000' : undefined, width: wide ? '100%' : undefined }}
      spellCheck={false}
      readOnly={store.session.running}
      onChange={(e) => { setDraft(e.target.value); setBad(false); }}
      onBlur={() => { commit(); setDraft(null); setBad(false); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(null); setBad(false); } }}
    />
  );
}

const sx8 = (v: number) => (v & 0x80 ? v - 0x100 : v);
const sx16 = (v: number) => (v & 0x8000 ? v - 0x10000 : v);

function parseIn(text: string, radix: number, bits: number, signed = false): number | null {
  const t = text.replace(/_/g, '').toLowerCase();
  if (!t) return null;
  const re = radix === 16 ? /^-?[0-9a-f]+$/ : radix === 2 ? /^-?[01]+$/ : radix === 8 ? /^-?[0-7]+$/ : /^-?[0-9]+$/;
  if (!re.test(t)) return null;
  const v = parseInt(t, radix);
  const max = 1 << bits;
  if (signed ? v < -(max / 2) || v >= max / 2 : v < 0 || v >= max) return null;
  return v & (max - 1);
}

export function ValueViewer() {
  const s = useStore();
  const [byteMode, setByteMode] = useState(false);
  const w = s.watch;
  const value = readWatch(w);
  const word = byteMode ? value & 0xff : value;
  const H = (word >> 8) & 0xff;
  const L = word & 0xff;
  const setHL = (h: number | null, l: number | null) => {
    if (byteMode) {
      // byte mode edits the low byte only (AL for AX, the byte at the address for MEM)
      if (w.kind === 'mem') writeWatch(w, l ?? L, true);
      else writeWatch(w, (value & 0xff00) | (l ?? L), false);
    } else writeWatch(w, ((h ?? H) << 8) | (l ?? L), false);
  };
  const byteCell = (half: 'H' | 'L', radix: number, digits: number) => {
    const v = half === 'H' ? H : L;
    return (
      <Field
        label={`${half} ${radix === 16 ? 'hex' : radix === 2 ? 'bin' : 'oct'}`}
        value={v.toString(radix).toUpperCase().padStart(digits, '0')}
        parse={(t) => {
          const r = parseIn(t, radix, 8);
          if (r !== null) setHL(half === 'H' ? r : null, half === 'L' ? r : null);
          return r;
        }}
      />
    );
  };
  const decCell = (half: 'H' | 'L', signed: boolean) => {
    const v = half === 'H' ? H : L;
    return (
      <Field
        label={`${half} ${signed ? 'signed' : 'unsigned'}`}
        value={String(signed ? sx8(v) : v)}
        parse={(t) => {
          const r = parseIn(t, 10, 8, signed);
          if (r !== null) setHL(half === 'H' ? r : null, half === 'L' ? r : null);
          return r;
        }}
      />
    );
  };
  const asciiCell = (half: 'H' | 'L') => {
    const v = half === 'H' ? H : L;
    return (
      <Field
        label={`${half} ascii`}
        value={v === 0 ? '' : CP437[v]}
        parse={(t) => {
          if ([...t].length !== 1) return null;
          const code = t.charCodeAt(0) < 256 ? t.charCodeAt(0) : CP437.indexOf(t);
          if (code < 0) return null;
          setHL(half === 'H' ? code : null, half === 'L' ? code : null);
          return code;
        }}
      />
    );
  };
  const showH = !byteMode;
  return (
    <Window id="viewer" title="extended value viewer" icon={<Icons.appTool />} tool resizable={false}>
      <div className="vv" data-testid="value-viewer">
        <div className="vv-top">
          <span>watch:</span>
          <select
            className="sunken"
            aria-label="watch"
            value={w.kind === 'reg' ? w.name : 'MEM'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'MEM') {
                const c = store.session.machine.cpu;
                store.watch = { kind: 'mem', segment: c.sregs[3], offset: c.regs[BX] };
              } else store.watch = { kind: 'reg', name: v };
              store.emit();
            }}
          >
            {WORD_REGS.map((r) => <option key={r}>{r}</option>)}
            <option value="MEM">MEM:</option>
          </select>
        </div>
        {w.kind === 'mem' && (
          <div className="vv-top">
            <span>at:</span>
            <Field label="segment" value={hex4(w.segment)} parse={(t) => { const v = parseIn(t, 16, 16); if (v !== null) { store.watch = { ...w, segment: v }; store.emit(); } return v; }} />
            <span>:</span>
            <Field label="offset" value={hex4(w.offset)} parse={(t) => { const v = parseIn(t, 16, 16); if (v !== null) { store.watch = { ...w, offset: v }; store.emit(); } return v; }} />
          </div>
        )}
        <div className="vv-top" style={{ gap: 18, paddingLeft: 52 }}>
          <label className="r"><input type="radio" checked={!byteMode} onChange={() => setByteMode(false)} /> word</label>
          <label className="r"><input type="radio" checked={byteMode} onChange={() => setByteMode(true)} /> byte</label>
        </div>
        <div className="vv-grid">
          <span />
          <span className="hd">{showH ? 'H' : ''}</span>
          <span className="hd">L</span>
          <span>hex:</span>{showH ? byteCell('H', 16, 2) : <span />}{byteCell('L', 16, 2)}
          <span>bin:</span>{showH ? byteCell('H', 2, 8) : <span />}{byteCell('L', 2, 8)}
          <span>oct:</span>{showH ? byteCell('H', 8, 3) : <span />}{byteCell('L', 8, 3)}
        </div>
        <div className="group">
          <span className="legend">decimal 8 bit</span>
          <div className="vv-grid">
            <span>unsigned:</span>{showH ? decCell('H', false) : <span />}{decCell('L', false)}
            <span>signed:</span>{showH ? decCell('H', true) : <span />}{decCell('L', true)}
            <span>ascii:</span>{showH ? asciiCell('H') : <span />}{asciiCell('L')}
          </div>
        </div>
        {!byteMode && (
          <div className="group">
            <span className="legend">decimal 16 bit</span>
            <div className="vv-wide">
              <span>unsigned:</span>
              <Field label="unsigned 16" wide value={String(word)} parse={(t) => { const v = parseIn(t, 10, 16); if (v !== null) writeWatch(w, v, false); return v; }} />
              <span>signed:</span>
              <Field label="signed 16" wide value={String(sx16(word))} parse={(t) => { const v = parseIn(t, 10, 16, true); if (v !== null) writeWatch(w, v, false); return v; }} />
            </div>
          </div>
        )}
      </div>
    </Window>
  );
}

// ============================================================ flags
export const FLAG_INFO: [string, number, string][] = [
  ['CF', CF, 'Carry Flag'],
  ['ZF', ZF, 'Zero Flag (0-not zero, 1-zero)'],
  ['SF', SF, 'Sign Flag (0-positive, 1-negative)'],
  ['OF', OF, 'Overflow Flag'],
  ['PF', PF, 'Parity Flag (0-odd, 1-even)'],
  ['AF', AF, 'Auxiliary Flag'],
  ['IF', IF, 'Interrupt enable Flag'],
  ['DF', DF, 'Direction Flag (0-forward, 1-backward)'],
];

export function FlagsWindow() {
  const s = useStore();
  const c = s.session.machine.cpu;
  const prev = s.session.previousFlags;
  return (
    <Window id="flags" title="flags" icon={<Icons.appTool />} tool resizable={false}>
      <div className="dlg" data-testid="flags">
        <div className="flags-grid">
          {FLAG_INFO.map(([name, mask, tip]) => (
            <label key={name} title={tip} style={{ color: s.session.previous && (prev & mask) !== (c.flags & mask) ? '#0000ff' : undefined }}>
              <input
                type="checkbox"
                checked={(c.flags & mask) !== 0}
                disabled={s.session.running}
                onChange={(e) => {
                  c.setFlag(mask, e.target.checked);
                  s.session.revision++;
                  store.emit();
                }}
              />
              {name} {(c.flags & mask) ? 1 : 0}
            </label>
          ))}
        </div>
        <div className="buttons">
          <button className="btn3d" onClick={() => store.open('lexflags')}>analyse</button>
        </div>
      </div>
    </Window>
  );
}

export function LexFlagsWindow() {
  const s = useStore();
  const f = s.session.machine.cpu.flags;
  const cf = (f & CF) !== 0, zf = (f & ZF) !== 0, sf = (f & SF) !== 0, of = (f & OF) !== 0;
  const pf = (f & PF) !== 0, af = (f & AF) !== 0, iff = (f & IF) !== 0, df = (f & DF) !== 0;
  const lines = [
    '=== unsigned ===',
    cf ? 'below (CF=1), carry' : 'not below (CF=0), no carry',
    !cf && !zf ? 'above (CF=0 and ZF=0)' : 'below or equal (CF=1 or ZF=1)',
    '=== signed ===',
    sf === of ? 'not less (SF=OF)' : 'less (SF<>OF)',
    !zf && sf === of ? 'greater (SF=OF and ZF=0)' : 'less or equal (ZF=1 or SF<>OF)',
    '=== other ===',
    zf ? 'equal / zero (ZF=1)' : 'not equal (ZF=0)',
    sf ? 'negative (SF=1)' : 'positive (SF=0)',
    of ? 'overflow (OF=1)' : 'no overflow (OF=0)',
    pf ? 'parity even (PF=1)' : 'parity odd (PF=0)',
    af ? 'aux carry (AF=1)' : 'not aux carry (AF=0)',
    iff ? 'hw-int enabled (IF=1)' : 'hw-int disabled (IF=0)',
    df ? 'backward dir (DF=1)' : 'forward dir (DF=0)',
  ];
  return (
    <Window id="lexflags" title="lexical flag analyser" icon={<Icons.appTool />}>
      <pre className="debug-log sunken" style={{ margin: 4 }}>{lines.join('\n')}</pre>
    </Window>
  );
}

// ============================================================ stack
export function StackWindow() {
  const s = useStore();
  const m = s.session.machine;
  const ss = m.cpu.sregs[2];
  const sp = m.cpu.regs[SP];
  const rows = [];
  const start = Math.max(0, sp - 8) & 0xfffe;
  for (let off = start; off <= Math.min(0xfffe, sp + 64); off += 2) {
    const v = m.mem.read16(ss, off);
    rows.push(
      <div key={off} className={`row ${off === sp ? 'cur' : ''}`}>
        {hex4(ss)}:{hex4(off)}  {hex4(v)} {off === sp ? '<' : ''}
      </div>,
    );
  }
  return (
    <Window id="stack" title="stack" icon={<Icons.appTool />} minW={170}>
      <div className="list sunken" style={{ margin: 4 }} data-testid="stack">{rows}</div>
    </Window>
  );
}

// ============================================================ variables
type ShowAs = 'hex' | 'bin' | 'octal' | 'signed' | 'unsigned' | 'ascii';

function fmt(v: number, size: number, as: ShowAs): string {
  const bits = size * 8;
  switch (as) {
    case 'hex': return v.toString(16).toUpperCase().padStart(size * 2, '0') + 'h';
    case 'bin': return v.toString(2).padStart(bits, '0') + 'b';
    case 'octal': return v.toString(8) + 'o';
    case 'unsigned': return String(v);
    case 'signed': return String(v >= 2 ** (bits - 1) ? v - 2 ** bits : v);
    case 'ascii': return size === 1 ? (v >= 32 ? `'${CP437[v]}'` : String(v)) : fmt(v, size, 'hex');
  }
}

export function VarsWindow() {
  const s = useStore();
  const m = s.session.machine;
  const vars = (m.program?.result.symbols ?? []).filter((x) => x.kind === 'var');
  const [sel, setSel] = useState<string | null>(null);
  const [sizeOverride, setSizeOverride] = useState<Record<string, number>>({});
  const [elements, setElements] = useState<Record<string, number>>({});
  const [showAs, setShowAs] = useState<Record<string, ShowAs>>({});
  const [edit, setEdit] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const current = vars.find((v) => v.name === sel) ?? vars[0];
  const seg = m.program?.loadSegment ?? 0;
  const sizeOf = (name: string, def: number) => sizeOverride[name] ?? def;
  const countOf = (name: string, def: number) => elements[name] ?? Math.min(def, 16);
  const asOf = (name: string, size: number): ShowAs => showAs[name] ?? (size === 1 ? 'hex' : 'hex');

  const valueText = (v: typeof vars[number]) => {
    const size = sizeOf(v.name, v.size || 1);
    const n = countOf(v.name, v.count);
    const parts = [];
    for (let i = 0; i < n; i++) {
      let val = 0;
      for (let b = size - 1; b >= 0; b--) val = val * 256 + m.mem.read8(physical(seg, v.value + i * size + b));
      parts.push(fmt(val, size, asOf(v.name, size)));
    }
    return parts.join(', ');
  };

  return (
    <Window id="vars" title="variables" icon={<Icons.appTool />} minW={300}>
      <div className="dlg" style={{ padding: 6, gap: 6 }}>
        {current && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span>size:</span>
            <select className="sunken" value={sizeOf(current.name, current.size || 1)} onChange={(e) => setSizeOverride({ ...sizeOverride, [current.name]: Number(e.target.value) })}>
              <option value={1}>byte</option><option value={2}>word</option><option value={4}>dword</option>
            </select>
            <span>elements:</span>
            <input className="sunken" style={{ width: 44 }} type="number" min={1} max={256} value={countOf(current.name, current.count)}
              onChange={(e) => setElements({ ...elements, [current.name]: Math.max(1, Math.min(256, Number(e.target.value) || 1)) })} />
            <span>show as:</span>
            <select className="sunken" value={asOf(current.name, current.size)} onChange={(e) => setShowAs({ ...showAs, [current.name]: e.target.value as ShowAs })}>
              {(['hex', 'bin', 'octal', 'signed', 'unsigned', 'ascii'] as ShowAs[]).map((o) => <option key={o}>{o}</option>)}
            </select>
            <button className="btn3d" onClick={() => { setEdit(current.name); setErr(''); }} disabled={s.session.running}>edit</button>
          </div>
        )}
        <div className="plain-list sunken mono" data-testid="vars">
          {!vars.length && <div style={{ padding: 6, fontFamily: 'var(--ui-font)', fontSize: 12 }}>no variables are defined (DB / DW / DD with a name).</div>}
          <table>
            <tbody>
              {vars.map((v) => (
                <tr key={v.name} className={current?.name === v.name ? 'sel' : ''} onClick={() => setSel(v.name)} onDoubleClick={() => { setSel(v.name); setEdit(v.name); setErr(''); }}>
                  <td>{v.name}</td>
                  <td>{valueText(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && current && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const text = (new FormData(e.currentTarget).get('v') as string) ?? '';
              const size = sizeOf(current.name, current.size || 1);
              const r = assemble(`${size === 1 ? 'db' : size === 2 ? 'dw' : 'dd'} ${text}`);
              if (!r.ok) {
                setErr(r.diagnostics[0]?.message ?? 'invalid value');
                return;
              }
              for (let i = 0; i < r.bytes.length; i++) m.mem.write8(physical(seg, current.value + i), r.bytes[i]);
              s.session.revision++;
              setEdit(null);
              store.emit();
            }}
          >
            <span>{current.name} =</span>
            <input name="v" className="sunken" autoFocus style={{ flex: 1 }} placeholder="e.g. 5, 0Ah, 1010b, 'text', 1, 2, 3"
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setEdit(null); }} />
            <button className="btn3d" type="submit">OK</button>
            {err && <span style={{ color: '#c00000' }}>{err}</span>}
          </form>
        )}
      </div>
    </Window>
  );
}

// ============================================================ symbols / listing
export function SymbolsWindow() {
  const s = useStore();
  const r = s.session.machine.program?.result ?? s.lastAssembly;
  const syms = [...(r?.symbols ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Window id="symbols" title="symbol table" icon={<Icons.appTool />}>
      <div className="plain-list sunken" style={{ margin: 4 }}>
        <table>
          <thead><tr><th>name</th><th>offset</th><th>size</th><th>elements</th><th>type</th><th>line</th></tr></thead>
          <tbody>
            {syms.map((x) => (
              <tr key={x.name}>
                <td>{x.name}</td>
                <td>{x.kind === 'const' ? '-' : hex4(x.value)}</td>
                <td>{x.kind === 'var' ? x.size : '-'}</td>
                <td>{x.kind === 'var' ? x.count : '-'}</td>
                <td>{x.kind === 'const' ? `CONST ${x.value}` : x.kind === 'var' ? (x.size === 1 ? 'BYTE' : x.size === 2 ? 'WORD' : 'DWORD') : x.kind === 'proc' ? 'PROC' : 'LABEL'}</td>
                <td>{x.line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Window>
  );
}

export function ListingWindow() {
  const s = useStore();
  const prog = s.session.machine.program;
  const r = prog?.result ?? s.lastAssembly;
  const src = (prog ? s.loadedSource : s.lastAssemblySource).split(/\r?\n/);
  const byLine = new Map<number, { address: number; bytes: number[] }[]>();
  if (r) {
    for (const e of r.sourceMap) {
      const bytes = Array.from(r.bytes.subarray(e.address - r.origin, e.address - r.origin + e.length));
      const list = byLine.get(e.line) ?? [];
      list.push({ address: e.address, bytes });
      byLine.set(e.line, list);
    }
  }
  const out: string[] = [];
  src.forEach((line, i) => {
    const entries = byLine.get(i + 1);
    const first = entries?.[0];
    const hexBytes = first ? first.bytes.slice(0, 6).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') + (first.bytes.length > 6 ? '…' : '') : '';
    out.push(`${String(i + 1).padStart(4)}  ${first ? hex4(first.address) : '    '}  ${hexBytes.padEnd(19)} ${line}`);
  });
  return (
    <Window id="listing" title="listing" icon={<Icons.appTool />}>
      <pre className="debug-log sunken" style={{ margin: 4, whiteSpace: 'pre' }}>{r ? out.join('\n') : 'compile a program first.'}</pre>
    </Window>
  );
}

// ============================================================ tabled memory
export function MemoryWindow() {
  const s = useStore();
  const m = s.session.machine;
  const [addr, setAddr] = useState({ segment: m.cpu.sregs[3], offset: 0 });
  const [text, setText] = useState(`${hex4(addr.segment)}:${hex4(addr.offset)}`);
  const [editing, setEditing] = useState<number | null>(null);
  const rows = [];
  for (let r = 0; r < 16; r++) {
    const off = (addr.offset + r * 16) & 0xffff;
    const cells = [];
    let ascii = '';
    for (let c = 0; c < 16; c++) {
      const o = (off + c) & 0xffff;
      const a = physical(addr.segment, o);
      const b = m.mem.bytes[a];
      ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
      cells.push(
        <td key={c} onDoubleClick={() => setEditing(a)} style={{ padding: '0 3px' }}>
          {editing === a ? (
            <input
              autoFocus
              className="sunken"
              style={{ width: 26, height: 16, padding: 0, fontFamily: 'var(--mono)', fontSize: 14 }}
              defaultValue={b.toString(16).toUpperCase().padStart(2, '0')}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  const v = parseInt((e.target as HTMLInputElement).value, 16);
                  if (!Number.isNaN(v) && v >= 0 && v < 256) {
                    m.mem.write8(a, v);
                    s.session.revision++;
                  }
                  setEditing(null);
                  store.emit();
                }
                if (e.key === 'Escape') setEditing(null);
              }}
              onBlur={() => setEditing(null)}
            />
          ) : b.toString(16).toUpperCase().padStart(2, '0')}
        </td>,
      );
    }
    rows.push(
      <tr key={r}>
        <td style={{ color: '#808080' }}>{hex4(addr.segment)}:{hex4(off)}</td>
        {cells}
        <td style={{ paddingLeft: 8 }}>{ascii}</td>
      </tr>,
    );
  }
  return (
    <Window id="memory" title="Random Access Memory" icon={<Icons.appTool />}>
      <div className="dlg" style={{ padding: 6, gap: 6 }}>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const mm = /^\s*([0-9a-f]{1,4})h?\s*:\s*([0-9a-f]{1,4})h?\s*$/i.exec(text);
            if (mm) setAddr({ segment: parseInt(mm[1], 16), offset: parseInt(mm[2], 16) });
          }}
        >
          <span>address:</span>
          <input className="sunken mono" style={{ width: 100, height: 22 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="btn3d" type="submit" title="update memory viewer">update</button>
          <span style={{ color: '#555' }}>double-click a byte to edit it</span>
        </form>
        <div className="plain-list sunken mono">
          <table><tbody>{rows}</tbody></table>
        </div>
      </div>
    </Window>
  );
}
