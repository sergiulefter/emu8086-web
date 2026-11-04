Inner MACRO v
 MOV DX, v
ENDM
Outer MACRO A, b
 MOV AX, a
 Inner B
 DB 'a', A
Outer ENDM
ORG 100h
start: outer 7, 9 ; comment
JMP start
