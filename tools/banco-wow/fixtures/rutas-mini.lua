-- Fixture del banco: SNF_RUTAS pequeño con el formato de la fase 1 (ver addons/SnetForever_Rutas/nucleo.lua).
-- Las coordenadas de mundo (wx, wy) de los goto salen de los rectángulos del banco (src/wow-falso.lua):
--   1411: wx = -2000 - 5000*x/100, wy = 1800 - 3500*y/100 (instancia 1).
--   1453: wx = 1700 - 1700*x/100,  wy = -8000 - 1150*y/100 (instancia 0).
-- Como en los datos reales: la guía «Prueba (A)\01-09 Cielonato» no tiene campo faccion (vale para las dos) y trae
-- dos variantes; la clave de la variante de la Horda no está en guias, se resuelve con alias, y la guía figura (con
-- su clave real) en el grupo de cada variante.
-- Las guías Inicio y Mazmorras llevan además un paso con el requisito «mazmorra RFC», como si viniera de un #include.
SNF_RUTAS = {version="2026.11.09.1",esquema=1,guias={},grupos={
  ["Prueba (H)"]={"Prueba (H)\\01-02 Inicio","Prueba (H)\\02-03 Sigue","Prueba (A)\\01-09 Cielonato"},
  ["Prueba (H) Mazmorras"]={"Prueba (H) Mazmorras\\01-02 Inicio"},
  ["Prueba (H) Mago AoE"]={"Prueba (H) Mago AoE\\01-02 Inicio"},
  ["Prueba (A)"]={"Prueba (A)\\01-03 Elwynn","Prueba (A)\\01-09 Cielonato"},
  ["Prueba"]={"Prueba\\01-03 Skyborne"},
},alias={["Prueba (H)\\01-09 Cielonato"]="Prueba (A)\\01-09 Cielonato"}}
local T = SNF_RUTAS.guias

-- Los 6 pasos de «Inicio» (Valle de los Retos, mapa 1411). Se generan de nuevo para cada guía que los usa.
local function pasosInicio()
  return {
    {id="h0000001",n=1,etiquetas={},elementos={
      {t="goto",mapa=1411,inst=1,wx=-4165,wy=-615,modo="flecha",linea=10},
      {t="target",npcs={{nombre="Kaltunk",id=10176}},linea=11},
      {t="nota",texto={en="Talk to |cRXP_FRIENDLY_Kaltunk|r",es="Habla con |cRXP_FRIENDLY_Kaltunk|r"},linea=12},
      {t="accept",q=4641,texto={en="Accept Your Place In The World",es="Acepta la misión Tu lugar en el mundo"},linea=13},
    },requisitos={},linea=9},
    {id="h0000002",n=2,etiquetas={},elementos={
      {t="goto",mapa=1411,inst=1,wx=-4105,wy=-590.5,modo="flecha",linea=16},
      {t="turnin",q=4641,texto={en="Turn in Your Place In The World",es="Entrega la misión Tu lugar en el mundo"},linea=17},
      {t="accept",q=788,texto={en="Accept Cutting Teeth",es="Acepta la misión Afilando los dientes"},linea=18},
    },requisitos={},linea=15},
    {id="h0000003",n=3,etiquetas={},elementos={
      {t="nota",texto={en="Kill |cRXP_ENEMY_Mottled Boars|r",es="Mata a los |cRXP_ENEMY_Jabalíes moteados|r"},linea=21},
      {t="goto",mapa=1411,inst=1,wx=-4350,wy=-370,modo="baja",radio=0,linea=22},
      {t="complete",objetivo=1,q=788,linea=23},
      {t="mob",npcs={{nombre="Mottled Boar"}},padre=3,linea=24},
    },requisitos={},linea=20},
    {id="h0000004",n=4,etiquetas={},elementos={
      {t="goto",mapa=1411,inst=1,wx=-4200,wy=-580,modo="flecha",linea=27},
      {t="nota",texto={en="Buy |cRXP_BUY_Refreshing Spring Water|r",es="Compra |cRXP_BUY_Agua de manantial refrescante|r"},linea=28},
      {t="collect",i=159,n=5,linea=29},
    },requisitos={},linea=26},
    {id="h0000005",n=5,etiquetas={},elementos={
      {t="goto",mapa=1411,inst=1,wx=-4105,wy=-590.5,modo="flecha",linea=32},
      {t="turnin",q=788,texto={en="Turn in Cutting Teeth",es="Entrega la misión Afilando los dientes"},linea=33},
    },requisitos={{t="mision",q=4641,estado="entregada"}},linea=31},
    {id="h0000006",n=6,etiquetas={},elementos={
      {t="xp",nivel=2,efecto="objetivo",texto={en="Grind to level 2",es="Mata enemigos hasta subir al nivel 2"},linea=36},
    },requisitos={{t="nivel",n=2}},linea=35},
    {id="h00000r1",n=7,etiquetas={},elementos={
      {t="nota",texto={en="Go to |cRXP_WARN_Ragefire Chasm|r",es="Ve a la |cRXP_WARN_Sima Ígnea|r"},linea=39},
    },requisitos={{t="mazmorra",d="RFC"}},linea=38,mazmorra="RFC",de="Prueba (H) Mazmorras\\RFC"},
  }
