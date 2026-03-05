// ============================================================
// ONESHOT - DUNGEON MASTER ENGINE
// A stateful, character-aware narrative system with no API key
// ============================================================

const { v4: uuidv4 } = require('uuid');

// ============================================================
// CAMPAIGN TEMPLATES
// Each campaign has: intro, acts (with scenes), boss, ending
// ============================================================
const CAMPAIGNS = [
  {
    id: 'gloom_sewers',
    title: 'The Gloom Sewers',
    setting: 'sewer',
    mood: 'horror',
    estimatedRounds: 20,
    goal: 'Destroy the Plaguefather and cleanse the sewers',
    intro: [
      "The city of Mourne reeks of desperation. Three weeks ago, the sewers went silent — no rats, no workers, no sound. Now, a sickly green fog creeps through the grates at night. People are disappearing.",
      "You've been hired, threatened, or simply foolish enough to descend into The Gloom Sewers. Your goal: find the source of the corruption and destroy it. The city's last alchemist believes it's a creature called the Plaguefather — a rot-touched abomination growing in the deep chambers.",
      "One way in. One way out. Whatever happens down there — happens fast."
    ],
    acts: [
      {
        id: 'act1',
        name: 'Descent',
        scenes: ['sewer_entrance', 'first_encounter', 'trapped_passage', 'underground_market'],
        bossHint: "The walls are slick with something that glows faintly.",
      },
      {
        id: 'act2', 
        name: 'The Deep Dark',
        scenes: ['nest_chamber', 'flooded_corridor', 'prisoner_cell', 'fungal_grove'],
        bossHint: "The green light is brighter now. Something massive is breathing nearby.",
      },
      {
        id: 'act3',
        name: 'The Plaguefather',
        scenes: ['boss_approach', 'boss_fight', 'aftermath'],
        bossHint: null,
      }
    ],
    locations: {
      sewer_entrance: {
        name: 'The Iron Gate',
        descriptions: [
          "The iron gate groans as you force it open. The stench of rot hits like a fist. Somewhere below, water drips in an irregular rhythm. Green phosphorescence clings to the stone walls.",
          "Narrow walkways run alongside channels of black water. The ceiling is low — barely enough for a tall person to stand. Old pipes, crusted with mineral deposits, line the walls."
        ],
        encounters: ['sewer_rats', 'cursed_worker', null],
        exits: ['tunnel_a', 'tunnel_b'],
        secrets: ['hidden_cache', null, null]
      },
      first_encounter: {
        name: 'The Dripping Hall',
        descriptions: [
          "A long hall stretches before you. Alcoves line the walls — storage, once. Now they hold something else. You hear movement.",
          "The water here is ankle-deep and warm. That's wrong. Sewer water shouldn't be warm. The green glow pulses slowly, like a heartbeat."
        ],
        encounters: ['plague_rats', 'infected_worker', 'sewer_lurker'],
        exits: ['main_channel', 'maintenance_shaft'],
        secrets: ['alchemist_notes', null]
      },
      trapped_passage: {
        name: 'The Pressure Locks',
        descriptions: [
          "Old pressure locks — meant to control water flow — block the passage. Someone has jury-rigged them into a trap. A thin wire gleams in the green light.",
          "The mechanism is old but functional. Whoever set this wanted to slow something down. Or keep it in."
        ],
        encounters: [null, 'trap_triggered', null],
        exits: ['deep_tunnels'],
        secrets: ['bypass_lever', 'trapped_chest']
      },
      underground_market: {
        name: "Ratkin's Rest",
        descriptions: [
          "Impossible — but there it is. A cramped underground market, lit by stolen lanterns. Half a dozen ratkin traders eye you with cautious suspicion. They're refugees. From deeper down.",
          "A scarred ratkin matriarch approaches. 'You go deeper, yes? We sell. We know things. Cheap. Because we want you to succeed.'"
        ],
        encounters: [null, null, 'hostile_ratkin'],
        exits: ['deep_tunnels', 'secret_path'],
        secrets: ['map_fragment', 'healing_vendor']
      },
      nest_chamber: {
        name: 'The Brood Nest',
        descriptions: [
          "The chamber reeks of ammonia and decay. Eggs — roughly the size of a human head — line the walls in clusters of glistening membrane. They pulse gently.",
          "A massive brood-tender, bloated and wrong, circles the chamber protectively. It hasn't noticed you. Yet."
        ],
        encounters: ['brood_tender', 'hatching_young'],
        exits: ['flooded_corridor', 'vent_shaft'],
        secrets: ['stolen_equipment']
      },
      flooded_corridor: {
        name: 'The Black Water',
        descriptions: [
          "The corridor is flooded to chest height. The water is completely black and completely still. Your torch reflects off it like a mirror.",
          "Something moves under the surface. A long, slow shape. It might be a shadow. It might not be."
        ],
        encounters: ['blind_crawler', null, 'black_water_thing'],
        exits: ['fungal_grove'],
        secrets: ['sunken_lockbox']
      },
      prisoner_cell: {
        name: 'The Forgotten Cells',
        descriptions: [
          "Old cells, from when this sewer served as a dungeon annex. Most are empty. One isn't.",
          "A thin, pale figure cowers in the corner. Human. Barely. They've been down here a long time."
        ],
        encounters: [null, 'transformed_prisoner'],
        exits: ['fungal_grove', 'deep_tunnels'],
        secrets: ['prisoner_knowledge', 'cell_key']
      },
      fungal_grove: {
        name: 'The Plague Garden',
        descriptions: [
          "The tunnel opens into a vast chamber — and you stop breathing for a moment. It's beautiful, in a horrible way. Massive fungi, three meters tall, glow green and gold. Spores drift like snow.",
          "The air here is thick and sweet. Too sweet. The spores aren't just light — they're intoxicating. You feel your thoughts slow, soften. The green light pulses, welcoming."
        ],
        encounters: ['spore_cloud', 'fungal_guardian', 'mind_touched_cultist'],
        exits: ['boss_approach'],
        secrets: ['antidote_mushroom', 'cultist_diary']
      },
      boss_approach: {
        name: 'The Throne of Rot',
        descriptions: [
          "The final passage is wide enough for ten people abreast. The walls are entirely covered in living fungus. The green glow is blinding. The smell of sweet rot makes your eyes water.",
          "You can hear it now. Breathing. Wet and massive and slow. The Plaguefather is just ahead."
        ],
        encounters: ['plaguefather_spawn'],
        exits: ['boss_fight'],
        secrets: ['weakness_inscription']
      },
      boss_fight: {
        name: 'The Plaguefather',
        descriptions: [
          "IT TURNS. The Plaguefather is massive — eight feet of bloated, fungus-encrusted flesh, its face a ruin of teeth and glowing eyes. It SEES you. A sound emerges from it — not quite a roar, not quite words.",
          "'FLESH. SEED. GROW.' It raises one massive arm."
        ],
        encounters: ['plaguefather'],
        exits: ['aftermath'],
        secrets: ['heart_weakness']
      },
      aftermath: {
        name: 'The Silent Sewer',
        descriptions: [
          "Silence. Real silence, for the first time since you descended. The green glow fades. The fungus begins to wither.",
          "You've done it. The Plaguefather is dead. Now you just have to get out."
        ],
        encounters: [null],
        exits: ['surface'],
        secrets: ['plaguefather_hoard']
      }
    }
  },
  {
    id: 'cursed_manor',
    title: 'Ashveil Manor',
    setting: 'haunted_house',
    mood: 'mystery',
    estimatedRounds: 18,
    goal: 'Break the Ashveil Curse and free the trapped souls',
    intro: [
      "The Ashveil family was the wealthiest in the province — until the night of the Crimson Banquet, forty years ago. Every guest died at the table. The family vanished. The manor has stood empty since, behind iron gates no one dares open.",
      "Now someone has opened them. A flickering light moves through the upper windows at night. Local children have gone missing. And you've been sent — hired, cursed, or desperate — to find out why.",
      "The manor awaits. Its secrets are old, and they are hungry."
    ],
    acts: [
      {
        id: 'act1', name: 'The Grounds',
        scenes: ['manor_gate', 'garden_maze', 'servant_quarters', 'wine_cellar'],
        bossHint: "Portraits in the manor watch you. Their painted eyes move."
      },
      {
        id: 'act2', name: 'The Manor',
        scenes: ['grand_hall', 'library', 'master_bedroom', 'hidden_passage'],
        bossHint: "You find a diary. The last entry: 'It was never a ghost. It was never dead. We simply gave it a name.'"
      },
      {
        id: 'act3', name: 'The Crimson Truth',
        scenes: ['ritual_room', 'final_confrontation', 'escape'],
        bossHint: null
      }
    ],
    locations: {}
  },
  {
    id: 'sky_fortress',
    title: 'The Iron Citadel',
    setting: 'sky_fortress',
    mood: 'epic',
    estimatedRounds: 22,
    goal: 'Assassinate the Warlord and destroy the sky cannon',
    intro: [
      "Three months ago, an iron fortress appeared in the sky above the Thornwall Mountains. It floats on thundercloud and sorcery, and from its belly, a cannon has reduced two cities to rubble.",
      "The Warlord Keseph commands it. He has demanded surrender from every nation in the region. None have complied. None have survived refusal — yet.",
      "You've been given a way up. A stolen sky-skiff, docking codes, and one shot. Get inside. Kill Keseph. Destroy the cannon. Get out. In that order, ideally."
    ],
    acts: [
      {
        id: 'act1', name: 'Infiltration',
        scenes: ['sky_dock', 'barracks', 'engine_room', 'armory'],
        bossHint: "The guards here are too disciplined. Too quiet. Something has them scared."
      },
      {
        id: 'act2', name: 'The Citadel Interior',
        scenes: ['war_room', 'prisoner_hold', 'throne_antechamber', 'cannon_platform'],
        bossHint: "You find a prisoner — a former general. He says: 'Keseph isn't human anymore. Whatever the cannon runs on... it's been running on him.'"
      },
      {
        id: 'act3', name: 'Warlord\'s End',
        scenes: ['throne_room', 'cannon_destruction', 'escape_skiff'],
        bossHint: null
      }
    ],
    locations: {}
  }
];

