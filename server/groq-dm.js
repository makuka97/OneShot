// ============================================================
// ONESHOT — Groq DM Service
// Wraps the Groq API with a rich system prompt that knows
// every player's character sheet, the campaign, and game state
// ============================================================

const Groq = require('groq-sdk');
const { CAMPAIGNS, CLASSES, ENEMIES, rollD20, getRollTier, getModifiedRoll } = require('./dm-engine');

let groq = null;

function initGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.warn('⚠️  No GROQ_API_KEY found — DM will use fallback engine');
    return false;
  }
  groq = new Groq({ apiKey: key });
  console.log('✅ Groq DM initialized');
  return true;
}

// ── SYSTEM PROMPT BUILDER ─────────────────────────────────────
function buildSystemPrompt(lobby, gameState) {
  const campaign = CAMPAIGNS.find(c => c.id === gameState.campaignId);
  const players = Object.values(lobby.players).filter(p => !p.disconnected);

  const playerSheets = players.map(p => {
    const cls = CLASSES[p.class] || {};
    const perksAvailable = (p.perks || []).map(pk => {
      const uses = p.activePerks?.[pk.id];
      if (pk.passive) return `  - ${pk.name} (PASSIVE): ${pk.description}`;
      if (uses !== undefined && uses <= 0) return `  - ${pk.name}: SPENT`;
      return `  - ${pk.name}${uses !== undefined ? ` (${uses} uses left)` : ''}: ${pk.description}`;
    }).join('\n');

    return `
**${p.characterName || p.name}** — ${cls.name || p.class}
  HP: ${p.stats.hp}/${p.stats.maxHp} | Gold: ${p.stats.gold}g | Level: ${p.stats.level}
  Backstory: ${p.backstory || 'Unknown past'}
  Abilities:
${perksAvailable}`;
  }).join('\n');

  const act = campaign?.acts[gameState.currentAct];
  const activeEnemyDesc = (gameState.activeEnemies || []).map(e => {
    const data = ENEMIES[e.type] || {};
    return `${data.name || e.type} (${e.currentHp} HP remaining)`;
  }).join(', ') || 'none';

  const recentHistory = (lobby.chatHistory || [])
    .filter(m => m.type === 'player' || m.type === 'dm')
    .slice(-12)
    .map(m => m.type === 'dm' ? `DM: ${m.text}` : `${m.playerName}: ${m.text}`)
    .join('\n');

  return `You are the Dungeon Master for ONESHOT — a fast, punchy one-shot tabletop RPG campaign.

CAMPAIGN: ${campaign?.title || 'Unknown'}
GOAL: ${campaign?.goal || 'Survive'}
CURRENT ACT: ${act?.name || 'Unknown'} (Act ${(gameState.currentAct || 0) + 1})
CURRENT LOCATION: ${(gameState.currentScene || 'unknown').replace(/_/g, ' ').toUpperCase()}
ACTIVE ENEMIES: ${activeEnemyDesc}
ROUND: ${gameState.round || 0}

PARTY CHARACTER SHEETS:
${playerSheets}

RECENT HISTORY:
${recentHistory || 'Campaign just started.'}

YOUR DM STYLE RULES:
- Keep responses SHORT and PUNCHY — 2-5 sentences max. This is a fast action game.
- Always end with tension, a question, or what happens next. Never just describe — always push forward.
- React specifically to what the player typed. Use their character name and class abilities when relevant.
- Be dramatic and atmospheric. Use strong verbs. Avoid generic filler.
- When players roll, narrate the outcome with energy matching the tier (critical = electric, failure = brutal).
- Track the active enemies. When an enemy is defeated, make it feel earned. 
- Keep the campaign GOAL in sight — hint at it when appropriate.
- If all enemies are defeated in a scene, describe the aftermath briefly and signal they can move forward.
- Never break character. Never say "As an AI". You ARE the Dungeon Master.
- Format: plain prose only. No markdown headers. You may use **bold** for emphasis on key hits/items.
- If a player tries something creative or unusual, reward it narratively even on mixed rolls.`;
}

// ── ROLL CONTEXT BUILDER ──────────────────────────────────────
function buildRollContext(action, player, roll, modifiedRoll, tier) {
  const cls = CLASSES[player?.class] || {};
  return `[ROLL RESULT: ${player?.characterName || player?.name} rolled ${roll} (modified to ${modifiedRoll} with ${cls.name} bonuses) = ${tier.replace(/_/g, ' ').toUpperCase()}]
ACTION: "${action}"`;
}

// ── MAIN DM CALL ──────────────────────────────────────────────
async function askGroqDM(action, player, lobby, gameState, roll, modifiedRoll, tier) {
  if (!groq) return null; // Fall back to local engine

  const systemPrompt = buildSystemPrompt(lobby, gameState);
  const userMessage = buildRollContext(action, player, roll, modifiedRoll, tier);

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant', // fastest Groq model
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 200,
      temperature: 0.85,
      stream: false,
    });

    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('Groq API error:', err.message);
    return null; // Will fall back to local engine
  }
}

// ── SCENE INTRO VIA GROQ ──────────────────────────────────────
async function askGroqSceneIntro(lobby, gameState, sceneName) {
  if (!groq) return null;

  const campaign = CAMPAIGNS.find(c => c.id === gameState.campaignId);
  const act = campaign?.acts[gameState.currentAct];
  const actHint = act?.bossHint || '';

  const systemPrompt = buildSystemPrompt(lobby, gameState);
  const prompt = `Describe entering this new location: ${sceneName.replace(/_/g, ' ')}.
Campaign setting: ${campaign?.setting}. Act: ${act?.name}.
${actHint ? `Atmospheric hint for this act: "${actHint}"` : ''}
Keep it 2-3 sentences. Atmospheric, immediate, end with "What do you do?" in bold.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.9,
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('Groq scene intro error:', err.message);
    return null;
  }
}

// ── CAMPAIGN OPENING VIA GROQ ─────────────────────────────────
async function askGroqCampaignOpening(lobby, gameState) {
  if (!groq) return null;

  const campaign = CAMPAIGNS.find(c => c.id === gameState.campaignId);
  if (!campaign) return null;

  const playerNames = Object.values(lobby.players)
    .map(p => `${p.characterName || p.name} the ${CLASSES[p.class]?.name || 'adventurer'}`)
    .join(', ');

  const prompt = `Open this campaign dramatically. Campaign: "${campaign.title}". 
Players: ${playerNames}.
Campaign intro context: ${campaign.intro.join(' ')}
Write a dramatic 3-4 sentence opening that addresses the party directly, sets the scene, and ends by dropping them into the first location. End with **What do you do?**`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: `You are the Dungeon Master for a fast tabletop RPG. Be dramatic, atmospheric, and direct. No markdown headers. Plain prose with **bold** for emphasis only.` },
        { role: 'user', content: prompt }
      ],
      max_tokens: 250,
      temperature: 0.9,
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('Groq opening error:', err.message);
    return null;
  }
}

module.exports = { initGroq, askGroqDM, askGroqSceneIntro, askGroqCampaignOpening };
