# Importar una guía local de RestedXP

SnetForever puede seguir los pasos escritos en un paquete local de RestedXP para WoW Forever.
El importador lee los archivos Lua como texto y usa el mismo motor de rutas que las guías
incluidas con SnetForever. Puedes jugar con la app de escritorio cerrada.

## Preparar la copia local

Usa la carpeta `RXPGuides` de tu biblioteca. Debe contener `Guides/forever`, `DB/forever/db.lua`
y `LICENSE`. La carpeta de salida debe existir fuera del repositorio.

```powershell
npm run importar:rxp -- "<carpeta RXPGuides>" "<carpeta de salida>"
```

La orden genera `SnetForever_RutasRXP` en la salida. Conserva esa carpeta en tu PC. Con WoW
cerrado, colócala en `Interface/AddOns` junto al núcleo de SnetForever que admite esta importación.
Para generar una nueva copia, usa otra carpeta de salida. Si la vas a instalar, guarda la
copia instalada anterior fuera de `AddOns` antes de poner la nueva.

## Importar desde el juego

También puedes añadir tramos sin instalar nada ni cerrar el juego. En el PC, prepara un paquete
con los grupos o tramos que quieras:

```powershell
npm run importar:rxp -- --juego "<carpeta RXPGuides>" "<carpeta de salida>" "<grupo>" "<otro grupo>\<tramo>"
```

Un nombre sin barra elige el grupo entero. Con barra, elige un tramo. Si algún nombre no
corresponde a ninguna guía de Forever, la orden falla y no prepara nada. La orden crea
`SnetForever_ImportarRXP_<id>` en la salida, con un archivo `parte-NN-de-NN.txt` por cada parte del
paquete y un `LEEME.txt`. El `LEEME.txt` da el identificador del paquete y el número de partes, guías
y pasos. También lista los destinos que no van en el paquete y los enlaces que ya faltan en el origen.
Cada parte tiene hasta 100 000 caracteres de datos. Si el conversor indica que el paquete supera el
límite del juego, elige menos tramos.

En el juego, abre el selector de guías y pulsa **Mis guías: importar de RestedXP…**. También
puedes escribir `/snet importar`. Abre cada parte con el Bloc de notas y pulsa Ctrl+A y Ctrl+C.
Después, pega la parte en el cuadro de la ventana con Ctrl+V. Puedes pegar las partes en cualquier
orden. Cuando están todas, la ventana comprueba el paquete y muestra los mismos datos que el
`LEEME.txt`. Pulsa **Importar** para guardarlo.

La importación trata el paquete solo como datos y nunca lo ejecuta. Importa el paquete entero o
no importa nada. La ventana indica el motivo si falta una parte, si una suma no coincide, si hay un
dato que no se reconoce o si el resumen del paquete no coincide con su contenido. Cada guía conserva
sus ids de paso, filtros, eventos, variantes y enlaces originales. Las guías importadas sustituyen
a las de `SnetForever_RutasRXP` que tengan la misma clave. Como usan las mismas claves y los mismos ids,
conservas el progreso. Al confirmar, la guía en curso se vuelve a cargar.

Los paquetes se guardan en el personaje que los importa, dentro de sus variables guardadas. Así
no crece el `SnetForever.lua` de la cuenta, que la app lee con un límite de 5 MB. Para usar el paquete
en otro personaje, vuelve a pegarlo. Cada personaje admite 4 000 000 de caracteres de paquetes.
La lista de la ventana permite quitar cada paquete. Las guías importadas se leen la primera vez
que las pide cada sesión.

## Seguir la ruta

Abre el selector de guías de SnetForever y elige el grupo **Mis guías RXP** que corresponda.
Selecciona el tramo que quieres seguir. Se aplican las condiciones del personaje, las
referencias a otros pasos y el siguiente tramo definido en la guía. El progreso de cada
ruta importada se guarda por personaje. El selector mantiene disponibles las guías habituales.

En **Opciones → Guía** puedes elegir el multiplicador de XP de las guías importadas.
El valor inicial es 1×. Cambiarlo aplica las condiciones de XP del archivo original.
Una copia importada antes de este cambio necesita una nueva importación para recuperar
las variantes de XP que no se habían incluido.

**Objetos activos** muestra botones para los objetos y hechizos disponibles que pide el paso.
Puedes asignar teclas a esos botones y a **Objetivos cercanos** en los atajos de WoW.
El atajo **Todos los objetivos cercanos del paso** fija con una sola tecla el primer objetivo
de la lista que esté a tu alcance y le pone la marca elegida. La lista solo se actualiza fuera
de combate y cabe en el límite de 255 bytes de una macro del cliente; si no cabe entera, se quitan
los últimos objetivos.
Al salir del combate se aplican los cambios de los botones protegidos.

En **Opciones → Guía** también puedes activar la aceptación y entrega de las misiones
del paso activo. Mantén pulsado Ctrl para pausar esta opción durante un diálogo.
Las recompensas con varias opciones quedan a tu elección salvo que la guía indique
una recompensa concreta.

Los pasos con `.next` siguen el enlace en cuanto se activan. Los de `.clicknext` ofrecen
un enlace que puedes pulsar. Las listas de destinos conservan su orden y se elige la primera
guía disponible para el personaje.

Cuando falta un destino, el resultado de la importación lo cuenta y lo explica en
`enlacesSinResolverDetalle`: el tramo de origen, la línea del `#next` y el motivo. El motivo es
`solo-en-otra-edicion` cuando el nombre solo aparece en guías de otro cliente, como Classic o TBC, y
`sin-tramo` cuando no aparece en ninguna. También se indican los tramos de Forever del mismo grupo que
empiezan por los mismos niveles. El importador no añade tramos de otro cliente ni sustituye un nombre
por otro parecido. Un `#next` sin destino deja el recorrido en su último tramo, igual que en el original.
También se informa del número de comandos sin interpretar.
El importador utiliza los textos en español de la guía cuando puede alinearlos con sus
pasos originales.
