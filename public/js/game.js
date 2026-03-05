// ═══════════════════════════════════════════════════════════
// ONESHOT — Client v2 (Groq + Screenshot UI)
// ═══════════════════════════════════════════════════════════

const socket = io();
let voice = null;
let myId = null;
let myLobbyId = null;
let lobby = null;
let selectedClass = null;
let isJoining = false;
let CLASSES_CACHE = {};
let diceTimer = null;

// ── SCREENS ──────────────────────────────────────────────────
const screens = {};
['menu','name','lobby','char','game','end'].forEach(id => {
  screens[id] = document.getElementById(`screen-${id}`);
});

function show(id) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[id]) screens[id].classList.add('active');
}

// ── TOASTS ───────────────────────────────────────────────────
function toast(text, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── MARKDOWN ─────────────────────────────────────────────────
function md(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^## (.+)$/gm, '<span class="act-header">$1</span>')
    .replace(/^---$/gm, '<hr class="msg-sep">')
    .replace(/\n/g, '<br>');
}

function esc(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── DICE ANIMATION ────────────────────────────────────────────
function flyDice() {
  const el = document.createElement('div');
  el.className = 'dice-fly';
  el.textContent = '🎲';
  el.style.left = `${window.innerWidth * .55}px`;
  el.style.top  = `${window.innerHeight * .55}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ── SHOW ROLL RESULT on parchment ────────────────────────────
function showRoll(data) {
  const box = document.getElementById('dice-display');
  const face = document.getElementById('d20-face');
  const val  = document.getElementById('d20-value');
  const meta = document.getElementById('dice-meta');

  val.textContent = data.modified;

  face.className = 'd20-wrap';
  if (data.tier === 'critical_success') face.classList.add('crit');
  else if (data.tier === 'critical_failure' || data.tier === 'failure') face.classList.add('fail');
  else if (data.tier === 'great_success') face.classList.add('great');

  const tierLabels = {
    critical_success: 'CRITICAL!',
    great_success: 'SUCCESS',
    partial_success: 'PARTIAL',
    failure: 'FAILURE',
    critical_failure: 'FUMBLE!'
  };
  const isFail = data.tier === 'failure' || data.tier === 'critical_failure';

  meta.innerHTML = `
    <span class="dice-meta-tier ${isFail ? 'fail' : ''}">${tierLabels[data.tier] || data.tier}</span>
    <span class="dice-meta-who">${esc(data.playerName)} · d20: ${data.roll}</span>
  `;

  box.style.display = 'flex';
  // auto-hide after 6 seconds
  clearTimeout(diceTimer);
  diceTimer = setTimeout(() => { box.style.display = 'none'; }, 6000);
}

// ── MENU ─────────────────────────────────────────────────────
document.getElementById('btn-host').onclick = () => {
  isJoining = false;
  document.getElementById('name-title').textContent = 'WHAT ARE YOU CALLED?';
  document.getElementById('code-row').style.display = 'none';
  show('name');
  document.getElementById('inp-name').focus();
};
document.getElementById('btn-join-menu').onclick = () => {
  isJoining = true;
  document.getElementById('name-title').textContent = 'JOIN A GAME';
  document.getElementById('code-row').style.display = 'block';
  show('name');
  document.getElementById('inp-name').focus();
};
document.getElementById('btn-name-back').onclick = () => show('menu');
document.getElementById('btn-name-go').onclick = confirmName;
document.getElementById('inp-name').addEventListener('keydown', e => { if (e.key === 'Enter') confirmName(); });
document.getElementById('inp-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });

function confirmName() {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { toast('Enter your name!', 'err'); return; }
  if (isJoining) {
    const code = document.getElementById('inp-code').value.trim().toUpperCase();
    if (code.length !== 6) { toast('Enter a valid 6-letter code', 'err'); return; }
    socket.emit('join_lobby', { lobbyId: code, playerName: name });
  } else {
    socket.emit('create_lobby', { playerName: name });
  }
}

// ── LOBBY ─────────────────────────────────────────────────────
document.getElementById('btn-copy').onclick = () => {
  navigator.clipboard.writeText(myLobbyId).then(() => toast('Lobby code copied!', 'ok'));
};
document.getElementById('btn-ready').onclick = () => {
  const p = lobby?.players[myId];
  if (!p) return;
  socket.emit('set_ready', { ready: !p.ready });
};
document.getElementById('btn-make-char').onclick = () => {
  loadClasses();
  show('char');
};
document.getElementById('btn-start').onclick = () => socket.emit('start_game');

function renderLobby() {
  if (!lobby) return;

  document.getElementById('code-val').textContent = myLobbyId;
  document.getElementById('invite-code').textContent = myLobbyId;

  const players = Object.values(lobby.players);
  const slots = document.getElementById('lobby-slots');
  slots.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const div = document.createElement('div');
    if (p) {
      const cls = CLASSES_CACHE[p.class];
      div.className = `lslot ${p.id === myId ? 'me' : ''}`;
      div.innerHTML = `
        <div class="lslot-name">${esc(p.characterName || p.name)}${p.id === myId ? ' ★' : ''}</div>
        <div class="lslot-class">${cls ? cls.icon + ' ' + cls.name : 'No class yet'}</div>
        <div class="lslot-status">
          <div class="sdot ${p.characterCreated && p.ready ? 'ready' : 'waiting'}"></div>
          <span>${p.characterCreated ? (p.ready ? 'READY' : 'Character done') : 'Setting up...'}</span>
        </div>
      `;
    } else {
      div.className = 'lslot empty';
      div.innerHTML = `<div class="lslot-name" style="color:var(--text3)">— Waiting —</div>`;
    }
    slots.appendChild(div);
  }

  const me = lobby.players[myId];
  if (me) {
    document.getElementById('char-cta').style.display = me.characterCreated ? 'none' : 'block';
    document.getElementById('ready-zone').style.display = me.characterCreated ? 'block' : 'none';
    const rb = document.getElementById('btn-ready');
    rb.classList.toggle('on', !!me.ready);
    rb.textContent = me.ready ? '✓ READY!' : 'READY UP ✓';

    if (me.isHost) {
      document.getElementById('btn-start').style.display = 'block';
      const allDone = players.filter(Boolean).every(p => p.characterCreated);
      document.getElementById('btn-start').disabled = !allDone || !lobby.campaignId;
    }
  }

  const allReady = players.filter(Boolean).every(p => p.characterCreated && p.ready);
  document.getElementById('lob-status').textContent =
    allReady ? '✓ All ready — host can start!' :
    players.filter(Boolean).some(p => !p.characterCreated) ? 'Waiting for character creation...' :
    'Waiting for everyone to ready up...';
}

async function loadCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    const camps = await res.json();
    const list = document.getElementById('camp-list');
    list.innerHTML = '';
    camps.forEach(c => {
      const div = document.createElement('div');
      div.className = `ccamp ${lobby?.campaignId === c.id ? 'sel' : ''}`;
      div.dataset.id = c.id;
      div.innerHTML = `
        <div class="ccamp-title">${esc(c.title)}</div>
        <div class="ccamp-meta">${c.mood} · ~${c.estimatedRounds} rounds</div>
        <div class="ccamp-goal">${esc(c.goal)}</div>
      `;
      div.onclick = () => {
        if (!lobby?.players[myId]?.isHost) return;
        socket.emit('select_campaign', { campaignId: c.id });
      };
      list.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

// ── CHARACTER CREATION ────────────────────────────────────────
async function loadClasses() {
  try {
    const res = await fetch('/api/classes');
    const cls = await res.json();
    Object.assign(CLASSES_CACHE, cls);

    const grid = document.getElementById('class-grid');
    grid.innerHTML = '';

    Object.entries(cls).forEach(([id, c]) => {
      const card = document.createElement('div');
      card.className = 'cls-card';
      card.dataset.id = id;

      const stats = [
        {k:'ATK', v:c.baseAttack},
        {k:'DEF', v:c.baseDefense},
        {k:'WIS', v:c.baseWisdom},
        {k:'AGI', v:c.baseAgility},
      ];
      const statBars = stats.map(s => `
        <div class="cls-stat-row">
          <span class="cls-stat-key">${s.k}</span>
          <div class="cls-stat-bar"><div class="cls-stat-fill" style="width:${(s.v/5)*100}%"></div></div>
        </div>
      `).join('');
      const perkList = (c.perks||[]).map(p => `<div class="cls-perk">◆ ${esc(p.name)}</div>`).join('');

      card.innerHTML = `
        <span class="cls-icon">${c.icon}</span>
        <div class="cls-name">${esc(c.name)}</div>
        <div class="cls-desc">${esc(c.description)}</div>
        ${statBars}
        ${perkList}
      `;
      card.onclick = () => {
        document.querySelectorAll('.cls-card').forEach(x => x.classList.remove('sel'));
        card.classList.add('sel');
        selectedClass = id;
        showCharForm(id, c);
      };
      grid.appendChild(card);
    });
  } catch(e) { console.error(e); }
}

function showCharForm(classId, cls) {
  document.getElementById('cls-preview').innerHTML = `
    <span style="font-size:34px">${cls.icon}</span>
    <div>
      <div style="font-family:var(--pixel);font-size:9px;color:var(--gold)">${esc(cls.name)}</div>
      <div style="font-family:var(--mono);font-size:17px;color:var(--text2)">${esc(cls.description)}</div>
      <div style="font-family:var(--pixel);font-size:7px;color:var(--gold-dim);margin-top:4px">HP: ${cls.hp} · Starting gold: ~30–40g</div>
    </div>
  `;
  document.getElementById('char-form').style.display = 'block';
  document.getElementById('inp-charname').focus();
}

document.getElementById('btn-char-back').onclick = () => {
  document.getElementById('char-form').style.display = 'none';
  selectedClass = null;
  document.querySelectorAll('.cls-card').forEach(x => x.classList.remove('sel'));
};
document.getElementById('btn-char-ok').onclick = () => {
  if (!selectedClass) { toast('Choose a class first!', 'err'); return; }
  const name = document.getElementById('inp-charname').value.trim();
  if (!name) { toast('Name your hero!', 'err'); return; }
  const backstory = document.getElementById('inp-backstory').value.trim();
  socket.emit('select_class', { classId: selectedClass, characterName: name, backstory });
  show('lobby');
  toast(`${name} created! Ready up when set.`, 'ok');
};

// ── GAME SCREEN ───────────────────────────────────────────────
function initGame() {
  voice = new VoiceChat(socket);
  window.voice = voice; // expose for debugging
  document.getElementById('btn-voice').onclick  = () => voice.joinVoice();
  document.getElementById('btn-mute').onclick   = () => voice.toggleMute();

  document.getElementById('btn-send').onclick   = sendAction;
  document.getElementById('action-inp').addEventListener('keydown', e => { if (e.key === 'Enter') sendAction(); });

  document.getElementById('btn-chat').onclick = sendChat;
  document.getElementById('chat-inp').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  document.getElementById('btn-copy-ingame').onclick = () => {
    const url = `${location.origin}?join=${myLobbyId}`;
    navigator.clipboard.writeText(url).then(() => toast('Invite link copied!', 'ok'));
  };
}

function sendAction() {
  const inp = document.getElementById('action-inp');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  socket.emit('player_action', { text });
  flyDice();
}

function sendChat() {
  const inp = document.getElementById('chat-inp');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  socket.emit('chat_message', { text });
}

// ── ADD MESSAGE TO PARCHMENT ──────────────────────────────────
function addMsg(msg) {
  const parchment = document.getElementById('parchment');
  const chatBox   = document.getElementById('party-chat');

  if (msg.type === 'chat') {
    const div = document.createElement('div');
    div.className = 'pchat-msg';
    div.innerHTML = `<span class="pchat-who">${esc(msg.playerName)}</span>${esc(msg.text)}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  const div = document.createElement('div');

  if (msg.type === 'dm') {
    div.className = 'msg msg-dm';
    div.innerHTML = md(msg.text);
  } else if (msg.type === 'player') {
    div.className = 'msg msg-player';
    const cls = CLASSES_CACHE[msg.playerClass];
    div.innerHTML = `
      <span class="msg-player-who">${cls ? cls.icon + ' ' : ''}${esc(msg.playerName?.toUpperCase())}</span>
      <span class="msg-player-text">"${esc(msg.text)}"</span>
    `;
  } else {
    div.className = 'msg msg-dm';
    div.innerHTML = md(msg.text);
  }

  parchment.appendChild(div);
  parchment.scrollTop = parchment.scrollHeight;
}

// ── RENDER PARTY CARDS (left sidebar) ─────────────────────────
function renderParty() {
  if (!lobby) return;
  window._lobbyPlayers = lobby.players; // expose for voice.js
  const container = document.getElementById('game-players');
  container.innerHTML = '';

  Object.values(lobby.players).forEach((p, i) => {
    const isMe = p.id === myId;
    const cls  = CLASSES_CACHE[p.class] || {};
    const hpPct = p.stats.maxHp > 0 ? Math.max(0, (p.stats.hp / p.stats.maxHp) * 100) : 0;
    const hpClass = hpPct > 60 ? 'full' : hpPct > 25 ? 'mid' : 'ok';
    const dead = p.stats.hp <= 0;

    const div = document.createElement('div');
    div.className = `pcard ${isMe ? 'me' : ''} ${dead ? 'dead' : ''}`;
    div.dataset.pid = p.id;
    if (p.socketId) div.dataset.socket = p.socketId;

    div.innerHTML = `
      <div class="pcard-head">
        <div class="pcard-portrait">${cls.icon || '⚔'}</div>
        <div class="pcard-name-area">
          <div class="pcard-label">PLAYER ${i+1}</div>
          <div class="pcard-name">${esc(p.characterName || p.name)}</div>
        </div>
      </div>
      <div class="pcard-stats">
        <div class="pstat-row">
          <span class="pstat-key">HP</span>
          <div class="hp-bar"><div class="hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
          <span class="pstat-val">${p.stats.hp}/${p.stats.maxHp}</span>
        </div>
        <div class="pstat-row">
          <span class="pstat-key gold-key">GOLD</span>
          <span class="pstat-gold">💰 ${p.stats.gold}g  Lv.${p.stats.level}</span>
        </div>
      </div>
    `;

    container.appendChild(div);
  });

  // Also render perks for self
  renderPerks();
}

function renderPerks() {
  const me = lobby?.players[myId];
  if (!me) return;
  const panel = document.getElementById('perk-panel');
  panel.innerHTML = '';

  (me.perks || []).forEach(perk => {
    const uses = me.activePerks?.[perk.id];
    const spent = !perk.passive && uses !== undefined && uses <= 0;
    const btn = document.createElement('button');
    btn.className = `perk-btn ${perk.passive ? 'passive' : ''}`;
    btn.disabled = perk.passive || spent;
    btn.innerHTML = `
      <span class="perk-name">${esc(perk.name)}${perk.passive ? ' ·PASSIVE' : ''}</span>
      <span class="perk-desc">${esc(perk.description)}</span>
      ${!perk.passive && uses !== undefined ? `<span class="perk-uses">${uses > 0 ? uses + ' use(s) left' : 'SPENT'}</span>` : ''}
    `;
    if (!perk.passive && !spent) btn.onclick = () => socket.emit('use_perk', { perkId: perk.id });
    panel.appendChild(btn);
  });
}

// ── SOCKET EVENTS ─────────────────────────────────────────────
socket.on('lobby_created', ({ lobbyId, playerId, lobby: l }) => {
  myId = playerId; myLobbyId = lobbyId; lobby = l;
  show('lobby'); loadCampaigns(); renderLobby();
});

socket.on('lobby_joined', ({ lobbyId, playerId, lobby: l }) => {
  myId = playerId; myLobbyId = lobbyId; lobby = l;
  show('lobby'); loadCampaigns(); renderLobby();
  toast(`Joined lobby ${lobbyId}!`, 'ok');
});

socket.on('error', ({ message }) => toast(message, 'err'));

socket.on('lobby_updated', l => { lobby = l; renderLobby(); });
socket.on('player_joined', ({ player, lobby: l }) => { lobby = l; renderLobby(); toast(`${player.name} joined!`); });
socket.on('player_updated', ({ playerId, player, lobby: l }) => { lobby = l; renderLobby(); if (playerId === myId) toast(`${player.characterName} forged!`, 'ok'); });

socket.on('campaign_selected', ({ campaignId, lobby: l }) => {
  lobby = l;
  document.querySelectorAll('.ccamp').forEach(c => c.classList.toggle('sel', c.dataset.id === campaignId));
  renderLobby();
});

socket.on('game_started', ({ lobby: l, campaignTitle, campaignGoal }) => {
  lobby = l;
  document.getElementById('loc-name').textContent = campaignTitle.toUpperCase();
  document.getElementById('invite-code').textContent = myLobbyId;
  show('game');
  initGame();
  renderParty();
  // Pre-fill quick-bar note
  const parchment = document.getElementById('parchment');
  parchment.innerHTML = '';
});

socket.on('message', msg => {
  addMsg(msg);
});

socket.on('dm_typing', typing => {
  document.getElementById('typing-wrap').style.display = typing ? 'flex' : 'none';
  if (typing) {
    // scroll parchment to bottom to show typing
    const p = document.getElementById('parchment');
    p.scrollTop = p.scrollHeight;
  }
});

socket.on('roll_result', data => {
  flyDice();
  showRoll(data);
});

socket.on('stats_updated', ({ players }) => {
  if (!lobby) return;
  // Flash damaged players
  Object.entries(players).forEach(([id, p]) => {
    const oldHp = lobby.players[id]?.stats?.hp ?? p.stats.hp;
    if (p.stats.hp < oldHp) {
      const card = document.querySelector(`.pcard[data-pid="${id}"]`);
      if (card) { card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1000); }
      if (id === myId) toast(`You take damage! (${p.stats.hp} HP remaining)`, 'err');
    }
  });
  lobby.players = players;
  renderParty();
});

socket.on('scene_changed', ({ scene }) => {
  document.getElementById('loc-name').textContent = scene.replace(/_/g,' ').toUpperCase();
  document.getElementById('dice-display').style.display = 'none';
});

socket.on('player_disconnected', ({ playerId }) => {
  const name = lobby?.players[playerId]?.name;
  if (name) toast(`${name} disconnected`, 'err');
  if (lobby?.players[playerId]) lobby.players[playerId].disconnected = true;
  renderParty();
});

socket.on('game_ended', ({ victory }) => {
  const me = lobby?.players[myId];
  document.getElementById('end-icon').textContent = victory ? '🏆' : '💀';
  document.getElementById('end-title').textContent = victory ? 'VICTORY!' : 'DEFEATED';
  document.getElementById('end-msg').textContent = victory
    ? 'Against all odds, the party prevailed. Songs will be sung.'
    : 'The dungeon claims its toll. Maybe next time, adventurers.';
  if (me) {
    document.getElementById('end-stats').innerHTML =
      `${esc(me.characterName || me.name)} the ${CLASSES_CACHE[me.class]?.name || 'Adventurer'}<br>
       Level: ${me.stats.level}  ·  Gold: ${me.stats.gold}g  ·  XP: ${me.stats.xp || 0}`;
  }
  show('end');
  if (voice) { voice.destroy(); voice = null; }
});

document.getElementById('btn-again').onclick = () => {
  myId = null; myLobbyId = null; lobby = null; selectedClass = null;
  document.getElementById('parchment').innerHTML = '';
  document.getElementById('party-chat').innerHTML = '';
  show('menu');
};

// ── AUTO-JOIN VIA URL PARAM ───────────────────────────────────
window.addEventListener('load', () => {
  const params = new URLSearchParams(location.search);
  const code = params.get('join');
  if (code) {
    isJoining = true;
    document.getElementById('name-title').textContent = 'JOIN A GAME';
    document.getElementById('code-row').style.display = 'block';
    document.getElementById('inp-code').value = code.toUpperCase();
    show('name');
  }
});

// ═══════════════════════════════════════════════════════════
// MOBILE — Tab switching, mobile panel rendering, keyboard fix
// ═══════════════════════════════════════════════════════════

// Tab switcher — called from onclick in HTML
function mobTab(btn, panel) {
  // Update tab active states
  document.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Close all panels
  document.querySelectorAll('.mob-panel').forEach(p => p.classList.remove('open'));

  // Open requested panel (empty string = story view, no panel)
  if (panel) {
    const el = document.getElementById(`mob-panel-${panel}`);
    if (el) el.classList.add('open');
    // Blur action input so keyboard closes when switching tabs
    document.getElementById('action-inp')?.blur();
  }
}

// Render compact player cards in mobile party panel
function renderMobileParty() {
  if (!lobby) return;
  const grid = document.getElementById('mob-party-grid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.values(lobby.players).forEach(p => {
    const isMe = p.id === myId;
    const cls  = CLASSES_CACHE[p.class] || {};
    const hpPct = p.stats.maxHp > 0 ? Math.max(0, (p.stats.hp / p.stats.maxHp) * 100) : 0;
    const hpClass = hpPct > 60 ? 'full' : hpPct > 25 ? 'mid' : 'low';

    const div = document.createElement('div');
    div.className = `mob-pcard ${isMe ? 'me' : ''}`;
    div.innerHTML = `
      <div class="mob-pcard-icon">${cls.icon || '⚔'}</div>
      <div class="mob-pcard-info">
        <div class="mob-pcard-name">${esc(p.characterName || p.name)}${isMe ? ' ★' : ''}</div>
        <div class="mob-hp-bar"><div class="mob-hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
        <div class="mob-pcard-stats">${p.stats.hp}/${p.stats.maxHp} HP · ${p.stats.gold}g</div>
      </div>
    `;
    grid.appendChild(div);
  });
}

