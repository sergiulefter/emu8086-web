MyMacro2 MACRO
 LOCAL label1, label2
 CMP AX, 2
 JE label1
 CMP AX, 3
 JE label2
 label1:
 INC AX
 label2:
 ADD AX, 2
ENDM
ORG 100h
MyMacro2
MyMacro2
RET
