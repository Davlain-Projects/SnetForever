-- Recorte adaptado de RXPGuides_Clasicas/Skyrim_Horde_22-60_EN.lua (guía de la comunidad sobre RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
RXPGuides.RegisterGuide([[
#version 8
#group Skyrim Horde 22-30 (EN)
#classic
<< Horde
#name 22-24 Hillsbrad
#next 24-25 Class quests << Rogue
#next 25-26 Inexistente << !Rogue

step
    .accept 493 >>Accept Journey to Hillsbrad Foothills
]])

RXPGuides.RegisterGuide([[
#group Skyrim Horde 22-30 (EN)
#version 8
#classic
#som
<< Horde Shaman/Horde Warlock/Horde Rogue
#name 24-25 Class quests
#next 26-28 Ashenvale << Horde

step
    .accept 1508 >>Accept Blind Cazul
]])

RXPGuides.RegisterGuide([[
#group Skyrim Horde 22-30 (EN)
#version 8
#classic
#season 0,1
#xprate <1.5
#era/som << !Warlock
#era/som << Warlock
<< Horde
#name 26-28 Ashenvale

step
    .accept 6441 >>Accept Satyr Horns
]])

RXPGuides.RegisterGuide([[
#version 1
#name 1-9 Zephras Isle
#displayname 1-9 Skyborne << Alliance
#displayname 1-9 Skyborne (H) << Horde
#group Skyrim Neutral (A) << Alliance
#group Skyrim Neutral (H) << Horde
#subgroup Speedrun Guide 1-20 << Alliance
#subgroup Speedrun Guide 1-22 << Horde
#defaultfor Skyborne
#next 9-13 Zephras Isle

step
    .accept 92460 >>Accept Coming of Age
]])
