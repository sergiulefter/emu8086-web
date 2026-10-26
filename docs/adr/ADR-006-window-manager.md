# ADR-006: In-page desktop window manager and persistence

**Status:** accepted

## Decision
- A custom window manager (`src/ui/windows/Window.tsx` and `store.ts`) instead of browser pop-ups, which can be
  blocked and cannot overlap the page. Each window has `{id, x, y, w, h, z, open, minimized, maximized}`.
  Pointer events handle dragging (the title bar stays reachable) and resizing from all 8 edges. Focus raises
  the z-order.
- A slim task bar restores minimised windows and offers cascade, tile and reset-layout commands, as required at
  1366×768.
- Default geometry follows the EMU8086 4.08 screenshots. At 1440 px and wider, the 80×25 screen sits beside the
  emulator at a 1:1 pixel scale.
- `localStorage` stores the window layout, the current document and the settings. Every access is wrapped in
  try/catch, and the app works without storage.
- The editor is CodeMirror 6 (MIT). It is styled with the Terminal-like IBM VGA 8×14 font and EMU8086 colours.
  Highlighting uses the assembler's own mnemonic and directive tables, so highlighting and parsing agree.
