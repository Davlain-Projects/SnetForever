-- Fixture del banco: SNF_RUTAS.avisos pequeño, con el formato que fija la fase 2 para la fase 3:
--   avisos = Array<{id, clase, faccion?, nivel, texto = {en, es?}, guia?}>
-- Se carga después de rutas-mini.lua (añade el campo a SNF_RUTAS, que ya existe).
--   * druida-10-tormenta: druida de nivel 10 (las dos facciones), con una guía que existe.
--   * druida-10-alianza: solo druidas de la Alianza (un druida de la Horda no lo recibe).
--   * druida-15-perdida: nivel 15, con una guía que no existe (tieneGuia es falso).
--   * druida-20-sin-guia: nivel 20, sin campo guia.
SNF_RUTAS.avisos = {
  {id = "druida-10-tormenta", clase = "DRUID", nivel = 10,
    texto = {en = "Druid chain: Moonglade storm", es = "Cadena de druida: la tormenta de Claro de la Luna"},
    guia = "Prueba (H)\\02-03 Sigue"},
  {id = "druida-10-alianza", clase = "DRUID", faccion = "Alliance", nivel = 10,
    texto = {en = "Alliance druid chain"}, guia = "Prueba (A)\\01-03 Elwynn"},
  {id = "druida-15-perdida", clase = "DRUID", nivel = 15,
    texto = {en = "Druid chain: lost guide", es = "Cadena de druida: guía perdida"},
    guia = "Inexistente\\15-16 Perdida"},
  {id = "druida-20-sin-guia", clase = "DRUID", nivel = 20,
    texto = {en = "Druid chain: no guide", es = "Cadena de druida: sin guía"}},
}
