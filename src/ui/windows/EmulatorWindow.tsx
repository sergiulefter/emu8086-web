import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Window } from './Window';
import { MenuBar, MenuPopup, type MenuDef, type MenuEntry } from '../Menu';
import { Icons } from '../icons';
import { store, useStore } from '../store';
import * as A from '../actions';
import { EXAMPLES } from '../../examples';
import { physical } from '../../cpu/memory';
import { hex4 } from '../../debug/machine';
import { CONTROL_NAMES, CP437 } from '../../devices/vga/textmode';
import { REGISTER_ORDER, type RegisterName } from '../../debug/session';
import { AX, BP, BX, CX, DI, DX, SI, SP } from '../../cpu/cpu';
import { loadExecutableFile } from '../loadExecutable';
import { parseAddress } from '../addressParser';

const ROW = 14;
const unavailable = 'not available in the browser version of emu8086-web';

function emulatorMenus(): MenuDef[] {
  const m = store.session.machine;
  const running = store.session.running;
  return [
    {
      label: 'file',
      items: [
        { label: 'load executable...', action: loadExecutableFile },
        { label: 'reload', shortcut: 'F4', action: A.reload },
        'sep',
        {
          label: 'examples',
          submenu: EXAMPLES.map((ex, i) => ({
            label: ex.name,
            action: () => {
              A.openExample(i);
              setTimeout(() => store.emulate(), 0);
            },
          })),
        },
        'sep',
        { label: 'reset emulator and ram', action: A.resetEmulator, disabled: !m.program },
        'sep',
        { label: 'set command line parameters', disabled: true, title: 'not supported yet (the PSP command tail is always empty)' },
        'sep',
        { label: "save the emulator's state", disabled: true, title: 'not supported yet' },
        { label: 'load from previous state', disabled: true, title: 'not supported yet' },
        'sep',
        { label: 'close the emulator', action: () => { store.session.stop(); store.close('emulator'); } },
      ],
    },
    {
      label: 'math',
      items: [
        { label: 'multi base calculator', action: () => store.open('calculator') },
        { label: 'base converter', action: () => store.open('convertor') },
      ],
    },
    {
      label: 'debug',
      items: [
        { label: 'single step', shortcut: 'F8', action: A.singleStep, disabled: !m.program },
        { label: 'step over', shortcut: 'Shift+F8', action: A.stepOver, disabled: !m.program },
        'sep',
        { label: 'step back', shortcut: 'F6', action: A.stepBack, disabled: !m.canStepBack },
        'sep',
        { label: 'stop on condition...', disabled: true, title: 'not supported yet' },
        'sep',
        { label: `run until (${hex5(store.selectionOrIp())})`, shortcut: 'Ctrl+F8', action: A.runUntilSelected, disabled: !m.program },
        { label: 'run', shortcut: 'F9', action: A.toggleRun, disabled: !m.program || running },
        { label: 'stop', action: A.stopRun, disabled: !running },
        'sep',
        { label: `set break point (${hex5(store.selectionOrIp())})`, action: A.setBreakpointAtSelection, disabled: !m.program },
        { label: 'clear break point', action: A.clearBreakpoints, disabled: m.breakpoints.size === 0 },
        {
          label: 'show current break point',
          disabled: m.breakpoints.size === 0,
          action: () => store.showMessage({
            title: 'message', icon: 'info',
            text: `break points at:\n${[...m.breakpoints].map(hex5).join('\n')}`,
          }),
        },
        'sep',
        { label: 'show current instruction (at CS:IP)', shortcut: 'F7', action: A.showCurrentInstruction },
        'sep',
        { label: `set CS:IP to selected position (${store.selectedAddress === null ? '????:????' : hex5(store.selectedAddress)})`, shortcut: 'Ctrl+Shift+F7', action: A.setCsIpToSelection, disabled: store.selectedAddress === null },
      ],
    },
    {
      label: 'view',
      items: [
        { label: 'log and debug.exe emulation', shortcut: 'F11', action: () => store.open('debug') },
        'sep',
        { label: 'extended value viewer', action: () => store.open('viewer') },
        'sep',
        { label: 'stack', action: () => store.open('stack') },
        'sep',
        { label: 'variables', action: () => store.open('vars') },
        { label: 'memory', action: () => store.open('memory') },
        'sep',
        { label: 'symbol table', action: () => store.open('symbols') },
        { label: 'listing', action: () => store.open('listing') },
        'sep',
        { label: 'original source code', action: () => store.open('source') },
        'sep',
        { label: 'options', action: () => store.open('options') },
        'sep',
        { label: 'arithmetic & logical unit', disabled: true, title: 'not supported yet' },
        'sep',
        { label: 'flags', action: () => store.open('flags') },
        { label: 'lexical flag analyzer', action: () => store.open('lexflags') },
        'sep',
        { label: 'ascii codes', action: () => store.open('ascii') },
        'sep',
        { label: 'emulator screen', action: () => store.open('screen') },
      ],
    },
    {
      label: 'external',
      items: [
        { label: 'start debug.exe (external)', shortcut: 'F12', disabled: true, title: unavailable },
        'sep',
        { label: 'command prompt (external)', disabled: true, title: unavailable },
        'sep',
        { label: 'run (external)', disabled: true, title: unavailable },
      ],
    },
    {
      label: 'virtual devices',
      items: [{ label: 'no virtual devices are installed', disabled: true, title: 'virtual devices (traffic lights, stepper motor...) are outside the course scope' }],
    },
    {
      label: 'virtual drive',
      items: [
        { label: 'boot from virtual floppy', disabled: true, title: unavailable },
        'sep',
        { label: 'write 512 bytes at 0000:7c00 to boot sector', disabled: true, title: unavailable },
        { label: "write '.bin' file to floppy...", disabled: true, title: unavailable },
        'sep',
        { label: 'create new floppy drive', disabled: true, title: unavailable },
      ],
    },
    {
      label: 'help',
      items: [
        { label: 'documentation and tutorials', shortcut: 'F1', action: A.openHelp },
        'sep',
        { label: 'about...', action: () => store.open('about') },
      ],
    },
  ];
}

