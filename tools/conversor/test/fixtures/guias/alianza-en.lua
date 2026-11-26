-- Recorte adaptado de RXPGuides/Guides/forever/Alliance-1-10_NightElf.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
local faction = UnitFactionGroup("player")
if faction == "Horde" then return end

RXPGuides.RegisterGuide([[
#forever
<< Alliance
#name 1-6 Shadowglen
#group RestedXP Forever Guide (A)
#next 6-11 Teldrassil

step
    .accept 456 >>Accept The Balance of Nature
step
    .isOnQuest 457,4495
    >>Check your quest log
step
    .use 5185 >>Use the Crystal Phial
step
    .line 1438,40,40,41,41
    >>Follow the road
step
    .accept 458 >>Accept The Woodland Protector
step
    .complete 456,1
    .complete 456,2
step
    .turnin 456 >>Turn in The Balance of Nature
step
    .accept 3116 >>Accept Simple Sigil
]])
