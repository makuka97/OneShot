const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const {
  CAMPAIGNS, CLASSES, ENEMIES,
  rollD20, rollDice, getRollTier, getModifiedRoll,
  parseAction, generateDMResponse, generateSceneIntro,
  getCampaignIntro, pick
} = require('./dm-engine');

const { initGroq, askGroqDM, askGroqSceneIntro, askGroqCampaignOpening } = require('./groq-dm');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const groqEnabled = initGroq();

// ── STATE ─────────────────────────────────────────────────────
const lobbies = new Map();
const playerSockets = new Map();

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createPlayer(id, socketId, name, isHost = false) {
  return { id, socketId, name, isHost, ready: false, characterCreated: false, class: null, characterName: '', stats: { hp: 0, maxHp: 0, gold: 0, level: 1, xp: 0 }, perks: [], activePerks: {}, backstory: '', disconnected: false };
}

function createLobby(hostSocketId, hostName) {
  const lobbyId = generateLobbyCode();
  const hostPlayerId = uuidv4();
  const lobby = { id: lobbyId, hostPlayerId, status: 'lobby', players: { [hostPlayerId]: createPlayer(hostPlayerId, hostSocketId, hostName, true) }, campaignId: null, gameState: null, chatHistory: [], createdAt: Date.now() };
  lobbies.set(lobbyId, lobby);
  playerSockets.set(hostSocketId, { lobbyId, playerId: hostPlayerId });
  return { lobby, playerId: hostPlayerId };
}

function joinLobby(lobbyId, socketId, playerName) {
  const lobby = lobbies.get(lobbyId.toUpperCase());
  if (!lobby) return { error: 'Lobby not found. Check your code.' };
  if (lobby.status !== 'lobby') return { error: 'This game has already started.' };
  if (Object.keys(lobby.players).length >= 4) return { error: 'Lobby is full (max 4 players).' };
  const playerId = uuidv4();
  lobby.players[playerId] = createPlayer(playerId, socketId, playerName, false);
  playerSockets.set(socketId, { lobbyId: lobby.id, playerId });
  return { lobby, playerId };
}

function initGameState(lobby) {
  const campaign = CAMPAIGNS.find(c => c.id === lobby.campaignId);
  const firstScene = campaign.acts[0].scenes[0];
  return { campaignId: lobby.campaignId, currentAct: 0, currentSceneIndex: 0, currentScene: firstScene, sceneActionCount: 0, activeEnemies: [], defeatedEnemies: [], round: 0, phase: 'exploration', campaignComplete: false };
}

