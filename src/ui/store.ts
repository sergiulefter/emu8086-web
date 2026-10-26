/**
 * Application state: in-page window manager, editor document, assembler
 * results and the emulator session. React components subscribe through
 * `useStore()` (useSyncExternalStore on a version counter).
 */
import { useSyncExternalStore } from 'react';
import { assemble } from '../assembler/assembler';
import type { AssembleResult } from '../assembler/types';
import { EmulatorSession, type SessionEvent } from '../debug/session';
import { hex4 } from '../debug/machine';
import { physical } from '../cpu/memory';

export type WinId =
  | 'editor' | 'emulator' | 'screen' | 'source' | 'viewer' | 'flags' | 'stack' | 'vars' | 'debug'
  | 'memory' | 'calculator' | 'convertor' | 'ascii' | 'options' | 'help' | 'about' | 'status'
  | 'message' | 'symbols' | 'listing' | 'template' | 'lexflags' | 'goto' | 'find' | 'confirm';

export interface Win {
  id: WinId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  open: boolean;
  minimized: boolean;
  maximized: boolean;
}

export interface MessageBox {
  title: string;
  text: string;
  icon: 'stop' | 'info' | 'error' | 'warn';
  buttons?: { label: string; action?: () => void; default?: boolean }[];
}

export type Watch = { kind: 'reg'; name: string } | { kind: 'mem'; segment: number; offset: number };

export interface EditorApi {
  getText(): string;
  setText(text: string): void;
  gotoLine(line: number, col?: number): void;
  focus(): void;
  setDiagnostics(d: AssembleResult['diagnostics']): void;
  command(name: string): void;
}

const LAYOUT_KEY = '8086studio.layout.v1';
const DOC_KEY = '8086studio.document.v1';
const SETTINGS_KEY = '8086studio.settings.v1';

export const DEFAULT_SOURCE = `; You may customize this and other start-up templates;
; this is the 8086 Studio COM template.

org 100h

; add your code here

ret
`;

export interface Settings {
  stepDelay: number;
  instructionLimit: number;
  screenFont: number;
  activateScreen: boolean;
}

function viewport() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const h = typeof window !== 'undefined' ? window.innerHeight - 30 : 870;
  return { w, h };
}

/** Default geometry, modelled on the EMU8086 4.08 reference layout. */
function defaultLayout(): Record<WinId, Omit<Win, 'id' | 'z' | 'open' | 'minimized' | 'maximized'>> {
  const { w: vw, h: vh } = viewport();
  const ew = Math.min(Math.max(vw - 24, 600), 1180);
  const eh = Math.min(Math.max(vh - 24, 400), 820);
  const emuW = Math.min(vw >= 1440 ? 680 : 660, vw - 20);
  const emuH = Math.min(520, vh - 20);
  // 80x25 cells of 9x16 pixels + 1px borders: the canvas is shown 1:1 when there is room
  const scrFull = 9 * 80 + 2;
  const scrH = Math.min(16 * 25 + 30 + 34 + 2, vh - 20);
  const center = (w: number, h: number) => ({ x: Math.max(10, (vw - w) / 2), y: Math.max(10, (vh - h) / 3), w, h });
  const emuY = Math.max(10, Math.min(vh - emuH - 12, 290));
  const emuRight = 16 + emuW + 6;
  const besideEmu = vw - emuRight - 6 >= 560;
  const scrX = besideEmu ? Math.max(emuRight, vw - scrFull - 6) : Math.max(10, vw - scrFull - 10);
  const scrW = Math.min(scrFull, vw - scrX - 6);
  return {
    editor: { x: 12, y: 12, w: ew, h: eh },
    emulator: { x: 16, y: emuY, w: emuW, h: emuH },
    screen: { x: scrX, y: Math.max(10, Math.min(vh - scrH - 10, emuY + 40)), w: scrW, h: scrH },
    source: { x: Math.max(10, Math.min(vw - 310, 740)), y: 56, w: 300, h: Math.max(150, Math.min(250, emuY + 30)) },
    viewer: { x: Math.max(10, vw - 268), y: 12, w: 256, h: 380 },
    flags: { x: Math.max(10, vw - 500), y: 90, w: 220, h: 240 },
    stack: { x: Math.max(10, vw - 740), y: 110, w: 210, h: 320 },
    vars: { x: Math.max(10, vw - 690), y: 450, w: 400, h: 240 },
    debug: { x: 160, y: 100, w: Math.min(720, vw - 20), h: 340 },
    memory: { x: 140, y: 80, w: 640, h: 380 },
    calculator: { x: 220, y: 120, w: 430, h: 280 },
    convertor: { x: 260, y: 140, w: 360, h: 280 },
    ascii: { x: 240, y: 90, w: 520, h: 420 },
    options: center(420, 330),
    help: { x: 120, y: 40, w: Math.min(760, vw - 40), h: Math.min(620, vh - 40) },
    about: center(400, 260),
    status: center(520, 330),
    message: center(380, 190),
    symbols: { x: 200, y: 110, w: 420, h: 300 },
    listing: { x: 180, y: 90, w: 620, h: 420 },
    template: center(470, 280),
    lexflags: { x: 260, y: 130, w: 400, h: 300 },
    goto: center(300, 140),
    find: center(400, 170),
    confirm: center(360, 170),
  };
}

