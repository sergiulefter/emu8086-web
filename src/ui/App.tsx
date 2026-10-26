import { useEffect, useState } from 'react';
import { store, useStore, TASK_WINDOWS, WINDOW_TITLES } from './store';
import * as A from './actions';
import { MenuPopup } from './Menu';
import { Icons } from './icons';
import { EditorWindow } from './windows/EditorWindow';
import { EmulatorWindow } from './windows/EmulatorWindow';
import { ScreenWindow } from './windows/ScreenWindow';
import {
  FlagsWindow, LexFlagsWindow, ListingWindow, MemoryWindow, SourceWindow, StackWindow, SymbolsWindow, ValueViewer, VarsWindow,
} from './windows/ToolWindows';
import { AboutDialog, ConfirmDialog, GotoDialog, MessageDialog, OptionsDialog, StatusDialog, TemplateDialog } from './windows/Dialogs';
import { AsciiWindow, CalculatorWindow, ConvertorWindow, DebugLogWindow, HelpWindow } from './windows/Utilities';

const TASK_ICONS: Partial<Record<string, () => React.ReactNode>> = {
  editor: () => <Icons.appEditor />,
  emulator: () => <Icons.appEmulator />,
  screen: () => <Icons.appScreen />,
  source: () => <Icons.appSource />,
};

/** EMU8086 hotkeys (function keys are captured so the browser does not reload/help/fullscreen). */
function onGlobalKey(e: KeyboardEvent): void {
  const k = e.key;
  const fn = /^F\d+$/.test(k);
  if (!fn) {
    if (k === 'Escape' && store.wins.message.open && store.active === 'message') store.close('message');
    return;
  }
  const handled = (() => {
    if (k === 'F5' && !e.ctrlKey) { A.emulate(); return true; }
    if (k === 'F8' && e.ctrlKey) { A.runUntilSelected(); return true; }
    if (k === 'F8' && e.shiftKey) { A.stepOver(); return true; }
    if (k === 'F8') { A.singleStep(); return true; }
    if (k === 'F6') { A.stepBack(); return true; }
    if (k === 'F9') { A.toggleRun(); return true; }
    if (k === 'F4') { A.reload(); return true; }
    if (k === 'F7' && e.ctrlKey && e.shiftKey) { A.setCsIpToSelection(); return true; }
    if (k === 'F7') { A.showCurrentInstruction(); return true; }
    if (k === 'F11') { store.open('debug'); return true; }
    if (k === 'F1') { A.openHelp(); return true; }
    return false;
  })();
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function App() {
  const s = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    window.addEventListener('keydown', onGlobalKey, true);
    const onResize = () => store.emit();
    window.addEventListener('resize', onResize);
    const beforeUnload = () => store.persistDocument();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', onGlobalKey, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  const tasks = TASK_WINDOWS.filter((id) => s.wins[id].open);
  const m = s.session.machine;
  const state = !m.program ? '' : s.session.running ? (m.waiting ? 'waiting for input' : 'running') : m.stopEvent ? 'terminated' : 'ready';

  return (
    <>
      <main className="desktop" aria-label="8086 Studio desktop">
        <EditorWindow />
        <EmulatorWindow />
        <SourceWindow />
        <ScreenWindow />
        <ValueViewer />
        <FlagsWindow />
        <LexFlagsWindow />
        <StackWindow />
        <VarsWindow />
        <SymbolsWindow />
        <ListingWindow />
        <MemoryWindow />
        <DebugLogWindow />
        <CalculatorWindow />
        <ConvertorWindow />
        <AsciiWindow />
        <HelpWindow />
        <StatusDialog />
        <TemplateDialog />
        <GotoDialog />
        <OptionsDialog />
        <AboutDialog />
        <MessageDialog />
        <ConfirmDialog />
      </main>
      <nav className="taskbar" aria-label="open windows">
        <button
          className="task"
          title="window layout"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: r.left, y: r.top - 90 });
          }}
        >
          <span>windows ▴</span>
        </button>
        {tasks.map((id) => {
          const w = s.wins[id];
          const icon = TASK_ICONS[id]?.() ?? <Icons.appTool />;
          const title = id === 'emulator' && m.program ? `emulator: ${m.program.executableName}` : id === 'editor' ? `8086 Studio - ${s.fileName}` : WINDOW_TITLES[id];
          return (
            <button
              key={id}
              className={`task ${s.active === id && !w.minimized ? 'active' : ''} ${w.minimized ? 'minimized' : ''}`}
              title={title}
              onClick={() => {
                if (w.minimized || s.active !== id) store.open(id);
                else store.minimize(id);
              }}
            >
              {icon}
              <span>{title}</span>
            </button>
          );
        })}
        <span className="spacer" />
        {state && <span className="tb-status">emulator: {state}</span>}
      </nav>
      {menu && (
        <MenuPopup
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'cascade', action: () => store.cascade() },
            { label: 'tile', action: () => store.tile() },
            'sep',
            { label: 'reset window layout', action: () => store.resetLayout() },
          ]}
        />
      )}
    </>
  );
}