// ── SOCKET EVENTS ─────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('create_lobby', ({ playerName }) => {
    const { lobby, playerId } = createLobby(socket.id, playerName);
    socket.join(lobby.id);
    socket.emit('lobby_created', { lobbyId: lobby.id, playerId, lobby: serializeLobby(lobby) });
  });

  socket.on('join_lobby', ({ lobbyId, playerName }) => {
    const result = joinLobby(lobbyId, socket.id, playerName);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(result.lobby.id);
    socket.emit('lobby_joined', { lobbyId: result.lobby.id, playerId: result.playerId, lobby: serializeLobby(result.lobby) });
    socket.to(result.lobby.id).emit('player_joined', { player: result.lobby.players[result.playerId], lobby: serializeLobby(result.lobby) });
  });

  socket.on('select_class', ({ classId, characterName, backstory }) => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby) return;
    const player = lobby.players[info.playerId];
    if (!player) return;
    const classData = CLASSES[classId];
    if (!classData) return;
    player.class = classId; player.characterName = characterName || player.name; player.backstory = backstory || '';
    player.stats.hp = classData.hp; player.stats.maxHp = classData.hp; player.stats.gold = 30 + rollDice(10);
    player.perks = [...classData.perks]; player.activePerks = {};
    classData.perks.forEach(p => { if (p.uses) player.activePerks[p.id] = p.uses; });
    player.characterCreated = true;
    io.to(lobby.id).emit('player_updated', { playerId: info.playerId, player, lobby: serializeLobby(lobby) });
  });

  socket.on('set_ready', ({ ready }) => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby) return;
    lobby.players[info.playerId].ready = ready;
    io.to(lobby.id).emit('lobby_updated', serializeLobby(lobby));
  });

  socket.on('select_campaign', ({ campaignId }) => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby || !lobby.players[info.playerId]?.isHost) return;
    lobby.campaignId = campaignId;
    io.to(lobby.id).emit('campaign_selected', { campaignId, lobby: serializeLobby(lobby) });
  });

  socket.on('start_game', async () => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby || !lobby.players[info.playerId]?.isHost) return;
    if (!lobby.campaignId) { socket.emit('error', { message: 'Select a campaign first' }); return; }
    if (!Object.values(lobby.players).every(p => p.characterCreated)) { socket.emit('error', { message: 'All players must create characters first' }); return; }

    lobby.status = 'in_game';
    lobby.gameState = initGameState(lobby);
    const campaignData = getCampaignIntro(lobby.campaignId);

    io.to(lobby.id).emit('game_started', { lobby: serializeLobby(lobby), campaignTitle: campaignData.title, campaignGoal: campaignData.goal, firstScene: campaignData.firstScene });
    io.to(lobby.id).emit('dm_typing', true);

    let openingText = groqEnabled ? await askGroqCampaignOpening(lobby, lobby.gameState) : null;
    if (!openingText) openingText = campaignData.intro + '\n\n*Your goal: ' + campaignData.goal + '*\n\n' + generateSceneIntro(lobby.campaignId, campaignData.firstScene, lobby.gameState);

    io.to(lobby.id).emit('dm_typing', false);
    const msg = addDMMessage(lobby, openingText);
    io.to(lobby.id).emit('message', msg);
  });

  socket.on('player_action', async ({ text }) => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby || lobby.status !== 'in_game') return;
    const player = lobby.players[info.playerId];
    if (!player || player.stats.hp <= 0) { socket.emit('error', { message: 'You are incapacitated!' }); return; }

    const playerMsg = { id: uuidv4(), type: 'player', playerId: info.playerId, playerName: player.characterName || player.name, playerClass: player.class, text, timestamp: Date.now() };
    lobby.chatHistory.push(playerMsg);
    io.to(lobby.id).emit('message', playerMsg);

    // Roll
    const { intent } = parseAction(text);
    const rollTypeMap = { attack: 'attack', stealth: 'stealth', search: 'perception', persuade: 'persuasion', move: 'agility', use: 'perception', heal: 'magic', defend: 'defense', loot: 'perception', perception: 'perception', generic: 'perception' };
    const rollType = rollTypeMap[intent] || 'perception';
    const rawRoll = rollD20();
    const modifiedRoll = getModifiedRoll(rawRoll, player, rollType);
    const tier = getRollTier(modifiedRoll);

    io.to(lobby.id).emit('roll_result', { playerId: info.playerId, playerName: player.characterName || player.name, roll: rawRoll, modified: modifiedRoll, tier, rollType });

    // Combat
    let combatResult = null;
    if (lobby.gameState.activeEnemies?.length > 0) {
      combatResult = resolveCombat(player, lobby.gameState, modifiedRoll, tier);
      if (combatResult) {
        if (combatResult.enemyDamage > 0) {
          let dmg = combatResult.enemyDamage;
          if (player.class === 'warrior') dmg = Math.max(0, dmg - 1);
          player.stats.hp = Math.max(0, player.stats.hp - dmg);
        }
        const enemy = lobby.gameState.activeEnemies[0];
        if (enemy) {
          enemy.currentHp = Math.max(0, enemy.currentHp - combatResult.playerDamage);
          if (enemy.currentHp <= 0) {
            const eData = ENEMIES[enemy.type] || {};
            lobby.gameState.defeatedEnemies.push({ ...enemy });
            lobby.gameState.activeEnemies.shift();
            const share = Math.max(1, Object.keys(lobby.players).length);
            Object.values(lobby.players).forEach(p => { if (p.stats.hp > 0) { p.stats.gold += Math.floor((eData.gold || 0) / share); p.stats.xp = (p.stats.xp || 0) + Math.floor((eData.xp || 0) / share); } });
          }
        }
        io.to(lobby.id).emit('stats_updated', { players: serializePlayers(lobby.players) });
      }
    }

    // Level check
    Object.values(lobby.players).forEach(p => {
      if (p.stats.xp >= p.stats.level * 100) {
        p.stats.level++; p.stats.maxHp += 2; p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + 2);
        const lm = addDMMessage(lobby, `✨ **${p.characterName || p.name}** reached **Level ${p.stats.level}**!`);
        io.to(lobby.id).emit('message', lm);
      }
    });

    lobby.gameState.round++;
    lobby.gameState.sceneActionCount++;

    io.to(lobby.id).emit('dm_typing', true);
    let narrative = groqEnabled ? await askGroqDM(text, player, lobby, lobby.gameState, rawRoll, modifiedRoll, tier) : null;
    if (!narrative) {
      const local = generateDMResponse({ text, playerId: info.playerId }, { ...lobby.gameState, players: lobby.players });
      narrative = `*${local.flavor}*\n\n${local.narrative}`;
    }

    // Append combat note
    if (combatResult) {
      if (combatResult.playerDamage > 0) {
        narrative += combatResult.enemyDefeated
          ? `\n\n⚔️ **${combatResult.enemyName}** — **DESTROYED** 💀`
          : `\n\n⚔️ **${combatResult.enemyName}** takes **${combatResult.playerDamage} dmg** (${Math.max(0, combatResult.enemyCurrentHp)} HP left)`;
      }
      if (combatResult.enemyDamage > 0) {
        narrative += `\n💢 **${player.characterName || player.name}** takes **${combatResult.enemyDamage} dmg**`;
        if (player.stats.hp <= 0) narrative += ' — **INCAPACITATED** 💀';
      }
    }

    io.to(lobby.id).emit('dm_typing', false);
    const dmMsg = addDMMessage(lobby, narrative);
    io.to(lobby.id).emit('message', dmMsg);

    if (lobby.gameState.sceneActionCount >= 4 && (tier === 'great_success' || tier === 'critical_success') && intent === 'move') {
      await progressScene(lobby);
    }
    checkGameConditions(lobby);
  });

  socket.on('use_perk', async ({ perkId }) => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby) return;
    const player = lobby.players[info.playerId];
    if (!player) return;
    const perk = player.perks?.find(p => p.id === perkId);
    if (!perk || perk.passive) return;
    const uses = player.activePerks[perkId];
    if (uses !== undefined && uses <= 0) { socket.emit('error', { message: 'That ability is spent.' }); return; }
    if (uses !== undefined) player.activePerks[perkId]--;

    let effect = '';
    if (perkId === 'heal') { const hp = rollDice(8)+2; player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp+hp); effect = `heals **${hp} HP**`; }
    else if (perkId === 'arcane_blast') { const d = rollDice(6,4); effect = `fires arcane blast for **${d} damage**`; if (lobby.gameState.activeEnemies?.length>0){lobby.gameState.activeEnemies[0].currentHp-=d; if(lobby.gameState.activeEnemies[0].currentHp<=0){effect+=' — **DESTROYED** 💀'; lobby.gameState.activeEnemies.shift();}}}
    else if (perkId === 'battle_cry') effect = 'unleashes a battle cry — all allies +2 attack';
    else if (perkId === 'spell_shield') effect = 'raises a spell shield (8 damage blocked)';
    else if (perkId === 'shadow_step') effect = 'vanishes with shadow step';
    else if (perkId === 'turn_undead') effect = 'turns undead — they flee';
    else if (perkId === 'bless') effect = 'bestows a blessing — all allies +2';
    else if (perkId === 'volley') { const d=rollDice(6,2)+3; effect=`fires volley for **${d} total damage**`; }
    else if (perkId === 'hunters_mark') effect = 'marks target — +3 attack against them';
    else effect = `uses ${perk.name}`;

    io.to(lobby.id).emit('stats_updated', { players: serializePlayers(lobby.players) });
    io.to(lobby.id).emit('dm_typing', true);
    const actionText = `${player.characterName || player.name} uses ${perk.name}: ${effect}`;
    let narrative = groqEnabled ? await askGroqDM(actionText, player, lobby, lobby.gameState, 18, 18, 'great_success') : null;
    io.to(lobby.id).emit('dm_typing', false);
    const msg = addDMMessage(lobby, narrative || `✨ **${player.characterName || player.name}** ${effect}!`);
    io.to(lobby.id).emit('message', msg);
  });

  // WebRTC
  socket.on('voice_offer', ({ targetSocketId, offer }) => io.to(targetSocketId).emit('voice_offer', { fromSocketId: socket.id, offer }));
  socket.on('voice_answer', ({ targetSocketId, answer }) => io.to(targetSocketId).emit('voice_answer', { fromSocketId: socket.id, answer }));
  socket.on('voice_ice_candidate', ({ targetSocketId, candidate }) => io.to(targetSocketId).emit('voice_ice_candidate', { fromSocketId: socket.id, candidate }));
  socket.on('voice_toggle', ({ muted }) => { const info = playerSockets.get(socket.id); if (info) socket.to(info.lobbyId).emit('player_voice_toggle', { socketId: socket.id, muted }); });
  socket.on('player_speaking', ({ speaking }) => { const info = playerSockets.get(socket.id); if (info) socket.to(info.lobbyId).emit('player_speaking', { socketId: socket.id, speaking }); });
  socket.on('voice_peer_left', () => { const info = playerSockets.get(socket.id); if (info) socket.to(info.lobbyId).emit('voice_peer_left', { socketId: socket.id }); });

  socket.on('chat_message', ({ text }) => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (!lobby) return;
    const player = lobby.players[info.playerId];
    const msg = { id: uuidv4(), type: 'chat', playerId: info.playerId, playerName: player?.name || 'Unknown', text, timestamp: Date.now() };
    lobby.chatHistory.push(msg);
    io.to(lobby.id).emit('message', msg);
  });

  socket.on('disconnect', () => {
    const info = playerSockets.get(socket.id);
    if (!info) return;
    const lobby = lobbies.get(info.lobbyId);
    if (lobby?.players[info.playerId]) { lobby.players[info.playerId].disconnected = true; socket.to(lobby.id).emit('player_disconnected', { playerId: info.playerId }); }
    playerSockets.delete(socket.id);
  });
});

