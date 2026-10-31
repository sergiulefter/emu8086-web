export class AsmError extends Error {
  constructor(message: string, readonly line: number, readonly col: number, readonly length = 1) {
    super(message);
  }
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** 1-based line and column in the original source. */
  line: number;
  col: number;
  length: number;
}

export type OutputType = 'com' | 'bin';

export interface SourceMapEntry {
  line: number;
  /** Offset (relative to the load segment) of the first emitted byte. */
  address: number;
  length: number;
  /** True for DB/DW data, false for instructions. */
  isData: boolean;
}

export interface SymbolInfo {
  name: string;
  kind: 'label' | 'var' | 'const' | 'proc';
  value: number;
  /** Element size for variables (1 = byte, 2 = word, 4 = dword). */
  size: number;
  /** Number of elements reserved by the defining directive. */
  count: number;
  line: number;
}

/** Bytes to load at a physical address before a BIN program starts. */
export interface MemoryPreset {
  address: number;
  bytes: Uint8Array;
}

export interface AssembleResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  outputType: OutputType;
  /** Offset of bytes[0] within the load segment (100h for COM). */
  origin: number;
  bytes: Uint8Array;
  /** Entry offset (END label, or origin). */
  entry: number;
  sourceMap: SourceMapEntry[];
  symbols: SymbolInfo[];
  /** Human-readable notes (e.g. automatic long-jump conversions). */
  notes: string[];
  /** BIN loader settings from #LOAD_SEGMENT=...#, #CS=...# etc. (hex values). */
  binf: Record<string, number>;
  /** #MEM entries in source order; separate from the executable image. */
  memoryPresets: MemoryPreset[];
}
