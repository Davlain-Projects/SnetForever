-- Fixture del banco: índice de mazmorras de la fase 3 en pequeño (SNF_MISIONES.instancias y porMazmorra), para la ficha
-- de mazmorra de OpenMap (mapa/openmap.lua). Se carga después de misiones-mini.lua y le añade esos dos campos.
-- Formato de cada Entrada: ver docs/planes/2026-11-09-fase-3-guias-de-mazmorra.md (q, nivel, nivelMision, faccion?, clases?,
-- razas?, recoge?, previas?, todas?).
--   * 209 Shadowfang Keep: una entrada por cada prueba de las reglas (9001 a 9008); 9500 es la previa de 9005.
--   * 796 Scarlet Monastery: solo una misión de la Alianza (a un orco no le toca nada).
--   * 1583 Blackrock Spire y 1584 Blackrock Depths: dos mazmorras de la misma Montaña Roca Negra.
SNF_MISIONES.instancias = {[33]=209,[189]=796,[229]=1583,[230]=1584}
SNF_MISIONES.porMazmorra = {
  [209]={nombre="Shadowfang Keep",area=209,instancia=33,niveles={18,25},fuenteNiveles="OpenMap",banda=false,misiones={
    {q=9001,nivel=18,nivelMision=20,recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9002,nivel=18,nivelMision=20,faccion="Alliance",recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9003,nivel=18,nivelMision=20,faccion="Alliance",recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9004,nivel=24,nivelMision=24,recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9005,nivel=18,nivelMision=21,previas={9500},recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9006,nivel=18,nivelMision=20,recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9007,nivel=18,nivelMision=22,recoge={tipo="npc",id=15503,enMazmorra=209}},
    {q=9008,nivel=18,nivelMision=19,recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
    {q=9009,nivel=18,nivelMision=23,recoge={tipo="npc",id=3143}},
  }},
  [796]={nombre="Scarlet Monastery",area=796,instancia=189,niveles={30,40},fuenteNiveles="OpenMap",banda=false,misiones={
    {q=9101,nivel=30,nivelMision=30,faccion="Alliance",recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
  }},
  [1583]={nombre="Blackrock Spire",area=1583,instancia=229,niveles={55,60},fuenteNiveles="OpenMap",banda=false,misiones={
    {q=9201,nivel=20,nivelMision=20,recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
  }},
  [1584]={nombre="Blackrock Depths",area=1584,instancia=230,niveles={52,60},fuenteNiveles="OpenMap",banda=false,misiones={
    {q=9301,nivel=20,nivelMision=22,recoge={tipo="npc",id=3143,mapa=1411,x=42.1,y=68.3}},
  }},
}