// ── HELPERS ───────────────────────────────────────────────────
function addDMMessage(lobby, text) {
  const msg = { id: uuidv4(), type: 'dm', text, timestamp: Date.now() };
  lobby.chatHistory.push(msg);
  return msg;
}

function resolveCombat(player, gameState, roll, tier) {
  if (!gameState.activeEnemies?.length) return null;
  const enemy = gameState.activeEnemies[0];
  const eData = ENEMIES[enemy.type] || { attack: 5, defense: 2, name: 'Enemy', hp: 10 };
  const cls = CLASSES[player.class] || {};
  let playerDamage = 0, enemyDamage = 0;
  if (tier === 'critical_success') playerDamage = rollDice(6,2) + (cls.baseAttack||2) + 5;
  else if (tier === 'great_success') playerDamage = rollDice(6) + (cls.baseAttack||2) + 2;
  else if (tier === 'partial_success') { playerDamage = rollDice(4) + (cls.baseAttack||1); enemyDamage = Math.max(0, rollDice(6) + Math.floor(eData.attack/2) - (cls.baseDefense||1)); }
  else if (tier === 'failure') enemyDamage = Math.max(0, rollDice(6) + eData.attack - (cls.baseDefense||1));
  else if (tier === 'critical_failure') enemyDamage = Math.max(0, rollDice(8,2) + eData.attack - (cls.baseDefense||1));
  return { playerDamage, enemyDamage, enemyName: eData.name, enemyCurrentHp: enemy.currentHp - playerDamage, enemyDefeated: (enemy.currentHp - playerDamage) <= 0 };
}