function hex5(a: number): string {
  return a.toString(16).toUpperCase().padStart(5, '0');
}

function charRepr(b: number): string {
  return CONTROL_NAMES[b] ?? CP437[b];
}

// ------------------------------------------------------------ registers
function RegisterBox({ name, value, width, changed, onCommit, onDouble, disabled }: {
  name: string; value: number; width: 2 | 4; changed: boolean; disabled: boolean;
  onCommit: (v: number) => void; onDouble: () => void;
}) {
  const text = value.toString(16).toUpperCase().padStart(width, '0');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = parseInt(draft, 16);
    if (/^[0-9a-f]{1,4}$/i.test(draft.trim()) && v < 1 << (width * 4)) onCommit(v);
    setDraft(null);
  };
  return (
    <input
      className={`sunken ${changed ? 'changed' : ''}`}
      aria-label={name}
      title={`${name}: double-click for the extended value viewer`}
      value={draft ?? text}
      maxLength={width}
      spellCheck={false}
      readOnly={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
        e.stopPropagation();
      }}
      onDoubleClick={onDouble}
    />
  );
}

function Registers() {
  const s = useStore();
  const ses = s.session;
  const regs = ses.registers();
  const prev = ses.previous;
  const cpu = ses.machine.cpu;
  const running = ses.running;
  const index: Record<string, number> = { AX, BX, CX, DX, SP, BP, SI, DI };
  const setWord = (name: RegisterName, v: number) => {
    switch (name) {
      case 'CS': cpu.sregs[1] = v; break;
      case 'DS': cpu.sregs[3] = v; break;
      case 'ES': cpu.sregs[0] = v; break;
      case 'SS': cpu.sregs[2] = v; break;
      case 'IP': cpu.ip = v; break;
      default: cpu.regs[index[name]] = v;
    }
    store.disasmAnchor = null;
    ses.revision++;
    store.emit();
  };
  const changed = (n: RegisterName, mask = 0xffff) => !!prev && (prev[n] & mask) !== (regs[n] & mask);
  return (
    <div className="regs">
      <div className="group">
        <span className="legend">registers</span>
        <div className="reg-head"><span /><span>H</span><span>L</span></div>
        {(['AX', 'BX', 'CX', 'DX'] as const).map((n) => (
          <div className="reg-row" key={n}>
            <label>{n}</label>
            <RegisterBox name={`${n[0]}H`} value={regs[n] >> 8} width={2} changed={changed(n, 0xff00)} disabled={running}
              onCommit={(v) => setWord(n, (regs[n] & 0xff) | (v << 8))} onDouble={() => store.setWatch({ kind: 'reg', name: n })} />
            <RegisterBox name={`${n[0]}L`} value={regs[n] & 0xff} width={2} changed={changed(n, 0x00ff)} disabled={running}
              onCommit={(v) => setWord(n, (regs[n] & 0xff00) | v)} onDouble={() => store.setWatch({ kind: 'reg', name: n })} />
          </div>
        ))}
        <div style={{ height: 6 }} />
        {REGISTER_ORDER.slice(4).map((n) => (
          <div className="reg-row w" key={n}>
            <label>{n}</label>
            <RegisterBox name={n} value={regs[n]} width={4} changed={changed(n)} disabled={running}
              onCommit={(v) => setWord(n, v)} onDouble={() => store.setWatch({ kind: 'reg', name: n })} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ address box
function AddressBox({ segment, offset, onGo, label }: { segment: number; offset: number; onGo: (seg: number, off: number) => void; label: string }) {
  const text = `${hex4(segment)}:${hex4(offset)}`;
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const r = parseAddress(draft, store.session.machine);
    if (r) {
      onGo(r.segment, r.offset);
      setDraft(null);
      setBad(false);
    } else setBad(true);
  };
  return (
    <input
      className="sunken addrbox"
      aria-label={label}
      title="type an address: 0700:0100, DS:[BX], CS:IP, ES:DI, a variable name... then press Enter"
      style={bad ? { color: '#c00000' } : undefined}
      value={draft ?? text}
      spellCheck={false}
      onChange={(e) => { setDraft(e.target.value); setBad(false); }}
      onBlur={() => { setDraft(null); setBad(false); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(null); setBad(false); }
      }}
    />
  );
}

// ------------------------------------------------------------ memory list
function MemoryList() {
  const s = useStore();
  const m = s.session.machine;
  const cs = m.cpu.sregs[1];
  const ip = m.cpu.ip;
  const anchor = s.memoryAnchor ?? { segment: cs, offset: ip };
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(300);
  const cur = physical(cs, ip);
  const len = m.program ? m.disassembleAt(cs, ip).length : 1;
  const segBase = (anchor.segment << 4);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // keep the anchor (CS:IP or typed address) visible
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const row = anchor.offset;
    const top = row * ROW;
    if (top < el.scrollTop || top + ROW > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - 2 * ROW);
      setScrollTop(el.scrollTop);
    }
  }, [anchor.segment, anchor.offset, s.session.revision]);

  const first = Math.floor(scrollTop / ROW);
  const count = Math.ceil(height / ROW) + 2;
  const rows = [];
  for (let i = first; i < Math.min(first + count, 0x10000); i++) {
    const a = (segBase + i) & 0xfffff;
    const b = m.mem.bytes[a];
    const isCur = m.program !== null && a === cur;
    const isCur2 = m.program !== null && a > cur && a < cur + len;
    rows.push(
      <div
        key={i}
        className={`row ${isCur ? 'cur' : ''} ${isCur2 ? 'cur2' : ''}`}
        style={{ position: 'absolute', top: i * ROW, left: 0, right: 0 }}
        onDoubleClick={() => store.setWatch({ kind: 'mem', segment: anchor.segment, offset: i })}
        title="double-click: extended value viewer (word at this address)"
      >
        {hex5(a)}: <span className="hx">{b.toString(16).toUpperCase().padStart(2, '0')}</span> {String(b).padStart(3, '0')} {charRepr(b)}
      </div>,
    );
  }
  return (
    <div className="col-list">
      <AddressBox label="memory address" segment={anchor.segment} offset={anchor.offset} onGo={(segment, offset) => { store.memoryAnchor = { segment, offset }; store.emit(); }} />
      <div className="list sunken" ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} data-testid="memory-list">
        <div style={{ height: 0x10000 * ROW, position: 'relative' }}>{rows}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ disassembly
function DisassemblyList() {
  const s = useStore();
  const m = s.session.machine;
  const cs = m.cpu.sregs[1];
  const ip = m.cpu.ip;
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  const [menu, setMenu] = useState<{ x: number; y: number; addr: number } | null>(null);
  const anchorRef = useRef<{ segment: number; offset: number }>({ segment: cs, offset: ip });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = Math.max(4, Math.floor(height / ROW));
  const explicit = s.disasmAnchor;
  let anchor = explicit ?? anchorRef.current;
  let lines = m.disassembleFrom(anchor.segment, anchor.offset, visible + 1);
  if (!explicit) {
    // follow CS:IP: re-anchor when the current instruction is not among the visible lines
    const idx = lines.findIndex((l) => anchor.segment === cs && l.offset === ip);
    if (idx < 0 || idx >= visible - 1) {
      anchor = { segment: cs, offset: ip };
      anchorRef.current = anchor;
      lines = m.disassembleFrom(cs, ip, visible + 1);
    }
  } else {
    anchorRef.current = explicit;
  }

  const scrollBy = (dir: number) => {
    const a = anchorRef.current;
    let off = a.offset;
    if (dir > 0) off = (off + m.disassembleAt(a.segment, off).length) & 0xffff;
    else {
      // find a start that decodes exactly onto the current anchor
      let found = (off - 1) & 0xffff;
      for (let back = 6; back >= 1; back--) {
        const start = (off - back) & 0xffff;
        if (((start + m.disassembleAt(a.segment, start).length) & 0xffff) === off) { found = start; break; }
      }
      off = found;
    }
    store.disasmAnchor = { segment: a.segment, offset: off };
    store.emit();
  };

  const contextItems = (addr: number): MenuEntry[] => [
    { label: 'set break point', action: () => { store.session.machine.breakpoints.add(addr); store.emit(); } },
    { label: 'clear break point', disabled: !m.breakpoints.has(addr), action: () => { store.session.machine.breakpoints.delete(addr); store.emit(); } },
    'sep',
    { label: 'run until', action: () => { store.selectAddress(addr); A.runUntilSelected(); } },
    { label: 'set CS:IP to selected position', action: () => { store.selectAddress(addr); A.setCsIpToSelection(); } },
    'sep',
    { label: 'show current instruction', action: A.showCurrentInstruction },
  ];

  return (
    <div className="col-list">
      <AddressBox label="disassembly address" segment={anchor.segment} offset={anchor.offset} onGo={(segment, offset) => { store.disasmAnchor = { segment, offset }; store.emit(); }} />
      <div
        className="list sunken"
        ref={ref}
        style={{ overflowY: 'hidden' }}
        onWheel={(e) => scrollBy(e.deltaY > 0 ? 1 : -1)}
        data-testid="disassembly-list"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); scrollBy(1); }
          if (e.key === 'ArrowUp') { e.preventDefault(); scrollBy(-1); }
        }}
      >
        {lines.slice(0, visible).map((l) => {
          const addr = physical(anchor.segment, l.offset);
          const isCur = m.program !== null && anchor.segment === cs && l.offset === ip;
          return (
            <div
              key={l.offset + ':' + addr}
              className={`row ${isCur ? 'cur' : ''} ${s.selectedAddress === addr ? 'sel' : ''} ${m.breakpoints.has(addr) ? 'bp' : ''}`}
              style={{ paddingLeft: 10, position: 'relative' }}
              title={`${hex4(anchor.segment)}:${hex4(l.offset)}  (${hex5(addr)})`}
              onClick={() => store.selectAddress(addr)}
              onDoubleClick={() => store.toggleBreakpointAt(addr)}
              onContextMenu={(e) => { e.preventDefault(); store.selectAddress(addr); setMenu({ x: e.clientX, y: e.clientY, addr }); }}
            >
              {l.d.text}
            </div>
          );
        })}
      </div>
      {menu && <MenuPopup items={contextItems(menu.addr)} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}

