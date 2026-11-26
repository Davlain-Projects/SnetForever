# Créditos

## NeverQuestAlone

El códec de la franja de colores (`src/franja/codec.mjs`) está adaptado de
[NeverQuestAlone](https://github.com/chelinho139/NeverQuestAlone) (`bridge/transport/strip.mjs`),
licencia MIT, © 2026 chelinho139 y los autores de NeverQuestAlone, commit 3a9b93c.
El mismo proyecto es el origen de `addons/SnetForever/ia/codec.lua` (`addon/NeverQuestAlone/Codec.lua`).
Cambios: nombres en español, magia propia (`0x53 0x46`), imagen con `bgr` opcional y otro reparto de motivos de rechazo.

## NeverQuestAlone: buzón y reintentos

`src/buzon.mjs` (`luaCadena`) deriva de `luaStr` de `bridge/transport/luaenc.mjs`, y `src/fsseguro.mjs` (los reintentos ante los
bloqueos de Windows) deriva de `bridge/transport/fsretry.mjs`. Licencia MIT, © 2026 chelinho139 y los autores de
NeverQuestAlone, commit 3a9b93c. Cambios: nombres en español, reintentos asíncronos que se rinden para toda la tanda tras
agotarse una vez, claves de Lua restringidas a identificadores o enteros y límite de profundidad.

## Base de datos de misiones

La app lee en tiempo de ejecución la base de datos de misiones de WoW Forever (licencia GPLv3). No copia ni redistribuye nada de ella.

## Node.js (dentro del instalador)

El instalador de SnetForever lleva una copia portátil de Node.js (`node\node.exe`, v24.14.0), sin cambios, para que la
app funcione sin instalar nada más. Node.js es MIT, © Node.js contributors y OpenJS Foundation. Node.js incluye
componentes de terceros (V8, ICU, OpenSSL, libuv y otros) con sus propias licencias, recogidas en el `LICENSE` de
Node.js; el instalador lleva ese aviso junto a `node.exe`, en `node\LICENSE`.

## Inno Setup

El instalador (`.exe`) se hace con [Inno Setup](https://jrsoftware.org/isinfo.php) 6, © Jordan Russell y Martijn Laan,
con su propia licencia (Inno Setup License). Del código de Inno Setup solo va dentro del instalador su programa de
instalación y su desinstalador (`unins000.exe`).

## Licencia

See `LICENSE` for the collaboration terms for original app code and the separately licensed contributions.
