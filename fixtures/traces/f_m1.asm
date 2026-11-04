MyMacro MACRO p1, p2, p3
 MOV AX, p1
 MOV BX, p2
 MOV CX, p3
ENDM
ORG 100h
MyMacro 1, 2, 3
MyMacro 4, 5, DX
RET
