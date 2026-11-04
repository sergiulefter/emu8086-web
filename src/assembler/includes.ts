/**
 * Include files bundled with emu8086-web, as INCLUDE finds them in EMU8086's Inc folder.
 *
 * emu8086.inc is EMU8086 4.08's library file, unchanged: Copyright (c) 2015 by EMU8086.COM. All rights
 * reserved. http://www.emu8086.com — reproduced with that notice and link as the emu8086 ReadMe permits.
 */
import emu8086Inc from './includes/emu8086.inc?raw';
import type { IncludeFiles } from './preprocess';

export const INCLUDE_FILES: IncludeFiles = { 'emu8086.inc': emu8086Inc };
