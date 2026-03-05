# ⚔ ONESHOT

Online 1–4 player one-shot D&D with a Groq AI Dungeon Master, always-on voice chat, and full character sheets.

---

## Quick Start (Local)

```bash
npm install
GROQ_API_KEY=your_key_here npm start
```

Open **http://localhost:3000** — done.

> No Groq key yet? Run without it and the built-in narrative engine takes over automatically.

---

## Getting Your Free Groq Key

1. Go to **console.groq.com** → sign up (just email)
2. Click **API Keys** → **Create API Key** → copy it
3. That's it — free tier is ~30 req/min, plenty for 4 players

---

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to **railway.app** → New Project → Deploy from GitHub
3. In your Railway project → **Variables** → add:
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```
4. Deploy — Railway auto-detects Node.js, your game goes live in ~2 min

---

## File Structure

```
oneshot/
├── server/
│   ├── index.js        ← Express + Socket.io server, all game logic
│   ├── dm-engine.js    ← Campaigns, classes, enemies, dice, fallback DM
│   └── groq-dm.js      ← Groq AI integration, system prompt builder
├── public/
│   ├── index.html      ← All screens (menu, lobby, character, game, end)
│   ├── css/style.css   ← Full pixel dark-fantasy UI
│   └── js/
│       ├── game.js     ← Client socket logic, UI rendering
│       └── voice.js    ← WebRTC always-on party voice chat
├── package.json
├── railway.toml        ← Railway deploy config (already set up)
└── .gitignore
```

---

## How to Play

1. One person clicks **HOST A GAME** → creates a lobby
2. Share the 6-letter code (or copy the invite link) with friends
3. Everyone creates a character (choose class, name, backstory)
4. Host selects a campaign and starts the game
5. Type actions in the **ACTION:** bar — the AI DM narrates what happens
6. Click **🎙 VOICE** to join party voice — always-on open mic, just like Discord

---

## Voice Chat

- Click **🎙 VOICE** once to join — microphone is always-on after that
- **🔇 MUTE** is the only other button — toggles your mic
- Speaking indicator dot on each player card: 💚 pulsing = talking, 🟢 = in voice, 🔴 = muted
- Uses WebRTC peer-to-peer (no audio hits the server)
- TURN relay via OpenRelay included — works across different networks/ISPs

---

## Campaigns Included

| Campaign | Mood | Rounds | Goal |
|---|---|---|---|
| The Gloom Sewers | Horror | ~20 | Destroy the Plaguefather |
| Ashveil Manor | Mystery | ~18 | Break the Ashveil Curse |
| The Iron Citadel | Epic | ~22 | Assassinate the Warlord |

---

## Classes

| Class | HP | Strength |
|---|---|---|
| ⚔ Warrior | 14 | Melee damage, Iron Skin, Battle Cry |
| 🗡 Rogue | 8 | Sneak Attack (+5 from stealth), Shadow Step |
| 🔮 Mage | 6 | Arcane Blast (4d6), Spell Shield |
| ✨ Cleric | 10 | Divine Heal (1d8+2), Bless, Turn Undead |
| 🏹 Ranger | 10 | Hunter's Mark, Volley, Expert Tracker |

---

## Adding More Content

**New campaign** → add to the `CAMPAIGNS` array in `server/dm-engine.js`

**New class** → add to `CLASSES` in `server/dm-engine.js`

**Tweak the DM's personality** → edit `buildSystemPrompt()` in `server/groq-dm.js`
