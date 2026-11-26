-- Fixture inventado (sin procedencia): una guía con un único #next filtrado, para SIGUIENTES_EXTRA.
RXPGuides.RegisterGuide([[
#forever
<< Horde
#name 22-24 Origen
#group Prueba Extra
#next 24-26 Destino << !Rogue

step
    .goto Durotar,50,50
    >>Paso
]])

RXPGuides.RegisterGuide([[
#forever
<< Horde
#name 24-26 Destino
#group Prueba Extra

step
    .goto Durotar,50,50
    >>Paso
]])