// ============================================================
// CLASSES
// ============================================================
const CLASSES = {
  warrior: {
    name: 'Warrior',
    icon: '⚔️',
    description: 'Hardened fighter. High HP, high melee damage.',
    hp: 14,
    baseAttack: 3,
    baseDefense: 3,
    baseWisdom: 0,
    baseAgility: 1,
    perks: [
      { id: 'iron_skin', name: 'Iron Skin', description: 'Take 1 less damage from physical attacks', passive: true },
      { id: 'battle_cry', name: 'Battle Cry', description: 'Boost all allies +2 attack next roll (once per scene)', uses: 1 },
      { id: 'cleave', name: 'Cleave', description: 'On a nat 20, hit all enemies in the room', passive: true },
    ],
    rollBonuses: { attack: 3, defense: 2, persuasion: -1, stealth: -2, magic: -2, perception: 0 }
  },
  rogue: {
    name: 'Rogue',
    icon: '🗡️',
    description: 'Cunning shadow. Low HP, high stealth and critical hits.',
    hp: 8,
    baseAttack: 2,
    baseDefense: 1,
    baseWisdom: 1,
    baseAgility: 4,
    perks: [
      { id: 'sneak_attack', name: 'Sneak Attack', description: '+5 damage if attacking from stealth or advantage', passive: true },
      { id: 'shadow_step', name: 'Shadow Step', description: 'Move to any shadow in the room instantly (once per scene)', uses: 1 },
      { id: 'lockpick', name: 'Master Lockpick', description: 'Auto-succeed on locks and traps', passive: true },
    ],
    rollBonuses: { attack: 1, defense: -1, persuasion: 2, stealth: 5, magic: -1, perception: 2 }
  },
  mage: {
    name: 'Mage',
    icon: '🔮',
    description: 'Arcane scholar. Fragile but devastating spells.',
    hp: 6,
    baseAttack: 1,
    baseDefense: 0,
    baseWisdom: 5,
    baseAgility: 1,
    perks: [
      { id: 'arcane_blast', name: 'Arcane Blast', description: 'Ranged attack dealing 4d6 magic damage (once per scene)', uses: 1 },
      { id: 'spell_shield', name: 'Spell Shield', description: 'Block up to 8 damage once (once per combat)', uses: 1 },
      { id: 'identify', name: 'Arcane Sight', description: 'Auto-identify magic items and weak points', passive: true },
    ],
    rollBonuses: { attack: -1, defense: -2, persuasion: 1, stealth: -1, magic: 5, perception: 3 }
  },
  cleric: {
    name: 'Cleric',
    icon: '✨',
    description: 'Divine warrior. Healer and spiritual anchor for the party.',
    hp: 10,
    baseAttack: 2,
    baseDefense: 2,
    baseWisdom: 3,
    baseAgility: 0,
    perks: [
      { id: 'heal', name: 'Divine Heal', description: 'Restore 1d8+2 HP to yourself or an ally (twice per session)', uses: 2 },
      { id: 'turn_undead', name: 'Turn Undead', description: 'Force undead/cursed enemies to flee for one round', uses: 1 },
      { id: 'bless', name: 'Bless', description: 'Give all allies +2 to all rolls for one scene (once per session)', uses: 1 },
    ],
    rollBonuses: { attack: 1, defense: 2, persuasion: 3, stealth: -2, magic: 2, perception: 1 }
  },
  ranger: {
    name: 'Ranger',
    icon: '🏹',
    description: 'Wilderness hunter. Ranged attacks, tracking, and survival.',
    hp: 10,
    baseAttack: 3,
    baseDefense: 1,
    baseWisdom: 2,
    baseAgility: 3,
    perks: [
      { id: 'hunters_mark', name: "Hunter's Mark", description: '+3 to all attacks against one marked enemy', passive: false, uses: 1 },
      { id: 'volley', name: 'Volley', description: 'Attack all enemies in a group simultaneously', uses: 1 },
      { id: 'tracker', name: 'Expert Tracker', description: 'Always know where enemies are and what paths they use', passive: true },
    ],
    rollBonuses: { attack: 3, defense: 0, persuasion: -1, stealth: 2, magic: -1, perception: 4 }
  }
};

