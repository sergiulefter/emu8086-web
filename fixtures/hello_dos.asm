; DOS string output with INT 21h / AH=09h
org 100h

mov dx, offset msg
mov ah, 09h
int 21h

mov ah, 4Ch
int 21h

msg db 'Hello, World!$'