async function progressScene(lobby) {
  const campaign = CAMPAIGNS.find(c => c.id === lobby.gameState.campaignId);
  if (!campaign) return;
  const act = campaign.acts[lobby.gameState.currentAct];
  const nextIdx = lobby.gameState.currentSceneIndex + 1;
  if (nextIdx < act.scenes.length) {
    lobby.gameState.currentSceneIndex = nextIdx;
    lobby.gameState.currentScene = act.scenes[nextIdx];
  } else {
    const nextAct = lobby.gameState.currentAct + 1;
    if (nextAct < campaign.acts.length) {
      lobby.gameState.currentAct = nextAct;
      lobby.gameState.currentSceneIndex = 0;
      lobby.gameState.currentScene = campaign.acts[nextAct].scenes[0];
      const am = addDMMessage(lobby, `---\n\n## Act ${nextAct+1}: ${campaign.acts[nextAct].name}`);
      io.to(lobby.id).emit('message', am);
    } else { lobby.gameState.campaignComplete = true; return; }
  }
  lobby.gameState.sceneActionCount = 0;
  lobby.gameState.activeEnemies = [];
  io.to(lobby.id).emit('scene_changed', { scene: lobby.gameState.currentScene });
  io.to(lobby.id).emit('dm_typing', true);
  let intro = groqEnabled ? await askGroqSceneIntro(lobby, lobby.gameState, lobby.gameState.currentScene) : null;
  if (!intro) intro = generateSceneIntro(lobby.gameState.campaignId, lobby.gameState.currentScene, lobby.gameState);
  io.to(lobby.id).emit('dm_typing', false);
  const sm = addDMMessage(lobby, intro);
  io.to(lobby.id).emit('message', sm);
}

