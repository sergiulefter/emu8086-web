import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { redo, selectAll, undo, indentMore, indentLess } from '@codemirror/commands';
import { findNext, openSearchPanel } from '@codemirror/search';
import { Window } from './Window';
import { MenuBar, MenuPopup, ToolButton, type MenuDef, type MenuEntry } from '../Menu';
import { Icons } from '../icons';
import { store, useStore } from '../store';
import * as A from '../actions';
import { EXAMPLES } from '../../examples';
import {
  bookmarksField, changeCase, clearBookmarksEffect, commentBlock, createEditorState, jumpBookmark,
  setDiagnosticsEffect, toggleBookmarkEffect,
} from '../editor/asmEditor';
import { exportHtml, printSource } from '../exporters';

let view: EditorView | null = null;

function cmd(name: string): void {
  const v = view;
  if (!v) return;
  v.focus();
  switch (name) {
    case 'undo': undo(v); break;
    case 'redo': redo(v); break;
    case 'selectAll': selectAll(v); break;
    case 'find': openSearchPanel(v); break;
    case 'findNext': findNext(v); break;
    case 'replace': openSearchPanel(v); break;
    case 'indent': indentMore(v); break;
    case 'outdent': indentLess(v); break;
    case 'comment': commentBlock(v, true); break;
    case 'uncomment': commentBlock(v, false); break;
    case 'lower': changeCase(v, false); break;
    case 'upper': changeCase(v, true); break;
    case 'toggleBookmark': v.dispatch({ effects: toggleBookmarkEffect.of(v.state.selection.main.head) }); break;
    case 'nextBookmark': jumpBookmark(v, 'next'); break;
    case 'prevBookmark': jumpBookmark(v, 'prev'); break;
    case 'firstBookmark': jumpBookmark(v, 'first'); break;
    case 'lastBookmark': jumpBookmark(v, 'last'); break;
    case 'clearBookmarks': v.dispatch({ effects: clearBookmarksEffect.of(null) }); break;
    case 'cut':
    case 'copy': {
      const sel = v.state.selection.ranges.map((r) => v.state.sliceDoc(r.from, r.to)).join('\n');
      void navigator.clipboard?.writeText(sel).catch(() => {});
      if (name === 'cut') v.dispatch(v.state.replaceSelection(''));
      break;
    }
    case 'paste':
      navigator.clipboard?.readText().then(
        (t) => v.dispatch(v.state.replaceSelection(t)),
        () => store.showMessage({ title: 'message', icon: 'info', text: 'the browser blocked clipboard access.\nuse Ctrl+V inside the editor instead.' }),
      );
      break;
  }
}

