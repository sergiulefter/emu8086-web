/** Original SVG icons drawn for 8086 Studio in a late-90s toolbar style. */
import type { JSX } from 'react';

type P = { size?: number };
const S = ({ size = 24, children, vb = '0 0 24 24' }: { size?: number; children: React.ReactNode; vb?: string }) => (
  <svg width={size} height={size} viewBox={vb} aria-hidden="true" focusable="false">{children}</svg>
);

export const Icons: Record<string, (p: P) => JSX.Element> = {
  new: ({ size }) => (
    <S size={size}>
      <path d="M5 2.5h9.5l4.5 4.5v14.5H5z" fill="#fff" stroke="#555" />
      <path d="M14.5 2.5V7H19" fill="#e8e8e8" stroke="#555" />
    </S>
  ),
  open: ({ size }) => (
    <S size={size}>
      <path d="M2.5 6.5h6l2 2h9v11h-17z" fill="#e7b44c" stroke="#8a6214" />
      <path d="M4.5 11.5h17l-3 8h-16z" fill="#f6d27c" stroke="#8a6214" />
      <path d="M13 3.5c3 0 5 1.5 5.5 4" fill="none" stroke="#2a64c8" strokeWidth="1.5" />
      <path d="M17 6.5l1.6 1.8 1.4-2.2" fill="none" stroke="#2a64c8" strokeWidth="1.5" />
    </S>
  ),
  examples: ({ size }) => (
    <S size={size}>
      <path d="M12 2.5l2.8 6 6.5.6-4.9 4.3 1.5 6.4L12 16.4l-5.9 3.4 1.5-6.4-4.9-4.3 6.5-.6z" fill="#f2b632" stroke="#9a6a00" strokeLinejoin="round" />
      <path d="M12 5.5l1.8 4 4.2.4" fill="none" stroke="#ffe48a" />
    </S>
  ),
  save: ({ size }) => (
    <S size={size}>
      <path d="M3.5 3.5h15l2 2v15h-17z" fill="#3b4a6b" stroke="#1d2436" />
      <rect x="6.5" y="3.5" width="10" height="6.5" fill="#e9eef7" stroke="#1d2436" />
      <rect x="13" y="4.5" width="2" height="4" fill="#3b4a6b" />
      <rect x="6" y="13" width="12" height="7" fill="#d0d6e2" stroke="#1d2436" />
    </S>
  ),
  compile: ({ size }) => (
    <S size={size}>
      <rect x="5.5" y="5.5" width="13" height="13" fill="#2f5d9e" stroke="#13284a" />
      {[8, 11, 14, 17].map((v) => (
        <g key={v} stroke="#555">
          <line x1={v - 0.5} y1="2" x2={v - 0.5} y2="5.5" />
          <line x1={v - 0.5} y1="18.5" x2={v - 0.5} y2="22" />
          <line x1="2" y1={v - 0.5} x2="5.5" y2={v - 0.5} />
          <line x1="18.5" y1={v - 0.5} x2="22" y2={v - 0.5} />
        </g>
      ))}
      <text x="12" y="14.6" fontSize="6.5" fontFamily="monospace" fill="#fff" textAnchor="middle" fontWeight="bold">86</text>
    </S>
  ),
  emulate: ({ size }) => (
    <S size={size}>
      <path d="M7 4.5l12 7.5-12 7.5z" fill="#2fb34a" stroke="#156b26" strokeLinejoin="round" />
      <path d="M8.5 7.5l6.5 4" stroke="#9be8a9" />
    </S>
  ),
  calculator: ({ size }) => (
    <S size={size}>
      <rect x="4.5" y="2.5" width="15" height="19" rx="1.5" fill="#4c5a66" stroke="#222" />
      <rect x="6.5" y="4.5" width="11" height="4.5" fill="#9fd8c9" stroke="#222" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={6.5 + c * 4} y={11 + r * 3.3} width="2.8" height="2.2" fill={c === 2 && r === 2 ? '#e36a3b' : '#e8e8e8'} />
      )))}
    </S>
  ),
  convertor: ({ size }) => (
    <S size={size}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" fill="#7fc6d3" stroke="#245e6a" />
      <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" fill="#4ea3b4" stroke="#245e6a" />
      <text x="12" y="16.5" fontSize="6.5" fontFamily="monospace" fill="#fff" textAnchor="middle" fontWeight="bold">0F</text>
    </S>
  ),
  options: ({ size }) => (
    <S size={size}>
      <path d="M5 19l9-9" stroke="#7a4b22" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 4.5l4 4-2.5 2.5-4-4z" fill="#8a8f96" stroke="#3b3f45" />
      <path d="M19 19l-8.5-8.5" stroke="#8a8f96" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="6.5" cy="6.5" r="3.6" fill="none" stroke="#3b3f45" strokeWidth="2.2" />
      <path d="M5 5l3 3" stroke="#f0f0f0" strokeWidth="2.4" />
    </S>
  ),
  help: ({ size }) => (
    <S size={size}>
      <circle cx="12" cy="12" r="9" fill="#ffe17a" stroke="#a37b00" />
      <path d="M9.2 9.3c0-1.8 1.3-2.9 2.9-2.9 1.7 0 2.9 1.1 2.9 2.6 0 2.4-2.9 2.4-2.9 4.8" fill="none" stroke="#5a3e00" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12.1" cy="17" r="1.25" fill="#5a3e00" />
    </S>
  ),
  about: ({ size }) => (
    <S size={size}>
      <rect x="3.5" y="4.5" width="17" height="15" fill="#fff" stroke="#3b4a6b" />
      <rect x="3.5" y="4.5" width="17" height="3.5" fill="#3b4a6b" />
      <circle cx="12" cy="13.5" r="3.6" fill="#2a64c8" />
      <rect x="11.3" y="12.6" width="1.4" height="3" fill="#fff" />
      <rect x="11.3" y="10.9" width="1.4" height="1.2" fill="#fff" />
    </S>
  ),
  load: ({ size = 18 }) => (
    <S size={size}>
      <path d="M2.5 7.5h6l2 2h9v10h-17z" fill="#e7b44c" stroke="#8a6214" />
      <path d="M4.5 12h17l-3 7.5h-16z" fill="#f6d27c" stroke="#8a6214" />
    </S>
  ),
  reload: ({ size = 18 }) => (
    <S size={size}>
      <path d="M18 12a6 6 0 1 1-2.2-4.6" fill="none" stroke="#1f5fc8" strokeWidth="2.6" />
      <path d="M13.5 3.8l4.6 3.3-4.2 3.4z" fill="#1f5fc8" />
    </S>
  ),
  stepBack: ({ size = 18 }) => (
    <S size={size}>
      <path d="M17 5v14l-9-7z" fill="#d6402b" stroke="#7d1709" strokeLinejoin="round" />
      <rect x="4.5" y="5" width="2.6" height="14" fill="#d6402b" stroke="#7d1709" />
    </S>
  ),
  singleStep: ({ size = 18 }) => (
    <S size={size}>
      <rect x="5" y="5" width="2.6" height="14" fill="#2fb34a" stroke="#156b26" />
      <path d="M9.5 5v14l9-7z" fill="#2fb34a" stroke="#156b26" strokeLinejoin="round" />
    </S>
  ),
  run: ({ size = 18 }) => (
    <S size={size}>
      <path d="M4 5l8 7-8 7z" fill="#2fb34a" stroke="#156b26" strokeLinejoin="round" />
      <path d="M12 5l8 7-8 7z" fill="#2fb34a" stroke="#156b26" strokeLinejoin="round" />
    </S>
  ),
  // 16px window icons
  appEditor: () => (
    <S size={16} vb="0 0 16 16">
      <rect x="2.5" y="2.5" width="11" height="11" fill="#1d8f3a" stroke="#0c4a1b" />
      <path d="M5 6h6M5 8h6M5 10h4" stroke="#bff3c9" />
    </S>
  ),
  appEmulator: () => (
    <S size={16} vb="0 0 16 16">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="#c62828" stroke="#6d0f0f" />
      <rect x="5" y="5" width="6" height="6" fill="#f3b0a8" />
    </S>
  ),
  appScreen: () => (
    <S size={16} vb="0 0 16 16">
      <rect x="1.5" y="2.5" width="13" height="10" fill="#e47b1c" stroke="#7a3a00" />
      <text x="8" y="10.4" fontSize="6" fontFamily="monospace" fill="#fff" textAnchor="middle" fontWeight="bold">SCR</text>
    </S>
  ),
  appSource: () => (
    <S size={16} vb="0 0 16 16">
      <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#666" />
      <path d="M5 7h6M5 9h6M5 11h4" stroke="#2a64c8" />
    </S>
  ),
  appTool: () => (
    <S size={16} vb="0 0 16 16">
      <rect x="2.5" y="3.5" width="11" height="9" fill="#fff" stroke="#3b4a6b" />
      <rect x="2.5" y="3.5" width="11" height="2.5" fill="#3b4a6b" />
    </S>
  ),
  msgStop: () => (
    <S size={16} vb="0 0 16 16">
      <circle cx="8" cy="8" r="6.5" fill="#c62828" stroke="#6d0f0f" />
    </S>
  ),
  bigInfo: () => (
    <S size={32} vb="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#2a64c8" stroke="#123a80" />
      <rect x="14.4" y="13.5" width="3.2" height="10" fill="#fff" />
      <circle cx="16" cy="9.6" r="2" fill="#fff" />
    </S>
  ),
  bigError: () => (
    <S size={32} vb="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#d32f2f" stroke="#7a1010" />
      <path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </S>
  ),
  bigWarn: () => (
    <S size={32} vb="0 0 32 32">
      <path d="M16 3l14 25H2z" fill="#f2c12e" stroke="#7a5d00" strokeLinejoin="round" />
      <rect x="14.5" y="11" width="3" height="9" fill="#222" />
      <circle cx="16" cy="23.5" r="1.8" fill="#222" />
    </S>
  ),
  dropArrow: () => (
    <S size={8} vb="0 0 8 8">
      <path d="M1 2.5h6L4 6z" fill="#333" />
    </S>
  ),
};
