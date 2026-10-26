; Reconstruction of the classroom projector listing:
; lines 07-32 are transcribed from the photo; lines 01-05 are not visible
; there and are filled with the same header as the professor's H example.
ORG 100h
MOV AX, 0B800h
MOV DS, AX
MOV CH,15

MOV CL, 'H'                 ; set CL to ASCII code of 'A', it is 41h.
MOV BX, 0              ; set BX to 15Eh.
MOV [BX], CX                ; copy contents of CX to memory at B800:015E

MOV CL, 'E'                 ; set CL to ASCII code of 'A', it is 41h.
ADD BX, 162            ; set BX to 15Eh.
MOV [BX], CX                ; copy contents of CX to memory at B800:015E


MOV CL, 'L'
ADD BX, 162            ; set BX to 15Eh.
MOV [BX], CX                ; copy contents of CX to memory at B800:015E

MOV CL, 'L'
ADD BX, 162            ; set BX to 15Eh.
MOV [BX], CX


MOV CL, 'O'
ADD BX, 162            ; set BX to 15Eh.
MOV [BX], CX


RET                    ; returns to operating system.
