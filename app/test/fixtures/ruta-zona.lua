-- Ampliación del fixture de la app para las rutas de zona (tarea 16b): se carga DESPUÉS de misiones-app.lua.
-- Una zona pequeña en Los Baldíos (uiMap 1413, área 17) con:
--   9101 -> 9102 cadena (preQuestSingle y nextQuestInChain); 9110 pide 9103 y 9109 (preQuestGroup);
--   9104 de la Alianza (máscara); 9105 de mazmorra (zoneOrSort 1581); 9106 de nivel alto; 9107 solo tauren;
--   9108 con una previa externa (4641); 9109 élite (PNJ de rango 1); 9111 la da un objeto y es de guerrero;
--   9112 de PvP (QuestSort -25); 9113 la da un PNJ de la Alianza; 9114 su previa es de la Alianza; 9115 de fiesta
--   (QuestSort -366); 9116 entra por zoneOrSort y se recoge en Durotar; 9117 en el índice de mazmorras; 9118 basura;
--   9119 excluyente con 9103; 9120 pide Herboristería (182); 9121 la da y la recoge la misma PNJ que 9103.
-- Ronda 1 (Ruling F4-29): 854 es la migaja de 844 (exclusiveTo = {844}, como en la base real: sale 854, nunca 844);
--   9122 empieza con un ítem que suelta la hiena (9303); 9123 empieza con un ítem sin fuente (sale y se cuenta);
--   9124 pide nivel 5 (va al bloque final «A partir del nivel 5»); 9125 es de Garganta Grito de Guerra (área 3277, PvP).
-- Un punto fuera de 0-100 (9301 en 120,50) que no debe salir nunca. 1450 tiene puntos y no tiene nombre de zona.
local P = SNF_MISIONES.porMazmorra
P[1581]={nombre="The Deadmines",area=1581,fuenteNiveles="misiones",banda=false,misiones={{q=9117,nivel=1,nivelMision=3,motivo="pnj"}}}

