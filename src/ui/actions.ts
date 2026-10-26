/**
 * User commands shared by menus, toolbars and keyboard shortcuts.
 * Local files only: File System Access API where available (Chrome),
 * otherwise <input type=file> and downloads (Firefox).
 */
import { store, type WinId } from './store';
import { EXAMPLES, TEMPLATES } from '../examples';
import { physical } from '../cpu/memory';
import { hex4 } from '../debug/machine';

type FileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
};
type PickerWindow = Window & {
  showOpenFilePicker?: (o?: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o?: unknown) => Promise<FileHandle>;
};

let fileHandle: FileHandle | null = null;

const ASM_TYPES = [{ description: 'Assembly source', accept: { 'text/plain': ['.asm', '.txt', '.inc'] } }];

function confirmDiscard(then: () => void): void {
  if (!store.dirty) {
    then();
    return;
  }
  store.askConfirm({
    title: 'message',
    icon: 'warn',
    text: `${store.fileName} has unsaved changes.\nDiscard them?`,
    buttons: [
      { label: 'discard', action: then, default: true },
      { label: 'cancel' },
    ],
  });
}

export function loadDocument(text: string, fileName: string): void {
  store.editor?.setText(text);
  store.fileName = fileName;
  store.dirty = false;
  store.editor?.setDiagnostics([]);
  store.persistDocument();
  store.open('editor');
  store.editor?.focus();
}

export function newFromTemplate(kind: keyof typeof TEMPLATES): void {
  confirmDiscard(() => {
    fileHandle = null;
    loadDocument(TEMPLATES[kind], 'noname.asm');
  });
}

export function openExample(index: number): void {
  const ex = EXAMPLES[index];
  confirmDiscard(() => {
    fileHandle = null;
    loadDocument(ex.source, ex.fileName);
  });
}

export function openFile(): void {
  confirmDiscard(async () => {
    const w = window as PickerWindow;
    if (w.showOpenFilePicker) {
      try {
        const [h] = await w.showOpenFilePicker({ types: ASM_TYPES, multiple: false });
        const f = await h.getFile();
        fileHandle = h;
        loadDocument(await f.text(), f.name);
      } catch {
        /* cancelled */
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asm,.txt,.inc,text/plain';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) {
        fileHandle = null;
        loadDocument(await f.text(), f.name);
      }
    };
    input.click();
  });
}

export async function openDroppedFile(f: File): Promise<void> {
  const text = await f.text();
  confirmDiscard(() => {
    fileHandle = null;
    loadDocument(text, f.name);
  });
}

function download(name: string, data: BlobPart, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveFile(saveAs = false): Promise<void> {
  const text = store.currentText().replace(/\r?\n/g, '\r\n');
  const w = window as PickerWindow;
  try {
    if (!saveAs && fileHandle) {
      const wr = await fileHandle.createWritable();
      await wr.write(text);
      await wr.close();
    } else if (w.showSaveFilePicker) {
      const h = await w.showSaveFilePicker({ suggestedName: store.fileName, types: ASM_TYPES });
      const wr = await h.createWritable();
      await wr.write(text);
      await wr.close();
      fileHandle = h;
      store.fileName = h.name;
    } else {
      download(store.fileName, text);
    }
    store.dirty = false;
    store.persistDocument();
    store.emit();
  } catch {
    /* cancelled */
  }
}

export function saveExecutable(): void {
  const r = store.lastAssembly;
  if (!r || !r.ok) return;
  const stem = store.fileName.replace(/\.[^.]*$/, '') || 'noname';
  download(`${stem}.${r.outputType}`, r.bytes.slice(), 'application/octet-stream');
}

export function compile(): void {
  store.compile();
  const w = store.wins.status;
  const ed = store.wins.editor;
  w.x = Math.max(10, ed.x + (ed.w - w.w) / 2);
  w.y = Math.max(10, ed.y + 120);
  store.open('status');
}

export function emulate(): void {
  store.emulate();
}

// -------------------------------------------------------------- debugger
function ensureLoaded(): boolean {
  const m = store.session.machine;
  if (!m.program) {
    store.showMessage({ title: 'message', icon: 'info', text: 'no program is loaded.\nuse emulate (F5) in the editor first.' });
    return false;
  }
  if (m.stopEvent) {
    store.askConfirm({
      title: 'message',
      icon: 'info',
      text: 'program terminated.\nreload?',
      buttons: [{ label: 'yes', default: true, action: () => store.session.reset() }, { label: 'no' }],
    });
    return false;
  }
  return true;
}

export function singleStep(): void {
  if (!ensureLoaded()) return;
  store.session.step();
}

export function stepBack(): void {
  store.session.stepBack();
}

export function stepOver(): void {
  if (!ensureLoaded()) return;
  store.session.stepOver();
}

export function toggleRun(): void {
  if (store.session.running) {
    store.session.stop();
    return;
  }
  if (!ensureLoaded()) return;
  if (store.wins.message.open) store.close('message');
  store.session.toggleRun();
}

export function stopRun(): void {
  store.session.stop();
}

export function runUntilSelected(): void {
  if (!ensureLoaded()) return;
  store.session.runUntil(store.selectionOrIp());
}

export function resetEmulator(): void {
  if (store.wins.message.open) store.close('message');
  store.session.reset();
  store.screenHadOutput = false;
}

/** EMU8086 "reload": assemble the current editor source again and restart it. */
export function reload(): void {
  if (store.wins.message.open) store.close('message');
  store.emulate();
}

export function setBreakpointAtSelection(): void {
  const addr = store.selectionOrIp();
  store.session.machine.breakpoints.add(addr);
  store.emit();
}

export function clearBreakpoints(): void {
  store.session.machine.breakpoints.clear();
  store.emit();
}

export function showCurrentInstruction(): void {
  store.disasmAnchor = null;
  store.memoryAnchor = null;
  store.selectedAddress = null;
  store.open('emulator');
}

export function setCsIpToSelection(): void {
  const m = store.session.machine;
  const sel = store.selectedAddress;
  if (sel === null) return;
  const cs = m.cpu.sregs[1];
  const off = sel - (cs << 4);
  if (off < 0 || off > 0xffff) {
    store.showMessage({ title: 'message', icon: 'warn', text: `the selected address is outside the current code segment (${hex4(cs)}).` });
    return;
  }
  m.cpu.ip = off;
  m.revision++;
  store.session.revision++;
  store.emit();
}

export function showWindow(id: WinId): void {
  store.open(id);
}

export function describeCsIp(): string {
  const m = store.session.machine;
  return `${hex4(m.cpu.sregs[1])}:${hex4(m.cpu.ip)}`;
}

export function physicalOf(seg: number, off: number): number {
  return physical(seg, off);
}

export function openHelp(): void {
  store.open('help');
}