export const WINDOW_TITLES: Record<WinId, string> = {
  editor: '8086 Studio - assembler and microprocessor emulator',
  emulator: 'emulator',
  screen: 'emulator screen (80x25 chars)',
  source: 'original source code',
  viewer: 'extended value viewer',
  flags: 'flags',
  stack: 'stack',
  vars: 'variables',
  debug: 'debug log - debug.exe emulation',
  memory: 'Random Access Memory',
  calculator: 'calculator - expression evaluator',
  convertor: 'base convertor',
  ascii: 'ascii codes',
  options: 'options',
  help: 'documentation and tutorials',
  about: 'about 8086 Studio',
  status: 'assembler status',
  message: 'message',
  symbols: 'symbol table',
  listing: 'listing',
  template: 'choose code template',
  lexflags: 'lexical flag analyser',
  goto: 'go to line',
  find: 'find',
  confirm: 'message',
};

/** Windows reachable from the task bar (dialogs are not listed). */
export const TASK_WINDOWS: WinId[] = [
  'editor', 'emulator', 'screen', 'source', 'viewer', 'flags', 'stack', 'vars', 'debug', 'memory',
  'calculator', 'convertor', 'ascii', 'symbols', 'listing', 'lexflags', 'help',
];

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode etc.) */
  }
}

export class AppStore {
  version = 0;
  wins: Record<WinId, Win>;
  active: WinId = 'editor';
  private zTop = 10;
  private listeners = new Set<() => void>();

  readonly session = new EmulatorSession();
  fileName = 'noname.asm';
  dirty = false;
  /** Initial editor text (the editor component owns the live document). */
  initialText: string;
  editor: EditorApi | null = null;
  /** Result of the last Compile/Emulate. */
  lastAssembly: AssembleResult | null = null;
  lastAssemblySource = '';
  statusLines: string[] = [];
  message: MessageBox | null = null;
  confirm: MessageBox | null = null;
  watch: Watch = { kind: 'reg', name: 'AX' };
  /** Selected disassembly line (physical address) for breakpoint / run until / set CS:IP. */
  selectedAddress: number | null = null;
  memoryAnchor: { segment: number; offset: number } | null = null;
  disasmAnchor: { segment: number; offset: number } | null = null;
  settings: Settings;
  cursor = { line: 1, col: 1 };
  screenHadOutput = false;
  lastVideoVersion = -1;
  /** The source text that the loaded program was assembled from. */
  loadedSource = '';
  bookmarks: number[] = [];

