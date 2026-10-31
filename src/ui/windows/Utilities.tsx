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

// ============================================================ help
export function HelpWindow() {
  return (
    <Window id="help" title="documentation and tutorials" icon={<Icons.help size={16} />}>
      <div className="help-body">
        <h2>emu8086-web — quick guide</h2>
        <p>
          Write or paste an 8086 program in the editor, then press <b>emulate</b> (F5). The program is assembled and
          loaded into the <b>emulator</b> window; nothing runs until you press <b>single step</b> (F8) or <b>run</b> (F9).
          The <b>emulator screen</b> shows the 80×25 text video memory at <code>B800:0000</code>; the <b>original source code</b> window
          highlights the next line to execute.
        </p>
        <h3>Keyboard</h3>
        <table>
          <tbody>
            <tr><td>F5</td><td>compile and load in the emulator</td></tr>
            <tr><td>F8 / Shift+F8</td><td>single step / step over (CALL, INT, LOOP, REP)</td></tr>
            <tr><td>F6</td><td>step back (exact undo of the previous instruction)</td></tr>
            <tr><td>F9</td><td>run / stop (run is a toggle, as in EMU8086)</td></tr>
            <tr><td>F4</td><td>reload (assemble the current source again and restart)</td></tr>
            <tr><td>F7</td><td>show current instruction</td></tr>
            <tr><td>Ctrl+F8</td><td>run until the selected disassembly line</td></tr>
            <tr><td>F11</td><td>debug log (debug.exe-style commands)</td></tr>
            <tr><td>Ctrl+F, F3, Ctrl+H, Ctrl+G</td><td>find, find next, replace, go to line</td></tr>
            <tr><td>Ctrl+F2 / F2 / Shift+F2</td><td>toggle / next / previous bookmark</td></tr>
            <tr><td>Ctrl+Alt+Q / Ctrl+Alt+W</td><td>comment / uncomment block (EMU8086 uses Ctrl+Q / Ctrl+W, which browsers reserve)</td></tr>
          </tbody>
        </table>
        <h3>Program types</h3>
        <p>
          <b>COM</b> (<code>org 100h</code>): loaded at <code>0700:0100</code> like EMU8086 4.08, with a PSP at <code>0700:0000</code> whose first
          instruction is <code>INT 20h</code>. <code>SS:SP = 0700:FFFE</code> holds <code>0000</code>, so a final <code>RET</code> returns into the PSP and
          terminates the program with <i>PROGRAM HAS RETURNED CONTROL TO THE OPERATING SYSTEM</i>. <code>MOV AX, 4C00h / INT 21h</code> terminates too.
          <br />
          <b>BIN</b> (no <code>org 100h</code>, or <code>#make_bin#</code>): loaded at <code>0100:0000</code>; by default, a final <code>RET</code> reaches a <code>HLT</code>.
          <code>#LOAD_SEGMENT=…#</code>, <code>#CS=…#</code>, <code>#IP=…#</code> etc. are honoured. <b>EXE</b> programs (<code>.model</code>, segments) are not supported yet.
        </p>
        <h3>Assembler syntax</h3>
        <ul>
          <li>Numbers: <code>162</code>, <code>162d</code>, <code>0B800h</code> (hex must start with a digit), <code>0x1F</code>, <code>0000_1111b</code>, <code>17o</code>, <code>'H'</code>, <code>-1</code></li>
          <li>Directives: <code>ORG</code>, <code>DB</code>, <code>DW</code>, <code>DD</code>, <code>DUP</code>, <code>?</code>, <code>EQU</code> (numeric and text), <code>=</code>, <code>PROC/ENDP</code> (NEAR/FAR), <code>END</code>, <code>NAME</code>, <code>COMMENT</code>, <code>$</code>, <code>#make_com#</code>, <code>#make_bin#</code>, <code>#make_boot#</code></li>
          <li>Operators: <code>+ - * / MOD SHL SHR AND OR XOR NOT OFFSET HIGH LOW LENGTH SIZE TYPE</code></li>
          <li>Operands: <code>BYTE PTR</code>/<code>WORD PTR</code> or <code>b.</code>/<code>w.</code>, <code>ES:[DI]</code>, <code>var[BX]</code>, <code>[BX+SI+5]</code>, <code>SHORT</code>, <code>FAR PTR</code>, <code>seg:off</code></li>
          <li>Out-of-range conditional jumps are replaced by the opposite jump + <code>JMP</code> (5 bytes), and <code>SHL AX, 3</code> becomes three <code>SHL AX, 1</code>, as in EMU8086.</li>
          <li>Not supported yet: <code>MACRO</code>, <code>INCLUDE</code> (e.g. <code>emu8086.inc</code>), EXE segments, FPU instructions.</li>
        </ul>
        <h3>DOS and BIOS services</h3>
        <ul>
          <li><b>INT 21h</b>: 00h, 01h, 02h, 06h, 07h, 08h, 09h, 0Ah, 0Bh, 0Ch, 25h, 2Ah, 2Ch, 35h, 4Ch</li>
          <li><b>INT 10h</b>: 00h (text modes 0–3, 7), 01h, 02h, 03h, 05h, 06h, 07h, 08h, 09h, 0Ah, 0Eh, 0Fh, 13h, 1003h</li>
          <li><b>INT 16h</b>: 00h, 01h, 02h, 10h, 11h &nbsp; <b>INT 20h</b> &nbsp; <b>INT 11h</b>, <b>INT 12h</b>, <b>INT 15h/86h</b>, <b>INT 1Ah/00h</b>, <b>INT 19h</b> (stops)</li>
          <li>Any other service stops the program with an explicit “not supported” message instead of pretending to succeed. Programs can install their own handlers with INT 21h/25h or by writing the vector table.</li>
        </ul>
        <h3>Keyboard input</h3>
        <p>When a program waits for a key (INT 16h, INT 21h/01h…), click the emulator screen and type. The <code>n/15</code> box shows the BIOS keyboard buffer.</p>
        <h3>Debugging</h3>
        <ul>
          <li>Double-click a register or a memory byte for the <b>extended value viewer</b>; type into register boxes to change them.</li>
          <li>Click a disassembly line to select it; double-click (or right-click) to set a break point. Click a line number in the original source window to toggle a break point.</li>
          <li><b>step back</b> restores registers, flags, memory, screen and keyboard state exactly (up to 50 000 steps).</li>
          <li>Every <b>run</b> is limited to 5 000 000 instructions by default (options) so endless loops never freeze the page; run can also be stopped at any time.</li>
        </ul>
      </div>
    </Window>
  );
}
