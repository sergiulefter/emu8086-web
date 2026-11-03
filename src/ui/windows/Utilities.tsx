import { useEffect, useRef, useState } from 'react';
import { Window } from './Window';
import { Icons } from '../icons';
import { store, useStore } from '../store';
import { evaluate, formatIn } from '../../debug/calc';
import { runDebugCommand, type DebugContext } from '../../debug/debugCommands';
import { CP437 } from '../../devices/vga/textmode';

// ============================================================ calculator
export function CalculatorWindow() {
  const [expr, setExpr] = useState('');
  const [base, setBase] = useState<'dec' | 'hex' | 'oct' | 'bin'>('dec');
  const [signed, setSigned] = useState(false);
  const [bits, setBits] = useState<8 | 16>(16);
  const [history, setHistory] = useState<string[]>([]);
  const run = () => {
    const t = expr.trim();
    if (!t) return;
    let line: string;
    try {
      let v = evaluate(t);
      if (signed && /[0-9a-f]h\b|0x|[01]b\b|[0-7]o\b/i.test(t) && v >= 0) {
        const max = 1 << bits;
        if (v < max && v >= max / 2) v -= max;
      }
      line = `${t} = ${formatIn(v, base, base === 'dec' ? 32 : bits === 8 && v >= -128 && v < 256 ? 8 : v >= -32768 && v < 65536 ? 16 : 32)}`;
    } catch (e) {
      line = `${t} : ${(e as Error).message}`;
    }
    setHistory([...history, line].slice(-100));
    setExpr('');
  };
  return (
    <Window id="calculator" title="calculator - expression evaluator" icon={<Icons.appTool />}>
      <div className="dlg" style={{ gap: 6 }}>
        <pre className="debug-log sunken" style={{ flex: 1 }}>{history.join('\n') || 'type an expression and press Enter, e.g.  (0B800h + 162) * 2   or   1111_0000b >> 4'}</pre>
        <input
          className="sunken mono"
          aria-label="expression"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') run(); }}
          placeholder="expression: ~ * / % + - << >> & ^ |"
        />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span>show result as:</span>
          {(['dec', 'hex', 'oct', 'bin'] as const).map((b) => (
            <label key={b} className="row" style={{ gap: 3 }}><input type="radio" checked={base === b} onChange={() => setBase(b)} />{{ dec: 'decimal', hex: 'hex', oct: 'oct', bin: 'bin' }[b]}</label>
          ))}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span>treat hex, oct, bin as:</span>
          <label className="row" style={{ gap: 3 }}><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} />signed</label>
          <label className="row" style={{ gap: 3 }}><input type="radio" checked={bits === 16} onChange={() => setBits(16)} />word</label>
          <label className="row" style={{ gap: 3 }}><input type="radio" checked={bits === 8} onChange={() => setBits(8)} />byte</label>
          <button className="btn3d" style={{ marginLeft: 'auto' }} onClick={() => setHistory([])}>clear</button>
        </div>
      </div>
    </Window>
  );
}