// ------------------------------------------------------------ window
export function EmulatorWindow() {
  const s = useStore();
  const ses = s.session;
  const m = ses.machine;
  const [aux, setAux] = useState<{ x: number; y: number } | null>(null);
  const auxRef = useRef<HTMLButtonElement>(null);
  const menus = useMemo(() => emulatorMenus(), [s.version]);

  const name = m.program?.executableName ?? 'no program loaded';
  let status = 'ready';
  if (!m.program) status = 'no program loaded: write code in the editor and click emulate';
  else if (m.stopEvent) status = `stopped: ${m.stopEvent.message.split('\n')[0].toLowerCase()}`;
  else if (ses.running && m.waiting) status = '';
  else if (ses.running) status = `running... ${ses.runCount.toLocaleString('en-US')} instructions`;
  else if (m.waiting) status = '';
  const line = m.currentSourceLine();

  return (
    <Window id="emulator" title={`emulator: ${name}`} icon={<Icons.appEmulator />} minW={560} minH={360}>
      <MenuBar menus={menus} />
      <div className="emu-toolbar" role="toolbar" aria-label="emulator toolbar">
        <button className="btn3d big" onClick={loadExecutableFile} title="load executable file to emulator">
          <span className="ico"><Icons.load /></span>Load
        </button>
        <button className="btn3d big" onClick={A.reload} title="reload executable file (assemble the current source again) - F4">
          <span className="ico"><Icons.reload /></span>reload
        </button>
        <button className="btn3d big" onClick={A.stepBack} disabled={!m.canStepBack} title="revert the changes made by previous step forward - F6">
          <span className="ico"><Icons.stepBack /></span>step back
        </button>
        <button className="btn3d big" onClick={A.singleStep} disabled={!m.program || ses.running} title="process instruction at CS:IP - F8">
          <span className="ico"><Icons.singleStep /></span>single step
        </button>
        <button
          className={`btn3d big run ${ses.running ? 'pressed' : ''}`}
          aria-pressed={ses.running}
          onClick={A.toggleRun}
          disabled={!m.program}
          title="make [single steps] automatically - F9 (click again to stop)"
        >
          <span className="ico"><Icons.run /></span>run
        </button>
        <div className="delay">
          <input
            type="range"
            min={0}
            max={400}
            step={10}
            value={ses.stepDelay}
            list="delay-ticks"
            aria-label="step delay"
            onChange={(e) => store.updateSettings({ stepDelay: Number(e.target.value) })}
          />
          <datalist id="delay-ticks">{Array.from({ length: 9 }, (_, i) => <option key={i} value={i * 50} />)}</datalist>
          <span>step delay ms: {ses.stepDelay}</span>
        </div>
      </div>
      <div className="emu-main">
        <Registers />
        <MemoryList />
        <DisassemblyList />
      </div>
      <div className="emu-buttons">
        <button className="btn3d" onClick={() => store.open('screen')} title="emulator virtual screen">screen</button>
        <button className="btn3d" onClick={() => store.open('source')} title="original source code">source</button>
        <button className="btn3d" onClick={A.resetEmulator} disabled={!m.program} title="reset emulator: restore interrupt vector, clear screen and reload the program">reset</button>
        <button
          className="btn3d"
          ref={auxRef}
          title="auxiliary tools"
          onClick={() => {
            const r = auxRef.current!.getBoundingClientRect();
            setAux({ x: r.left, y: r.bottom });
          }}
        >aux</button>
        <button className="btn3d" onClick={() => store.open('vars')} title="show defined variables, arrays and strings">vars</button>
        <button className="btn3d" onClick={() => store.open('debug')} title="log and debug.exe emulation">debug</button>
        <button className="btn3d" onClick={() => store.open('stack')} title="memory at SS:SP from bottom to top">stack</button>
        <button className="btn3d" onClick={() => store.open('flags')} title="show flags register">flags</button>
      </div>
      <div className="emu-status">
        {m.waiting ? (
          <span className="waiting">waiting for keyboard input: type in the emulator screen</span>
        ) : (
          <span>{status}</span>
        )}
        <span style={{ marginLeft: 'auto' }}>{line ? `source line ${line}` : ''}</span>
        <span>{m.program ? `${m.cpu.instructionCount.toLocaleString('en-US')} instr.` : ''}</span>
      </div>
      {aux && (
        <MenuPopup
          x={aux.x}
          y={aux.y}
          onClose={() => setAux(null)}
          items={[
            { label: 'memory', action: () => store.open('memory') },
            { label: 'ALU', disabled: true, title: 'not supported yet' },
            { label: 'FPU', disabled: true, title: 'no 8087 coprocessor is emulated' },
            { label: 'stop on condition', disabled: true, title: 'not supported yet' },
            'sep',
            { label: 'symbol table', action: () => store.open('symbols') },
            { label: 'listing', action: () => store.open('listing') },
          ]}
        />
      )}
    </Window>
  );
}
