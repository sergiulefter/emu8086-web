import { useRef, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { useStore, type WinId } from '../store';

interface Props {
  id: WinId;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  resizable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  /** Tool windows show only a close button (like EMU8086's extended value viewer). */
  tool?: boolean;
  minW?: number;
  minH?: number;
  onClose?: () => void;
  className?: string;
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export function Window({
  id, title, icon, children, resizable = true, minimizable = true, maximizable = true, tool = false,
  minW = 160, minH = 90, onClose, className,
}: Props) {
  const s = useStore();
  const w = s.wins[id];
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; w: number; h: number; edge?: Edge } | null>(null);
  if (!w.open) return null;
  const active = s.active === id;

  const desktopSize = () => {
    const d = document.querySelector('.desktop') as HTMLElement | null;
    return { dw: d?.clientWidth ?? window.innerWidth, dh: d?.clientHeight ?? window.innerHeight };
  };

  const onPointerDown = (e: RPointerEvent, edge?: Edge) => {
    if (e.button !== 0) return;
    if (!edge && (e.target as HTMLElement).closest('.tbtn')) return;
    s.focus(id);
    if (w.maximized) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: w.x, y: w.y, w: w.w, h: w.h, edge };
  };

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const { dw, dh } = desktopSize();
    if (!d.edge) {
      // keep at least part of the title bar reachable
      const x = Math.min(Math.max(d.x + dx, -d.w + 90), dw - 90);
      const y = Math.min(Math.max(d.y + dy, 0), dh - 30);
      s.setGeometry(id, { x, y });
      return;
    }
    let { x, y, w: ww, h } = d;
    if (d.edge.includes('e')) ww = Math.max(minW, d.w + dx);
    if (d.edge.includes('s')) h = Math.max(minH, d.h + dy);
    if (d.edge.includes('w')) {
      ww = Math.max(minW, d.w - dx);
      x = d.x + (d.w - ww);
    }
    if (d.edge.includes('n')) {
      h = Math.max(minH, d.h - dy);
      y = Math.max(0, d.y + (d.h - h));
      h = d.y + d.h - y;
    }
    s.setGeometry(id, { x, y, w: ww, h });
  };

  const onPointerUp = (e: RPointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    s.saveLayout();
  };

  const close = () => (onClose ? onClose() : s.close(id));
  const style = w.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: w.z }
    : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z };

  return (
    <section
      className={`win ${active ? 'active' : ''} ${w.maximized ? 'maximized' : ''} ${className ?? ''}`}
      style={{ ...style, display: w.minimized ? 'none' : undefined }}
      onPointerDownCapture={() => s.focus(id)}
      role="dialog"
      aria-label={title}
      data-win={id}
    >
      <div
        className="titlebar"
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(e) => {
          if (maximizable && resizable && !(e.target as HTMLElement).closest('.tbtn')) s.toggleMaximize(id);
        }}
      >
        <span className="ticon">{icon}</span>
        {/* window titles are the page's headings: the main editor window is the h1 */}
        {id === 'editor' ? <h1 className="ttext">{title}</h1> : <h2 className="ttext">{title}</h2>}
        {!tool && minimizable && (
          <button className="tbtn" title="Minimize" aria-label="Minimize" onClick={() => s.minimize(id)}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" /></svg>
          </button>
        )}
        {!tool && maximizable && (
          <button className="tbtn" title={w.maximized ? 'Restore Down' : 'Maximize'} aria-label={w.maximized ? 'Restore' : 'Maximize'} disabled={!resizable} onClick={() => s.toggleMaximize(id)}>
            {w.maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
            )}
          </button>
        )}
        <button className={`tbtn close ${tool ? 'small' : ''}`} title="Close" aria-label="Close" onClick={close}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
      </div>
      <div className="win-body">{children}</div>
      {resizable && !w.maximized &&
        EDGES.map((edge) => (
          <div
            key={edge}
            className={`rs ${edge}`}
            onPointerDown={(e) => onPointerDown(e, edge)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        ))}
    </section>
  );
}