  constructor() {
    const layout = defaultLayout();
    const saved = loadJson<Partial<Record<WinId, Partial<Win>>>>(LAYOUT_KEY) ?? {};
    const { w: vw, h: vh } = viewport();
    this.wins = {} as Record<WinId, Win>;
    for (const id of Object.keys(layout) as WinId[]) {
      const s = saved[id];
      const g = { ...layout[id], ...(s ? { x: s.x, y: s.y, w: s.w, h: s.h } : {}) } as Win;
      // keep restored windows reachable
      g.w = Math.min(Math.max(g.w ?? 200, 160), Math.max(vw, 320));
      g.h = Math.min(Math.max(g.h ?? 120, 80), Math.max(vh, 240));
      g.x = Math.min(Math.max(g.x ?? 10, -g.w + 80), vw - 80);
      g.y = Math.min(Math.max(g.y ?? 10, 0), vh - 30);
      this.wins[id] = { ...g, id, z: 1, open: id === 'editor', minimized: false, maximized: false };
    }
    this.wins.editor.z = this.zTop;
    const doc = loadJson<{ text: string; fileName: string }>(DOC_KEY);
    this.initialText = doc?.text ?? DEFAULT_SOURCE;
    this.fileName = doc?.fileName ?? 'noname.asm';
    const st = loadJson<Partial<Settings>>(SETTINGS_KEY) ?? {};
    this.settings = {
      stepDelay: st.stepDelay ?? 0,
      instructionLimit: st.instructionLimit ?? 5_000_000,
      screenFont: st.screenFont ?? 0,
      activateScreen: st.activateScreen ?? true,
    };
    this.session.stepDelay = this.settings.stepDelay;
    this.session.instructionLimit = this.settings.instructionLimit;
    this.session.subscribe(() => this.onSessionChange());
    this.session.onEvent((e) => this.onSessionEvent(e));
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ------------------------------------------------------------- windows
  open(id: WinId): void {
    const w = this.wins[id];
    w.open = true;
    w.minimized = false;
    this.focus(id);
  }

  toggle(id: WinId): void {
    if (this.wins[id].open && !this.wins[id].minimized && this.active === id) this.close(id);
    else this.open(id);
  }

  focus(id: WinId): void {
    const w = this.wins[id];
    if (this.active === id && w.z === this.zTop) return;
    w.z = ++this.zTop;
    this.active = id;
    this.emit();
  }

  close(id: WinId): void {
    const w = this.wins[id];
    w.open = false;
    w.maximized = false;
    if (id === 'message') this.message = null;
    if (id === 'confirm') this.confirm = null;
    if (this.active === id) this.activateTopmost();
    this.emit();
  }

  minimize(id: WinId): void {
    this.wins[id].minimized = true;
    if (this.active === id) this.activateTopmost();
    this.emit();
  }

  toggleMaximize(id: WinId): void {
    this.wins[id].maximized = !this.wins[id].maximized;
    this.focus(id);
    this.emit();
  }

  private activateTopmost(): void {
    let best: Win | null = null;
    for (const w of Object.values(this.wins)) {
      if (w.open && !w.minimized && (!best || w.z > best.z)) best = w;
    }
    this.active = best ? best.id : 'editor';
  }

  setGeometry(id: WinId, g: Partial<Pick<Win, 'x' | 'y' | 'w' | 'h'>>, persist = false): void {
    Object.assign(this.wins[id], g);
    if (persist) this.saveLayout();
    this.emit();
  }

  saveLayout(): void {
    const out: Partial<Record<WinId, Partial<Win>>> = {};
    for (const w of Object.values(this.wins)) out[w.id] = { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h) };
    saveJson(LAYOUT_KEY, out);
  }

  resetLayout(): void {
    const layout = defaultLayout();
    for (const id of Object.keys(layout) as WinId[]) Object.assign(this.wins[id], layout[id], { maximized: false });
    this.saveLayout();
    this.emit();
  }

  cascade(): void {
    let i = 0;
    const order = Object.values(this.wins).filter((w) => w.open && !w.minimized).sort((a, b) => a.z - b.z);
    for (const w of order) {
      w.maximized = false;
      w.x = 12 + i * 26;
      w.y = 12 + i * 26;
      i++;
    }
    this.saveLayout();
    this.emit();
  }

  tile(): void {
    const { w: vw, h: vh } = viewport();
    const order = Object.values(this.wins).filter((w) => w.open && !w.minimized).sort((a, b) => a.z - b.z);
    const n = order.length;
    if (!n) return;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cw = Math.floor((vw - 8) / cols);
    const rh = Math.floor((vh - 8) / rows);
    order.forEach((w, k) => {
      w.maximized = false;
      w.x = 4 + (k % cols) * cw;
      w.y = 4 + Math.floor(k / cols) * rh;
      w.w = cw - 4;
      w.h = rh - 4;
    });
    this.saveLayout();
    this.emit();
  }

  // ------------------------------------------------------------- dialogs
  showMessage(m: MessageBox): void {
    this.message = m;
    const w = this.wins.message;
    const { w: vw, h: vh } = viewport();
    const emu = this.wins.emulator;
    if (emu.open) {
      w.x = Math.min(Math.max(10, emu.x + 120), vw - w.w - 10);
      w.y = Math.min(Math.max(10, emu.y + 110), vh - w.h - 10);
    } else {
      w.x = (vw - w.w) / 2;
      w.y = (vh - w.h) / 3;
    }
    this.open('message');
  }

  askConfirm(m: MessageBox): void {
    this.confirm = m;
    this.open('confirm');
  }

  // ------------------------------------------------------------ document
  currentText(): string {
    return this.editor?.getText() ?? this.initialText;
  }

  persistDocument(): void {
    saveJson(DOC_KEY, { text: this.currentText(), fileName: this.fileName });
  }

  saveSettings(): void {
    saveJson(SETTINGS_KEY, this.settings);
  }

  setFileName(name: string): void {
    this.fileName = name;
    this.persistDocument();
    this.emit();
  }

  // ------------------------------------------------------------ assembler
  compile(): AssembleResult {
    const text = this.currentText();
    const result = assemble(text);
    this.lastAssembly = result;
    this.lastAssemblySource = text;
    this.editor?.setDiagnostics(result.diagnostics);
    const stem = this.fileName.replace(/\.[^.]*$/, '') || 'noname';
    const lines: string[] = [];
    if (result.ok) {
      lines.push(`${result.outputType === 'com' ? '#make_COM# / ORG 100h detected' : 'creating plain binary file (BIN).'}`);
      lines.push(`${stem}.${result.outputType} is assembled successfully into ${result.bytes.length} bytes.`);
      for (const n of result.notes) lines.push(n);
      for (const d of result.diagnostics) if (d.severity === 'warning') lines.push(`(${d.line}) warning: ${d.message}`);
    } else {
      lines.push('there are errors!');
      lines.push('executable file is not created!');
    }
    this.statusLines = lines;
    this.emit();
    return result;
  }