// ============================================================
// ENEMIES
// ============================================================
const ENEMIES = {
  sewer_rats: { name: 'Sewer Rats (Pack)', hp: 4, attack: 2, defense: 0, xp: 10, gold: 0, description: 'A writhing mass of bloated, diseased rats.' },
  cursed_worker: { name: 'Cursed Worker', hp: 8, attack: 4, defense: 1, xp: 20, gold: 5, description: 'A former sewer worker, eyes glowing green, moving wrong.' },
  plague_rats: { name: 'Plague Rats (Swarm)', hp: 12, attack: 5, defense: 0, xp: 30, gold: 0, description: 'Bigger than they should be. Much bigger.' },
  infected_worker: { name: 'Infected Worker', hp: 10, attack: 5, defense: 2, xp: 25, gold: 8, description: 'The infection has given them unnatural strength.' },
  sewer_lurker: { name: 'Sewer Lurker', hp: 16, attack: 7, defense: 3, xp: 50, gold: 15, description: 'Something evolved in the dark. Long limbs. No eyes.' },
  brood_tender: { name: 'Brood Tender', hp: 22, attack: 8, defense: 4, xp: 80, gold: 20, description: 'A massive, bloated creature protecting its eggs.' },
  hatching_young: { name: 'Hatching Young', hp: 5, attack: 3, defense: 0, xp: 15, gold: 0, description: 'Fresh from the egg. Hungry. Many.' },
  blind_crawler: { name: 'Blind Crawler', hp: 18, attack: 9, defense: 2, xp: 60, gold: 10, description: 'No eyes. Sonar-like senses. Patient as stone.' },
  black_water_thing: { name: 'The Drowned Thing', hp: 25, attack: 10, defense: 3, xp: 90, gold: 30, description: 'It was human once. The water changed it.' },
  transformed_prisoner: { name: 'Transformed Prisoner', hp: 14, attack: 6, defense: 2, xp: 40, gold: 5, description: 'They were a person. They might still be, somewhere inside.' },
  spore_cloud: { name: 'Spore Cloud', hp: 8, attack: 4, defense: 0, xp: 20, gold: 0, description: 'Alive. Hungry. Seeking lungs.' },
  fungal_guardian: { name: 'Fungal Guardian', hp: 28, attack: 9, defense: 5, xp: 100, gold: 25, description: 'Shaped from pure fungus. Ancient. Purposeful.' },
  mind_touched_cultist: { name: 'Mind-Touched Cultist', hp: 12, attack: 7, defense: 2, xp: 45, gold: 12, description: 'They came down willingly. They serve willingly.' },
  plaguefather_spawn: { name: "Plaguefather's Chosen", hp: 20, attack: 8, defense: 4, xp: 70, gold: 20, description: 'The Plaguefather\'s elite guard. Infected beyond saving.' },
  plaguefather: { name: 'THE PLAGUEFATHER', hp: 60, attack: 12, defense: 6, xp: 500, gold: 200, isBoss: true, description: 'Massive. Ancient. The source of all the corruption. It speaks.' },
  hostile_ratkin: { name: 'Ratkin Warriors', hp: 10, attack: 5, defense: 2, xp: 30, gold: 8, description: 'Small but fierce. They fight dirty.' },
};

