-- Fixture inventado (sin procedencia), lote A (revisión 52, I2): pasos que solo informan.
RXPGuides.RegisterGuide([[
#forever
<< Horde
#name 24-26 Informativos
#group Prueba Informativos

step
    .goto Durotar,50,50
    >>Talk to Newton
    .target Newton
step
    .goto Durotar,51,51
    >>Talk to Newton
    .bankwithdraw 1,2 >>Withdraw the following items from your bank:
step
    >>Withdraw the following items from your bank:
    >>Fang
    .bankwithdraw 3
step
    #sticky
    >>Keep an eye out for the chest
step
    .goto Durotar,52,52
step
    .goto Durotar,53,53
    .bankwithdraw 4 >>Withdraw:  << Warlock
    >>Talk to Newton
    .accept 1508 >>Accept Blind Cazul
]])