end

T["Prueba (H)\\01-02 Inicio"]={clave="Prueba (H)\\01-02 Inicio",grupo="Prueba (H)",nombre="01-02 Inicio",
  titulo={en="1-2 Start",es="1-2 Inicio"},subgrupo="Guía de prueba 1-3",niveles={1,2},filtro={{"f:Horde"}},
  porDefecto={{"r:Orc"},{"r:Troll"}},siguientes={{clave="Prueba (H)\\02-03 Sigue"}},tipo="normal",
  fuente={archivo="fixtures/rutas-mini.lua",linea=1},faccion="Horde",mazmorras={RFC=false},pasos=pasosInicio()}

T["Prueba (H)\\02-03 Sigue"]={clave="Prueba (H)\\02-03 Sigue",grupo="Prueba (H)",nombre="02-03 Sigue",
  titulo={en="2-3 Next",es="2-3 Sigue"},subgrupo="Guía de prueba 1-3",niveles={2,3},filtro={{"f:Horde"}},
  siguientes={},tipo="normal",fuente={archivo="fixtures/rutas-mini.lua",linea=50},faccion="Horde",mazmorras={},pasos={
    {id="h0000101",n=1,etiquetas={},elementos={
      {t="goto",mapa=1411,inst=1,wx=-4105,wy=-590.5,modo="flecha",linea=52},
      {t="accept",q=790,texto={en="Accept Sarkoth",es="Acepta la misión Sarkoth"},linea=53},
    },requisitos={},linea=51},
    {id="h0000102",n=2,etiquetas={},elementos={
      {t="turnin",q=790,texto={en="Turn in Sarkoth",es="Entrega la misión Sarkoth"},linea=56},
    },requisitos={},linea=55},
  }}

T["Prueba (H) Mazmorras\\01-02 Inicio"]={clave="Prueba (H) Mazmorras\\01-02 Inicio",grupo="Prueba (H) Mazmorras",
  nombre="01-02 Inicio",titulo={en="1-2 Start",es="1-2 Inicio"},subgrupo="Guía de mazmorras de prueba",niveles={1,2},
  filtro={{"f:Horde"}},porDefecto={{"r:Orc"},{"r:Troll"}},siguientes={},tipo="mazmorras",
  fuente={archivo="fixtures/rutas-mini.lua",linea=60},faccion="Horde",mazmorras={RFC=true},pasos=pasosInicio()}

T["Prueba (H) Mago AoE\\01-02 Inicio"]={clave="Prueba (H) Mago AoE\\01-02 Inicio",grupo="Prueba (H) Mago AoE",
  nombre="01-02 Inicio",titulo={en="1-2 Start AoE",es="1-2 Inicio AoE"},niveles={1,2},filtro={{"f:Horde","c:MAGE"}},
  porDefecto={{"f:Horde","c:MAGE"}},siguientes={},tipo="normal",fuente={archivo="fixtures/rutas-mini.lua",linea=70},
  faccion="Horde",mazmorras={},pasos={
    {id="h0000201",n=1,filtro={{"c:MAGE"}},etiquetas={},elementos={
      {t="nota",texto={en="Train |cRXP_WARN_Arcane Explosion|r",es="Aprende |cRXP_WARN_Explosión Arcana|r"},linea=72},
    },requisitos={},linea=71},
    {id="h0000202",n=2,etiquetas={},elementos={
      {t="xp",nivel=2,efecto="objetivo",texto={en="Grind to level 2",es="Mata enemigos hasta subir al nivel 2"},linea=75},
    },requisitos={{t="nivel",n=2}},linea=74},
  }}

