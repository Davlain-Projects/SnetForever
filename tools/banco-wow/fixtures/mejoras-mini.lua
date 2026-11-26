-- Fixture del banco: una guía de mejora (lote «Cadenas de mejoras») con el formato de los datos reales (tipo «mejora»,
-- grupo «Mejoras (H)», pasos accept/turnin sobre objetos con `objeto` y el beneficio en `mejora`) y su aviso. Se carga
-- DESPUÉS de rutas-mini.lua, misiones-mini.lua y, si va, laterales-mini.lua. Usa las misiones 4641 y 788 de
-- misiones-mini.lua y dos objetos de prueba en Durotar (1411), el mapa que el banco sabe medir.
SNF_MISIONES.guias = SNF_MISIONES.guias or {}
SNF_MISIONES.object[900001] = {name = "Burned-Out Remains", spawns = {[1411] = {{50, 50}}}}
SNF_MISIONES.object[900002] = {name = "Pocket Litter", spawns = {[1411] = {{52, 52}}}}
SNF_MISIONES.es.object[900002] = {name = "Bolsillo de basura"}

SNF_MISIONES.guias["Mejoras (H)\\mejora-prueba"] = {
  clave = "Mejoras (H)\\mejora-prueba", grupo = "Mejoras (H)", nombre = "mejora-prueba",
  titulo = {en = "Upgrade: Cozy Sleeping Bag", es = "Mejora: Saco de dormir acogedor"}, tipo = "mejora", faccion = "Horde",
  -- Ronda 1 (M3): «x:mejora» en cada grupo, como en los datos reales.
  filtro = {{"r:Orc", "x:mejora"}, {"r:Scourge", "x:mejora"}, {"r:Tauren", "x:mejora"}, {"r:Troll", "x:mejora"},
    {"r:Skyborne", "x:mejora"}}, niveles = {min = 14, max = 14},
  siguientes = {}, mazmorras = {}, fuente = {archivo = "fixtures/mejoras-mini.lua", linea = 0}, sinVerificar = true,
  mejora = {id = "mejora-prueba", beneficioDe = "jugador",
    beneficio = {es = "Te acuestas y ganas experiencia extra (según el jugador en el juego)",
      en = "You lie down and gain extra experience (according to the player, in game)"},
    recompensa = {item = 211527, nombre = {en = "Cozy Sleeping Bag", es = "Saco de dormir acogedor"}},
    porElCamino = {es = "Por el camino, \"Tu lugar en el mundo\" te da también una bolsa (Old Toolbox).",
      en = "Along the way, \"Tu lugar en el mundo\" also gives you a bag (Old Toolbox)."}},
  origen = {base = "QuestieDB", version = "prueba", commit = "0000000000000000000000000000000000000000"},
  pasos = {
    {id = "m0000001", n = 1, etiquetas = {}, requisitos = {}, linea = 0, elementos = {
      {t = "goto", mapa = 1411, x = 50, y = 50, modo = "flecha"},
      {t = "accept", q = 4641, objeto = 900001},
    }},
    {id = "m0000002", n = 2, etiquetas = {}, requisitos = {}, linea = 0, elementos = {
      {t = "goto", mapa = 1411, x = 52, y = 52, modo = "flecha"},
      {t = "turnin", q = 4641, objeto = 900002},
      {t = "accept", q = 788, objeto = 900002},
    }},
    {id = "m0000003", n = 3, etiquetas = {}, requisitos = {}, linea = 0, elementos = {
      {t = "goto", mapa = 1411, x = 52, y = 52, modo = "flecha"},
      {t = "turnin", q = 788, objeto = 900002},
    }},
  },
}

SNF_RUTAS.avisos = SNF_RUTAS.avisos or {}
table.insert(SNF_RUTAS.avisos, {id = "mejora-prueba-H", tipo = "mejora", faccion = "Horde",
  filtro = {{"r:Orc"}, {"r:Scourge"}, {"r:Tauren"}, {"r:Troll"}, {"r:Skyborne"}}, nivel = 14,
  texto = {en = "You can get: Cozy Sleeping Bag", es = "Puedes conseguir: Saco de dormir acogedor"},
  inicio = {mapa = 1411, x = 50, y = 50}, guia = "Mejoras (H)\\mejora-prueba", hechas = {788}})
-- Ronda 1 (M4): una mejora que empieza en otro continente (Ventormenta, instancia 0; el jugador del banco está en Durotar).
table.insert(SNF_RUTAS.avisos, {id = "mejora-lejos-H", tipo = "mejora", faccion = "Horde", filtro = {{"r:Orc"}}, nivel = 14,
  texto = {en = "You can get: Far Bag", es = "Puedes conseguir: Bolsa lejana"}, inicio = {mapa = 1453, x = 50, y = 50},
  hechas = {789}})
