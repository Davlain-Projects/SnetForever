-- Fragmento de una guía de RestedXP (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
if GetLocale() ~= "esES" and GetLocale() ~= "esMX" then return end
local faction = UnitFactionGroup("player")
if faction == "Alliance" then return end

RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 1-6 Durotar
#version 11
#group RestedXP Guía Forever (H)
#subgroup Guía de subida rápida de nivel (Speedrun) 1-22
--#groupid RXP-SRGCE-H1
#defaultfor Troll/Orc
#next 6-10 Durotar

step << !Orc !Troll
    #completewith next
    +|cRXP_WARN_Has seleccionado una guía para Orcos y Trols. Deberías elegir la misma zona inicial donde empiezas|r
step
    .goto 1411/1,-4251.46,-607.35
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Kaltunk|r
    .accept 4641 >>Acepta la misión Tu lugar en el mundo
    .target Kaltunk
step << Warrior/Shaman/Warlock/Mage/Priest
    #completewith next
    +|cRXP_WARN_Mata a los |cRXP_ENEMY_Jabalíes jaspeados|r. Despójalos hasta que tengas 35 cobres en objetos para vender (incluyendo tu armadura)|r << Warlock
    +|cRXP_WARN_Mata a los |cRXP_ENEMY_Jabalíes jaspeados|r. Despójalos hasta que tengas 60 cobres en objetos para vender (incluyendo tu armadura)|r << Maget
    +|cRXP_WARN_Mata a los |cRXP_ENEMY_Jabalíes jaspeados|r. Despójalos hasta que tengas 50 cobres en objetos para vender (incluyendo tu armadura)|r << Priest
    +|cRXP_WARN_Mata a los |cRXP_ENEMY_Jabalíes jaspeados|r. Despójalos hasta que tengas 10 cobres en objetos para vender (incluyendo tu armadura)|r << Warrior/Shaman
    .goto 1411/1,-4281.07,-720.15,30,0 << Warlock/Mage/Priest
    .goto 1411/1,-4299.05,-494.9,30,0 << Warrior/Shaman
    .mob Mottled Boar
    .money >0.01
step << Warlock
    .goto 1411/1,-4214.45,-623.92.00
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Ruzan|r
    .accept 1485 >>Acepta la misión Familiares viles
    .target Ruzan
step << Warrior/Shaman
    .goto 1411/1,-4214.45,-565.75
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Duokna|r
    .vendor >> Vende la Basura
    .target Duokna
    .money >0.01
step
    .goto 1411/1,-4198.05,-605.59,12,0 << !Warrior !Shaman
    .goto 1411/1,-4198.58,-602.41,12,0 << Warrior/Shaman
    .goto 1411/1,-4186.42,-599.95
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Gornek|r
    .turnin 4641 >>Entrega la misión Tu lugar en el mundo
    .accept 788 >>Acepta la misión Dientes afilados
    --.accept 97279 >>Accept Wayward Weapons
    .target Gornek
    --97279 not worth doing, bad xp loot quest, no followup
step << Warrior/Shaman
    .goto 1411/1,-4198.05,-605.59,10,0
    .goto 1411/1,-4230.31,-639.43 << Warrior
    .goto 1411/1,-4203.87,-623.92 << Shaman
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Frang|r << Warrior
]])