// Render perks in mobile abilities panel
function renderMobilePerks() {
  const me = lobby?.players[myId];
  if (!me) return;
  const list = document.getElementById('mob-perk-list');
  if (!list) return;
  list.innerHTML = '';

  (me.perks || []).forEach(perk => {
    const uses  = me.activePerks?.[perk.id];
    const spent = !perk.passive && uses !== undefined && uses <= 0;
    const btn   = document.createElement('button');
    btn.className = `mob-perk-btn ${perk.passive ? 'passive' : ''}`;
    btn.disabled  = perk.passive || spent;
    btn.innerHTML = `
      <div class="mob-perk-left">
        <div class="mob-perk-name">${esc(perk.name)}${perk.passive ? ' · PASSIVE' : ''}</div>
        <div class="mob-perk-desc">${esc(perk.description)}</div>
      </div>
      ${!perk.passive && uses !== undefined ? `<span class="mob-perk-uses">${uses > 0 ? uses + 'x' : 'SPENT'}</span>` : ''}
    `;
    if (!perk.passive && !spent) {
      btn.onclick = () => {
        socket.emit('use_perk', { perkId: perk.id });
        // Switch back to story tab after using ability
        const storyTab = document.querySelector('.mob-tab[data-panel=""]');
        if (storyTab) mobTab(storyTab, '');
      };
    }
    list.appendChild(btn);
  });
}

