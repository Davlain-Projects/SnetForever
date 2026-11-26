-- Fixture del banco: guías laterales de la fase 3 con el formato de los datos reales (ver el contrato de la fase 3 en
-- docs/planes/2026-11-09-fase-3-cadenas.md). Se carga DESPUÉS de rutas-mini.lua y misiones-mini.lua:
--   * SNF_MISIONES.guias: la cadena «druida-oso» (druida de la Horda, 3 pasos en el mapa 1411, el 2.º con
--     sinVerificar = "orden") y la guía de mazmorra de Las Minas de la Muerte (area 1581). Como en los datos reales,
--     sus niveles van como {min = , max = } (las guías de RestedXP traen {1, 60}).
--   * SNF_RUTAS.guias["Profesiones\\01-300 Herbalism (H)"]: guía de profesión con tramo bilingüe.
SNF_MISIONES.guias = {}
SNF_MISIONES.guias["Cadenas de clase (H)\\druida-oso"] = {
  clave = "Cadenas de clase (H)\\druida-oso", grupo = "Cadenas de clase (H)", nombre = "druida-oso",
  titulo = {en = "Druid: Bear Form", es = "Druida: Forma de oso"}, tipo = "cadena", faccion = "Horde",
  filtro = {{"c:DRUID"}}, niveles = {min = 10, max = 10}, siguientes = {}, mazmorras = {},
  fuente = {archivo = "fixtures/laterales-mini.lua", linea = 0}, sinVerificar = true,
  cadena = {id = "druida-oso", habilidad = {en = "Bear Form", es = "Forma de oso"}},
  origen = {base = "QuestieDB", version = "prueba", commit = "0000000000000000000000000000000000000000"},
  pasos = {
    {id = "c0000001", n = 1, etiquetas = {}, requisitos = {}, linea = 0, elementos = {
      {t = "goto", mapa = 1411, x = 43.3, y = 69, modo = "flecha"},
      {t = "accept", q = 4641},
    }},
    {id = "c0000002", n = 2, etiquetas = {}, requisitos = {}, linea = 0, sinVerificar = "orden", elementos = {
      {t = "goto", mapa = 1411, x = 42.1, y = 68.3, modo = "flecha"},
      {t = "turnin", q = 4641},
      {t = "accept", q = 788},
    }},
    {id = "c0000003", n = 3, etiquetas = {}, requisitos = {}, linea = 0, elementos = {
      {t = "goto", mapa = 1411, x = 42.1, y = 68.3, modo = "flecha"},
      {t = "turnin", q = 788},
    }},
  },
}

SNF_MISIONES.guias["Mazmorras SnetForever (H)\\16-21 The Deadmines"] = {
  clave = "Mazmorras SnetForever (H)\\16-21 The Deadmines", grupo = "Mazmorras SnetForever (H)",
  nombre = "16-21 The Deadmines", titulo = {en = "The Deadmines"}, tipo = "mazmorra", faccion = "Horde",
  filtro = {{"f:Horde"}}, niveles = {min = 16, max = 21}, siguientes = {}, mazmorras = {},
  fuente = {archivo = "fixtures/laterales-mini.lua", linea = 0}, sinVerificar = true,
  area = 1581, instancia = 36,
  origen = {base = "QuestieDB", version = "prueba", commit = "0000000000000000000000000000000000000000"},
  pasos = {
    {id = "d0000001", n = 1, etiquetas = {}, requisitos = {}, linea = 0, elementos = {
      {t = "goto", mapa = 1411, x = 42.1, y = 68.3, modo = "flecha"},
      {t = "accept", q = 791},
    }},
  },
}

SNF_RUTAS.guias["Profesiones\\01-300 Herbalism (H)"] = {
  clave = "Profesiones\\01-300 Herbalism (H)", grupo = "Profesiones", nombre = "01-300 Herbalism (H)",
  titulo = {en = "1-300 Herbalism", es = "1-300 Herboristería"}, tipo = "profesion", faccion = "Horde",
  filtro = {{"f:Horde"}}, niveles = {min = 1, max = 60}, siguientes = {}, mazmorras = {},
  fuente = {archivo = "fixtures/laterales-mini.lua", linea = 0}, sinVerificar = true,
  tramo = {en = "Skill 1-300", es = "Habilidad 1-300"},
  habilidad = {p = "herbalism", desde = 1, hasta = 300},
  pasos = {
    {id = "p0000001", n = 1, etiquetas = {}, requisitos = {}, linea = 1, elementos = {
      {t = "nota", texto = {en = "Pick Peacebloom", es = "Recoge flor de paz"}, linea = 2},
    }},
  },
}
