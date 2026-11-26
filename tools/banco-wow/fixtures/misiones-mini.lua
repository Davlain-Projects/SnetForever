-- Fixture del banco: SNF_MISIONES pequeño con el formato de la fase 1 (ver addons/SnetForever_Misiones/nucleo.lua).
-- Cada misión prueba un campo: 4641 requiredRaces (2^33 + ...), 788 preQuestSingle, 789 requiredLevel,
-- 790 questFlags, 791 zoneOrSort de mazmorra, 792 requiredSkill y 793 objetivo de un PNJ élite (rank 1).
-- porFaccion: Alliance cambia 788.requiredLevel; Horde da 788.nextQuestInChain por clase y borra 790.questFlags.
SNF_MISIONES = {version="2026.11.09.1",esquema=1,
  fuente={nombre="QuestieDB",version="prueba",commit="0000000000000000000000000000000000000000"},
  quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},
  mazmorra={[1581]={nombre="The Deadmines",zonaPadre=40,entradas={{zona=40,mapa=1436,x=42.5,y=71.7}}}},
  porFaccion={
    Alliance={quest={[788]={requiredLevel=5}},npc={},object={},item={}},
    Horde={quest={[788]={nextQuestInChain={porClase={WARRIOR=900,SHAMAN=901}}},[790]={questFlags="__borrar"}},
      npc={},object={},item={}},
  }}

local Q = SNF_MISIONES.quest
Q[4641]={name="Your Place In The World",startedBy={{10176}},finishedBy={{3143}},requiredLevel=1,questLevel=1,
  requiredRaces=8589934770,requiredClasses=0,objectivesText={"Speak with Gornek."},objectives={},sourceItemId=0,
  zoneOrSort=363,nextQuestInChain=788,questFlags=8,specialFlags=0,parentQuest=0,breadcrumbForQuestId=788,uiMap=1411}
Q[788]={name="Cutting Teeth",startedBy={{3143}},finishedBy={{3143}},requiredLevel=1,questLevel=2,requiredRaces=0,
  requiredClasses=0,objectivesText={"Kill 10 Mottled Boars then return to Gornek at the Den."},
  objectives={{{[1]=3098,[3]=0}}},sourceItemId=0,preQuestSingle={4641},zoneOrSort=363,nextQuestInChain=0,
  questFlags=8,specialFlags=0,parentQuest=0,uiMap=1411}
Q[789]={name="Sting of the Scorpid",startedBy={{3143}},finishedBy={{3143}},requiredLevel=3,questLevel=4,requiredRaces=0,
  requiredClasses=0,objectivesText={"Bring 8 Scorpid Worker Tails to Gornek."},objectives={},sourceItemId=0,
  zoneOrSort=363,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0,uiMap=1411}
Q[790]={name="Sarkoth",startedBy={{3287}},finishedBy={{3287}},requiredLevel=1,questLevel=4,requiredRaces=0,
  requiredClasses=0,objectivesText={"Bring Sarkoth's Mangled Claw to Hana'zua."},objectives={},sourceItemId=0,
  zoneOrSort=363,nextQuestInChain=0,questFlags=64,specialFlags=0,parentQuest=0,uiMap=1411}
Q[791]={name="Prueba de mazmorra",startedBy={{3143}},finishedBy={{3143}},requiredLevel=1,questLevel=20,requiredRaces=0,
  requiredClasses=0,objectivesText={"Quest inside The Deadmines."},objectives={},sourceItemId=0,
  zoneOrSort=1581,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0}
Q[792]={name="Prueba de profesión",startedBy={{3143}},finishedBy={{3143}},requiredLevel=1,questLevel=5,requiredRaces=0,
  requiredClasses=0,objectivesText={"Quest that needs Herbalism 50."},objectives={},sourceItemId=0,
  requiredSkill={182,50},zoneOrSort=363,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0,uiMap=1411}
Q[793]={name="Prueba de élite",startedBy={{3143}},finishedBy={{3143}},requiredLevel=1,questLevel=5,requiredRaces=0,
  requiredClasses=0,objectivesText={"Kill a Flesh Eater."},objectives={{{[1]=3,[3]=0}}},sourceItemId=0,
  zoneOrSort=363,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0,uiMap=1411}

local N = SNF_MISIONES.npc
N[3]={name="Flesh Eater",minLevelHealth=0,maxLevelHealth=1,minLevel=5,maxLevel=6,rank=1,zoneID=363,factionID=21,
  npcFlags=0,spawns={[1411]={{47,62},{48,61}}}}
N[3143]={name="Gornek",minLevelHealth=0,maxLevelHealth=1,minLevel=10,maxLevel=10,rank=0,zoneID=363,factionID=29,
  friendlyToFaction="H",npcFlags=3,spawns={[1411]={{42.1,68.3}}},questStarts={788,789,791,792,793},
  questEnds={4641,788,789,791,792,793}}
N[3287]={name="Hana'zua",minLevelHealth=0,maxLevelHealth=1,minLevel=7,maxLevel=7,rank=0,zoneID=363,factionID=29,
  friendlyToFaction="H",npcFlags=2,spawns={[1411]={{40.6,62.6}}},questStarts={790},questEnds={790}}
N[10176]={name="Kaltunk",minLevelHealth=0,maxLevelHealth=1,minLevel=10,maxLevel=10,rank=0,zoneID=363,factionID=29,
  friendlyToFaction="H",npcFlags=2,spawns={[1411]={{43.3,69}}},questStarts={4641}}

SNF_MISIONES.item[159]={name="Refreshing Spring Water",startQuest=0,flags=0,itemLevel=5,requiredLevel=1,class=0,
  subClass=0,vendors={3158},teachesSpell=0}

local ES = SNF_MISIONES.es
ES.quest[4641]={name="Tu lugar en el mundo",objectivesText={"Habla con Gornek."}}
ES.quest[788]={name="Afilando los dientes",objectivesText={"Mata a 10 jabalíes moteados y vuelve con Gornek a El Cubil."}}
ES.npc[3]={name="Comecarne"}
ES.item[159]={name="Agua de manantial refrescante"}
