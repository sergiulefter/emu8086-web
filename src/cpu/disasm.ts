/**
 * 8086 disassembler producing EMU8086-style text (uppercase mnemonics,
 * `[BX + SI + 05h]` memory operands, `0B800h` immediates, `b.`/`w.` size
 * prefixes where the operand size is not implied by a register).
 */
import { REG16_NAMES, REG8_NAMES, ROM_SEGMENT, SREG_NAMES } from './cpu';

export interface Disassembled {
  /** Number of bytes consumed (1..6 plus prefixes). */
  length: number;
  text: string;
  /** Near/far branch target if statically known. */
  target?: { segment?: number; offset: number };
}

export type ByteReader = (offset: number) => number;

const ALU = ['ADD', 'OR', 'ADC', 'SBB', 'AND', 'SUB', 'XOR', 'CMP'];
const SHIFTS = ['ROL', 'ROR', 'RCL', 'RCR', 'SHL', 'SHR', 'SETMO', 'SAR'];
const JCC = ['JO', 'JNO', 'JB', 'JAE', 'JE', 'JNE', 'JBE', 'JA', 'JS', 'JNS', 'JP', 'JNP', 'JL', 'JGE', 'JLE', 'JG'];
const EA = ['BX + SI', 'BX + DI', 'BP + SI', 'BP + DI', 'SI', 'DI', 'BP', 'BX'];

export function hex(v: number, digits: number): string {
  return v.toString(16).toUpperCase().padStart(digits, '0');
}

/** EMU8086 disassembly literal: always a leading 0, padded digits, `h` suffix (`INT 010h`, `MOV AX, 0B800h`). */
export function hexLiteral(v: number, digits: number): string {
  return '0' + hex(v, digits) + 'h';
}

