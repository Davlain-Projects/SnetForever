-- Recorte adaptado de RXPGuides/lang/Guides-esES/Herbalism.lua (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
if GetLocale() ~= "esES" and GetLocale() ~= "esMX" then return end
RXPGuides.RegisterGuide([[
#wotlk
#group Subida de Profesión
<< Horde
#name 1-450 Herboristería (H)
#guideKind profession
#displayname 1-450 Herboristería

step
    .goto Undercity,54.0,49.5
    .train 2366 >> Aprende Herboristería de aprendiz (1-75) con Martha en Entrañas
step
    .openmap Tirisfal Glades
    .skill herbalism,70 >> Sube tu Herboristería de 1 a 70 en los Claros de Tirisfal.
    .loop 60,Tirisfal Glades,53.7,59.8,51.5,62.2,49.1,66.4
step
    #completewith next
    .hs >> Usa tu Piedra de Hogar para ir a Dalaran
step
    .goto Swamp of Sorrows,37.2,46.5
    .skill herbalism,225 >> Sube tu Herboristería de 200 a 225 en el Pantano de las Penas
step
    .goto Tirisfal Glades,53.7,59.8
    .skill herbalism,300 >> Sube tu Herboristería de 275 a 300 en los Claros de Tirisfal
step
    .goto Hellfire Peninsula,88.9,50.2
    .skill herbalism,325 >> Sube tu Herboristería de 300 a 325 en la Península del Fuego Infernal
]])
