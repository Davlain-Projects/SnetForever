-- Fixture de la app: SNF_MISIONES pequeño con el formato de la fase 1 (ver addons/SnetForever_Misiones/nucleo.lua).
-- 4641 requiredRaces (2^33 + ...) con nombre en es; 788 requiredLevel/nextQuestInChain (porFaccion); 790 questFlags
-- (la Horda lo borra) y es item de inicio (5000); 791 zoneOrSort de mazmorra; 792 pide el objeto 2589.
-- porFaccion como en tools/banco-wow/fixtures/misiones-mini.lua.
SNF_MISIONES = {version="2026.11.09.1",esquema=1,
  fuente={nombre="QuestieDB",version="prueba",commit="0000000000000000000000000000000000000000"},
  quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},porMazmorra={},
  zonas={area={[14]=1411,[17]=1413},nombre={[1411]={en="Durotar",es="Durotar"},[1412]={en="Mulgore"},[1413]={en="The Barrens",es="Los Baldíos"}}},
  mazmorra={[1581]={nombre="The Deadmines",zonaPadre=40,entradas={{zona=40,mapa=1436,x=42.5,y=71.7}}}},
  porFaccion={
    Alliance={quest={[788]={requiredLevel=5}},npc={},object={},item={}},
    Horde={quest={[788]={nextQuestInChain={porClase={WARRIOR=900,SHAMAN=901}}},[790]={questFlags="__borrar"}},
      npc={},object={},item={}},
  }}

local Q = SNF_MISIONES.quest
Q[4641]={name="Your Place In The World",startedBy={{10176}},finishedBy={{10176}},requiredLevel=1,questLevel=1,
  requiredRaces=8589934770,requiredClasses=0,objectivesText={"Speak with Gornek."},objectives={[1]={{3}}},sourceItemId=0,
  zoneOrSort=363,nextQuestInChain=788,questFlags=8,specialFlags=0,parentQuest=0,uiMap=1411}
Q[788]={name="Cutting Teeth",startedBy={{3143}},finishedBy={{3143}},requiredLevel=1,questLevel=2,requiredRaces=0,
  requiredClasses=0,objectivesText={"Kill 10 Mottled Boars then return to Gornek at the Den."},
  objectives={[1]={{3098,"Mottled Boar"}}},sourceItemId=0,preQuestSingle={4641},zoneOrSort=363,nextQuestInChain=0,
  questFlags=8,specialFlags=0,parentQuest=0,uiMap=1411}
Q[790]={name="Sting of the Scorpid",startedBy={{5000}},finishedBy={{3143}},requiredLevel=3,questLevel=4,requiredRaces=0,
  requiredClasses=0,objectivesText={},objectives={},sourceItemId=5000,zoneOrSort=363,nextQuestInChain=0,
  questFlags=8,specialFlags=0,parentQuest=0,uiMap=1411}
Q[791]={name="Defias in the Deadmines",startedBy={{10176}},finishedBy={{10176}},requiredLevel=10,questLevel=12,requiredRaces=0,
  requiredClasses=0,objectivesText={"Enter the Deadmines."},objectives={},sourceItemId=0,zoneOrSort=1581,nextQuestInChain=0,
  questFlags=0,specialFlags=0,parentQuest=0}
Q[792]={name="Fine Ore for the Forge",startedBy={{3143}},finishedBy={{3143}},requiredLevel=4,questLevel=5,requiredRaces=0,
  requiredClasses=0,objectivesText={"Bring 5 ore."},objectives={[3]={{2589}}},sourceItemId=0,zoneOrSort=363,
  nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0,uiMap=1411}

local E = SNF_MISIONES.es.quest
E[4641]={name="Tu lugar en el mundo",objectivesText={"Habla con Gornek."}}
E[788]={name="Dientes afilados",objectivesText={"Mata 10 jabalíes moteados y vuelve con Gornek."}}
E[792]={name="Mineral fino para la forja",objectivesText={"Trae 5 minerales."}}

local N = SNF_MISIONES.npc
N[10176]={name="Gornek",spawns={[1411]={{42.1,68.3}}},minLevel=1,maxLevel=1}
N[3]={name="Mottled Boar",spawns={[1411]={{45,70},{46,71},{44,69},{80,20}}},minLevel=1,maxLevel=2}
N[3143]={name="Gornek's Assistant",spawns={[1411]={{51,41}}},minLevel=3,maxLevel=3}
N[644]={name="Deadmines Defias",enMazmorra={1581},minLevel=10,maxLevel=12}

local O = SNF_MISIONES.item
O[2589]={name="Linen Cloth",class=7,subClass=5}
O[118]={name="Minor Healing Potion",class=0,subClass=1}
O[5000]={name="Worn Note",class=12,subClass=0,startQuest=790}
