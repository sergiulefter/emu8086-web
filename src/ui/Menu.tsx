import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type MenuEntry =
  | 'sep'
  | {
      label: string;
      shortcut?: string;
      action?: () => void;
      disabled?: boolean;
      /** Tooltip, e.g. why an item is unavailable. */
      title?: string;
      checked?: boolean;
      submenu?: MenuEntry[];
    };

export interface MenuDef {
  label: string;
  items: MenuEntry[];
  /** A top-level item that acts directly (EMU8086's "ascii codes"). */
  action?: () => void;
}

interface PopupProps {
  items: MenuEntry[];
  x: number;
  y: number;
  onClose: (reason: 'outside' | 'escape' | 'select') => void;
  anchorRef?: RefObject<HTMLElement | null>;
  depth?: number;
  autoFocus?: boolean;
}

/** Drop-down / context menu rendered in a portal above all windows. */
export function MenuPopup({ items, x, y, onClose, anchorRef, depth = 0, autoFocus = true }: PopupProps) {
  const [hot, setHot] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  const dismissOnOutsidePress = useEffectEvent((e: PointerEvent) => {
    const target = e.target;
    if (target instanceof Node && !tree.current?.contains(target) && !anchorRef?.current?.contains(target)) {
      onClose('outside');
    }
  });

  useEffect(() => {
    if (depth > 0) return;
    // Window dragging can cancel the mouse events that follow pointerdown.
    const onDown = (e: PointerEvent) => dismissOnOutsidePress(e);
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [depth]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 2) nx = Math.max(2, window.innerWidth - r.width - 2);
    if (ny + r.height > window.innerHeight - 2) ny = Math.max(2, window.innerHeight - r.height - 2);
    setPos({ x: nx, y: ny });
    if (autoFocus) el.focus();
  }, [x, y, autoFocus]);

  const selectable = (i: number) => items[i] !== 'sep';
  const move = (dir: number) => {
    let i = hot;
    for (let k = 0; k < items.length; k++) {
      i = (i + dir + items.length) % items.length;
      if (selectable(i)) break;
    }
    setHot(i);
  };

  const activate = (i: number) => {
    const it = items[i];
    if (!it || it === 'sep' || it.disabled) return;
    if (it.submenu) {
      const el = ref.current?.children[i] as HTMLElement | undefined;
      const r = el?.getBoundingClientRect();
      if (r) setSub({ index: i, x: r.right - 2, y: r.top - 3 });
      return;
    }
    onClose('select');
    it.action?.();
  };

  const content = (
    <>
      <div
        ref={ref}
        className="menu-pop"
        role="menu"
        tabIndex={-1}
        style={{ left: pos.x, top: pos.y, zIndex: 100000 + depth }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hot >= 0) activate(hot); }
          else if (e.key === 'ArrowRight') { if (hot >= 0) activate(hot); }
          else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && depth > 0)) {
            e.preventDefault();
            anchorRef?.current?.focus({ preventScroll: true });
            onClose('escape');
          }
        }}
      >
        {items.map((it, i) =>
          it === 'sep' ? (
            <div key={i} className="sep" />
          ) : (
            <div
              key={i}
              role="menuitem"
              aria-disabled={it.disabled || undefined}
              title={it.title}
              className={`mi ${it.disabled ? 'disabled' : ''} ${hot === i ? 'hot' : ''}`}
              onMouseEnter={() => {
                setHot(i);
                if (it.submenu && !it.disabled) {
                  const r = (ref.current?.children[i] as HTMLElement).getBoundingClientRect();
                  setSub({ index: i, x: r.right - 2, y: r.top - 3 });
                } else setSub(null);
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activate(i)}
            >
              {it.checked && <span className="chk">✓</span>}
              <span>{it.label}</span>
              {it.shortcut && <span className="sc">{it.shortcut}</span>}
              {it.submenu && <span className="sub">▸</span>}
            </div>
          ),
        )}
      </div>
      {sub && items[sub.index] !== 'sep' && (items[sub.index] as { submenu?: MenuEntry[] }).submenu && (
        <MenuPopup
          items={(items[sub.index] as { submenu: MenuEntry[] }).submenu}
          x={sub.x}
          y={sub.y}
          depth={depth + 1}
          autoFocus={false}
          onClose={(reason) => {
            setSub(null);
            onClose(reason);
          }}
        />
      )}
    </>
  );
  // Keep every level in one portal so clicking a submenu counts as an inside press.
  return depth === 0 ? createPortal(<div ref={tree}>{content}</div>, document.body) : content;
}

/** Window menu bar with click-to-open, hover-to-switch and keyboard navigation. */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const bar = useRef<HTMLDivElement>(null);

  const openAt = (i: number) => {
    const el = bar.current?.children[i] as HTMLElement | undefined;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom });
    setOpen(i);
  };

  return (
    <div className="menubar" ref={bar} role="menubar">
      {menus.map((m, i) => (
        <div
          key={m.label}
          role="menuitem"
          tabIndex={0}
          aria-haspopup={!m.action}
          aria-expanded={open === i}
          className={`mtop ${open === i ? 'open' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            if (m.action) { setOpen(null); m.action(); return; }
            if (open === i) setOpen(null);
            else openAt(i);
          }}
          onMouseEnter={() => {
            if (open !== null && open !== i && !m.action) openAt(i);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
              e.preventDefault();
              if (m.action) m.action();
              else openAt(i);
            } else if (e.key === 'ArrowRight') {
              (bar.current?.children[(i + 1) % menus.length] as HTMLElement)?.focus();
            } else if (e.key === 'ArrowLeft') {
              (bar.current?.children[(i - 1 + menus.length) % menus.length] as HTMLElement)?.focus();
            }
          }}
        >
          {m.label}
        </div>
      ))}
      {open !== null && (
        <MenuPopup
          items={menus[open].items}
          x={anchor.x}
          y={anchor.y}
          anchorRef={bar}
          onClose={(reason) => {
            setOpen(null);
            if (reason !== 'outside') (bar.current?.children[open] as HTMLElement | undefined)?.focus();
          }}
        />
      )}
    </div>
  );
}

export function ToolButton({ icon, label, onClick, disabled, title, children }: {
  icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string; children?: ReactNode;
}) {
  return (
    <button className="tool" onClick={onClick} disabled={disabled} title={title ?? label} aria-label={label}>
      <span className="ico">{icon}</span>
      <span className="lbl">{label}</span>
      {children}
    </button>
  );
}