// ============================================================
// NARRATIVE TEMPLATES
// Context-aware descriptions the DM uses
// ============================================================
const NARRATIVE = {
  // Roll outcome flavors
  roll_critical_success: [
    "A PERFECT ROLL. Fortune smiles on the bold.",
    "FLAWLESS. Whatever you attempted, you nailed it with impossible precision.",
    "CRITICAL SUCCESS. The universe bends to your will, just this once.",
    "NAT 20. Everything goes exactly as you hoped — and then some.",
  ],
  roll_great_success: [
    "A solid result. You succeed, and it feels good.",
    "Strong effort — you pull it off with room to spare.",
    "Good enough and then some. It works.",
  ],
  roll_partial_success: [
    "Mostly there. It works, but not cleanly.",
    "You succeed, but there's a cost. There's always a cost.",
    "Close enough. But something's not quite right.",
  ],
  roll_failure: [
    "The dice are cruel. You fail.",
    "It doesn't work. Back to the drawing board.",
    "Not today. The attempt fails.",
  ],
  roll_critical_failure: [
    "CRITICAL FAILURE. Something has gone terribly wrong.",
    "NAT 1. The universe has decided to make an example of you.",
    "DISASTER. This will be a story you tell later — if you survive.",
  ],
  // Action interpretations
  attack_verbs: ['strikes', 'slashes', 'smashes', 'drives a blade into', 'hammers', 'tears into', 'unleashes on'],
  miss_verbs: ['misses', 'glances off', 'is deflected', 'slides wide', 'fails to connect'],
  // Environment reactions
  search_found: [
    "Your search pays off.",
    "There it is — something others would have missed.",
    "Sharp eyes. You find something useful.",
  ],
  search_empty: [
    "Nothing. The room gives up none of its secrets.",
    "Either there's nothing here, or it's hidden too well.",
    "Empty. Move on.",
  ],
  // Player actions to narrative
  action_move: ['advances', 'moves', 'steps', 'creeps', 'strides', 'rushes'],
  action_look: ['examines', 'inspects', 'studies', 'scans', 'peers at'],
  // Scene transitions
  scene_transitions: [
    "You press deeper.",
    "The path leads on.",
    "There's no going back now.",
    "The next chamber awaits.",
    "Forward. Always forward.",
  ]
};

