-- Recorte adaptado de RXPGuides/Guides/forever/Horde-01-12_Durotar.lua y Horde-12-22_Barrens.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
local faction = UnitFactionGroup("player")
if faction == "Alliance" then return end

local L = GetLocale() if L and RXP.enabledLocale[L] then return end
RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 10-12 Durotar
#version 11
#group RestedXP Forever Guide (H)
#subgroup Speedrun Guide 1-22
#defaultfor Troll/Orc
#next 10-12 Tirisfal (Orc/Troll) << !Hunter !Shaman !Tauren !Skyborne
#next 12-17 The Barrens << Orc Hunter/Troll Hunter/Orc Shaman/Troll Shaman

step << Shaman/Hunter
    .goto 1411/1,-4648.55,271.43
    >>Talk to |cRXP_FRIENDLY_Takrin|r
    .accept 840 >>Accept Conscript of the Horde
    .target Takrin Pathseeker
step
    #label InicioRuta
    .goto 1413/1,-3687.11,303.14
    .turnin 840 >>Turn in Conscript of the Horde
    .accept 842 >>Accept Crossroads Conscription
step
    >>Kill |cRXP_ENEMY_Dreadmaw Crocolisks|r. Loot them for |cRXP_LOOT_Kron's Amulet|r
    .complete 816,1 --Kron's Amulet (1)
step
    #label FinRuta
    .turnin 816 >>Turn in Kron's Amulet
step
    .dungeon RFC
    >>Enter Ragefire Chasm
    .goto 1454,52.0,49.0
]])

RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 10-12 Tirisfal (Orc/Troll)
#version 11
#group RestedXP Forever Guide (H)
#subgroup Speedrun Guide 1-22
#next 12-17 No Existe;12-17 The Barrens

step
    .goto 1420/0,253.4,2234.85,80 >> Travel to Brill
step
    .dungeon !RFC
    .accept 1358 >>Accept Sample for Helbrim
]])

RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 12-17 The Barrens
#version 11
#group RestedXP Forever Guide (H)
#subgroup Speedrun Guide 1-22
#next 22-24 Hillsbrad

step
    .xp 13
step
    .xp 13
step
    .accept 848 >>Accept Fungal Spores
]])
