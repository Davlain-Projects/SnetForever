# Créditos de SnetForever - Misiones

Los datos de este addon (misiones, PNJ, objetos del mundo, ítems, sus traducciones al español y las
correcciones por facción) se han generado a partir de **QuestieDB 1.1.0**, commit
`90ab55bdddd6ef6507fe51610b9c26948bbeb637`.

© colaboradores de Questie/QuestieDB.

## Licencia

Este addon se distribuye bajo la **GNU General Public License versión 3** (archivo `LICENSE`),
igual que los datos de origen.

## Procedencia y cambios

- Se han convertido los datos al formato Lua 5.1 propio de SnetForever (tablas por tipo, español aparte).
- Las coordenadas de PNJ y objetos están agrupadas por uiMapID en lugar de por AreaID.
- Se han descartado 364 misiones: las de relleno o de prueba (sin nombre, «REUSE ME», TEST o NYI), las que
  Questie oculta en el Forever (su lista negra) y las de otras temporadas sin quien las dé en el mapa.
- Las correcciones dinámicas por facción y clase se guardan en `porFaccion`.

## Sin relación con Questie

SnetForever y este addon no tienen ninguna relación con Questie ni con sus autores, y no están
respaldados por ellos. El nombre y el logotipo de Questie no se usan aquí.

## Guías generadas a partir de esta base

Las guías de cadenas de clase y de mazmorras, y el índice de mazmorras, las ha generado el conversor de
SnetForever a partir de los datos de QuestieDB de este mismo addon: cada misión, PNJ y coordenada sale de
la base y ninguna se ha escrito a mano. Siguen la licencia GPLv3 de la base. Salen marcadas «sin verificar»
mientras nadie las compruebe en el juego.

## OpenMap

Los niveles de zonas y mazmorras del índice de mazmorras proceden de **OpenMap** (licencia MIT; su texto
está en `LICENSE-OpenMap.txt`).