export function disassemble(read: ByteReader, offset: number, segment = 0): Disassembled {
  let pos = offset;
  const next = () => read(pos++ & 0xffff) & 0xff;
  const next16 = () => {
    const lo = next();
    return lo | (next() << 8);
  };
  let segPrefix = '';
  let rep = '';
  let lock = '';
  let op = next();
  for (let guard = 0; guard < 8; guard++) {
    if (op === 0x26 || op === 0x2e || op === 0x36 || op === 0x3e) segPrefix = SREG_NAMES[(op >> 3) & 3];
    else if (op === 0xf2) rep = 'REPNE ';
    else if (op === 0xf3) rep = 'REP ';
    else if (op === 0xf0 || op === 0xf1) lock = 'LOCK ';
    else break;
    op = next();
  }

  interface M { mod: number; reg: number; rm: number; mem: string }
  const modrm = (): M => {
    const b = next();
    const mod = b >> 6;
    const reg = (b >> 3) & 7;
    const rm = b & 7;
    if (mod === 3) return { mod, reg, rm, mem: '' };
    let inner: string;
    if (mod === 0 && rm === 6) inner = hexLiteral(next16(), 4);
    else {
      inner = EA[rm];
      if (mod === 1) {
        const d = next();
        const sd = d & 0x80 ? d - 0x100 : d;
        inner += sd < 0 ? ` - ${hexLiteral(-sd, 2)}` : ` + ${hexLiteral(sd, 2)}`;
      } else if (mod === 2) {
        inner += ` + ${hexLiteral(next16(), 4)}`;
      }
    }
    return { mod, reg, rm, mem: `${segPrefix ? segPrefix + ':' : ''}[${inner}]` };
  };
  const rm8 = (m: M, sized = false) => (m.mod === 3 ? REG8_NAMES[m.rm] : (sized ? 'b.' : '') + m.mem);
  const rm16 = (m: M, sized = false) => (m.mod === 3 ? REG16_NAMES[m.rm] : (sized ? 'w.' : '') + m.mem);
  const imm8 = () => hexLiteral(next(), 2);
  const imm16 = () => hexLiteral(next16(), 4);
  const rel8 = () => {
    const d = next();
    return (pos + (d & 0x80 ? d - 0x100 : d)) & 0xffff;
  };
  const rel16 = () => {
    const d = next16();
    return (pos + d) & 0xffff;
  };
  const moffs = () => `${segPrefix ? segPrefix + ':' : ''}[${hexLiteral(next16(), 4)}]`;

  let text = '';
  let target: Disassembled['target'];

  if (op < 0x40 && (op & 7) < 6) {
    const name = ALU[op >> 3];
    switch (op & 7) {
      case 0: { const m = modrm(); text = `${name} ${rm8(m)}, ${REG8_NAMES[m.reg]}`; break; }
      case 1: { const m = modrm(); text = `${name} ${rm16(m)}, ${REG16_NAMES[m.reg]}`; break; }
      case 2: { const m = modrm(); text = `${name} ${REG8_NAMES[m.reg]}, ${rm8(m)}`; break; }
      case 3: { const m = modrm(); text = `${name} ${REG16_NAMES[m.reg]}, ${rm16(m)}`; break; }
      case 4: text = `${name} AL, ${imm8()}`; break;
      case 5: text = `${name} AX, ${imm16()}`; break;
    }
  } else if (op >= 0x40 && op <= 0x5f) {
    text = `${['INC', 'DEC', 'PUSH', 'POP'][(op - 0x40) >> 3]} ${REG16_NAMES[op & 7]}`;
  } else if (op >= 0x60 && op <= 0x7f) {
    const t = rel8();
    target = { offset: t };
    text = `${JCC[op & 0x0f]} ${hexLiteral(t, 4)}`;
  } else if (op >= 0x91 && op <= 0x97) {
    text = `XCHG AX, ${REG16_NAMES[op & 7]}`;
  } else if (op >= 0xb0 && op <= 0xb7) {
    text = `MOV ${REG8_NAMES[op & 7]}, ${imm8()}`;
  } else if (op >= 0xb8 && op <= 0xbf) {
    text = `MOV ${REG16_NAMES[op & 7]}, ${imm16()}`;
  } else if (op >= 0xd8 && op <= 0xdf) {
    const m = modrm();
    text = `ESC ${((op & 7) << 3) | m.reg}, ${rm16(m)}`;
  } else {
    switch (op) {
      case 0x06: case 0x0e: case 0x16: case 0x1e: text = `PUSH ${SREG_NAMES[(op >> 3) & 3]}`; break;
      case 0x07: case 0x0f: case 0x17: case 0x1f: text = `POP ${SREG_NAMES[(op >> 3) & 3]}`; break;
      case 0x27: text = 'DAA'; break;
      case 0x2f: text = 'DAS'; break;
      case 0x37: text = 'AAA'; break;
      case 0x3f: text = 'AAS'; break;
      case 0x80: case 0x81: case 0x82: case 0x83: {
        const m = modrm();
        const word = op & 1;
        let imm: string;
        if (op === 0x83) {
          const i = next();
          imm = i & 0x80 ? hexLiteral(0xff00 | i, 4) : hexLiteral(i, 2);
        } else imm = word ? imm16() : imm8();
        text = `${ALU[m.reg]} ${word ? rm16(m, true) : rm8(m, true)}, ${imm}`;
        break;
      }
      case 0x84: { const m = modrm(); text = `TEST ${rm8(m)}, ${REG8_NAMES[m.reg]}`; break; }
      case 0x85: { const m = modrm(); text = `TEST ${rm16(m)}, ${REG16_NAMES[m.reg]}`; break; }
      case 0x86: { const m = modrm(); text = `XCHG ${rm8(m)}, ${REG8_NAMES[m.reg]}`; break; }
      case 0x87: { const m = modrm(); text = `XCHG ${rm16(m)}, ${REG16_NAMES[m.reg]}`; break; }
      case 0x88: { const m = modrm(); text = `MOV ${rm8(m)}, ${REG8_NAMES[m.reg]}`; break; }
      case 0x89: { const m = modrm(); text = `MOV ${rm16(m)}, ${REG16_NAMES[m.reg]}`; break; }
      case 0x8a: { const m = modrm(); text = `MOV ${REG8_NAMES[m.reg]}, ${rm8(m)}`; break; }
      case 0x8b: { const m = modrm(); text = `MOV ${REG16_NAMES[m.reg]}, ${rm16(m)}`; break; }
      case 0x8c: { const m = modrm(); text = `MOV ${rm16(m)}, ${SREG_NAMES[m.reg & 3]}`; break; }
      case 0x8d: { const m = modrm(); text = `LEA ${REG16_NAMES[m.reg]}, ${rm16(m)}`; break; }
      case 0x8e: { const m = modrm(); text = `MOV ${SREG_NAMES[m.reg & 3]}, ${rm16(m)}`; break; }
      case 0x8f: { const m = modrm(); text = `POP ${rm16(m, true)}`; break; }
      case 0x90: text = 'NOP'; break;
      case 0x98: text = 'CBW'; break;
      case 0x99: text = 'CWD'; break;
      case 0x9a: {
        const off = next16();
        const seg = next16();
        target = { segment: seg, offset: off };
        text = `CALL ${hex(seg, 4)}:${hex(off, 4)}`;
        break;
      }
      case 0x9b: text = 'WAIT'; break;
      case 0x9c: text = 'PUSHF'; break;
      case 0x9d: text = 'POPF'; break;
      case 0x9e: text = 'SAHF'; break;
      case 0x9f: text = 'LAHF'; break;
      case 0xa0: text = `MOV AL, ${moffs()}`; break;
      case 0xa1: text = `MOV AX, ${moffs()}`; break;
      case 0xa2: text = `MOV ${moffs()}, AL`; break;
      case 0xa3: text = `MOV ${moffs()}, AX`; break;
      case 0xa4: text = rep + 'MOVSB'; rep = ''; break;
      case 0xa5: text = rep + 'MOVSW'; rep = ''; break;
      case 0xa6: text = (rep === 'REP ' ? 'REPE ' : rep) + 'CMPSB'; rep = ''; break;
      case 0xa7: text = (rep === 'REP ' ? 'REPE ' : rep) + 'CMPSW'; rep = ''; break;
      case 0xa8: text = `TEST AL, ${imm8()}`; break;
      case 0xa9: text = `TEST AX, ${imm16()}`; break;
      case 0xaa: text = rep + 'STOSB'; rep = ''; break;
      case 0xab: text = rep + 'STOSW'; rep = ''; break;
      case 0xac: text = rep + 'LODSB'; rep = ''; break;
      case 0xad: text = rep + 'LODSW'; rep = ''; break;
      case 0xae: text = (rep === 'REP ' ? 'REPE ' : rep) + 'SCASB'; rep = ''; break;
      case 0xaf: text = (rep === 'REP ' ? 'REPE ' : rep) + 'SCASW'; rep = ''; break;
      case 0xc0: case 0xc2: text = `RET ${imm16()}`; break;
      case 0xc1: case 0xc3: text = 'RET'; break;
      case 0xc4: { const m = modrm(); text = `LES ${REG16_NAMES[m.reg]}, ${rm16(m)}`; break; }
      case 0xc5: { const m = modrm(); text = `LDS ${REG16_NAMES[m.reg]}, ${rm16(m)}`; break; }
      case 0xc6: { const m = modrm(); text = `MOV ${rm8(m, true)}, ${imm8()}`; break; }
      case 0xc7: { const m = modrm(); text = `MOV ${rm16(m, true)}, ${imm16()}`; break; }
      case 0xc8: case 0xca: text = `RETF ${imm16()}`; break;
      case 0xc9: case 0xcb: text = 'RETF'; break;
      case 0xcc: text = 'INT 3'; break;
      case 0xcd: text = `INT ${imm8()}`; break;
      case 0xce: text = 'INTO'; break;
      case 0xcf: text = 'IRET'; break;
      case 0xd0: case 0xd1: case 0xd2: case 0xd3: {
        const m = modrm();
        const dst = op & 1 ? rm16(m, true) : rm8(m, true);
        text = `${SHIFTS[m.reg]} ${dst}, ${op & 2 ? 'CL' : '1'}`;
        break;
      }
      case 0xd4: { const b = next(); text = b === 10 ? 'AAM' : `AAM ${hexLiteral(b, 2)}`; break; }
      case 0xd5: { const b = next(); text = b === 10 ? 'AAD' : `AAD ${hexLiteral(b, 2)}`; break; }
      case 0xd6: text = 'SALC'; break;
      case 0xd7: text = 'XLATB'; break;
      case 0xe0: case 0xe1: case 0xe2: case 0xe3: {
        const t = rel8();
        target = { offset: t };
        text = `${['LOOPNE', 'LOOPE', 'LOOP', 'JCXZ'][op - 0xe0]} ${hexLiteral(t, 4)}`;
        break;
      }
      case 0xe4: text = `IN AL, ${imm8()}`; break;
      case 0xe5: text = `IN AX, ${imm8()}`; break;
      case 0xe6: text = `OUT ${imm8()}, AL`; break;
      case 0xe7: text = `OUT ${imm8()}, AX`; break;
      case 0xe8: { const t = rel16(); target = { offset: t }; text = `CALL ${hexLiteral(t, 4)}`; break; }
      case 0xe9: { const t = rel16(); target = { offset: t }; text = `JMP ${hexLiteral(t, 4)}`; break; }
      case 0xea: {
        const off = next16();
        const seg = next16();
        target = { segment: seg, offset: off };
        text = `JMP ${hex(seg, 4)}:${hex(off, 4)}`;
        break;
      }
      case 0xeb: { const t = rel8(); target = { offset: t }; text = `JMP ${hexLiteral(t, 4)}`; break; }
      case 0xec: text = 'IN AL, DX'; break;
      case 0xed: text = 'IN AX, DX'; break;
      case 0xee: text = 'OUT DX, AL'; break;
      case 0xef: text = 'OUT DX, AX'; break;
      case 0xf4: text = 'HLT'; break;
      case 0xf5: text = 'CMC'; break;
      case 0xf6: case 0xf7: {
        const m = modrm();
        const word = op & 1;
        const dst = word ? rm16(m, true) : rm8(m, true);
        const names = ['TEST', 'TEST', 'NOT', 'NEG', 'MUL', 'IMUL', 'DIV', 'IDIV'];
        text = m.reg < 2 ? `TEST ${dst}, ${word ? imm16() : imm8()}` : `${names[m.reg]} ${dst}`;
        break;
      }
      case 0xf8: text = 'CLC'; break;
      case 0xf9: text = 'STC'; break;
      case 0xfa: text = 'CLI'; break;
      case 0xfb: text = 'STI'; break;
      case 0xfc: text = 'CLD'; break;
      case 0xfd: text = 'STD'; break;
      case 0xfe: {
        const m = modrm();
        text = m.reg < 2 ? `${m.reg ? 'DEC' : 'INC'} ${rm8(m, true)}` : `DB 0FEh ; undefined /${m.reg}`;
        break;
      }
      case 0xff: {
        // Emulator service trap inside the BIOS ROM segment: FF FF CD nn.
        if (segment === ROM_SEGMENT && read(pos & 0xffff) === 0xff && read((pos + 1) & 0xffff) === 0xcd) {
          pos += 2;
          text = `BIOS SERVICE ${hexLiteral(next(), 2)}`;
          break;
        }
        const m = modrm();
        switch (m.reg) {
          case 0: text = `INC ${rm16(m, true)}`; break;
          case 1: text = `DEC ${rm16(m, true)}`; break;
          case 2: text = `CALL ${rm16(m)}`; break;
          case 3: text = `CALL FAR ${rm16(m)}`; break;
          case 4: text = `JMP ${rm16(m)}`; break;
          case 5: text = `JMP FAR ${rm16(m)}`; break;
          default: text = `PUSH ${rm16(m, true)}`; break;
        }
        break;
      }
      default:
        text = `DB ${hexLiteral(op, 2)}`;
    }
  }
  return { length: pos - offset, text: lock + rep + text, target };
}
