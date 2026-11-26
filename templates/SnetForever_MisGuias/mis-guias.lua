-- Mis guías de SnetForever. Las instrucciones están en LEEME.txt, en esta misma carpeta.
--
-- Cada guía va entre { y }, separada de la siguiente por una coma. Después de cambiar este archivo, escribe /reload en
-- el juego. Tus guías salen en la ventana de SnetForever, en el grupo «Mis guías».
--
-- La de abajo es un ejemplo con datos reales de la base de misiones (las cuatro primeras misiones de los orcos y trols
-- en el Valle de los Retos, Durotar). Puedes cambiarla, copiarla o borrarla entera.

SnetForeverMisGuias = {

  {
    nombre = "Ejemplo: Valle de los Retos",
    niveles = {1, 4},
    faccion = "Horda",
    pasos = {
      {aceptar = 4641, ir = {1411, 43.3, 68.5}, texto = "Habla con Kaltunk"},
      {entregar = 4641, aceptar = 788, ir = {1411, 42.1, 68.3}, texto = "Gornek está dentro de la cueva"},
      {completar = 788, texto = "Mata jabalíes moteados por el valle"},
      {entregar = 788, aceptar = 789, ir = {1411, 42.1, 68.3}},
      {completar = 789, texto = "Recoge colas de escórpido obrero"},
      {entregar = 789, ir = {1411, 42.1, 68.3}},
      {texto = "Vende lo que no uses antes de seguir"},
    },
  },

}
