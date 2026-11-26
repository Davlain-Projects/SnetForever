-- Recorte adaptado de RXPGuides/Guides/forever/dungeon/Horde-01-12_Durotar.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
local faction = UnitFactionGroup("player")
if faction == "Alliance" then return end

local L = GetLocale() if L and RXP.enabledLocale[L] then return end
RXPGuides.RegisterGuide([[
#forever
<< Horde
#name 10-12 Durotar
#version 11
#group RestedXP Forever Dungeon Guide (H)
#subgroup Dungeon Guide 1-22
#defaultfor Troll/Orc
#next 10-12 Tirisfal (Orc/Troll)

step
.enabledungeon RFC
#include RestedXP Forever Guide (H)\10-12 Durotar@InicioRuta-FinRuta
step
#include RestedXP Forever Guide (H)\No Existe
step
#include RestedXP Forever Guide (H)\10-12 Durotar@NoHay-FinRuta
]])

-- Inventado para la prueba de .enabledungeon por grupo (dungeonOverride[grupo] del original).
RXPGuides.RegisterGuide([[
#forever
<< Horde
#name 12-14 Mazmorra Prueba
#group RestedXP Forever Dungeon Guide (H)
#subgroup Dungeon Guide 1-22

step
    .dungeon !RFC
    .goto Durotar,50,50
    >>Paso que solo sale sin RFC
step
    .enabledungeon WC
    .goto Durotar,51,51
    >>Paso
]])
