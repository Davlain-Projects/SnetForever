-- Fragmento de una guía de RestedXP (https://github.com/RestedXP), licencia CC BY-NC-SA 4.0. Se incluye solo como prueba.
local faction = UnitFactionGroup("player")
if faction == "Alliance" then return end

local L = GetLocale() if L and RXP.enabledLocale[L] then return end
RXPGuides.RegisterGuide([[
#forever
#disabledungeons
<< Horde
#name 1-6 Durotar
#version 11
#group RestedXP Forever Guide (H)
#subgroup Speedrun Guide 1-22
--#groupid RXP-SRGCE-H1
#defaultfor Troll/Orc
#next 6-10 Durotar

step << !Orc !Troll
    #completewith next
    +|cRXP_WARN_You have selected a guide meant for Orcs and Trolls. You should choose the same starter zone that you start in|r
step
    .goto 1411/1,-4251.46,-607.35
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Kaltunk|r
    .accept 4641 >>Accept Your Place In The World
    .target Kaltunk
step << Warrior/Shaman/Warlock/Mage/Priest
    #completewith next
    +|cRXP_WARN_Kill |cRXP_ENEMY_Mottled Boars|r. Loot them until you have 35 copper worth of vendor items (including your armor)|r << Warlock
    +|cRXP_WARN_Kill |cRXP_ENEMY_Mottled Boars|r. Loot them until you have 60 copper worth of vendor items (including your armor)|r << Maget
    +|cRXP_WARN_Kill |cRXP_ENEMY_Mottled Boars|r. Loot them until you have 50 copper worth of vendor items (including your armor)|r << Priest
    +|cRXP_WARN_Kill |cRXP_ENEMY_Mottled Boars|r. Loot them until you have 10 copper worth of vendor items (including your armor)|r << Warrior/Shaman
    .goto 1411/1,-4281.07,-720.15,30,0 << Warlock/Mage/Priest
    .goto 1411/1,-4299.05,-494.9,30,0 << Warrior/Shaman
    .mob Mottled Boar
    .money >0.01
step << Warlock
    .goto 1411/1,-4214.45,-623.92.00
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Ruzan|r
    .accept 1485 >>Accept Vile Familiars
    .target Ruzan
step << Warrior/Shaman
    .goto 1411/1,-4214.45,-565.75
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Duokna|r
    .vendor >> Vendor Trash
    .target Duokna
    .money >0.01
step
    .goto 1411/1,-4198.05,-605.59,12,0 << !Warrior !Shaman
    .goto 1411/1,-4198.58,-602.41,12,0 << Warrior/Shaman
    .goto 1411/1,-4186.42,-599.95
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Gornek|r
    .turnin 4641 >>Turn in Your Place In The World
    .accept 788 >>Accept Cutting Teeth
    --.accept 97279 >>Accept Wayward Weapons
    .target Gornek
    --97279 not worth doing, bad xp loot quest, no followup
step << Warrior/Shaman
    .goto 1411/1,-4198.05,-605.59,10,0
    .goto 1411/1,-4230.31,-639.43 << Warrior
    .goto 1411/1,-4203.87,-623.92 << Shaman
    >>|Tinterface/worldmap/chatbubble_64grey.blp:20|tTalk to |cRXP_FRIENDLY_Frang|r << Warrior
]])