// Wire up mobile voice buttons (mirrors desktop voice)
function initMobileVoice() {
  const mobVoiceBtn = document.getElementById('mob-btn-voice');
  const mobMuteBtn  = document.getElementById('mob-btn-mute');
  if (mobVoiceBtn) {
    mobVoiceBtn.onclick = async () => {
      await voice?.joinVoice();
      mobVoiceBtn.style.display = 'none';
      mobMuteBtn.style.display  = 'block';
    };
  }
  if (mobMuteBtn) {
    mobMuteBtn.onclick = () => {
      voice?.toggleMute();
      const muted = voice?.muted;
      mobMuteBtn.textContent = muted ? '🔊 UNMUTE' : '🔇 MUTE';
    };
  }
}

// Mobile invite copy
document.getElementById('mob-btn-copy')?.addEventListener('click', () => {
  const url = `${location.origin}?join=${myLobbyId}`;
  navigator.clipboard.writeText(url).then(() => toast('Invite link copied!', 'ok'));
});

// Fix: prevent iOS from zooming and bouncing when keyboard opens
// Use visualViewport API to shrink the game frame when keyboard appears
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const gameScreen = document.getElementById('screen-game');
    if (!gameScreen || !gameScreen.classList.contains('active')) return;
    // Set height to visual viewport height so parchment shrinks above keyboard
    gameScreen.style.height = `${window.visualViewport.height}px`;
    gameScreen.style.top    = `${window.visualViewport.offsetTop}px`;
  });
}

// Hook into existing renderParty to also update mobile panels
const _origRenderParty = renderParty;
// Override — calls both desktop and mobile renderers
window.renderParty = function() {
  _origRenderParty();
  renderMobileParty();
  renderMobilePerks();
  // Update mobile invite code
  const mic = document.getElementById('mob-invite-code');
  if (mic && myLobbyId) mic.textContent = myLobbyId;
};

// Also call mobile init when game starts
const _origInitGame = initGame;
window.initGame = function() {
  _origInitGame();
  initMobileVoice();
};
