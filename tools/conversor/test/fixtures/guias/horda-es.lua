-- Recorte adaptado de RXPGuides/lang/Guides-esES/forever/Horde-01-12_Durotar.lua y Horde-12-22_Barrens.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
if GetLocale() ~= "esES" and GetLocale() ~= "esMX" then return end
local faction = UnitFactionGroup("player")
if faction == "Alliance" then return end

RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 10-12 Durotar
#displayname 10-12 Durotar (España)
#version 11
#group RestedXP Guía Forever (H)
#subgroup Guía de subida rápida de nivel (Speedrun) 1-22
#defaultfor Troll/Orc
#next 10-12 Tirisfal (Orco/Trol) << !Hunter !Shaman !Tauren !Skyborne
#next 12-17 Los Baldíos << Orc Hunter/Troll Hunter/Orc Shaman/Troll Shaman

step << Shaman/Hunter
    .goto 1411/1,-4648.55,271.43
    >>Habla con |cRXP_FRIENDLY_Takrin|r
    .accept 840 >>Acepta Recluta de la Horda
    .target Takrin Pathseeker
step
    #label InicioRuta
    .goto 1413/1,-3687.11,303.14
    .turnin 840 >>Entrega Recluta de la Horda
    .accept 842 >>Acepta Reclutamiento en el Cruce
step
    >>Mata |cRXP_ENEMY_Crocoliscos Fauces de Terror|r. Despójalos para obtener |cRXP_LOOT_Amuleto de Kron|r
    .complete 817,1 --misión distinta: este paso no cuadra
step
    #label FinRuta
    .turnin 816 >>Entrega El amuleto de Kron
step
    .dungeon RFC
    >>Entra en Sima Ígnea
    .goto 1454,52.0,49.0
]])

RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 10-12 Tirisfal (Orco/Trol)
#version 11
#group RestedXP Guía Forever (H)
#subgroup Guía de subida rápida de nivel (Speedrun) 1-22
#next 12-17 Los Baldíos

step
    .goto 1420/0,253.4,2234.85,80 >> Viaja a Rémol
step
    .dungeon !RFC
    .accept 1358 >>Acepta Muestra para Helbrim
]])

RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 12-17 Los Baldíos
#version 11
#group RestedXP Guía Forever (H)
#subgroup Guía de subida rápida de nivel (Speedrun) 1-22
#next 22-24 Laderas de Trabalomas

step
    .xp 13
step
    .xp 13
step
    .accept 848 >>Acepta Esporas de hongos
]])
