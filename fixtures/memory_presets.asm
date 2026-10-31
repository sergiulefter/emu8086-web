; Both address notations refer to adjacent words in the default BIN data segment.
#make_bin#
#MEM=0100:0200,3412-01202,7856-B800:0000,480F#

mov ax, [0200h]
mov bx, [0202h]
mov word ptr [0200h], 0
hlt
