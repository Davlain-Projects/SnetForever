// Esquema de los registros de QuestieDB (plano 4 §2.1-2.4): nombres de campo en orden (índice Lua = posición + 1).

export const ESQUEMA = {
  quest: [
    'name', 'startedBy', 'finishedBy', 'requiredLevel', 'questLevel', 'requiredRaces', 'requiredClasses',
    'objectivesText', 'triggerEnd', 'objectives', 'sourceItemId', 'preQuestGroup', 'preQuestSingle',
    'childQuests', 'inGroupWith', 'exclusiveTo', 'zoneOrSort', 'requiredSkill', 'requiredMinRep',
    'requiredMaxRep', 'requiredSourceItems', 'nextQuestInChain', 'questFlags', 'specialFlags', 'parentQuest',
    'reputationReward', 'breadcrumbForQuestId', 'breadcrumbs', 'extraObjectives', 'requiredSpell',
    'requiredSpecialization', 'requiredMaxLevel', 'availableUntilCompleted', 'availableStartingWith',
    'requiredRanks', 'disabledByQuest',
  ],
  npc: [
    'name', 'minLevelHealth', 'maxLevelHealth', 'minLevel', 'maxLevel', 'rank', 'spawns', 'waypoints', 'zoneID',
    'questStarts', 'questEnds', 'factionID', 'friendlyToFaction', 'subName', 'npcFlags',
  ],
  object: ['name', 'questStarts', 'questEnds', 'spawns', 'zoneID', 'factionID', 'waypoints'],
  item: [
    'name', 'npcDrops', 'objectDrops', 'itemDrops', 'startQuest', 'questRewards', 'flags', 'foodType',
    'itemLevel', 'requiredLevel', 'ammoType', 'class', 'subClass', 'vendors', 'relatedQuests', 'teachesSpell',
  ],
};

// Número de campos que exige el contrato 4 (plano 4 §8, duda 9).
export const CAMPOS_ESPERADOS = { quest: 36, npc: 15, object: 7, item: 16 };

// Nombre del tipo en las claves del .toc (`X-<Tipo>-...`).
export const TIPO_TOC = { quest: 'Quest', npc: 'Npc', object: 'Object', item: 'Item' };

// Campos que van en clave propia `-<n>` (tablas), por número de campo (1-based).
export const TABLAS = {
  quest: [2, 3, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 21, 26, 28, 29, 35],
  npc: [7, 8, 10, 11],
  object: [2, 3, 4, 7],
  item: [2, 3, 4, 6, 14, 15],
};

// Campos de cadena (ausente = sin campo; el resto de escalares ausentes valen 0).
export const CADENAS = {
  quest: [1],
  npc: [1, 13, 14],
  object: [1],
  item: [1],
};

// Campos constantes que no se guardan en la fila (PNJ 2 = 0 y 3 = 1).
export const CONSTANTES = { npc: { 2: 0, 3: 1 } };

// Campos indexados por AreaID (spawns y rutas): se mantienen como objeto {areaId: [...]}.
export const POR_AREA = { npc: ['spawns', 'waypoints'], object: ['spawns', 'waypoints'] };

// Pares {id, valor} que valen nil cuando son {0, 0}.
export const PARES_NULOS = ['requiredSkill', 'requiredMinRep', 'requiredMaxRep'];

// Tablas que no son nunca nil en una misión que existe: se devuelven vacías.
export const SIEMPRE_TABLA = ['startedBy', 'finishedBy', 'objectives'];
