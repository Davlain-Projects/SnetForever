-- Fixture sintético (no es de RestedXP): casos raros del lector de guías.
local x = 1
RXPGuides.RegisterGuide([=[
#forever
#name Raro
<< Alliance
step
    foo bar
    .target A;B; C
    .link https://x.y/z, w
    .vendor
    *Una nota
    >>solo texto
    +hacer a mano << Mage
    .accept 1, , 2 >>Texto
    #label uno
    -- comentario solo

    .goto 1,2,3 -- otro comentario
]=])
RXPGuides.RegisterGuide([[
#name Segunda
step
    .goto 1,2,3
]])
