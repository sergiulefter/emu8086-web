ORG 100h
MOV AX, (2 + 3) * 4
RET
w1 DW 1, 2
b1 DB 1, 2, 3
d3 DB 2 DUP(1, 2 DUP(7))
lbl: NOP
x1 EQU 10h
