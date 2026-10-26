import { useEffect, useRef, useState } from 'react';
import { Window } from './Window';
import { Icons } from '../icons';
import { MenuPopup } from '../Menu';
import { store, useStore, type MessageBox } from '../store';
import * as A from '../actions';
import { SCREEN_FONTS } from './ScreenWindow';

function MsgIcon({ icon }: { icon: MessageBox['icon'] }) {
  if (icon === 'error') return <Icons.bigError />;
  if (icon === 'warn') return <Icons.bigWarn />;
  if (icon === 'stop') return <Icons.bigError />;
  return <Icons.bigInfo />;
}

function Box({ id, box }: { id: 'message' | 'confirm'; box: MessageBox }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), [box]);
  const buttons = box.buttons ?? [{ label: 'OK', default: true }];
  return (
    <Window id={id} title={box.title} icon={<Icons.msgStop />} tool resizable={false}>
      <div className="dlg" data-testid={`${id}-box`}>
        <div className="msg-body">
          {box.icon !== 'stop' && <span className="msg-icon"><MsgIcon icon={box.icon} /></span>}
          <div className="msg-text">{box.text}</div>
        </div>
        <div className="buttons">
          {buttons.map((b) => (
            <button
              key={b.label}
              ref={b.default ? ok : undefined}
              className="btn3d"
              onClick={() => {
                store.close(id);
                b.action?.();
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </Window>
  );
}

export function MessageDialog() {
  const s = useStore();
  return s.message ? <Box id="message" box={s.message} /> : null;
}

export function ConfirmDialog() {
  const s = useStore();
  return s.confirm ? <Box id="confirm" box={s.confirm} /> : null;
}

// ------------------------------------------------------------ assembler status
export function StatusDialog() {
  const s = useStore();
  const r = s.lastAssembly;
  const [view, setView] = useState<{ x: number; y: number } | null>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const errors = r?.diagnostics.filter((d) => d.severity === 'error') ?? [];
  return (
    <Window id="status" title="assembler status" icon={<Icons.appTool />} tool>
      <div className="dlg" data-testid="assembler-status">
        <div className="plain-list sunken" style={{ maxHeight: 110, flex: '0 0 auto' }}>
          <table><tbody>{s.statusLines.map((l, i) => <tr key={i}><td>{l}</td></tr>)}</tbody></table>
        </div>
        {errors.length > 0 && (
          <>
            <span>compilation errors:</span>
            <div className="plain-list sunken">
              <table>
                <tbody>
                  {errors.map((d, i) => (
                    <tr
                      key={i}
                      className="err"
                      title="click to show the line in the editor"
                      onClick={() => {
                        store.focus('editor');
                        store.editor?.gotoLine(d.line, d.col);
                      }}
                    >
                      <td style={{ color: '#c00000', whiteSpace: 'normal' }}>({d.line}) {d.message} <span style={{ color: '#777' }}>[col {d.col}]</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="buttons">
          <button
            className="btn3d"
            ref={viewRef}
            disabled={!r}
            onClick={() => {
              const b = viewRef.current!.getBoundingClientRect();
              setView({ x: b.left, y: b.bottom });
            }}
          >view...</button>
          <button className="btn3d" disabled title="external tools are not available in the browser version">external...</button>
          <button className="btn3d" onClick={() => store.close('status')}>close</button>
          <button className="btn3d" disabled={!r?.ok} onClick={() => { store.close('status'); A.emulate(); }}>run</button>
        </div>
      </div>
      {view && (
        <MenuPopup
          x={view.x}
          y={view.y}
          onClose={() => setView(null)}
          items={[
            { label: 'symbol table', action: () => store.open('symbols') },
            { label: 'listing', action: () => store.open('listing') },
            'sep',
            { label: 'save executable file...', disabled: !r?.ok, action: A.saveExecutable },
          ]}
        />
      )}
    </Window>
  );
}

// ------------------------------------------------------------ new: choose template
export function TemplateDialog() {
  const [choice, setChoice] = useState<'com' | 'bin' | 'boot' | 'empty'>('com');
  const opts: { v: typeof choice | 'exe'; label: string; disabled?: boolean }[] = [
    { v: 'com', label: 'COM template - simple and tiny executable file format, pure machine code.' },
    { v: 'exe', label: 'EXE template - advanced executable file. header: relocation, checksum. (not supported yet)', disabled: true },
    { v: 'bin', label: 'BIN template - pure binary file, allows all sorts of customizations (advanced)' },
    { v: 'boot', label: 'BOOT template - for creating floppy disk boot records (very advanced)' },
    { v: 'empty', label: 'empty workspace' },
  ];
  return (
    <Window id="template" title="choose code template" icon={<Icons.appTool />} tool resizable={false}>
      <form
        className="dlg"
        onSubmit={(e) => {
          e.preventDefault();
          store.close('template');
          A.newFromTemplate(choice);
        }}
      >
        {opts.map((o) => (
          <label key={o.v} className="row" style={{ color: o.disabled ? '#8d8d8d' : undefined, alignItems: 'flex-start' }}>
            <input type="radio" name="tpl" disabled={o.disabled} checked={choice === o.v} onChange={() => setChoice(o.v as typeof choice)} />
            <span>{o.label}</span>
          </label>
        ))}
        <div className="buttons">
          <button className="btn3d" type="submit" autoFocus>OK</button>
          <button className="btn3d" type="button" onClick={() => store.close('template')}>Cancel</button>
        </div>
      </form>
    </Window>
  );
}

// ------------------------------------------------------------ go to line
export function GotoDialog() {
  const s = useStore();
  const [v, setV] = useState('');
  return (
    <Window id="goto" title="go to line" icon={<Icons.appTool />} tool resizable={false}>
      <form
        className="dlg"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(v, 10);
          if (n > 0) {
            store.close('goto');
            store.focus('editor');
            store.editor?.gotoLine(n);
          }
        }}
      >
        <div className="row">
          <span>line number (1 - {s.editor ? s.editor.getText().split('\n').length : 1}):</span>
          <input className="sunken" autoFocus style={{ width: 70 }} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="buttons">
          <button className="btn3d" type="submit">OK</button>
          <button className="btn3d" type="button" onClick={() => store.close('goto')}>Cancel</button>
        </div>
      </form>
    </Window>
  );
}

// ------------------------------------------------------------ options
export function OptionsDialog() {
  const s = useStore();
  const st = s.settings;
  return (
    <Window id="options" title="options" icon={<Icons.appTool />} tool resizable={false}>
      <div className="dlg">
        <div className="group">
          <span className="legend">emulator</span>
          <div className="row">
            <span style={{ width: 170 }}>step delay (ms):</span>
            <input className="sunken" type="number" min={0} max={2000} style={{ width: 80 }} value={st.stepDelay}
              onChange={(e) => store.updateSettings({ stepDelay: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })} />
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <span style={{ width: 170 }}>instruction limit per run:</span>
            <select className="sunken" value={st.instructionLimit} onChange={(e) => store.updateSettings({ instructionLimit: Number(e.target.value) })}>
              {[100_000, 1_000_000, 5_000_000, 20_000_000, 100_000_000, 0].map((n) => (
                <option key={n} value={n}>{n === 0 ? 'unlimited' : n.toLocaleString('en-US')}</option>
              ))}
            </select>
          </div>
          <label className="row" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={st.activateScreen} onChange={(e) => store.updateSettings({ activateScreen: e.target.checked })} />
            show the emulator screen automatically when the program writes to it
          </label>
        </div>
        <div className="group">
          <span className="legend">emulator screen</span>
          <div className="row">
            <span style={{ width: 170 }}>font:</span>
            <select className="sunken" value={st.screenFont} onChange={(e) => store.updateSettings({ screenFont: Number(e.target.value) })}>
              {SCREEN_FONTS.map((f, i) => <option key={f.family} value={i}>{f.label}</option>)}
            </select>
          </div>
        </div>
        <div className="group">
          <span className="legend">windows</span>
          <div className="row">
            <button className="btn3d" onClick={() => store.resetLayout()}>reset window layout</button>
            <button className="btn3d" onClick={() => store.cascade()}>cascade</button>
            <button className="btn3d" onClick={() => store.tile()}>tile</button>
          </div>
        </div>
        <div className="buttons">
          <button className="btn3d" onClick={() => store.close('options')}>close</button>
        </div>
      </div>
    </Window>
  );
}

// ------------------------------------------------------------ about
export function AboutDialog() {
  return (
    <Window id="about" title="about 8086 Studio" icon={<Icons.appTool />} tool resizable={false}>
      <div className="dlg">
        <div className="msg-body" style={{ flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 14 }}>8086 Studio 1.0</b>
          <span>assembler and microprocessor emulator for the browser, modelled on the EMU8086 4.08 workflow used in class.</span>
          <span>Runs entirely in this browser tab: no server, account or network access.</span>
          <span style={{ color: '#555' }}>
            Not affiliated with EMU8086 or its authors; all artwork is original.
            Fonts: The Ultimate Oldschool PC Font Pack by VileR (int10h.org), CC BY-SA 4.0.
            Editor: CodeMirror (MIT). UI: React (MIT).
          </span>
        </div>
        <div className="buttons">
          <button className="btn3d" autoFocus onClick={() => store.close('about')}>OK</button>
        </div>
      </div>
    </Window>
  );
}