T["Prueba (A)\\01-03 Elwynn"]={clave="Prueba (A)\\01-03 Elwynn",grupo="Prueba (A)",nombre="01-03 Elwynn",
  titulo={en="1-3 Elwynn",es="1-3 Elwynn"},niveles={1,3},filtro={{"f:Alliance"}},porDefecto={{"r:Human"}},
  siguientes={},tipo="normal",fuente={archivo="fixtures/rutas-mini.lua",linea=80},faccion="Alliance",mazmorras={},pasos={
    {id="a0000001",n=1,etiquetas={},elementos={
      {t="goto",mapa=1453,inst=0,wx=850,wy=-8575,modo="flecha",linea=82},
      {t="accept",q=789,texto={en="Accept Sting of the Scorpid",es="Acepta la misión El aguijón del escórpido"},linea=83},
    },requisitos={},linea=81},
    {id="a0000002",n=2,etiquetas={},elementos={
      {t="goto",mapa=1453,inst=0,wx=680,wy=-8460,modo="flecha",linea=86},
      {t="turnin",q=789,texto={en="Turn in Sting of the Scorpid",es="Entrega la misión El aguijón del escórpido"},linea=87},
    },requisitos={},linea=85},
  }}

T["Prueba\\01-03 Skyborne"]={clave="Prueba\\01-03 Skyborne",grupo="Prueba",nombre="01-03 Skyborne",
  titulo={en="1-3 Skyborne",es="1-3 Cielonato"},niveles={1,3},porDefecto={{"r:Skyborne"}},siguientes={},tipo="normal",
  fuente={archivo="fixtures/rutas-mini.lua",linea=90},mazmorras={},pasos={
    {id="s0000001",n=1,etiquetas={},elementos={
      {t="goto",mapa=2521,x=42.82,y=23.41,modo="flecha",linea=92},
      {t="nota",texto={en="Follow the path",es="Sigue el camino"},linea=93},
    },requisitos={},linea=91},
    {id="s0000002",n=2,etiquetas={},elementos={
      {t="xp",nivel=2,efecto="objetivo",texto={en="Grind to level 2",es="Mata enemigos hasta subir al nivel 2"},linea=96},
    },requisitos={{t="nivel",n=2}},linea=95},
  }}

T["Prueba (A)\\01-09 Cielonato"]={clave="Prueba (A)\\01-09 Cielonato",grupo="Prueba (A)",nombre="01-09 Cielonato",
  titulo={en="1-9 Skyborne",es="1-9 Cielonato"},subgrupo="Guía rápida",niveles={1,9},
  filtro={{"f:Alliance"},{"f:Horde","!f:Alliance"}},porDefecto={{"r:Skyborne"}},siguientes={},tipo="normal",
  fuente={archivo="fixtures/rutas-mini.lua",linea=100},mazmorras={},
  variantes={
    {clave="Prueba (A)\\01-09 Cielonato",grupo="Prueba (A)",subgrupo="Guía rápida",
      titulo={en="1-9 Skyborne",es="1-9 Cielonato"},filtro={{"f:Alliance"}}},
    {clave="Prueba (H)\\01-09 Cielonato",grupo="Prueba (H)",subgrupo="Guía rápida H",
      titulo={en="1-9 Skyborne",es="1-9 Cielonato"},filtro={{"f:Horde","!f:Alliance"}}},
  },pasos={
    {id="c0000001",n=1,etiquetas={},elementos={
      {t="goto",mapa=2521,x=42.82,y=23.41,modo="flecha",linea=102},
      {t="nota",texto={en="Follow the path",es="Sigue el camino"},linea=103},
    },requisitos={},linea=101},
  }}
