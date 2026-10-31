import { ADDRESS_MASK, MEMORY_SIZE, physical } from '../cpu/memory';
import { AsmError, type MemoryPreset } from './types';

/** EMU8086 compiler help: bare hex addresses and byte strings, separated by '-'. */
export function parseMemoryPresets(value: string, line: number, col: number): MemoryPreset[] {
  const entries: MemoryPreset[] = [];
  let entryOffset = 0;
  for (const entry of value.split('-')) {
    const fail = (message: string, offset = 0, length = Math.max(1, entry.length)): never => {
      throw new AsmError(`#MEM: ${message}`, line, col + entryOffset + offset, length);
    };
    const comma = entry.indexOf(',');
    if (comma < 0) fail('expected address,bytes for each entry');
    const rawAddress = entry.slice(0, comma);
    const addressText = rawAddress.trim();
    const addressOffset = rawAddress.length - rawAddress.trimStart().length;
    const parts = addressText.split(':');
    if (parts.length > 2 || parts.some((part) => !/^[0-9a-f]+$/i.test(part.trim()))) {
      fail('expected a hexadecimal physical address or segment:offset', addressOffset, Math.max(1, addressText.length));
    }
    const values = parts.map((part) => Number.parseInt(part.trim(), 16));
    const limit = parts.length === 2 ? 0xffff : ADDRESS_MASK;
    if (values.some((n) => !Number.isSafeInteger(n) || n > limit)) {
      fail(parts.length === 2 ? 'segment and offset must fit in 16 bits' : 'physical address must be between 0 and FFFFF', addressOffset, addressText.length);
    }
    const address = parts.length === 2 ? physical(values[0], values[1]) : values[0];
    const rawBytes = entry.slice(comma + 1);
    const invalidDigit = rawBytes.search(/[^0-9a-f \t]/i);
    if (invalidDigit >= 0) fail('byte strings must contain hexadecimal digits only', comma + 1 + invalidDigit, 1);
    const hex = rawBytes.replace(/[ \t]/g, '');
    if (hex.length === 0 || hex.length % 2 !== 0) {
      fail('expected two hexadecimal digits per byte', comma + 1, Math.max(1, rawBytes.length));
    }
    if (hex.length / 2 > MEMORY_SIZE) fail('one byte string cannot exceed 1 MiB', comma + 1, rawBytes.length);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    entries.push({ address, bytes });
    entryOffset += entry.length + 1;
  }
  return entries;
}