function checkGameConditions(lobby) {
  if (Object.values(lobby.players).every(p => p.stats.hp <= 0)) {
    lobby.status = 'ended';
    const m = addDMMessage(lobby, '💀 **THE PARTY HAS FALLEN.** The dungeon wins tonight.');
    io.to(lobby.id).emit('message', m);
    io.to(lobby.id).emit('game_ended', { victory: false });
  } else if (lobby.gameState.campaignComplete) {
    lobby.status = 'ended';
    const campaign = CAMPAIGNS.find(c => c.id === lobby.gameState.campaignId);
    const m = addDMMessage(lobby, `🏆 **VICTORY!** ${campaign?.goal} — You did it. The ${campaign?.title} is over.`);
    io.to(lobby.id).emit('message', m);
    io.to(lobby.id).emit('game_ended', { victory: true });
  }
}

function serializeLobby(lobby) {
  return { id: lobby.id, status: lobby.status, campaignId: lobby.campaignId, players: serializePlayers(lobby.players), hostPlayerId: lobby.hostPlayerId };
}

function serializePlayers(players) {
  const out = {};
  for (const [id, p] of Object.entries(players)) {
    out[id] = { id: p.id, name: p.name, characterName: p.characterName, isHost: p.isHost, ready: p.ready, characterCreated: p.characterCreated, class: p.class, stats: p.stats, perks: p.perks, activePerks: p.activePerks, disconnected: p.disconnected||false };
  }
  return out;
}

app.get('/api/classes', (req, res) => res.json(CLASSES));
app.get('/api/campaigns', (req, res) => res.json(CAMPAIGNS.map(c => ({ id: c.id, title: c.title, setting: c.setting, mood: c.mood, goal: c.goal, estimatedRounds: c.estimatedRounds }))));
app.get('/health', (req, res) => res.json({ status: 'ok', groq: groqEnabled }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`⚔  OneShot on :${PORT} | Groq: ${groqEnabled ? 'ON' : 'fallback'}`));
