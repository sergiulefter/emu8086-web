; EMU8086 release-note values, assigned to separate registers for verification.
org 100h
.radix 2
mov ax, 101
.radix 16
mov bx, 101
.radix 10
mov cx, 20
.radix 8
mov dx, 20
.radix 16
mov si, 0ABCE
mov di, 123D
mov bp, 101B
mov ax, 4C00h
int 21h
