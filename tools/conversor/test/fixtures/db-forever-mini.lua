-- Recorte de RXPGuides/DB/forever/db.lua para las pruebas: solo la forma de la tabla addon.mapId.
local _, addon = ...

addon.questConversion = {
}

addon.mapId = {
    ["Durotar"] = 1411,
    ["Mulgore"] = 1412,
    ["Eastern Plaguelands"] = 1423,
    ["Teldrassil"] = 1438,
    ["Stormwind City"] = 1453,
    ["Orgrimmar"] = 1454,
    ["Un'Goro Crater"] = 1449,
    ["Zephras Isle"] = 2521,
}

addon.ignoredMaps = {
	["Eversong Woods"] = 1941,
}
