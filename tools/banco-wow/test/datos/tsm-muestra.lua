-- Muestra INVENTADA y anónima con la forma de TradeSkillMasterDB (la configuración guardada de TSM), para las pruebas de
-- comercio/importar-tsm.lua (Task 25). Ningún dato es del jugador: los grupos, objetos, operaciones, fórmulas, reinos y
-- personajes son de mentira. Los personajes propios de la cuenta de prueba son «Alba» y «Brisa», del reino «Mirador»;
-- «Kurgath», «Selyndra» y «Thornak» hacen de otros jugadores: no deben llegar nunca a lo que guarda SnetForever.
--
-- Lo que trae: 8 grupos en 3 niveles, 40 objetos («i:», «i:…::…» y «p:»), 11 operaciones de los 7 tipos (con override,
-- herencia y vínculos), fórmulas con db* (dbregionsaleavg queda sin traducir), una fuente propia y otras claves de TSM
-- (con nombres de jugadores) que la importación no debe leer.
TradeSkillMasterDB = {
  ["_version"] = 99,
  ["_currentProfile"] = {
    ["Alba - Mirador"] = "Default",
    ["Brisa - Mirador"] = "Default",
  },
  ["_scopeKeys"] = {
    ["char"] = {"Alba - Mirador", "Brisa - Mirador"},
    ["factionrealm"] = {"Horde - Mirador"},
  },
  -- Claves que NO se leen (nombres de otros jugadores y de hermandades inventados).
  ["s@Alba - Horde - Mirador@internalData@goldLog"] = "Kurgath te pagó 50g",
  ["f@Horde - Mirador@internalData@guildVaults"] = {["Los Selyndra"] = {}},
  ["f@Horde - Mirador@coreOptions@ignoreGuilds"] = {["Hermandad de Thornak"] = true},
  ["r@Mirador@internalData@saveTimeAuctions"] = "Selyndra,Thornak",
  ["g@ @userData@sharedOperations"] = {["Auctioning"] = {["De Kurgath"] = {}}},
  ["g@ @coreOptions@globalOperations"] = false,

  -- Las 4 claves que sí se leen.
  ["g@ @userData@customPriceSources"] = {
    ["minprecio"] = "max(min(dbhistorical, dbregionmarketavg, dbregionhistorical), vendorsell)",
  },
  ["p@Default@userData@groups"] = {
    [""] = {
      ["Auctioning"] = {"#Default", ["override"] = true},
      ["Crafting"] = {"#Default", ["override"] = true},
      ["Mailing"] = {["override"] = true},
      ["Shopping"] = {["override"] = true},
      ["Sniper"] = {["override"] = true},
      ["Vendoring"] = {["override"] = true},
      ["Warehousing"] = {["override"] = true},
    },
    ["Hierbas"] = {
      ["Auctioning"] = {"Hierbas 5x20", ["override"] = true},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {},
      ["Shopping"] = {"Compra barata", ["override"] = true},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {},
      ["Warehousing"] = {},
    },
    ["Hierbas`Comunes"] = {
      ["Auctioning"] = {"Hierbas 5x20"},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {},
      ["Shopping"] = {"Compra barata"},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {},
      ["Warehousing"] = {},
    },
    ["Hierbas`Raras"] = {
      ["Auctioning"] = {"Raras caras", "Hierbas 5x20", ["override"] = true},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {},
      ["Shopping"] = {"Compra barata"},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {},
      ["Warehousing"] = {},
    },
    ["Hierbas`Raras`Lotos"] = {
      ["Auctioning"] = {"Raras caras", "Hierbas 5x20"},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {},
      ["Shopping"] = {"Compra barata"},
      ["Sniper"] = {"Cazar", ["override"] = true},
      ["Vendoring"] = {},
      ["Warehousing"] = {},
    },
    ["Minerales"] = {
      ["Auctioning"] = {"#Default"},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {"Al banco", "A otro", ["override"] = true},
      ["Shopping"] = {"#Default"},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {},
      ["Warehousing"] = {"Guardar", ["override"] = true},
    },
    ["Minerales`Barras"] = {
      ["Auctioning"] = {"#Default"},
      ["Crafting"] = {"Fabricar", ["override"] = true},
      ["Mailing"] = {"Al banco", "A otro"},
      ["Shopping"] = {"#Default"},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {"Chatarra", ["override"] = true},
      ["Warehousing"] = {"Guardar"},
    },
    ["Mascotas"] = {
      ["Auctioning"] = {["override"] = true},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {},
      ["Shopping"] = {"#Default"},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {},
      ["Warehousing"] = {},
    },
    ["Mascotas`Raras"] = {
      ["Auctioning"] = {},
      ["Crafting"] = {"#Default"},
      ["Mailing"] = {},
      ["Shopping"] = {"#Default"},
      ["Sniper"] = {"#Default"},
      ["Vendoring"] = {},
      ["Warehousing"] = {},
    },
  },
  ["p@Default@userData@items"] = {
    ["i:2447"] = "Hierbas`Comunes", ["i:765"] = "Hierbas`Comunes", ["i:785"] = "Hierbas`Comunes",
    ["i:2449"] = "Hierbas`Comunes", ["i:2450"] = "Hierbas`Comunes", ["i:2452"] = "Hierbas`Comunes",
    ["i:2453"] = "Hierbas`Comunes", ["i:3820"] = "Hierbas`Comunes",
    ["i:3355"] = "Hierbas", ["i:3356"] = "Hierbas", ["i:3357"] = "Hierbas", ["i:3358"] = "Hierbas",
    ["i:3369"] = "Hierbas`Raras", ["i:3818"] = "Hierbas`Raras", ["i:3819"] = "Hierbas`Raras", ["i:3821"] = "Hierbas`Raras",
    ["i:8836::1:3"] = "Hierbas`Raras", ["i:8838::r42"] = "Hierbas`Raras",
    ["i:13463"] = "Hierbas`Raras`Lotos", ["i:13464"] = "Hierbas`Raras`Lotos", ["i:13465"] = "Hierbas`Raras`Lotos",
    ["i:13466::2:7:9"] = "Hierbas`Raras`Lotos",
    ["i:2770"] = "Minerales", ["i:2771"] = "Minerales", ["i:2772"] = "Minerales", ["i:3858"] = "Minerales",
    ["i:10620"] = "Minerales", ["i:2775::5"] = "Minerales",
    ["i:2840"] = "Minerales`Barras", ["i:2841"] = "Minerales`Barras", ["i:3575"] = "Minerales`Barras",
    ["i:3576"] = "Minerales`Barras", ["i:3859::r7"] = "Minerales`Barras",
    ["p:39:1:3"] = "Mascotas", ["p:40:1:2"] = "Mascotas", ["p:41:5:4"] = "Mascotas", ["p:68:1:1"] = "Mascotas",
    ["p:132:25:4"] = "Mascotas`Raras", ["p:1124:10:3"] = "Mascotas`Raras", ["p:1155:1:4"] = "Mascotas`Raras",
  },
  ["p@Default@userData@operations"] = {
    ["Auctioning"] = {
      ["#Default"] = {
        ["ignoreLowDuration"] = 0, ["postCap"] = "5", ["keepQuantity"] = "0", ["maxExpires"] = "0", ["duration"] = 2,
        ["bidPercent"] = 1, ["undercut"] = "0c",
        ["minPrice"] = "check(first(crafting,dbmarket,dbregionmarketavg),max(0.25*avg(crafting,dbmarket,dbregionmarketavg),1.5*vendorsell))",
        ["maxPrice"] = "check(first(crafting,dbmarket,dbregionmarketavg),max(5*avg(crafting,dbmarket,dbregionmarketavg),30*vendorsell))",
        ["normalPrice"] = "check(first(crafting,dbmarket,dbregionmarketavg),max(2*avg(crafting,dbmarket,dbregionmarketavg),12*vendorsell))",
        ["priceReset"] = "none", ["aboveMax"] = "maxPrice", ["cancelUndercut"] = true, ["cancelRepost"] = true,
        ["cancelRepostThreshold"] = "1g",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
      ["Hierbas 5x20"] = {
        ["ignoreLowDuration"] = 1, ["postCap"] = "100", ["keepQuantity"] = "20", ["maxExpires"] = "3", ["duration"] = 3,
        ["bidPercent"] = 0.8, ["undercut"] = "1c",
        ["minPrice"] = "max(80% dbmarket, 1.5 * vendorsell)",
        ["maxPrice"] = "200% DBHistorical",
        ["normalPrice"] = "first(dbregionmarketavg, minprecio, 50s)",
        ["priceReset"] = "minPrice", ["aboveMax"] = "normalPrice", ["cancelUndercut"] = true, ["cancelRepost"] = false,
        ["cancelRepostThreshold"] = "50s",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
      ["Raras caras"] = {
        ["ignoreLowDuration"] = 0, ["postCap"] = "1", ["keepQuantity"] = "0", ["maxExpires"] = "0", ["duration"] = 1,
        ["bidPercent"] = 1, ["undercut"] = "0c",
        ["minPrice"] = "10g",
        ["maxPrice"] = "first(250% dbregionsaleavg, 200% dbmarket, 500g)",
        ["normalPrice"] = "first(125% dbregionsaleavg, 120% dbmarket, 50g)",
        ["priceReset"] = "ignore", ["aboveMax"] = "none", ["cancelUndercut"] = false, ["cancelRepost"] = true,
        ["cancelRepostThreshold"] = "5g",
        ["ignorePlayer"] = {["Brisa - Horde - Mirador"] = true, ["Kurgath - Horde - Mirador"] = true},
        ["ignoreFactionrealm"] = {["Horde - Mirador"] = true, ["Alliance - Lejano"] = true},
        ["relationships"] = {["minPrice"] = "Hierbas 5x20", ["undercut"] = "Hierbas 5x20"},
      },
    },
    ["Crafting"] = {
      ["#Default"] = {
        ["minRestock"] = "10", ["maxRestock"] = "20", ["minProfit"] = "100g", ["craftPriceMethod"] = "",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
      ["Fabricar"] = {
        ["minRestock"] = "2", ["maxRestock"] = "6", ["minProfit"] = "", ["craftPriceMethod"] = "minprecio * 1.1",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {["maxRestock"] = "#Default"},
      },
    },
    ["Mailing"] = {
      ["Al banco"] = {
        ["maxQtyEnabled"] = true, ["maxQty"] = "40", ["target"] = "Brisa", ["restock"] = true,
        ["restockSources"] = {["guild"] = true, ["bank"] = false}, ["keepQty"] = "5",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
      ["A otro"] = {
        ["maxQtyEnabled"] = false, ["maxQty"] = "10", ["target"] = "Selyndra", ["restock"] = false,
        ["restockSources"] = {["guild"] = false, ["bank"] = false}, ["keepQty"] = "0",
        ["ignorePlayer"] = {["Thornak - Horde - Mirador"] = true}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
    },
    ["Shopping"] = {
      ["Compra barata"] = {
        ["restockQuantity"] = "200", ["maxPrice"] = "90% dbregionmarketavg", ["showAboveMaxPrice"] = false,
        ["restockSources"] = {["alts"] = true, ["auctions"] = false, ["bank"] = true, ["guild"] = false},
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
    },
    ["Sniper"] = {
      ["Cazar"] = {
        ["belowPrice"] = "70% dbminbuyout",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
    },
    ["Vendoring"] = {
      ["Chatarra"] = {
        ["sellAfterExpired"] = "10", ["sellSoulbound"] = true, ["keepQty"] = "1", ["restockQty"] = "0",
        ["restockSources"] = {["alts"] = false, ["ah"] = true, ["bank"] = false, ["guild"] = false, ["alts_ah"] = true, ["mail"] = false},
        ["enableBuy"] = false, ["enableSell"] = true, ["vsMarketValue"] = "dbmarket", ["vsMaxMarketValue"] = "5g",
        ["vsDestroyValue"] = "dbmarket", ["vsMaxDestroyValue"] = "0c",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
    },
    ["Warehousing"] = {
      ["Guardar"] = {
        ["moveQuantity"] = "5", ["stackSize"] = "20", ["keepBagQuantity"] = "1", ["keepBankQuantity"] = "2",
        ["restockQuantity"] = "10", ["restockStackSize"] = "5", ["restockKeepBankQuantity"] = "3",
        ["ignorePlayer"] = {}, ["ignoreFactionrealm"] = {}, ["relationships"] = {},
      },
    },
  },
}
