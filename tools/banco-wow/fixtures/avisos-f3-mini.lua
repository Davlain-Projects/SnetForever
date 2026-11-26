-- Fixture del banco: SNF_RUTAS.avisos con el formato de la fase 3 (ver el contrato en
-- docs/planes/2026-11-09-fase-3-cadenas.md). Se carga después de rutas-mini.lua y misiones-mini.lua.
--   * cadena-oso-H: druidas tauren de la Horda desde el nivel 10; se apaga si se entrega la 6002.
--   * mazmorra-1581-H: avisos de mazmorra (Las Minas de la Muerte) de la Horda entre los niveles 15 y 21, para cualquier
--     clase; se apaga cuando se han entregado la 788 y la 789 (modoHechas = "todas").
--   * druida-10-fase2: aviso con el formato de la fase 2, sin tipo ni filtro.
SNF_RUTAS.avisos = {
  {id = "cadena-oso-H", tipo = "cadena", clase = "DRUID", faccion = "Horde", filtro = {{"r:Tauren"}}, nivel = 10,
    texto = {en = "Druid chain: Bear Form", es = "Cadena de druida: Forma de oso"},
    guia = "Cadenas de clase (H)\\druida-oso", hechas = {6002}},
  {id = "mazmorra-1581-H", tipo = "mazmorra", faccion = "Horde", nivel = 15, hasta = 21, area = 1581,
    texto = {en = "Dungeon quests: The Deadmines", es = "Misiones de mazmorra: Las Minas de la Muerte"},
    guia = "Mazmorras SnetForever (H)\\16-21 The Deadmines", hechas = {788, 789}, modoHechas = "todas"},
  {id = "druida-10-fase2", clase = "DRUID", nivel = 10,
    texto = {en = "Druid chain: Moonglade storm", es = "Cadena de druida: la tormenta de Claro de la Luna"}},
}
