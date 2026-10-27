/**
 * Example programs bundled with emu8086-web (original code written for this
 * project, plus the two classroom programs from the course).
 * Every example is assembled and executed by tests/integration/examples.test.ts.
 */
export interface Example {
  name: string;
  fileName: string;
  /** Keys to type when the example waits for input (used by tests). */
  input?: string;
  /** Expected text on the emulator screen after a normal run (tests). */
  expectScreen?: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  {
    name: 'Hello, world',
    fileName: 'hello.asm',
    expectScreen: 'Hello, world!',
    source: `; Hello, world: prints a message with DOS function 09h.
org 100h

    mov dx, offset msg  ; DS:DX -> '$'-terminated string
    mov ah, 09h
    int 21h

    ret                 ; return to the operating system

msg db 'Hello, world!', 0Dh, 0Ah, '$'
`,
  },
  {
    name: 'add / subtract',
    fileName: 'add_sub.asm',
    expectScreen: '25 + 17 = 42\n25 - 17 = 8',
    source: `; add / subtract: computes 25 + 17 and 25 - 17 and prints both results.
org 100h

    mov dx, offset msg_add
    mov ah, 9
    int 21h
    mov al, 25
    add al, 17          ; AL = 42
    call print_num

    mov dx, offset msg_sub
    mov ah, 9
    int 21h
    mov al, 25
    sub al, 17          ; AL = 8
    call print_num

    mov ax, 4C00h       ; terminate with exit code 0
    int 21h

msg_add db '25 + 17 = $'
msg_sub db 0Dh, 0Ah, '25 - 17 = $'

; prints AL (0..255) as an unsigned decimal number
print_num proc
    mov ah, 0
    mov bl, 10
    mov cx, 0
next_digit:
    div bl              ; AL = AX / 10, AH = remainder
    push ax             ; keep the remainder (AH)
    inc cx
    mov ah, 0
    cmp al, 0
    jne next_digit
print_digit:
    pop dx
    mov dl, dh          ; remainder -> DL
    add dl, '0'
    mov ah, 2
    int 21h
    loop print_digit
    ret
print_num endp
`,
  },
  {
    name: 'calculate sum',
    fileName: 'sum.asm',
    expectScreen: 'sum = 276',
    source: `; calculate sum: adds the bytes of an array and prints the total.
org 100h

    mov si, offset numbers
    mov cx, count
    mov ax, 0
sum_loop:
    add al, [si]        ; add the next element
    adc ah, 0           ; carry into the high byte
    inc si
    loop sum_loop
    mov total, ax

    mov dx, offset msg
    mov ah, 9
    int 21h
    mov ax, total
    call print_word
    ret

numbers db 12, 7, 33, 120, 5, 99
count   equ $ - numbers
total   dw ?
msg     db 'sum = $'

; prints AX as an unsigned decimal number
print_word proc
    mov bx, 10
    mov cx, 0
pw_next:
    mov dx, 0
    div bx              ; AX = DX:AX / 10, DX = remainder
    push dx
    inc cx
    cmp ax, 0
    jne pw_next
pw_print:
    pop dx
    add dl, '0'
    mov ah, 2
    int 21h
    loop pw_print
    ret
print_word endp
`,
  },
  {
    name: 'compare numbers',
    fileName: 'compare.asm',
    input: '73',
    expectScreen: 'first digit: 7\nsecond digit: 3\nthe first one is larger.',
    source: `; compare numbers: reads two digits and reports which one is larger.
org 100h

    mov dx, offset ask1
    mov ah, 9
    int 21h
    mov ah, 1           ; read a character (with echo) -> AL
    int 21h
    mov bl, al

    mov dx, offset ask2
    mov ah, 9
    int 21h
    mov ah, 1
    int 21h
    mov bh, al

    cmp bl, bh
    ja first_bigger
    jb second_bigger
    mov dx, offset same
    jmp show
first_bigger:
    mov dx, offset big1
    jmp show
second_bigger:
    mov dx, offset big2
show:
    mov ah, 9
    int 21h
    ret

ask1 db 'first digit: $'
ask2 db 0Dh, 0Ah, 'second digit: $'
big1 db 0Dh, 0Ah, 'the first one is larger.$'
big2 db 0Dh, 0Ah, 'the second one is larger.$'
same db 0Dh, 0Ah, 'they are equal.$'
`,
  },
  {
    name: 'binary, hex and octal values',
    fileName: 'bases.asm',
    expectScreen: '10110101b',
    source: `; binary, hex and octal values: one number written in different bases.
org 100h

    mov al, 10110101b   ; binary
    mov bl, 0B5h        ; hexadecimal (starts with a digit!)
    mov cl, 265o        ; octal
    mov dl, 181         ; decimal
    ; AL, BL, CL and DL now hold the same value.

    ; print BL in binary, most significant bit first
    mov cx, 8
print_bit:
    mov dl, '0'
    shl bl, 1           ; next bit -> CF
    adc dl, 0           ; DL = '0' + CF
    mov ah, 2
    int 21h
    loop print_bit
    mov dl, 'b'
    int 21h
    ret
`,
  },
  {
    name: 'palindrome',
    fileName: 'palindrome.asm',
    expectScreen: "'level' is a palindrome.",
    source: `; palindrome: checks whether a string reads the same backwards.
org 100h

    mov si, offset text             ; first character
    mov di, offset text + len - 1   ; last character
    mov cx, len / 2
check:
    mov al, [si]
    cmp al, [di]
    jne not_palindrome
    inc si
    dec di
    loop check
    mov dx, offset yes
    jmp print
not_palindrome:
    mov dx, offset no
print:
    mov ah, 9
    int 21h
    ret

text db 'level'
len  equ $ - text
yes  db "'level' is a palindrome.$"
no   db "'level' is not a palindrome.$"
`,
  },
  {
    name: 'simple i/o',
    fileName: 'simple_io.asm',
    input: 'Hi 8086\r',
    expectScreen: 'HI 8086',
    source: `; simple i/o: type on the emulator screen; letters are echoed in
; upper case. Press Enter to finish.
org 100h

next_key:
    mov ah, 0           ; BIOS: wait for a key -> AL = ASCII code
    int 16h
    cmp al, 13          ; Enter?
    je done
    cmp al, 'a'
    jb show
    cmp al, 'z'
    ja show
    sub al, 20h         ; lower case -> upper case
show:
    mov ah, 0Eh         ; BIOS teletype output
    int 10h
    jmp next_key
done:
    ret
`,
  },
  {
    name: 'video memory: H (B800h)',
    fileName: 'vga_h.asm',
    expectScreen: 'H',
    source: `org 100h

MOV AX, 0B800h
MOV DS, AX

; MOV CL, 041h
MOV CL, 'H'
MOV CH, 0000_1111b
MOV BX, 0
MOV [BX], CX

RET
`,
  },
  {
    name: 'video memory: diagonal HELLO',
    fileName: 'vga_hello.asm',
    expectScreen: 'H\n E\n  L\n   L\n    O',
    source: `ORG 100h
MOV AX, 0B800h
MOV DS, AX
MOV CH,15

MOV CL, 'H'
MOV BX, 0
MOV [BX], CX

MOV CL, 'E'
ADD BX, 162             ; one row (160 bytes) down + one column (2 bytes) right
MOV [BX], CX

MOV CL, 'L'
ADD BX, 162
MOV [BX], CX

MOV CL, 'L'
ADD BX, 162
MOV [BX], CX

MOV CL, 'O'
ADD BX, 162
MOV [BX], CX

RET                     ; returns to operating system.
`,
  },
  {
    name: 'video memory: colours',
    fileName: 'vga_colors.asm',
    expectScreen: 'ABCDEFGHIJKLMNOP',
    source: `; text attributes: 16 cells, white text on each of the 16 background colours.
; attribute byte = background (high nibble) * 16 + foreground (low nibble)
org 100h

    mov ax, 0B800h
    mov es, ax
    mov di, 0           ; top-left cell
    mov al, 'A'         ; character
    mov ah, 0Fh         ; attribute: white on black
    mov cx, 16
next_color:
    mov es:[di], ax     ; character byte, then attribute byte
    add di, 2           ; next cell
    inc al
    add ah, 10h         ; next background colour
    loop next_color
    ret
`,
  },
];

export const TEMPLATES = {
  com: `; You may customize this and other start-up templates;
; this is the emu8086-web COM template.

org 100h

; add your code here

ret
`,
  bin: `#make_bin#

#LOAD_SEGMENT=0500h#
#LOAD_OFFSET=0000h#

; set entry point:
#CS=0500h#
#IP=0000h#

; set segment registers
#DS=0500h#
#ES=0500h#

; set stack
#SS=0500h#
#SP=FFFEh#

; add your code here

HLT           ; halt!
`,
  boot: `; a boot record is loaded by the BIOS at 0000:7C00.
; emu8086-web loads it there directly (no virtual floppy).

#make_boot#
org 7c00h

; add your code here

hlt
`,
  empty: '',
};
