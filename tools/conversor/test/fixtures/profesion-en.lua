-- Recorte adaptado de RXPGuides/Guides/Herbalism.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
local L = GetLocale() if L and RXP.enabledLocale[L] then return end
RXPGuides.RegisterGuide([[
#wotlk
#group +Profession Leveling
<< Horde
#name 1-450 Herbalism (H)
#guideKind profession
#displayname 1-450 Herbalism

step
    .goto Undercity,54.0,49.5
    .train 2366 >> Train Apprentice Herbalism (1-75) from Martha in Undercity
step
    .openmap Tirisfal Glades
    .skill herbalism,70 >> Level your Herbalism from 1-70 in Tirisfal Glades.
    .loop 60,Tirisfal Glades,53.7,59.8,51.5,62.2,49.1,66.4
step
    #completewith next
    .hs >> Hearth to Dalaran
step
    .goto Swamp of Sorrows,37.2,46.5
    .skill herbalism,225 >> Level your Herbalism from 200-225 in Swamp of Sorrows
step
    .goto Tirisfal Glades,53.7,59.8
    .skill herbalism,300 >> Level your Herbalism from 275-300 in Tirisfal Glades
step
    .goto Hellfire Peninsula,88.9,50.2
    .skill herbalism,325 >> Level your Herbalism from 300-325 in Hellfire Peninsula
]])
