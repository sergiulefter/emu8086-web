# ADR-004: VGA text mode and code page

**Status:** accepted

## Decision
- The screen window renders **directly from RAM** at `B8000h + page × 1000h`, two bytes per cell (character,
  attribute), with 80 or 40 columns from the BIOS data area. There is no separate output buffer.
- Glyphs are drawn on a canvas from code page 437, using the IBM VGA 9×16 font (also 8×16 and 8×14, switched with
  "change font"). The fonts come from The Ultimate Oldschool PC Font Pack (CC BY-SA 4.0), served locally.
- Colours use the standard 16-colour CGA/VGA palette. **Attribute bit 7 means a bright background, not blink.**
  EMU8086 does not emulate blinking, and its documentation advises `INT 10h AX=1003h`, which is accepted as a no-op.
- At startup the BIOS mode set fills all 8 pages with `20h 07h` (space, light grey on black). Untouched cells
  therefore read `20 07`, as on a real PC.
- The BIOS cursor (from `0040:0050`) is drawn as a blinking underline. The canvas scales uniformly to fit the window.
