M MACRO nm, lb
 nm DB 1
 lb: NOP
 MOV AL, nm
 JMP lb
ENDM
ORG 100h
M v1, l1
RET
