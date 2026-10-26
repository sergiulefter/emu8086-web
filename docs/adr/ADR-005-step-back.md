# ADR-005: Reverse stepping

**Status:** accepted

## Decision
Each `Machine.step()` records a history entry containing the 14 register words, the halted flag, the instruction
count, the stop state, the keyboard-wait state, the service state (INT 21h/0Ah line input, 0Ch flush), the last
source line, and a **journal of every memory write** (address, previous byte). `stepBack()` replays the journal
in reverse and restores everything else. Video memory, the cursor and the keyboard buffer pointers live in
emulated RAM, so screen output and consumed keys are undone exactly.

Limits: 50 000 entries or 8 million journaled values, whichever comes first; the oldest entries are dropped.
External events are not part of an instruction and are not undone: keys typed, "clear screen", and edits made in
the register, memory, flags and variables windows. Tests check that forward, back and forward again reproduce
identical state (T010).
