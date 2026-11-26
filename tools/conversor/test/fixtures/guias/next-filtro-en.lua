-- Fixture inventado (sin procedencia): `#next A;B` donde la guía A tiene un filtro de cabecera que no
-- se cumple para todos. RestedXP no registra esa guía para quien no cumple su `<<`, así que toma B.
RXPGuides.RegisterGuide([[
#forever
<< Alliance
#name 01-05 Origen
#group Prueba Next
#next 05-10 Solo Horda;05-10 Cazador;05-10 Resto

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
<< Horde
#name 05-10 Solo Horda
#group Prueba Next

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
<< Alliance Hunter
#name 05-10 Cazador
#group Prueba Next
#next 10-12 Comun

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
<< Alliance !Hunter
#name 05-10 Resto
#group Prueba Next
#next Otro Grupo\10-12 Solo Cazador

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
<< Alliance
#name 10-12 Comun
#group Prueba Next

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
<< Alliance Hunter
#name 10-12 Solo Cazador
#group Grupo Lejano

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
#name 01-05 Neutral
#group Prueba Next
#next Grupo H\05-10 Bivalente

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
#name 05-10 Bivalente
#group Grupo A << Alliance
#group Grupo H << Horde

step
    .goto Durotar,50,50
    >>Paso
]])