// ============================================================
// ACTION PARSER
// Reads player text and extracts intent
// ============================================================
function parseAction(text) {
  const lower = text.toLowerCase().trim();
  
  // Intent categories
  const intents = {
    attack: /\b(attack|hit|strike|kill|fight|stab|slash|shoot|blast|cast|spell|swing|punch|kick|smash|destroy)\b/,
    stealth: /\b(sneak|hide|shadow|silent|quiet|invisible|stealthy|creep)\b/,
    search: /\b(search|look|examine|inspect|check|find|investigate|explore|scan|investigate)\b/,
    persuade: /\b(talk|speak|convince|persuade|negotiate|reason|plead|charm|intimidate|threaten|ask)\b/,
    move: /\b(go|move|walk|run|advance|approach|enter|leave|exit|head|proceed)\b/,
    use: /\b(use|apply|drink|consume|activate|open|unlock|pull|push|grab|take|pick up|throw|place)\b/,
    heal: /\b(heal|bandage|rest|patch|cure|tend)\b/,
    defend: /\b(defend|block|dodge|duck|parry|shield|protect)\b/,
    loot: /\b(loot|grab|take|steal|pocket|search body|search the)\b/,
    perception: /\b(listen|hear|smell|sense|feel|detect|notice)\b/,
  };

  for (const [intent, regex] of Object.entries(intents)) {
    if (regex.test(lower)) {
      return { intent, raw: text };
    }
  }
  return { intent: 'generic', raw: text };
}

// ============================================================
// DICE SYSTEM
// ============================================================
function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function rollDice(sides, count = 1) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

function getRollTier(roll) {
  if (roll === 20) return 'critical_success';
  if (roll >= 15) return 'great_success';
  if (roll >= 10) return 'partial_success';
  if (roll >= 5) return 'failure';
  return 'critical_failure';
}

function getModifiedRoll(baseRoll, character, rollType) {
  const bonus = character.class ? CLASSES[character.class].rollBonuses[rollType] || 0 : 0;
  const statBonus = character.stats ? Math.floor((character.stats.level - 1) * 0.5) : 0;
  return Math.min(20, Math.max(1, baseRoll + bonus + statBonus));
}

// ============================================================
// DM RESPONSE GENERATOR
// The core of the game — turns player actions into narrative
// ============================================================
function generateDMResponse(action, gameState) {
  const { intent, raw } = parseAction(action.text);
  const player = gameState.players[action.playerId];
  const campaign = CAMPAIGNS.find(c => c.id === gameState.campaignId);
  const currentScene = gameState.currentScene;
  const sceneData = campaign?.locations[currentScene];
  
  let roll = rollD20();
  let rollType = intentToRollType(intent);
  let modifiedRoll = getModifiedRoll(roll, player, rollType);
  let tier = getRollTier(modifiedRoll);
  
  // Build context for the response
  const playerName = player?.name || 'Adventurer';
  const className = player?.class ? CLASSES[player.class].name : 'Fighter';
  const actionFlavor = pick(NARRATIVE[`roll_${tier}`]);
  
  // Build the narrative response
  let narrative = buildNarrative(intent, tier, raw, player, gameState, sceneData);
  
  // Check for combat
  let combatResult = null;
  if (intent === 'attack' && gameState.activeEnemies?.length > 0) {
    combatResult = resolveCombat(player, gameState, modifiedRoll, tier);
  }
  
  // Check scene progression
  let sceneProgression = checkSceneProgression(gameState, intent, tier);
  
  return {
    narrative,
    roll: { value: roll, modified: modifiedRoll, type: rollType, tier },
    flavor: actionFlavor,
    combatResult,
    sceneProgression,
    playerName,
    className
  };
}

