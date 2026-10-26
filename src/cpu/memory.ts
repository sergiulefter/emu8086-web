/**
 * 1 MiB real-mode memory. Physical addresses wrap at 0xFFFFF exactly like
 * the 8086's 20-bit address bus.
 *
 * Every write can be journaled (address + previous byte) so the debugger can
 * reverse an instruction exactly (Step Back), and observers are notified so
 * the VGA screen and memory views can refresh only when needed.
 */
export const MEMORY_SIZE = 0x100000;
export const ADDRESS_MASK = 0xfffff;

export function physical(segment: number, offset: number): number {
  return (((segment & 0xffff) << 4) + (offset & 0xffff)) & ADDRESS_MASK;
}

export class Memory {
  readonly bytes = new Uint8Array(MEMORY_SIZE);
  /** When non-null, each write appends `address, oldValue` pairs. */
  journal: number[] | null = null;
  /** Lowest/highest physical address written since the last `clearDirty()`. */
  dirtyLow = ADDRESS_MASK + 1;
  dirtyHigh = -1;
  /** Bumped on every write; cheap change detection for views. */
  version = 0;

  read8(address: number): number {
    return this.bytes[address & ADDRESS_MASK];
  }

  write8(address: number, value: number): void {
    const a = address & ADDRESS_MASK;
    const v = value & 0xff;
    if (this.journal) this.journal.push(a, this.bytes[a]);
    this.bytes[a] = v;
    if (a < this.dirtyLow) this.dirtyLow = a;
    if (a > this.dirtyHigh) this.dirtyHigh = a;
    this.version++;
  }

  /** Word access at segment:offset; the high byte offset wraps inside the segment. */
  read16(segment: number, offset: number): number {
    return this.read8(physical(segment, offset)) | (this.read8(physical(segment, offset + 1)) << 8);
  }

  write16(segment: number, offset: number, value: number): void {
    this.write8(physical(segment, offset), value & 0xff);
    this.write8(physical(segment, offset + 1), (value >> 8) & 0xff);
  }

  /** Bulk load without journaling (program loader, ROM setup). */
  load(address: number, data: ArrayLike<number>): void {
    for (let i = 0; i < data.length; i++) this.bytes[(address + i) & ADDRESS_MASK] = data[i] & 0xff;
    this.version++;
  }

  clear(): void {
    this.bytes.fill(0);
    this.version++;
  }

  clearDirty(): void {
    this.dirtyLow = ADDRESS_MASK + 1;
    this.dirtyHigh = -1;
  }

  isDirty(low: number, high: number): boolean {
    return this.dirtyHigh >= low && this.dirtyLow <= high;
  }
}
