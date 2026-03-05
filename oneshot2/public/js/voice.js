// ============================================================
// ONESHOT — Party Voice Chat
// Always-on open mic, like a Discord call.
// One "Join Voice" button, then everyone hears everyone.
// Only control is a mute toggle.
// TURN relay included so it works across different networks.
// ============================================================

class VoiceChat {
  constructor(socket) {
    this.socket      = socket;
    this.localStream = null;
    this.peers       = {};   // socketId -> { pc, audioEl }
    this.muted       = false;
    this.active      = false;
    this.analyser    = null;
    this.isSpeaking  = false;

    this._bindSocketEvents();
  }

  // ── ICE SERVER CONFIG ───────────────────────────────────
  // STUN = works same-network / simple NATs (free, Google)
  // TURN = relay for strict NATs across the internet (free, OpenRelay)
  get iceConfig() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    };
  }

  // ── SOCKET SIGNAL LISTENERS ─────────────────────────────
  _bindSocketEvents() {
    // Incoming call — answer it immediately
    this.socket.on('voice_offer', async ({ fromSocketId, offer }) => {
      if (!this.active) return;
      const pc = this._createPC(fromSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('voice_answer', { targetSocketId: fromSocketId, answer });
    });

    this.socket.on('voice_answer', async ({ fromSocketId, answer }) => {
      const entry = this.peers[fromSocketId];
      if (entry?.pc) await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    this.socket.on('voice_ice_candidate', async ({ fromSocketId, candidate }) => {
      const entry = this.peers[fromSocketId];
      if (entry?.pc && candidate) {
        try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch(_) {}
      }
    });

    // New player joined while we're in voice — call them automatically
    this.socket.on('player_joined', ({ player }) => {
      if (this.active && player.socketId && player.socketId !== this.socket.id) {
        this._callPeer(player.socketId);
      }
    });

    // Clean up when a peer disconnects
    this.socket.on('voice_peer_left', ({ socketId }) => {
      this._removePeer(socketId);
    });

    // Mute state change from another player — update their card dot
    this.socket.on('player_voice_toggle', ({ socketId, muted }) => {
      this._setSpeakDot(socketId, muted ? 'muted' : 'live');
    });

    // Speaking state from another player — animate their card dot
    this.socket.on('player_speaking', ({ socketId, speaking }) => {
      this._setSpeakDot(socketId, speaking ? 'speaking' : 'live');
    });
  }

  // ── JOIN VOICE ──────────────────────────────────────────
  // Player clicks "Join Voice" once. After that it's always-on.
  async joinVoice() {
    if (this.active) return true;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
        video: false
      });
    } catch(err) {
      toast('Microphone access denied', 'err');
      return false;
    }

    this.active = true;
    this._updateUI();
    this._startSpeakDetection();

    // Call everyone already in the lobby
    const knownSockets = this._getKnownSocketIds();
    for (const sid of knownSockets) {
      if (sid !== this.socket.id) this._callPeer(sid);
    }

    toast('🎙 Voice active — open mic', 'ok');
    return true;
  }

  // ── MUTE TOGGLE ─────────────────────────────────────────
  toggleMute() {
    this.muted = !this.muted;

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.enabled = !this.muted);
    }

    // Update button
    const btn = document.getElementById('btn-mute');
    if (btn) {
      btn.textContent  = this.muted ? '🔊 UNMUTE' : '🔇 MUTE';
      btn.style.borderColor = this.muted ? 'var(--red-hi)' : '';
      btn.style.color       = this.muted ? 'var(--red-hi)' : '';
    }

    // Update status text
    const status = document.getElementById('voice-status');
    if (status) status.textContent = this.muted ? '🔴 Muted' : '🟢 In voice';

    // Tell others so their UI updates
    this.socket.emit('voice_toggle', { muted: this.muted });

    // Update own card dot
    this._setSpeakDot(this.socket.id, this.muted ? 'muted' : 'live');
  }

  // ── SPEAKING DETECTION ───────────────────────────────────
  // Web Audio API volume analysis — when you speak, your card
  // gets a green pulse animation; others' cards pulse when they speak.
  _startSpeakDetection() {
    if (!this.localStream) return;
    try {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const src      = ctx.createMediaStreamSource(this.localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);

      const data      = new Uint8Array(analyser.frequencyBinCount);
      const THRESHOLD = 20; // 0-255 — tune up to reduce false triggers
      let   lastState = false;

      const tick = () => {
        if (!this.active) return;
        requestAnimationFrame(tick);
        if (this.muted) return;

        analyser.getByteFrequencyData(data);
        const avg     = data.slice(0, 30).reduce((a, b) => a + b, 0) / 30; // voice freq range
        const speaking = avg > THRESHOLD;

        if (speaking !== lastState) {
          lastState       = speaking;
          this.isSpeaking = speaking;
          this._setSpeakDot(this.socket.id, speaking ? 'speaking' : 'live');
          this.socket.emit('player_speaking', { speaking });
        }
      };
      requestAnimationFrame(tick);
    } catch(e) { /* Audio analysis unavailable — skip */ }
  }

  // ── PEER CONNECTION ──────────────────────────────────────
  _createPC(peerId) {
    if (this.peers[peerId]?.pc) return this.peers[peerId].pc;

    const pc = new RTCPeerConnection(this.iceConfig);
    this.peers[peerId] = { pc, audioEl: null };

    // Add our microphone to this connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
    }

    // Received their audio — play it immediately, no button press needed
    pc.ontrack = (event) => {
      const entry = this.peers[peerId];
      if (!entry) return;

      entry.audioEl?.remove();

      const audio         = document.createElement('audio');
      audio.srcObject     = event.streams[0];
      audio.autoplay      = true;
      audio.volume        = 1.0;
      audio.style.display = 'none'; // hidden but in DOM for autoplay
      audio.dataset.peerId = peerId;
      document.body.appendChild(audio);
      entry.audioEl = audio;

      audio.play().catch(() => {
        // Will play on next user interaction — acceptable browser behavior
      });
    };

    // ICE negotiation
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit('voice_ice_candidate', { targetSocketId: peerId, candidate });
      }
    };

    // Connection lifecycle
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this._setSpeakDot(peerId, 'live');
      }
      if (['disconnected','failed','closed'].includes(pc.connectionState)) {
        this._removePeer(peerId);
      }
    };

    return pc;
  }

  async _callPeer(peerId) {
    if (!this.active || this.peers[peerId]?.pc) return;
    const pc    = this._createPC(peerId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    this.socket.emit('voice_offer', { targetSocketId: peerId, offer });
  }

  _removePeer(peerId) {
    const entry = this.peers[peerId];
    if (!entry) return;
    entry.pc?.close();
    entry.audioEl?.remove();
    delete this.peers[peerId];
    this._setSpeakDot(peerId, 'off');
  }

  // ── SPEAKING DOT ON PLAYER CARDS ────────────────────────
  // Each player card has a tiny colored dot that shows:
  //  🟢 live      = in voice, not speaking
  //  💚 speaking  = actively speaking (pulsing)
  //  🔴 muted     = muted
  //  ⚫ off       = not in voice
  _setSpeakDot(socketId, state) {
    // Player cards are identified by data-socket attribute
    const card = document.querySelector(`.pcard[data-socket="${socketId}"]`);
    if (!card) return;

    let dot = card.querySelector('.speak-dot');
    if (!dot) {
      dot = document.createElement('div');
      dot.className = 'speak-dot';
      const head = card.querySelector('.pcard-head');
      if (head) head.appendChild(dot);
    }
    dot.setAttribute('data-state', state);
  }

  // ── HELPERS ──────────────────────────────────────────────
  _getKnownSocketIds() {
    // game.js exposes this on window so voice.js can access it
    if (!window._lobbyPlayers) return [];
    return Object.values(window._lobbyPlayers)
      .map(p => p.socketId)
      .filter(id => id && id !== this.socket.id);
  }

  _updateUI() {
    document.getElementById('btn-voice').style.display  = 'none';
    document.getElementById('btn-mute').style.display   = 'block';
    const status = document.getElementById('voice-status');
    if (status) status.textContent = '🟢 In voice';
  }

  destroy() {
    this.active = false;
    Object.keys(this.peers).forEach(id => this._removePeer(id));
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.socket.emit('voice_peer_left', {});
    document.getElementById('btn-voice').style.display = 'block';
    document.getElementById('btn-mute').style.display  = 'none';
  }
}
