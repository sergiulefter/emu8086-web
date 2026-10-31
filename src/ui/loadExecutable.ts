/**
 * Emulator "Load": opens a source (.asm → editor + emulate) or a raw
 * executable (.com / .bin) which is loaded without source information.
 */
import { store } from './store';
import { loadDocument } from './actions';
import type { AssembleResult } from '../assembler/types';

export function loadExecutableFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.asm,.com,.bin,.txt';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.com') || lower.endsWith('.bin')) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const com = lower.endsWith('.com');
      if (com && bytes.length > 0xff00) {
        store.showMessage({ title: 'message', icon: 'error', text: 'the file is too large for a COM program (max 65280 bytes).' });
        return;
      }
      const result: AssembleResult = {
        ok: true, diagnostics: [], outputType: com ? 'com' : 'bin', origin: com ? 0x100 : 0, bytes,
        entry: com ? 0x100 : 0, sourceMap: [], symbols: [], notes: [], binf: {}, memoryPresets: [],
      };
      store.loadedSource = '';
      store.session.load(result, f.name);
      store.close('source');
      store.open('emulator');
      store.showMessage({ title: 'message', icon: 'info', text: `${f.name} is loaded (${bytes.length} bytes).\noriginal source code is not available for an executable file.` });
      return;
    }
    loadDocument(await f.text(), f.name);
    store.emulate();
  };
  input.click();
}
