# EMU8086 .RADIX and #MEM UI review

Research date: 2026-10-31. Target: EMU8086 4.08, with older screenshots explicitly identified below.
Scope: the visible additions from the two directive implementations, not a redesign of every existing view.

## Sources checked

| Source | Evidence | Limit |
|---|---|---|
| [Release notes, .RADIX section](https://raw.githubusercontent.com/surendrajat/emu8086/master/version.txt) | Lines 335–356 describe a directive written in source and its effect on numeric interpretation. Lines 212–222 describe #MEM and the preset RET/HLT behavior. | No feature-specific screenshot or dialog is shown. |
| [Compiler help](https://surendrajat.github.io/emu8086/documentation/compiler.html) | #MEM appears with the BIN register/load directives, then as text syntax and examples. The same page explains the existing Compile/Emulate and error-processing flow. | Describes behavior rather than exact new control geometry or error text. |
| [Source editor screenshot](https://surendrajat.github.io/emu8086/documentation/img/compile01.gif) | Visually inspected the actual image: standard source editor, assembler/emulator menus, Compile and Emulate toolbar actions. | Older screenshot: toolbar/menu differs from the 4.08 inventory. Neither directive appears in its source. |
| [Assembler-status screenshot](https://surendrajat.github.io/emu8086/documentation/img/compile03.gif) | Visually inspected the existing error-processing window linked by the compiler help: status, compilation errors, close/run buttons and source-line indication. | Its older caption is "compiler status"; the existing 4.08 research identifies "assembler status". Not evidence of directive-specific errors. |
| [Emulator screenshot](https://surendrajat.github.io/emu8086/documentation/img/emulator03.gif) | Visually inspected the actual image: registers, memory list, disassembly, existing load/reload/step/run/reset controls. | No .RADIX or #MEM dialog is pictured. Does not establish all 4.08 pixel dimensions. |
| [Getting started](https://surendrajat.github.io/emu8086/documentation/start_unframed.html) | Emulate/F5 compiles and loads; Single Step/F8 observes registers and screen; Step Back/F6 reverses execution. | General interaction flow, not feature-specific screenshots. |
| [Help navigation](https://surendrajat.github.io/emu8086/documentation/menu.html) and [documentation index](https://surendrajat.github.io/emu8086/documentation/help.html) | Original help is an HTML reference/tutorial collection, not this project's single-page quick guide. | Does not establish the geometry of a Windows help/browser window. |
| [Shipped configuration](https://raw.githubusercontent.com/surendrajat/emu8086/master/emu8086.ini) | ASK_OPEN_URL and its comment describe opening offline documentation files. | Configuration is evidence about help handling, not a screenshot of the running help interface. |

The existing [4.08 UI inventory](EMU8086_DOC_RESEARCH.md), sections 1.8, 2.3, 2.4 and 8, was also reviewed.
It records the main menu/forms and syntax-color categories, and identifies version differences in the images.
The available inventory contains no dedicated radix selector or memory-preset editor.

## Findings and changes

Both features are documented as source directives. Their effects are observed through the ordinary
register/memory/disassembly views after compiling and loading. No separate feature dialog, toolbar button,
menu command, badge or live radix indicator was found in the references checked. That is a bounded finding,
not proof that no undocumented control exists in any release.

The implementations already use that existing interaction flow. `.RADIX` does not change register-view
number formats or the independent calculator, and #MEM initializes the same RAM shown by existing views.
Both remain in the editor source; neither emits executable instructions or introduces extra debugger steps.
They use the existing directive syntax-color category; exact 4.08 token colors for these two spellings
could not be established from the available screenshots, so no speculative color change was made.

The recently added .RADIX help bullet and #MEM help paragraph have been removed. Their technical guidance
remains in the support matrix and verification report. The existing BIN help sentence retains "by default"
to avoid falsely implying that custom memory presets always include the default RET/HLT trampoline.
No feature-specific controls or layouts were added.

The existing quick guide itself remains an acknowledged difference from EMU8086's HTML help system.
Removing the additions does not make that entire help system pixel-identical. A full help-system rebuild
is outside this two-feature review. The main editor/emulator styling also has previously documented
font and browser differences; no whole-application 1:1 claim is made.

## Verification

- `npx playwright test tests/e2e/radix.spec.ts tests/e2e/memoryPresets.spec.ts --workers=1`: exercises both
  directives through the existing editor, Emulate, register fields, Step Back, reset/reload, and error view.
  **6 / 6 passed** across Chromium and Firefox.
- `npm run build`: type check and production bundle after removing the added help content. **Passed.**
- `npm run check:seo` and `git diff --check`: normal build-content and whitespace checks. **Passed.**

The original executable was not run. Exact directive-specific error messages, highlighting, and pixel
geometry remain unverified rather than being guessed from generic screenshots.

## Follow-up: the original help interface

The user subsequently asked specifically whether EMU8086 4.x has a help interface and for visual evidence.
The existing 4.08 menu inventory identifies Help > documentation and tutorials, with F1, plus the toolbar
help button. The preserved [index.html source](https://raw.githubusercontent.com/surendrajat/emu8086/master/documentation/index.html)
provides a direct reference for the documentation layout: a frameset with a 35-pixel navigation row
(`menu.html`) and the remaining area containing `help.html`, initially the documentation index.
The [live preserved index](https://surendrajat.github.io/emu8086/documentation/index.html) was loaded and
visually inspected in Chromium at 1024 × 768. It has a white background, blue linked navigation and
topics, and a horizontal frame separator. The navigation links lead to the index, licence, tutorials,
instruction set and interrupts. This is not the project's one-page quick-guide layout.

An inspection screenshot is saved locally at `.cache/emu8086-ui/original-help-index.png`. It is a **new
rendering of the preserved original HTML**, not a historical capture of an EMU8086 application window.
The ignored cache also contains the inspected screenshot-gallery images, which did not establish the
help interface. These downloaded third-party images are not bundled into the app.

The shipped [emu8086.ini](https://raw.githubusercontent.com/surendrajat/emu8086/master/emu8086.ini), lines
19–20, describes the online prompt before opening offline documentation. A 2014 Universidad Nacional
de Rosario guide, [section 4.3 / Figure 18](https://pdfcoffee.com/introduccion-emu8086-v14-pdf-free.html),
explicitly describes the Help action opening a browser. Its text was available, but the Figure 18 image
could not be independently inspected, so it is corroboration rather than a verified historical screenshot.
The exact version shown by that guide is not established by its date alone.

A [beginner video](https://www.youtube.com/watch?v=flj4PDalKrc) and an
[instructional course](https://akademiktv.com/kurs/140) were located, but the relevant playback could not
be inspected. Neither is claimed to show a verified F1/help sequence, and no timestamp is asserted.

Conclusion: 4.08 has the help entry point; the preserved help content is an HTML documentation site.
The evidence supports reproducing that HTML structure and navigation. The exact external browser/window
chrome and any online/offline prompt behavior still require a running 4.08 observation; they must not be
inferred from the project's custom in-app window. No application UI was changed during this follow-up.