  /** Compile and load in the emulator (F5). On errors, shows the assembler status dialog instead. */
  emulate(): boolean {
    const result = this.compile();
    if (!result.ok) {
      this.open('status');
      return false;
    }
    this.loadedSource = this.lastAssemblySource;
    this.session.load(result, this.fileName);
    this.selectedAddress = null;
    this.memoryAnchor = null;
    this.disasmAnchor = null;
    this.screenHadOutput = false;
    this.lastVideoVersion = -1;
    this.wins.emulator.open = true;
    this.wins.source.open = true;
    this.wins.source.minimized = false;
    this.focus('source');
    this.open('emulator');
    if (this.wins.message.open) this.close('message');
    return true;
  }

  // ------------------------------------------------------------ emulator
  private lastCount = -1;

  private onSessionChange(): void {
    const m = this.session.machine;
    if (m.cpu.instructionCount !== this.lastCount) {
      this.lastCount = m.cpu.instructionCount;
      this.disasmAnchor = null; // the disassembly follows CS:IP after every executed instruction
    }
    // Bring the virtual screen forward when the program writes to video memory (EMU8086 ACTIVATE_SCREEN).
    if (m.mem.isDirty(0xb8000, 0xbffff)) {
      m.mem.clearDirty();
      if (this.session.machine.cpu.instructionCount > 0) {
        if (!this.screenHadOutput && this.settings.activateScreen && !this.wins.screen.open) {
          this.wins.screen.open = true;
          this.wins.screen.minimized = false;
          this.wins.screen.z = ++this.zTop;
        }
        this.screenHadOutput = true;
      }
    } else {
      m.mem.clearDirty();
    }
    this.emit();
  }

  private onSessionEvent(e: SessionEvent): void {
    const m = this.session.machine;
    const where = `${hex4(m.cpu.sregs[1])}:${hex4(m.cpu.ip)}`;
    switch (e.kind) {
      case 'stop': {
        const s = e.stop;
        if (this.screenHadOutput && this.settings.activateScreen) {
          this.wins.screen.open = true;
          this.wins.screen.minimized = false;
          this.wins.screen.z = ++this.zTop;
        }
        const text = s.reason === 'exit'
          ? 'PROGRAM HAS RETURNED CONTROL\nTO THE OPERATING SYSTEM' + (s.exitCode ? `\n\n(exit code ${hex2(s.exitCode)}h)` : '')
          : s.reason === 'halt' ? s.message
            : `${s.message}\n\nCS:IP = ${where}`;
        this.showMessage({ title: 'message', text, icon: s.reason === 'exit' || s.reason === 'halt' ? 'stop' : 'error' });
        break;
      }
      case 'breakpoint':
        this.showMessage({ title: 'message', text: `break point encountered at: ${e.address}`, icon: 'info' });
        break;
      case 'until':
        break;
      case 'limit':
        this.showMessage({
          title: 'message',
          icon: 'warn',
          text: `execution limit reached: ${e.count.toLocaleString('en-US')} instructions were executed by this run.\n\nThe program may be in an endless loop. CPU state is shown in the emulator (CS:IP = ${where}).\nPress run to continue, or change the limit in options.`,
        });
        break;
    }
  }

  setWatch(w: Watch): void {
    this.watch = w;
    this.open('viewer');
  }

  selectAddress(addr: number | null): void {
    this.selectedAddress = addr;
    this.emit();
  }

  toggleBreakpointAt(addr: number): void {
    const bp = this.session.machine.breakpoints;
    if (bp.has(addr)) bp.delete(addr);
    else bp.add(addr);
    this.emit();
  }

  /** Physical address of the selected disassembly line, or CS:IP. */
  selectionOrIp(): number {
    const m = this.session.machine;
    return this.selectedAddress ?? physical(m.cpu.sregs[1], m.cpu.ip);
  }

  updateSettings(s: Partial<Settings>): void {
    Object.assign(this.settings, s);
    this.session.instructionLimit = this.settings.instructionLimit;
    if (s.stepDelay !== undefined) this.session.setStepDelay(s.stepDelay);
    this.saveSettings();
    this.emit();
  }
}

export function hex2(v: number): string {
  return (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export const store = new AppStore();
if (typeof window !== 'undefined') (window as unknown as { __studio: AppStore }).__studio = store;

export function useStore(): AppStore {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
