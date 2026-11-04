ORG 100h
MOV CX, 9
 JO n1
n1:
 JNO n2
n2:
 JB n3
n3:
 JAE n4
n4:
 JE n5
n5:
 JNE n6
n6:
 JBE n7
n7:
 JA n8
n8:
 JS n9
n9:
 JNS n10
n10:
 JP n11
n11:
 JNP n12
n12:
 JL n13
n13:
 JGE n14
n14:
 JLE n15
n15:
 JG n16
n16:
 LOOP n17
n17:
 LOOPE n18
n18:
 LOOPNE n19
n19:
 JCXZ n20
n20:
 IN AL, 60h
 OUT 61h, AL
 IN AX, DX
 XLATB
 NOP
 NOP
 RET