function intentToRollType(intent) {
  const map = {
    attack: 'attack',
    stealth: 'stealth',
    search: 'perception',
    persuade: 'persuasion',
    move: 'agility',
    use: 'perception',
    heal: 'magic',
    defend: 'defense',
    loot: 'perception',
    perception: 'perception',
    generic: 'perception'
  };
  return map[intent] || 'perception';
}

function buildNarrative(intent, tier, rawAction, player, gameState, sceneData) {
  const playerName = player?.name || 'You';
  const location = sceneData?.name || gameState.currentScene || 'this dark place';
  
  // Extract target from action text
  const actionText = rawAction.toLowerCase();
  
  const responses = {
    attack: {
      critical_success: [
        `**${playerName}** moves with terrifying precision. The attack lands with devastating force — a perfect strike that would make veterans weep. The enemy staggers, critically wounded.`,
        `The ${player?.class === 'mage' ? 'spell' : 'blow'} connects with *absolute perfection*. Whatever ${playerName} aimed at takes the full brunt. Bones crack. Something vital breaks.`,
      ],
      great_success: [
        `**${playerName}** lands a solid hit. The attack connects cleanly, dealing real damage. The enemy is hurt — not finished, but hurting.`,
        `Clean strike. **${playerName}** finds the gap in the defenses and drives through it. The enemy reels.`,
      ],
      partial_success: [
        `**${playerName}** connects, but not cleanly. The attack lands — barely — dealing some damage but leaving an opening. The enemy counterattacks.`,
        `A glancing blow. **${playerName}** hits, but not with full force. It stings the enemy, but also costs — they retaliate.`,
      ],
      failure: [
        `**${playerName}** swings wide. The attack misses completely, and the enemy uses the moment to gain better footing.`,
        `The attempt fails. **${playerName}** can't find the angle, and the enemy is already moving.`,
      ],
      critical_failure: [
        `**${playerName}**'s attack goes catastrophically wrong. The weapon snags, the footing slips — for a terrible moment, the enemy has a perfect opening. This is going to hurt.`,
        `CRITICAL MISS. **${playerName}** overextends completely. The enemy doesn't just avoid it — they take full advantage.`,
      ]
    },
    stealth: {
      critical_success: [
        `**${playerName}** becomes shadow itself. Movement is silent, presence is nothing. Not even the most alert guard would notice.`,
        `Perfect stealth. **${playerName}** moves through the ${location} like a ghost, unseen and unheard.`,
      ],
      great_success: [
        `**${playerName}** slips through the shadows effectively. No one notices. For now.`,
        `Good form. **${playerName}** stays hidden and gets into position undetected.`,
      ],
      partial_success: [
        `**${playerName}** is mostly hidden — but makes a small sound. Something heard it. It's looking, but hasn't found anything yet.`,
        `Close. **${playerName}** nearly blew the cover — but managed to press back into shadow just in time. For now.`,
      ],
      failure: [
        `**${playerName}** is spotted. The attempt at stealth fails, and now something knows exactly where they are.`,
        `No good. **${playerName}**'s movement is heard. Something turns.`,
      ],
      critical_failure: [
        `**${playerName}** stumbles directly into view — possibly makes a sound, possibly knocks something over. Every eye in the room turns.`,
        `DISASTER. **${playerName}** is not only spotted — they've made enough noise to alert things nearby.`,
      ]
    },
    search: {
      critical_success: [
        `**${playerName}**'s search is exceptional. They find everything there is to find — and something others would have certainly missed.`,
        `Nothing escapes **${playerName}**'s notice. Every secret in this part of the ${location} is laid bare.`,
      ],
      great_success: [
        `A thorough search. **${playerName}** finds something useful hidden in the ${location}.`,
        `Sharp eyes. **${playerName}** locates what they were looking for — and it's exactly where you'd least expect it.`,
      ],
      partial_success: [
        `**${playerName}** finds *something* — though it's not exactly what they were hoping for. It might still be useful.`,
        `A partial success. **${playerName}** turns up something, though the search took longer than ideal.`,
      ],
      failure: [
        `**${playerName}** searches the area but comes up empty. Either there's nothing here, or it's hidden too well.`,
        `Nothing found. **${playerName}** searches, but the ${location} gives up none of its secrets today.`,
      ],
      critical_failure: [
        `**${playerName}**'s search disturbs something better left undisturbed. Whatever was hidden here wasn't meant to be found.`,
        `The search triggers something — a hidden trap, a noise, a reaction from the environment itself.`,
      ]
    },
    persuade: {
      critical_success: [
        `**${playerName}**'s words hit exactly right. Whatever they needed — information, compliance, trust — they get it, and then some.`,
        `Masterful. **${playerName}** reads the situation perfectly and says exactly the right thing at the right time.`,
      ],
      great_success: [
        `**${playerName}** makes a compelling case. The target is convinced. It works.`,
        `Effective persuasion. **${playerName}**'s approach lands, and they get what they were after.`,
      ],
      partial_success: [
        `**${playerName}** partially succeeds — they get *something* from the exchange, but not everything they hoped for. The target is cautious.`,
        `Mixed results. **${playerName}**'s words have some effect, but the target isn't fully swayed.`,
      ],
      failure: [
        `**${playerName}**'s attempt at persuasion falls flat. The words land wrong, and the target shuts down.`,
        `It doesn't work. **${playerName}** misjudged the approach, and now the situation is harder than before.`,
      ],
      critical_failure: [
        `**${playerName}** says exactly the wrong thing. The target is now actively hostile — and knows what the party is up to.`,
        `CRITICAL FAILURE. The attempt at persuasion backfires catastrophically. Things just got significantly more complicated.`,
      ]
    },
    move: {
      critical_success: [
        `**${playerName}** moves with complete control — perfectly quiet, perfectly timed. No one and nothing notices.`,
        `Flawless movement. **${playerName}** reaches the destination exactly as intended.`,
      ],
      great_success: [
        `**${playerName}** moves smoothly through the ${location}. Clean and easy.`,
        `No problems. **${playerName}** gets where they're going without incident.`,
      ],
      partial_success: [
        `**${playerName}** reaches their destination, but not without issue — something shifts, something sees them move, something changes.`,
        `They make it — but not cleanly. The movement costs something.`,
      ],
      failure: [
        `**${playerName}**'s movement is blocked or interrupted. Something stands in the way, or the path proves more dangerous than expected.`,
        `It doesn't go as planned. **${playerName}** encounters an obstacle.`,
      ],
      critical_failure: [
        `**${playerName}** moves directly into danger. Whatever they were trying to avoid, they've run straight into it.`,
        `DISASTER. The movement goes catastrophically wrong — a fall, a collision, a stumble into enemy territory.`,
      ]
    },
    generic: {
      critical_success: [
        `**${playerName}** acts decisively and it works better than anyone could have hoped.`,
        `Whatever **${playerName}** was trying to do — it worked. Perfectly.`,
      ],
      great_success: [
        `**${playerName}**'s action succeeds cleanly.`,
        `It works. **${playerName}** pulls it off.`,
      ],
      partial_success: [
        `**${playerName}** partially succeeds. The outcome is mixed.`,
        `Sort of works. **${playerName}** gets part of what they were after.`,
      ],
      failure: [
        `**${playerName}**'s attempt fails.`,
        `It doesn't work out for **${playerName}** this time.`,
      ],
      critical_failure: [
        `**${playerName}**'s attempt fails catastrophically. Something has gone very wrong.`,
        `DISASTER. **${playerName}**'s action has made things significantly worse.`,
      ]
    }
  };
  
  const intentKey = responses[intent] ? intent : 'generic';
  const tierResponses = responses[intentKey][tier];
  return pick(tierResponses);
}

