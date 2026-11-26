local T = SNF_MISIONES.guias
T["Pruebas\\misiones"]={clave="Pruebas\\misiones",nombre="misiones",titulo={es="Misiones de prueba",en="Test quests"},faccion="Horde",niveles={min=1,max=8},pasos={{id="a1",n=1,elementos={{t="goto",mapa=1413,x=50.5,y=60.5,modo="flecha"},{t="accept",q=9101},{t="nota",texto={es="Habla con ella",en="Talk to her"}}}},{id="a2",n=2,elementos={{t="complete",q=9101,objetivo=1},{t="manual",texto={es="Mata a los jabalíes",en="Kill the boars"}}}},{id="a3",n=3,elementos={{t="turnin",q=9101}}}}}
local T = SNF_RUTAS.guias
T["Pruebas\\ruta"]={clave="Pruebas\\ruta",nombre="ruta",titulo={es="Ruta de prueba",en="Test route"},faccion="Alliance",niveles={5,9},pasos={{id="b1",n=1,elementos={{t="goto",mapa=1413,x=40,y=30},{t="accept",q=9102}}}}}