// ============================================================ base convertor
export function ConvertorWindow() {
  const [bits, setBits] = useState<8 | 16>(8);
  const [value, setValue] = useState(0);
  const [edit, setEdit] = useState<{ field: string; text: string } | null>(null);
  const max = 1 << bits;
  const v = value & (max - 1);
  const signedV = v >= max / 2 ? v - max : v;
  const fields: { key: string; label: string; show: string; parse: (t: string) => number | null }[] = [
    { key: 'hex', label: 'HEX', show: v.toString(16).toUpperCase().padStart(bits / 4, '0'), parse: (t) => (/^[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : null) },
    { key: 'dec', label: 'DEC (unsigned)', show: String(v), parse: (t) => (/^\d+$/.test(t) ? parseInt(t, 10) : null) },
    { key: 'sdec', label: 'DEC (signed)', show: String(signedV), parse: (t) => (/^-?\d+$/.test(t) ? parseInt(t, 10) : null) },
    { key: 'oct', label: 'OCT', show: v.toString(8), parse: (t) => (/^[0-7]+$/.test(t) ? parseInt(t, 8) : null) },
    { key: 'bin', label: 'BIN', show: v.toString(2).padStart(bits, '0'), parse: (t) => (/^[01_]+$/.test(t) ? parseInt(t.replace(/_/g, ''), 2) : null) },
    {
      key: 'chr', label: 'char', show: bits === 8 ? (v ? CP437[v] : '') : (v >> 8 ? CP437[v >> 8] : '') + (v & 0xff ? CP437[v & 0xff] : ''),
      parse: (t) => (t.length === 1 ? t.charCodeAt(0) & 0xff : t.length === 2 && bits === 16 ? ((t.charCodeAt(0) & 0xff) << 8) | (t.charCodeAt(1) & 0xff) : null),
    },
  ];
  return (
    <Window id="convertor" title="base convertor" icon={<Icons.appTool />} resizable={false}>
      <div className="dlg">
        <div className="row">
          <label className="row" style={{ gap: 3 }}><input type="radio" checked={bits === 8} onChange={() => setBits(8)} />8 bit</label>
          <label className="row" style={{ gap: 3 }}><input type="radio" checked={bits === 16} onChange={() => setBits(16)} />16 bit</label>
        </div>
        <div className="vv-wide" style={{ gridTemplateColumns: '110px 1fr' }}>
          {fields.map((f) => {
            const text = edit?.field === f.key ? edit.text : f.show;
            const parsed = edit?.field === f.key ? f.parse(edit.text) : 0;
            const bad = edit?.field === f.key && (parsed === null || parsed < -(max / 2) || parsed >= max);
            return [
              <span key={f.key + 'l'}>{f.label}:</span>,
              <input
                key={f.key}
                className="sunken mono"
                aria-label={f.label}
                value={text}
                style={{ height: 22, color: bad ? '#c00000' : undefined }}
                onChange={(e) => {
                  const t = e.target.value;
                  setEdit({ field: f.key, text: t });
                  const p = f.parse(t.trim());
                  if (p !== null && p >= -(max / 2) && p < max) setValue(p & (max - 1));
                }}
                onBlur={() => setEdit(null)}
                onKeyDown={(e) => e.stopPropagation()}
              />,
            ];
          })}
        </div>
      </div>
    </Window>
  );
}

// ============================================================ ascii codes
export function AsciiWindow() {
  const [sel, setSel] = useState(0x41);
  return (
    <Window id="ascii" title="ascii codes" icon={<Icons.appTool />}>
      <div className="dlg" style={{ padding: 4, gap: 4 }}>
        <div className="ascii-grid sunken">
          {CP437.map((ch, i) => (
            <div key={i} className={sel === i ? 'sel' : ''} onClick={() => setSel(i)} title={`${i} = ${i.toString(16).toUpperCase().padStart(2, '0')}h`}>
              {i === 0 ? ' ' : ch}
            </div>
          ))}
        </div>
        <div className="statusbar" style={{ background: 'transparent' }}>
          <div className="cell">char: {sel === 0 ? 'NULL' : CP437[sel]}</div>
          <div className="cell">decimal: {sel}</div>
          <div className="cell">hex: {sel.toString(16).toUpperCase().padStart(2, '0')}h</div>
          <div className="cell">binary: {sel.toString(2).padStart(8, '0')}b</div>
        </div>
      </div>
    </Window>
  );
}

// ============================================================ debug log
export function DebugLogWindow() {
  const s = useStore();
  const ctx = useRef<DebugContext>({ session: s.session });
  const [log, setLog] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const out = useRef<HTMLPreElement>(null);
  const machineLog = s.session.machine.log;
  useEffect(() => {
    if (out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [log, machineLog.length]);
  const submit = () => {
    const c = cmd.trim();
    if (c.toLowerCase() === 'cls') {
      setLog([]);
      setCmd('');
      return;
    }
    const res = runDebugCommand(ctx.current, c);
    setLog([...log, `-${c}`, ...(res ? [res] : [])].slice(-400));
    setCmd('');
    store.emit();
  };
  return (
    <Window id="debug" title="debug log - debug.exe emulation" icon={<Icons.appTool />}>
      <div className="dlg" style={{ padding: 4, gap: 4 }}>
        <pre className="debug-log sunken" ref={out} data-testid="debug-log">
          {machineLog.length ? machineLog.join('\n') + '\n' : ''}
          {log.join('\n') || (machineLog.length ? '' : 'type a debug command below (? for help), e.g.  r   t   d ds:0   u cs:100')}
        </pre>
        <div className="row">
          <span>-</span>
          <input
            className="sunken mono"
            style={{ flex: 1, height: 22 }}
            aria-label="debug command"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); }}
          />
          <button className="btn3d" onClick={submit}>execute</button>
          <button className="btn3d" onClick={() => { setLog([]); machineLog.length = 0; store.emit(); }}>clear</button>
        </div>
      </div>
    </Window>
  );
}