function resolveCombat(player, gameState, roll, tier) {
  if (!gameState.activeEnemies || gameState.activeEnemies.length === 0) return null;
  
  const enemy = gameState.activeEnemies[0];
  const enemyData = ENEMIES[enemy.type] || enemy;
  
  let playerDamage = 0;
  let enemyDamage = 0;
  
  // Calculate player damage
  if (tier === 'critical_success') {
    playerDamage = rollDice(6, 2) + (CLASSES[player.class]?.baseAttack || 2) + 5;
  } else if (tier === 'great_success') {
    playerDamage = rollDice(6, 1) + (CLASSES[player.class]?.baseAttack || 2) + 2;
  } else if (tier === 'partial_success') {
    playerDamage = rollDice(4, 1) + (CLASSES[player.class]?.baseAttack || 1);
    enemyDamage = Math.max(0, rollDice(6, 1) + Math.floor(enemyData.attack / 2) - (CLASSES[player.class]?.baseDefense || 1));
  } else if (tier === 'failure') {
    enemyDamage = Math.max(0, rollDice(6, 1) + enemyData.attack - (CLASSES[player.class]?.baseDefense || 1));
  } else if (tier === 'critical_failure') {
    enemyDamage = Math.max(0, rollDice(8, 2) + enemyData.attack - (CLASSES[player.class]?.baseDefense || 1));
  }
  
  return {
    playerDamage,
    enemyDamage,
    enemyName: enemyData.name,
    enemyCurrentHp: enemy.currentHp - playerDamage,
    enemyMaxHp: enemyData.hp,
    enemyDefeated: (enemy.currentHp - playerDamage) <= 0
  };
}