function editorMenus(): MenuDef[] {
  const exampleItems: MenuEntry[] = EXAMPLES.map((ex, i) => ({ label: ex.name, action: () => A.openExample(i) }));
  return [
    {
      label: 'file',
      items: [
        {
          label: 'new',
          submenu: [
            { label: 'com template', action: () => A.newFromTemplate('com') },
            { label: 'exe template', disabled: true, title: 'EXE programs (segments, relocation) are not supported yet' },
            { label: 'bin template', action: () => A.newFromTemplate('bin') },
            { label: 'boot template', action: () => A.newFromTemplate('boot') },
            'sep',
            { label: 'empty', action: () => A.newFromTemplate('empty') },
          ],
        },
        'sep',
        { label: 'examples', submenu: exampleItems },
        'sep',
        { label: 'open...', action: A.openFile },
        'sep',
        { label: 'save', action: () => void A.saveFile(false) },
        { label: 'save as...', action: () => void A.saveFile(true) },
        'sep',
        { label: 'print...', action: () => printSource(store.currentText(), store.fileName) },
        { label: 'export to HTML...', action: () => exportHtml(store.currentText(), store.fileName) },
      ],
    },
    {
      label: 'edit',
      items: [
        { label: 'undo', shortcut: 'Ctrl+Z', action: () => cmd('undo') },
        { label: 'redo', shortcut: 'Ctrl+Y', action: () => cmd('redo') },
        'sep',
        { label: 'cut', shortcut: 'Ctrl+X', action: () => cmd('cut') },
        { label: 'copy', shortcut: 'Ctrl+C', action: () => cmd('copy') },
        { label: 'paste', shortcut: 'Ctrl+V', action: () => cmd('paste') },
        'sep',
        { label: 'select all', shortcut: 'Ctrl+A', action: () => cmd('selectAll') },
        'sep',
        { label: 'find...', shortcut: 'Ctrl+F', action: () => cmd('find') },
        { label: 'find next', shortcut: 'F3', action: () => cmd('findNext') },
        { label: 'replace...', shortcut: 'Ctrl+H', action: () => cmd('replace') },
        'sep',
        { label: 'go to line...', shortcut: 'Ctrl+G', action: () => store.open('goto') },
        'sep',
        { label: 'indent', shortcut: 'Tab', action: () => cmd('indent') },
        { label: 'outdent', shortcut: 'Shift+Tab', action: () => cmd('outdent') },
        'sep',
        { label: 'comment block', shortcut: 'Ctrl+Alt+Q', action: () => cmd('comment') },
        { label: 'uncomment block', shortcut: 'Ctrl+Alt+W', action: () => cmd('uncomment') },
        'sep',
        {
          label: 'advanced',
          submenu: [
            { label: 'lowercase selection', shortcut: 'Ctrl+L', action: () => cmd('lower') },
            { label: 'uppercase selection', shortcut: 'Ctrl+U', action: () => cmd('upper') },
          ],
        },
      ],
    },
    {
      label: 'bookmarks',
      items: [
        { label: 'toggle bookmark', shortcut: 'Ctrl+F2', action: () => cmd('toggleBookmark') },
        'sep',
        { label: 'previous bookmark', shortcut: 'Shift+F2', action: () => cmd('prevBookmark') },
        { label: 'next bookmark', shortcut: 'F2', action: () => cmd('nextBookmark') },
        'sep',
        { label: 'jump to first', action: () => cmd('firstBookmark') },
        { label: 'jump to last', action: () => cmd('lastBookmark') },
        'sep',
        { label: 'clear all bookmarks', action: () => cmd('clearBookmarks') },
      ],
    },
    {
      label: 'assembler',
      items: [
        { label: 'compile', action: A.compile },
        { label: 'compile and load in the emulator', shortcut: 'F5', action: A.emulate },
      ],
    },
    {
      label: 'emulator',
      items: [
        { label: 'show emulator', action: () => store.open('emulator') },
        { label: 'assemble and load in the emulator', action: A.emulate },
      ],
    },
    {
      label: 'math',
      items: [
        { label: 'multi base calculator', action: () => store.open('calculator') },
        { label: 'base converter', action: () => store.open('convertor') },
      ],
    },
    { label: 'ascii codes', items: [], action: () => store.open('ascii') },
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

export function editorCommand(name: string): void {
  cmd(name);
}

function DropdownTool({ icon, label, onClick, items }: { icon: React.ReactNode; label: string; onClick: () => void; items: MenuEntry[] }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="tool-split" ref={ref}>
      <ToolButton icon={icon} label={label} onClick={onClick} />
      <button
        className="drop"
        aria-label={`${label} menu`}
        title={label}
        onClick={() => {
          const r = ref.current!.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom });
        }}
      >
        {Icons.dropArrow({})}
      </button>
      {menu && <MenuPopup items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}

export function EditorWindow() {
  const s = useStore();
  const host = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const state = createEditorState(store.initialText, {
      onChange: () => {
        if (!store.dirty) {
          store.dirty = true;
          store.emit();
        }
        store.persistDocument();
      },
      onCursor: (line, col) => {
        store.cursor = { line, col };
        store.emit();
      },
      extraKeys: [
        { key: 'Mod-g', run: () => (store.open('goto'), true) },
        { key: 'Mod-h', run: (v) => openSearchPanel(v) },
        { key: 'F2', run: (v) => jumpBookmark(v, 'next') },
        { key: 'Shift-F2', run: (v) => jumpBookmark(v, 'prev') },
        { key: 'Ctrl-F2', run: (v) => (v.dispatch({ effects: toggleBookmarkEffect.of(v.state.selection.main.head) }), true) },
        { key: 'Ctrl-Alt-q', run: (v) => commentBlock(v, true) },
        { key: 'Ctrl-Alt-w', run: (v) => commentBlock(v, false) },
        { key: 'Ctrl-l', run: (v) => changeCase(v, false) },
        { key: 'Ctrl-u', run: (v) => changeCase(v, true) },
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view = v;
    store.editor = {
      getText: () => v.state.doc.toString(),
      setText: (text) => {
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: text },
          selection: EditorSelection.cursor(0),
          effects: clearBookmarksEffect.of(null),
        });
      },
      gotoLine: (line, col = 1) => {
        const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
        const pos = Math.min(l.from + col - 1, l.to);
        v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        v.focus();
      },
      focus: () => v.focus(),
      setDiagnostics: (d) => v.dispatch({ effects: setDiagnosticsEffect.of(d) }),
      command: (name) => cmd(name),
    };
    void bookmarksField;
    return () => {
      v.destroy();
      view = null;
      store.editor = null;
    };
  }, []);

  const asm = s.lastAssembly;
  const errors = asm ? asm.diagnostics.filter((d) => d.severity === 'error').length : 0;
  const asmStatus = !asm ? '' : asm.ok ? `assembled: ${asm.bytes.length} bytes (${asm.outputType.toUpperCase()})` : `${errors} error${errors === 1 ? '' : 's'}`;

  return (
    <Window
      id="editor"
      title={`8086 Studio - assembler and microprocessor emulator - ${s.fileName}${s.dirty ? ' *' : ''}`}
      icon={<Icons.appEditor />}
      minW={420}
      minH={260}
      onClose={() => store.minimize('editor')}
    >
      <MenuBar menus={editorMenus()} />
      <div className="toolbar" role="toolbar" aria-label="editor toolbar">
        <ToolButton icon={<Icons.new />} label="new" title="New Source Code (choose code template)" onClick={() => store.open('template')} />
        <ToolButton icon={<Icons.open />} label="open" title="Open Source Code" onClick={A.openFile} />
        <DropdownTool
          icon={<Icons.examples />}
          label="examples"
          onClick={() => A.openExample(0)}
          items={EXAMPLES.map((ex, i) => ({ label: ex.name, action: () => A.openExample(i) }))}
        />
        <DropdownTool
          icon={<Icons.save />}
          label="save"
          onClick={() => void A.saveFile(false)}
          items={[{ label: 'save as...', action: () => void A.saveFile(true) }]}
        />
        <div className="tsep" />
        <ToolButton icon={<Icons.compile />} label="compile" title="Compile the Source Code and build an executable" onClick={A.compile} />
        <ToolButton icon={<Icons.emulate />} label="emulate" title="Compile Source Code and Load it into the Emulator (F5)" onClick={A.emulate} />
        <div className="tsep" />
        <ToolButton icon={<Icons.calculator />} label="calculator" title="multi base calculator" onClick={() => store.open('calculator')} />
        <ToolButton icon={<Icons.convertor />} label="convertor" title="base convertor" onClick={() => store.open('convertor')} />
        <ToolButton icon={<Icons.options />} label="options" title="Font and other Settings" onClick={() => store.open('options')} />
        <ToolButton icon={<Icons.help />} label="help" title="Documentation & Tutorials (F1)" onClick={A.openHelp} />
        <ToolButton icon={<Icons.about />} label="about" title="About 8086 Studio" onClick={() => store.open('about')} />
      </div>
      <div
        className={`editor-host ${dragOver ? 'dragover' : ''}`}
        ref={host}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          const f = e.dataTransfer.files[0];
          setDragOver(false);
          if (f) {
            e.preventDefault();
            void A.openDroppedFile(f);
          }
        }}
        data-testid="editor"
      />
      <div className="statusbar">
        <div className="cell" style={{ width: 80 }}>line: {s.cursor.line}</div>
        <div className="cell" style={{ width: 70 }}>col: {s.cursor.col}</div>
        <div className="cell" style={{ width: 210 }} title="last compile result">{asmStatus}</div>
        <div className="cell" style={{ flex: 1 }}>drag a file here to open</div>
      </div>
    </Window>
  );
}
