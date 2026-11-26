-- Recorte adaptado de RXPGuides/lang/Guides-esES/forever/Alliance-1-10_NightElf.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
if GetLocale() ~= "esES" and GetLocale() ~= "esMX" then return end
local faction = UnitFactionGroup("player")
if faction == "Horde" then return end

RXPGuides.RegisterGuide([[
#forever
<< Alliance
#name 1-6 Cañada Umbría
#group RestedXP Guía Forever (A)
#next 6-11 Teldrassil

step
    .accept 456 >>Acepta El equilibrio de la naturaleza
step
    .isOnQuest 457,4496
    >>Mira tu registro de misiones
step
    .use 5186 >>Usa el Vial de cristal
step
    .line 1439,40,40,41,41
    >>Sigue el camino
step
    .complete 456,1
    .complete 456,2
step
    .turnin 456 >>Entrega El equilibrio de la naturaleza
step
    .accept 3116 >>Acepta Sigilo simple
]])