function checkSceneProgression(gameState, intent, tier) {
  // Progress scene if player has been active and got a good roll
  const sceneActions = gameState.sceneActionCount || 0;
  if (sceneActions >= 3 && (tier === 'great_success' || tier === 'critical_success') && intent === 'move') {
    return { shouldProgress: true, transition: pick(NARRATIVE.scene_transitions) };
  }
  return { shouldProgress: false };
}

// ============================================================
// SCENE INTRODUCTION GENERATOR
// ============================================================
function generateSceneIntro(campaignId, sceneId, gameState) {
  const campaign = CAMPAIGNS.find(c => c.id === campaignId);
  if (!campaign) return "You find yourselves in unfamiliar territory.";
  
  const sceneData = campaign.locations[sceneId];
  if (!sceneData) {
    // Generic scene generation for campaigns with sparse data
    return generateGenericScene(campaign, sceneId, gameState);
  }
  
  const desc = pick(sceneData.descriptions);
  
  // Check for enemies
  const enemyRoll = Math.random();
  let enemyIntro = '';
  const possibleEnemies = sceneData.encounters.filter(e => e !== null);
  
  if (possibleEnemies.length > 0 && enemyRoll > 0.3) {
    const enemyType = pick(possibleEnemies);
    const enemy = ENEMIES[enemyType];
    if (enemy) {
      enemyIntro = `\n\n⚠️ **${enemy.name}** is here. *${enemy.description}*`;
    }
  }
  
  // Check for secrets
  const secretRoll = Math.random();
  let secretHint = '';
  const possibleSecrets = sceneData.secrets?.filter(s => s !== null) || [];
  if (possibleSecrets.length > 0 && secretRoll > 0.5) {
    secretHint = "\n\n🔍 *Something in this room catches your attention. There may be more here than meets the eye.*";
  }
  
  return desc + enemyIntro + secretHint;
}

function generateGenericScene(campaign, sceneId, gameState) {
  const settings = {
    haunted_house: [
      "Dust motes drift in cold, still air. The floorboards groan under your weight. Portraits on the walls seem to watch.",
      "A long corridor stretches ahead. The wallpaper — once fine, now peeling — shows faded hunting scenes. Something moved at the far end.",
      "This room was grand once. Now it's a ruin of fallen plaster and broken furniture. A cold draft comes from nowhere."
    ],
    sky_fortress: [
      "Iron walls, riveted and humming with some arcane energy. The floor vibrates constantly — engines, somewhere below.",
      "A vast chamber, utilitarian and cold. Weapon racks, empty. Supply crates, half-opened. The garrison moved through here recently.",
      "Observation windows reveal the dizzying drop to the mountains below. The fortress is high enough that clouds drift past at eye level."
    ],
    sewer: [
      "Narrow stone passage, ankle-deep in black water. The green phosphorescence is your only light.",
      "A larger chamber opens up, dripping from every surface. Old pipes, encrusted with mineral and worse.",
      "A collapsed section has created a natural barrier. Getting past it will require care — or force."
    ]
  };
  
  return pick(settings[campaign.setting] || settings.sewer);
}

// ============================================================
// CAMPAIGN INTRO
// ============================================================
function getCampaignIntro(campaignId) {
  const campaign = CAMPAIGNS.find(c => c.id === campaignId);
  if (!campaign) return { title: 'Unknown', intro: 'The adventure begins.' };
  return {
    title: campaign.title,
    goal: campaign.goal,
    intro: campaign.intro.join('\n\n'),
    firstScene: campaign.acts[0].scenes[0]
  };
}

// ============================================================
// UTILITY
// ============================================================
function pick(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  CAMPAIGNS,
  CLASSES,
  ENEMIES,
  rollD20,
  rollDice,
  getRollTier,
  getModifiedRoll,
  parseAction,
  generateDMResponse,
  generateSceneIntro,
  getCampaignIntro,
  pick,
  NARRATIVE
};
