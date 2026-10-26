import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Window } from './Window';
import { Icons } from '../icons';
import { store, useStore } from '../store';
import { CP437, PALETTE, VIDEO_BASE } from '../../devices/vga/textmode';
import { KEYBOARD_CAPACITY } from '../../dos/environment';

export const SCREEN_FONTS = [
  { family: 'IBM VGA 9x16', w: 9, h: 16, label: 'VGA 9x16' },
  { family: 'IBM VGA 8x16', w: 8, h: 16, label: 'VGA 8x16' },
  { family: 'IBM VGA 8x14', w: 8, h: 14, label: 'EGA 8x14' },
];

/** PC scan codes for KeyboardEvent.code (set 1, make codes). */
const SCAN: Record<string, number> = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06, Digit6: 0x07, Digit7: 0x08,
  Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
  KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16, KeyI: 0x17, KeyO: 0x18, KeyP: 0x19,
  BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c, KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22,
  KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29, Backslash: 0x2b,
  KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34,
  Slash: 0x35, Space: 0x39, NumpadEnter: 0x1c,
};
const EXTENDED: Record<string, number> = {
  ArrowUp: 0x48, ArrowDown: 0x50, ArrowLeft: 0x4b, ArrowRight: 0x4d, Home: 0x47, End: 0x4f,
  PageUp: 0x49, PageDown: 0x51, Insert: 0x52, Delete: 0x53,
};

/** Translates a browser key event into the BIOS (ASCII, scan) pair, or null for keys we leave to the app. */
export function keyToBios(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): [number, number] | null {
  if (e.metaKey || e.altKey) return null;
  if (/^F\d+$/.test(e.key)) return null; // function keys stay emulator hotkeys (EMU8086 SCREEN_HOTKEYS)
  const scan = SCAN[e.code] ?? 0;
  if (EXTENDED[e.key] !== undefined) return [0, EXTENDED[e.key]];
  if (e.ctrlKey) {
    if (e.key.length === 1 && /[a-z]/i.test(e.key)) return [e.key.toUpperCase().charCodeAt(0) - 64, scan];
    return null;
  }
  switch (e.key) {
    case 'Enter': return [13, 0x1c];
    case 'Backspace': return [8, 0x0e];
    case 'Tab': return [9, 0x0f];
    case 'Escape': return [27, 0x01];
  }
  if (e.key.length === 1) {
    const c = e.key.charCodeAt(0);
    if (c < 256) return [c, scan];
    const cp = CP437.indexOf(e.key);
    return cp >= 0 ? [cp, scan] : null;
  }
  return null;
}

export function ScreenWindow() {
  const s = useStore();
  const m = s.session.machine;
  const scr = m.env.screen;
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 720, h: 400 });
  const [fontReady, setFontReady] = useState(false);
  const font = SCREEN_FONTS[s.settings.screenFont % SCREEN_FONTS.length];
  const cols = scr.columns;
  const rows = scr.rows;
  const cw = cols === 40 ? font.w * 2 : font.w;
  const W = cols * cw;
  const H = rows * font.h;

  useEffect(() => {
    let alive = true;
    void Promise.all(SCREEN_FONTS.map((f) => document.fonts.load(`${f.h}px '${f.family}'`))).then(() => alive && setFontReady(true));
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [s.wins.screen.open]);

  // draw from video RAM on every machine change
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.textBaseline = 'top';
    ctx.font = `${font.h}px '${font.family}'`;
    const base = VIDEO_BASE + scr.activePage * 0x1000;
    const bytes = m.mem.bytes;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const a = base + (r * cols + col) * 2;
        const ch = bytes[a];
        const attr = bytes[a + 1];
        const bg = attr >> 4;
        if (bg) {
          ctx.fillStyle = PALETTE[bg];
          ctx.fillRect(col * cw, r * font.h, cw, font.h);
        }
        if (ch !== 0 && ch !== 0x20 && ch !== 0xff) {
          ctx.fillStyle = PALETTE[attr & 0x0f];
          if (cols === 40) {
            ctx.save();
            ctx.scale(2, 1);
            ctx.fillText(CP437[ch], (col * cw) / 2, r * font.h);
            ctx.restore();
          } else {
            ctx.fillText(CP437[ch], col * cw, r * font.h);
          }
        }
      }
    }
  });

  const scale = Math.min(box.w / W, box.h / H);
  const cur = scr.getCursor();
  const shapeStart = m.mem.read8(0x461);
  const cursorVisible = m.program !== null && (shapeStart & 0x20) === 0 && cur.row < rows && cur.col < cols;
  const kb = m.env.keyboardCount();

  return (
    <Window id="screen" title={`emulator screen (${cols}x${rows} chars)`} icon={<Icons.appScreen />} minW={300} minH={180}>
      <div
        className="screen-wrap"
        ref={wrap}
        tabIndex={0}
        aria-label="emulator screen: click here and type to send keys to the program"
        data-testid="screen"
        onKeyDown={(e) => {
          const k = keyToBios(e);
          if (!k) return;
          e.preventDefault();
          e.stopPropagation();
          if (!m.env.pushKey(k[0], k[1])) return;
          store.session.notifyInput();
        }}
      >
        <canvas
          ref={canvas}
          width={W}
          height={H}
          style={{ width: W * scale, height: H * scale, visibility: fontReady ? 'visible' : 'hidden' }}
          data-font={font.family}
        />
        {cursorVisible && (
          <div
            className="vga-cursor"
            style={{
              position: 'absolute',
              left: cur.col * cw * scale,
              top: (cur.row * font.h + font.h - 3) * scale,
              width: cw * scale,
              height: 2 * scale,
              background: '#aaaaaa',
            }}
          />
        )}
      </div>
      <div className="screen-bar">
        <button className="btn3d" onClick={() => { m.env.screen.clearPage(); store.session.revision++; store.emit(); }} title="clear the emulator screen (writes spaces to video memory)">
          clear screen
        </button>
        <button className="btn3d" onClick={() => store.updateSettings({ screenFont: (s.settings.screenFont + 1) % SCREEN_FONTS.length })} title={`change font (current: ${font.label})`}>
          change font
        </button>
        <button
          className="kbuf sunken"
          title={`keyboard buffer: ${kb} of ${KEYBOARD_CAPACITY} keys waiting. click to flush.`}
          onClick={() => {
            if (kb === 0) return;
            store.askConfirm({ title: 'message', icon: 'info', text: 'flush keyboard buffer?', buttons: [{ label: 'yes', default: true, action: () => { m.env.flushKeyboard(); store.emit(); } }, { label: 'no' }] });
          }}
        >
          {kb}/{KEYBOARD_CAPACITY}
        </button>
        <span className="screen-hint">{m.waiting ? 'the program is waiting for a key: click the screen and type' : ''}</span>
      </div>
    </Window>
  );
}