local Q = SNF_MISIONES.quest
Q[9101]={name="Cadena uno",startedBy={{9201}},finishedBy={{9201}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={{{9301}}},sourceItemId=0,zoneOrSort=17,nextQuestInChain=9102,questFlags=8,specialFlags=0,parentQuest=0}
Q[9102]={name="Cadena dos",startedBy={{9201}},finishedBy={{9202}},requiredLevel=2,questLevel=4,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={{{9302}}},sourceItemId=0,preQuestSingle={9101},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9103]={name="Suelta",startedBy={{9203}},finishedBy={{9203}},requiredLevel=1,questLevel=2,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={[3]={{9401}}},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9104]={name="De la Alianza",startedBy={{9203}},finishedBy={{9201}},requiredLevel=1,questLevel=3,requiredRaces=4294967373,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9105]={name="De mazmorra",startedBy={{9203}},finishedBy={{9203}},requiredLevel=3,questLevel=5,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=1581,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9106]={name="De nivel alto",startedBy={{9201}},finishedBy={{9201}},requiredLevel=20,questLevel=25,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9107]={name="Solo tauren",startedBy={{9204}},finishedBy={{9204}},requiredLevel=1,questLevel=3,requiredRaces=32,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9108]={name="Con previa externa",startedBy={{9204}},finishedBy={{9204}},requiredLevel=1,questLevel=4,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,preQuestSingle={4641},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9109]={name="Elite",startedBy={{9202}},finishedBy={{9202}},requiredLevel=3,questLevel=6,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={{{9304}}},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9110]={name="Pide dos",startedBy={{9203}},finishedBy={{9203}},requiredLevel=3,questLevel=6,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,preQuestGroup={9103,9109},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9111]={name="Cartel de guerrero",startedBy={[2]={9501}},finishedBy={{9201}},requiredLevel=1,questLevel=4,requiredRaces=0,requiredClasses=1,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=-81,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9112]={name="De PvP",startedBy={{9201}},finishedBy={{9201}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=-25,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9113]={name="PNJ de la Alianza",startedBy={{9205}},finishedBy={{9205}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9114]={name="Previa imposible",startedBy={{9201}},finishedBy={{9201}},requiredLevel=1,questLevel=4,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,preQuestSingle={9104},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9115]={name="De fiesta",startedBy={{9203}},finishedBy={{9203}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=-366,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9116]={name="Desde Durotar",startedBy={{10176}},finishedBy={{9202}},requiredLevel=1,questLevel=2,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9117]={name="En el indice",startedBy={{9202}},finishedBy={{9202}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9118]={name="TEST quest",startedBy={{9202}},finishedBy={{9202}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9119]={name="Excluyente",startedBy={{9203}},finishedBy={{9203}},requiredLevel=1,questLevel=2,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,exclusiveTo={9103},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9120]={name="De herborista",startedBy={{9203}},finishedBy={{9203}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,requiredSkill={182,1},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9121]={name="Segunda de la cazadora",startedBy={{9203}},finishedBy={{9203}},requiredLevel=1,questLevel=2,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[854]={name="Migaja",startedBy={{9202}},finishedBy={{9201}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,exclusiveTo={844},zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[844]={name="Destino de la migaja",startedBy={{9201}},finishedBy={{9201}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={{{9302}}},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9122]={name="Nota de la hiena",startedBy={[3]={9402}},finishedBy={{9203}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=9402,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9123]={name="Nota perdida",startedBy={[3]={9403}},finishedBy={{9203}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=9403,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9124]={name="Para el nivel 5",startedBy={{9204}},finishedBy={{9204}},requiredLevel=5,questLevel=6,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=17,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}
Q[9125]={name="De la garganta",startedBy={{9201}},finishedBy={{9201}},requiredLevel=1,questLevel=3,requiredRaces=0,requiredClasses=0,
  objectivesText={},objectives={},sourceItemId=0,zoneOrSort=3277,nextQuestInChain=0,questFlags=8,specialFlags=0,parentQuest=0}

local E = SNF_MISIONES.es.quest
E[9101]={name="Cadena uno (es)"}

local N = SNF_MISIONES.npc
N[9201]={name="Jefe del puesto",spawns={[1413]={{50,50}}},minLevel=10,maxLevel=10,rank=0,friendlyToFaction="H"}
N[9202]={name="Explorador",spawns={[1413]={{40,40}}},minLevel=10,maxLevel=10,rank=0,friendlyToFaction="H"}
N[9203]={name="Cazadora",spawns={[1413]={{20,20}}},minLevel=10,maxLevel=10,rank=0,friendlyToFaction="AH"}
N[9204]={name="Chaman",spawns={[1413]={{30,70}}},minLevel=10,maxLevel=10,rank=0,friendlyToFaction="H"}
N[9205]={name="Guardia de la Alianza",spawns={[1413]={{55,52}}},minLevel=10,maxLevel=10,rank=0,friendlyToFaction="A"}
N[9301]={name="Jabali",spawns={[1413]={{60,60},{61,61},{120,50}}},minLevel=1,maxLevel=2,rank=0}
N[9302]={name="Raptor",spawns={[1413]={{70,70},{71,70}}},minLevel=3,maxLevel=4,rank=0}
N[9303]={name="Hiena",spawns={[1413]={{25,25}}},minLevel=2,maxLevel=3,rank=0}
N[9304]={name="Ogro",spawns={[1413]={{80,80}}},minLevel=8,maxLevel=8,rank=1}
N[9306]={name="Lejano",spawns={[1450]={{10,10}}},minLevel=8,maxLevel=8,rank=0}

local O = SNF_MISIONES.object
O[9501]={name="Cartel",spawns={[1413]={{80,20}}}}

local I = SNF_MISIONES.item
I[9401]={name="Colmillo",npcDrops={9303}}
I[9402]={name="Nota manchada",npcDrops={9303},startQuest=9122}
I[9403]={name="Nota sin dueño",startQuest=9123}
