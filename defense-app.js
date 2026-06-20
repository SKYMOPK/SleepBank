import {
  CARDS,
  ENEMIES,
  GAME,
  PLAYER_NAMES,
  RARITIES,
  STARTER_COLLECTION,
  STARTER_DECK,
  cardStats,
  isBossWave,
  nextBossWave,
} from './defense-config.js';
import {
  applyAction,
  availableGachaCards,
  createMatch,
  createPreviewMatch,
  createSeededRandom,
  drawGachaCard,
  normalizeUser,
  orientPosition,
  reconcileMatchSnapshot,
  rewardUserForSettlement,
  rewardForRun,
  settlementForMatch,
  snapshotMatch,
  tickMatch,
  validateDeck,
  viewedBoardPosition,
  viewedEnemyPosition,
} from './defense-core.js';

const firebaseConfig = {
  apiKey: 'AIzaSyArUT_yPRn3CR9ejNbp8ycYGjP6gHPPKJA',
  authDomain: 'gymsleep-e99d9.firebaseapp.com',
  databaseURL: 'https://gymsleep-e99d9-default-rtdb.firebaseio.com/',
  projectId: 'gymsleep-e99d9',
  storageBucket: 'gymsleep-e99d9.firebasestorage.app',
  messagingSenderId: '346919034740',
  appId: '1:346919034740:web:3399498d40359c10b61621',
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const serverTime = firebase.database.ServerValue.TIMESTAMP;
const clientId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const VIEW_MODE = 'self-bottom-v2';
const roomCodeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GACHA_COST = 50;
const RECONNECT_ATTEMPTS = 4;
const SETTLEMENT_RETRY_MS = 1800;
const MAX_GUEST_VISUAL_LEAD_SECONDS = 1.2;
const GUEST_VISUAL_CONVERGENCE_RATE = 14;
const GUEST_VISUAL_EFFECT_LIMIT = 160;
const GUEST_VISUAL_DAMAGE_LIMIT = 120;
const BATTLE_EFFECT_TARGET_MS = 12;
const PERFORMANCE_SOFT_ENEMY_COUNT = 18;
const RARITY_ORDER = Object.freeze(['common', 'rare', 'epic', 'legendary']);
const BOSS_ABILITY_LABELS = Object.freeze({
  insomnia_beast: '衝刺',
  fear_demon: '召喚',
  volcano_captain: '降階',
  silence_serpent: '沉默',
});
const urlParams = new URLSearchParams(window.location.search);
const e2eMode = urlParams.has('e2e');
const TOWER_SPRITES = Object.freeze({
  pillow_guard: [0, 0],
  alarm_turret: [1, 0],
  night_light: [2, 0],
  white_noise: [3, 0],
  dream_catcher: [0, 1],
  mosquito_coil: [1, 1],
  moon_prism: [2, 1],
  sheep_counter: [3, 1],
  gravity_blanket: [0, 2],
  sleep_cap_sniper: [1, 2],
  meteor_projector: [2, 2],
  orange_guard: [3, 2],
  hate_dream: [0, 3],
  charge_core: [1, 3],
});
const ENEMY_SPRITES = Object.freeze({
  normal: [0, 0],
  fast: [1, 0],
  tank: [2, 0],
  swarm: [0, 1],
  insomnia_beast: [0, 2],
  fear_demon: [1, 2],
  volcano_captain: [2, 2],
  silence_serpent: [3, 2],
  boss: [0, 2],
  elite: [2, 1],
});
const towerSprite = new Image();
towerSprite.src = 'assets/defense/towers.png?v=3';
const enemySprite = new Image();
enemySprite.src = 'assets/defense/enemies.png';
const battleBackgroundCache = new Map();

const state = {
  playerId: null,
  user: null,
  loadingUser: false,
  workingDeck: [],
  roomCode: null,
  room: null,
  roomRef: null,
  presenceRef: null,
  metaRef: null,
  metaListener: null,
  playersRef: null,
  playersListener: null,
  snapshotRef: null,
  snapshotListener: null,
  resultRef: null,
  resultListener: null,
  settlementRef: null,
  settlementListener: null,
  actionRef: null,
  actionListener: null,
  isHost: false,
  match: null,
  selectedHand: null,
  selectedTower: null,
  dragTower: null,
  dragTarget: null,
  dragPosition: null,
  dragStart: null,
  dragPreviousSelection: null,
  dragMoved: false,
  dragPointerId: null,
  suppressBattleClick: false,
  hostRaf: 0,
  hostLastTime: 0,
  hostLastRenderAt: 0,
  lastSnapshotAt: 0,
  snapshotWriteInFlight: false,
  snapshotWriteQueued: false,
  snapshotExtraUpdates: {},
  snapshotSeq: 0,
  lastSnapshotSeq: 0,
  pendingActions: new Map(),
  processedActions: new Set(),
  settled: false,
  settlementPromise: null,
  connectionRef: null,
  connectionListener: null,
  presenceRecoveryInFlight: false,
  disconnectSettlementTimer: 0,
  settlementRetryTimer: 0,
  settlementRetryReason: null,
  rewardPromises: new Map(),
  previewCard: null,
  previewRank: 1,
  previewMatch: null,
  previewRaf: 0,
  previewLastTime: 0,
  guestRaf: 0,
  guestLastRenderAt: 0,
  guestVisualLastAt: 0,
  guestVisualProgress: new Map(),
  guestVisualEffects: new Map(),
  guestVisualDamageNumbers: new Map(),
  snapshotSentAt: 0,
  handSignature: '',
  soundEnabled: localStorage.getItem('defense-sound') !== 'off',
  audioContext: null,
  seenEffectIds: new Set(),
  lastSoundAt: 0,
  lastBattleDomAt: 0,
  actionBursts: [],
  collectionFilter: 'all',
  collectionSort: 'rarity',
  deckFilter: 'all',
  deckSort: 'rarity',
  lastFrameCostMs: 0,
  reducedFx: false,
};

const byId = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];
const toast = byId('toast');
const battleCanvas = byId('battleCanvas');
const battleCtx = battleCanvas.getContext('2d');
const previewCanvas = byId('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

function towerArtStyle(cardId) {
  const [col, row] = TOWER_SPRITES[cardId];
  return `--sx:${col * (100 / 3)}%;--sy:${row * (100 / 3)}%;`;
}

function towerArtHtml(cardId, className = '') {
  return `<span class="tower-art ${className}" style="${towerArtStyle(cardId)}"></span>`;
}

function ensureAudio() {
  if (!state.soundEnabled) return null;
  if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
  return state.audioContext;
}

function tone(frequency, duration = 0.08, type = 'sine', volume = 0.035, delay = 0) {
  const audio = ensureAudio();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime + delay);
  gain.gain.setValueAtTime(volume, audio.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(audio.currentTime + delay);
  oscillator.stop(audio.currentTime + delay + duration);
}

function playActionSound(type) {
  if (type === 'merge') {
    tone(420, 0.08, 'triangle', 0.04);
    tone(680, 0.12, 'triangle', 0.035, 0.07);
  } else {
    tone(330, 0.07, 'triangle', 0.03);
    tone(470, 0.08, 'triangle', 0.025, 0.05);
  }
}

function addActionBurst(payload) {
  const cellIndex = payload.type === 'merge' ? payload.fromIndex : payload.cellIndex;
  if (!Number.isInteger(cellIndex)) return;
  state.actionBursts.push({
    playerId: state.playerId,
    cellIndex,
    type: payload.type,
    startedAt: performance.now(),
  });
}

function playEffectSound(effect) {
  if (!state.soundEnabled || performance.now() - state.lastSoundAt < 45) return;
  state.lastSoundAt = performance.now();
  const sound = {
    chain: [780, 0.07, 'square'],
    splash: [190, 0.12, 'sine'],
    slow: [360, 0.12, 'sine'],
    dot: [240, 0.09, 'sawtooth'],
    burst: [520, 0.08, 'square'],
    global: [880, 0.14, 'triangle'],
    projectile: [430, 0.055, 'triangle'],
  }[effect.type] || [430, 0.055, 'triangle'];
  tone(sound[0], sound[1], sound[2], effect.crit ? 0.05 : 0.025);
}

function syncEffectSounds(match) {
  if (!match?.effects) return;
  match.effects.forEach((effect) => {
    if (state.seenEffectIds.has(effect.id)) return;
    state.seenEffectIds.add(effect.id);
    playEffectSound(effect);
  });
  if (state.seenEffectIds.size > 800) state.seenEffectIds.clear();
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.style.borderLeftColor = type === 'error' ? 'var(--red)' : type === 'info' ? 'var(--gold)' : 'var(--green)';
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function showScreen(id) {
  if (document.querySelector('.screen.active')?.id === id) return;
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  byId('homeBtn').style.visibility = id === 'identityScreen' ? 'hidden' : 'visible';
}

function openModal(id) {
  const modal = byId(id);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const modal = byId(id);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

async function loadUser(playerId) {
  state.loadingUser = true;
  setHubLoading(true);
  const ref = db.ref(`tower_defense/users/${playerId}`);
  let loadedUser;
  try {
    const result = await ref.transaction((raw) => raw ? normalizeUser(raw) : normalizeUser());
    loadedUser = normalizeUser(result.snapshot.val());
  } catch (error) {
    console.error('User load failed:', error);
    loadedUser = normalizeUser(JSON.parse(localStorage.getItem(`defense-user-${playerId}`) || '{}'));
    showToast('Firebase 暫時無法連線，收藏以本機模式開啟', 'error');
  }
  if (state.playerId !== playerId) return;
  state.user = loadedUser;
  state.loadingUser = false;
  state.workingDeck = [...state.user.deck];
  renderHub();
  setHubLoading(false);
  const lastRoom = localStorage.getItem(`defense-room-${playerId}`);
  if (lastRoom) attemptReconnect(lastRoom);
}

async function saveUser(patch) {
  state.user = normalizeUser({ ...state.user, ...patch });
  localStorage.setItem(`defense-user-${state.playerId}`, JSON.stringify(state.user));
  try {
    await db.ref(`tower_defense/users/${state.playerId}`).update(patch);
  } catch (error) {
    console.error('User save failed:', error);
    showToast('雲端儲存失敗，已暫存於此裝置', 'error');
  }
  renderHub();
}

function selectIdentity(playerId) {
  state.playerId = playerId;
  state.user = null;
  localStorage.setItem('defense-player', playerId);
  showScreen('hubScreen');
  byId('hubIdentity').textContent = `${PLAYER_NAMES[playerId]} · 自己視角在下方`;
  loadUser(playerId);
}

function setHubLoading(loading) {
  byId('hubScreen').setAttribute('aria-busy', String(loading));
  byId('createRoomBtn').disabled = loading;
  byId('joinRoomBtn').disabled = loading;
  byId('roomCodeInput').disabled = loading;
}

function renderHub() {
  if (!state.user) return;
  byId('tokenValue').textContent = state.user.tokens;
  byId('bestWaveValue').textContent = state.user.stats.bestWave;
  byId('deckCountValue').textContent = state.workingDeck.length;
  byId('collectionFilter').value = state.collectionFilter;
  byId('collectionSort').value = state.collectionSort;
  byId('deckFilter').value = state.deckFilter;
  byId('deckSort').value = state.deckSort;
  renderCollection();
  renderDeck();
}

function rarityRank(cardId) {
  return RARITY_ORDER.indexOf(CARDS[cardId]?.rarity) + 1;
}

function cardMatchesFilter(cardId, filter) {
  const owned = state.user.collection[cardId] || 0;
  if (filter === 'owned') return owned > 0;
  if (filter === 'missing') return owned === 0;
  if (filter === 'full') return owned >= GAME.maxCopies;
  if (RARITIES[filter]) return CARDS[cardId].rarity === filter;
  return true;
}

function sortedCardIds(filter, sort) {
  return Object.keys(CARDS)
    .filter((cardId) => cardMatchesFilter(cardId, filter))
    .sort((a, b) => {
      if (sort === 'owned') {
        const ownedDiff = (state.user.collection[b] || 0) - (state.user.collection[a] || 0);
        if (ownedDiff) return ownedDiff;
      } else if (sort === 'name') {
        return CARDS[a].name.localeCompare(CARDS[b].name, 'zh-Hant');
      }
      const rarityDiff = rarityRank(b) - rarityRank(a);
      if (rarityDiff) return rarityDiff;
      return CARDS[a].name.localeCompare(CARDS[b].name, 'zh-Hant');
    });
}

function renderCard(cardId, mode) {
  const card = CARDS[cardId];
  const rarity = RARITIES[card.rarity];
  const owned = state.user.collection[cardId] || 0;
  const inDeck = state.workingDeck.filter((value) => value === cardId).length;
  const locked = owned === 0;
  const full = owned >= GAME.maxCopies;
  const control = mode === 'deck'
    ? `<button class="card-control" data-add="${cardId}" aria-label="加入 ${escapeHtml(card.name)}">＋</button>`
    : '';
  const status = mode === 'deck'
    ? `牌組 ${inDeck} 張`
    : locked ? '尚未解鎖' : full ? '已滿 3 張' : '已解鎖';
  return `<div class="game-card ${locked ? 'locked' : ''} ${full ? 'full-card' : ''}" data-card="${cardId}" role="button" tabindex="0" style="--card-color:${card.color};--rarity-color:${rarity.color}">
    <span class="card-art-frame">${towerArtHtml(cardId)}</span>
    <span class="card-copy-count">${owned}/3</span>
    <span class="card-rarity">${escapeHtml(rarity.name)}</span>
    <span class="card-title">${escapeHtml(card.name)}</span>
    <span class="card-summary">${escapeHtml(card.description)}</span>
    <span class="card-count">${escapeHtml(status)}</span>
    ${control}
  </div>`;
}

function renderCollection() {
  const cardIds = sortedCardIds(state.collectionFilter, state.collectionSort);
  byId('collectionGrid').innerHTML = cardIds.map((cardId) => renderCard(cardId, 'collection')).join('');
  const available = availableGachaCards(state.user.collection);
  const fullCount = Object.keys(CARDS).filter((cardId) => (state.user.collection[cardId] || 0) >= GAME.maxCopies).length;
  byId('gachaMeta').textContent = `可抽 ${available.length} 張 · 滿卡 ${fullCount} 張會自動排除`;
  byId('gachaBtn').disabled = !available.length || state.user.tokens < GACHA_COST;
  byId('gachaBtn').textContent = available.length ? `抽卡 · ${GACHA_COST}` : '收藏已完整';
}

function renderDeck() {
  const validation = validateDeck(state.workingDeck, state.user.collection);
  byId('deckValidation').textContent = validation.valid ? '牌組合法，可以進入合作對局。' : validation.reason;
  byId('deckValidation').style.color = validation.valid ? 'var(--green)' : 'var(--red)';
  byId('saveDeckBtn').disabled = !validation.valid;
  byId('deckCountValue').textContent = state.workingDeck.length;
  byId('deckStrip').innerHTML = state.workingDeck.map((cardId, index) => {
    const card = CARDS[cardId];
    const rarity = RARITIES[card.rarity];
    const copy = state.workingDeck.slice(0, index + 1).filter((value) => value === cardId).length;
    return `<article class="deck-card" style="--card-color:${card.color};--rarity-color:${rarity.color}">
      <span class="deck-card-art">${towerArtHtml(cardId)}</span>
      <strong>${escapeHtml(card.name)}</strong>
      <small>${escapeHtml(rarity.name)} · 第 ${copy} 張</small>
      <button data-remove="${index}" aria-label="移除 ${escapeHtml(card.name)}">×</button>
    </article>`;
  }).join('');
  byId('deckCollectionGrid').innerHTML = sortedCardIds(state.deckFilter, state.deckSort).map((cardId) => renderCard(cardId, 'deck')).join('');
}

async function gacha() {
  let cardId = null;
  let failure = '抽卡失敗';
  try {
    const result = await db.ref(`tower_defense/users/${state.playerId}`).transaction((raw) => {
      const user = normalizeUser(raw);
      if (user.tokens < GACHA_COST) {
        failure = '夢境代幣不足';
        return undefined;
      }
      const drawnCard = drawGachaCard(user.collection);
      if (!drawnCard) {
        failure = '所有卡牌都已持有三張';
        return undefined;
      }
      cardId = drawnCard;
      user.tokens -= GACHA_COST;
      user.collection[drawnCard] = (user.collection[drawnCard] || 0) + 1;
      return user;
    });
    if (!result.committed || !cardId) return showToast(failure, failure.startsWith('所有') ? 'info' : 'error');
    state.user = normalizeUser(result.snapshot.val());
    localStorage.setItem(`defense-user-${state.playerId}`, JSON.stringify(state.user));
    renderHub();
    showToast(`獲得新卡牌：${CARDS[cardId].name}`);
    openCardDetail(cardId);
  } catch (error) {
    console.error('Gacha transaction failed:', error);
    showToast('抽卡同步失敗，未扣除代幣', 'error');
  }
}

function addDeckCard(cardId) {
  const owned = state.user.collection[cardId] || 0;
  const current = state.workingDeck.filter((value) => value === cardId).length;
  if (!owned) return showToast('尚未解鎖這張卡', 'error');
  if (current >= owned || current >= GAME.maxCopies) return showToast('已達可攜帶數量上限', 'error');
  if (state.workingDeck.length >= GAME.maxDeck) return showToast('牌組最多 20 張', 'error');
  state.workingDeck.push(cardId);
  renderDeck();
}

function removeDeckCard(index) {
  state.workingDeck.splice(index, 1);
  renderDeck();
}

async function saveDeck() {
  const validation = validateDeck(state.workingDeck, state.user.collection);
  if (!validation.valid) return showToast(validation.reason, 'error');
  await saveUser({ deck: [...state.workingDeck] });
  showToast('牌組已儲存');
}

function openCardDetail(cardId) {
  const card = CARDS[cardId];
  state.previewCard = cardId;
  state.previewRank = 1;
  byId('detailIcon').setAttribute('style', towerArtStyle(cardId));
  byId('detailName').textContent = card.name;
  byId('detailRarity').textContent = `${RARITIES[card.rarity].name}卡牌 · 攻擊預覽`;
  byId('detailRarity').style.color = RARITIES[card.rarity].color;
  byId('detailDescription').textContent = card.description;
  byId('detailRankEffect').textContent = card.rankEffect;
  byId('rankSwitch').innerHTML = Array.from({ length: GAME.maxRank }, (_, index) => (
    `<button class="rank-btn ${index === 0 ? 'active' : ''}" data-rank="${index + 1}">${index + 1} 階</button>`
  )).join('');
  refreshPreview();
  openModal('cardModal');
}

function refreshPreview() {
  const stats = cardStats(state.previewCard, state.previewRank);
  state.previewMatch = createPreviewMatch(state.previewCard, state.previewRank);
  state.previewLastTime = performance.now();
  byId('detailStats').innerHTML = [
    ['傷害', Math.round(stats.damage)],
    ['間隔', `${stats.interval.toFixed(2)}s`],
    ['鎖定', '全線'],
    ['暴擊', '20%'],
  ].map(([label, value]) => `<div><strong>${value}</strong><small>${label}</small></div>`).join('');
  byId('rankSwitch').querySelectorAll('.rank-btn').forEach((button) => button.classList.toggle('active', Number(button.dataset.rank) === state.previewRank));
  if (!state.previewRaf) state.previewRaf = requestAnimationFrame(previewFrame);
}

function previewFrame(now) {
  if (!byId('cardModal').classList.contains('open')) {
    state.previewRaf = 0;
    return;
  }
  const dt = Math.min(0.05, (now - state.previewLastTime) / 1000);
  state.previewLastTime = now;
  tickMatch(state.previewMatch, dt, Math.random);
  if (!state.previewMatch.enemies.length) state.previewMatch = createPreviewMatch(state.previewCard, state.previewRank);
  drawBattle(previewCtx, previewCanvas, state.previewMatch, 'p1', { preview: true });
  state.previewRaf = requestAnimationFrame(previewFrame);
}

function randomRoomCode() {
  return Array.from({ length: 6 }, () => roomCodeChars[Math.floor(Math.random() * roomCodeChars.length)]).join('');
}

async function createRoom() {
  if (state.loadingUser || !state.user) return showToast('玩家資料仍在載入', 'info');
  const validation = validateDeck(state.user.deck, state.user.collection);
  if (!validation.valid) return showToast('請先儲存合法牌組', 'error');
  const player = {
    clientId,
    connected: true,
    ready: false,
    deck: state.user.deck,
    joinedAt: serverTime,
    lastSeen: serverTime,
  };
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomCode = randomRoomCode();
      const result = await db.ref(`tower_defense/rooms/${roomCode}`).transaction((current) => current ? undefined : {
        meta: {
          status: 'waiting',
          hostClientId: clientId,
          hostPlayerId: state.playerId,
          testMode: e2eMode || null,
          createdAt: serverTime,
          updatedAt: serverTime,
        },
        players: { [state.playerId]: player },
      });
      if (result.committed) {
        enterRoom(roomCode);
        return;
      }
    }
    showToast('建立房間失敗，請再試一次', 'error');
  } catch (error) {
    console.error('Create room failed:', error);
    showToast('建立房間失敗，請檢查網路或 Firebase 權限', 'error');
  }
}

async function joinRoom(roomCodeRaw) {
  if (state.loadingUser || !state.user) return showToast('玩家資料仍在載入', 'info');
  const roomCode = roomCodeRaw.trim().toUpperCase();
  if (roomCode.length !== 6) return showToast('請輸入六位房間碼', 'error');
  const ref = db.ref(`tower_defense/rooms/${roomCode}`);
  try {
    const snapshot = await ref.once('value');
    const room = snapshot.val();
    if (!room) return showToast('找不到這個房間', 'error');
    if (!room.meta) return showToast('這是舊版房間，請由房主重新建立', 'error');
    if (!['waiting', 'paused', 'playing'].includes(room.meta.status)) return showToast('房間已結束', 'error');
    if (room.players?.[state.playerId]?.connected && room.players[state.playerId].clientId !== clientId) {
      return showToast('此身分已在房間中', 'error');
    }
    await ref.child(`players/${state.playerId}`).update({
      clientId,
      connected: true,
      ready: room.players?.[state.playerId]?.ready || false,
      deck: state.user.deck,
      joinedAt: room.players?.[state.playerId]?.joinedAt || serverTime,
      lastSeen: serverTime,
    });
    enterRoom(roomCode);
  } catch (error) {
    console.error('Join room failed:', error);
    showToast('加入房間失敗', 'error');
  }
}

async function attemptReconnect(roomCode) {
  for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt += 1) {
    try {
      const roomRef = db.ref(`tower_defense/rooms/${roomCode}`);
      const snapshot = await roomRef.once('value');
      const room = snapshot.val();
      if (!room?.meta || !room?.players?.[state.playerId] || room.meta.status === 'finished') {
        localStorage.removeItem(`defense-room-${state.playerId}`);
        return;
      }
      const updates = {
        [`players/${state.playerId}/clientId`]: clientId,
        [`players/${state.playerId}/connected`]: true,
        [`players/${state.playerId}/lastSeen`]: serverTime,
      };
      if (room.meta.hostPlayerId === state.playerId) {
        updates['meta/hostClientId'] = clientId;
        updates['meta/updatedAt'] = serverTime;
      }
      await roomRef.update(updates);
      enterRoom(roomCode);
      showToast('已重新連線，正在恢復戰場', 'info');
      return;
    } catch (error) {
      console.warn(`Reconnect attempt ${attempt + 1} failed:`, error);
      if (attempt < RECONNECT_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
      }
    }
  }
  showToast('暫時無法重新連線，請稍後再試', 'error');
}

function enterRoom(roomCode) {
  leaveRoomListeners();
  state.roomCode = roomCode;
  state.roomRef = db.ref(`tower_defense/rooms/${roomCode}`);
  state.room = { status: 'waiting', players: {}, settlement: null };
  state.match = null;
  state.snapshotSeq = 0;
  state.lastSnapshotSeq = 0;
  state.snapshotSentAt = 0;
  state.guestVisualProgress.clear();
  state.guestVisualEffects.clear();
  state.guestVisualDamageNumbers.clear();
  state.guestVisualLastAt = 0;
  state.snapshotWriteInFlight = false;
  state.snapshotWriteQueued = false;
  state.snapshotExtraUpdates = {};
  state.settled = false;
  state.settlementPromise = null;
  state.pendingActions.clear();
  state.processedActions.clear();
  localStorage.setItem(`defense-room-${state.playerId}`, roomCode);
  const presenceRef = state.roomRef.child(`players/${state.playerId}`);
  presenceRef.onDisconnect().update({ connected: false, ready: false, lastSeen: serverTime });
  state.presenceRef = presenceRef;
  state.connectionRef = db.ref('.info/connected');
  state.connectionListener = state.connectionRef.on('value', (snapshot) => {
    if (snapshot.val() === true) recoverRoomConnection();
  });
  state.metaRef = state.roomRef.child('meta');
  state.metaListener = state.metaRef.on('value', (snapshot) => handleMetaUpdate(snapshot.val()));
  state.playersRef = state.roomRef.child('players');
  state.playersListener = state.playersRef.on('value', (snapshot) => handlePlayersUpdate(snapshot.val()));
  state.snapshotRef = state.roomRef.child('snapshot');
  state.snapshotListener = state.snapshotRef.on('value', (snapshot) => handleSnapshotUpdate(snapshot.val()));
  state.resultRef = state.roomRef.child(`actionResults/${clientId}`);
  state.resultListener = state.resultRef.on('child_added', (snapshot) => handleActionResult(snapshot));
  state.settlementRef = state.roomRef.child('settlement');
  state.settlementListener = state.settlementRef.on('value', (snapshot) => {
    if (!state.room) return;
    const settlement = snapshot.val();
    state.room.settlement = settlement;
    if (settlement && !state.room.testMode && !settlement.awarded?.[state.playerId]) {
      ensurePlayerReward(state.roomCode, settlement, state.playerId, state.roomRef).catch((error) => console.warn('Own reward retry failed:', error));
    }
    if (settlement && state.room.status === 'finished') showResult(settlement);
  });
  showScreen('lobbyScreen');
}

async function recoverRoomConnection() {
  if (!state.roomRef || !state.playerId || state.presenceRecoveryInFlight) return;
  state.presenceRecoveryInFlight = true;
  const roomRef = state.roomRef;
  try {
    const metaSnapshot = await roomRef.child('meta').once('value');
    const meta = metaSnapshot.val();
    if (!meta || meta.status === 'finished' || roomRef !== state.roomRef) return;
    await state.presenceRef.onDisconnect().update({ connected: false, ready: false, lastSeen: serverTime });
    const updates = {
      [`players/${state.playerId}/clientId`]: clientId,
      [`players/${state.playerId}/connected`]: true,
      [`players/${state.playerId}/lastSeen`]: serverTime,
    };
    if (meta.hostPlayerId === state.playerId) {
      updates['meta/hostClientId'] = clientId;
      updates['meta/updatedAt'] = serverTime;
    }
    await roomRef.update(updates);
    if (roomRef !== state.roomRef) return;
    state.guestLastRenderAt = 0;
    const latest = await roomRef.child('snapshot').once('value');
    handleSnapshotUpdate(latest.val(), true);
  } catch (error) {
    console.warn('Presence recovery failed:', error);
  } finally {
    state.presenceRecoveryInFlight = false;
  }
}

function syncDisconnectSettlementTimer(meta) {
  if (state.disconnectSettlementTimer) clearTimeout(state.disconnectSettlementTimer);
  state.disconnectSettlementTimer = 0;
  if (meta?.status !== 'paused' || !meta.pausedAt) return;
  const remaining = Math.max(0, GAME.roomReconnectMs - (Date.now() - Number(meta.pausedAt)));
  state.disconnectSettlementTimer = setTimeout(() => {
    state.disconnectSettlementTimer = 0;
    if (state.room?.status === 'paused') settleRoom('disconnect');
  }, remaining + 250);
}

function handleMetaUpdate(meta) {
  if (!state.room) return;
  if (!meta) {
    showToast('房間已關閉', 'error');
    leaveRoom(false);
    return;
  }
  Object.assign(state.room, meta);
  state.isHost = meta.hostClientId === clientId;
  syncDisconnectSettlementTimer(meta);
  byId('lobbyCode').textContent = state.roomCode;
  if (meta.status === 'playing' || meta.status === 'paused') {
    showScreen('battleScreen');
    if (state.match) renderBattleUi();
    else {
      const overlay = byId('battleOverlay');
      overlay.classList.add('show');
      overlay.querySelector('strong').textContent = '同步戰場中';
      overlay.querySelector('span').textContent = '正在接收房主的第一份戰鬥快照';
    }
    if (state.isHost) startHostRuntime();
    else if (state.match) startGuestRuntime();
  } else if (meta.status === 'finished') {
    stopHostRuntime();
    stopGuestRuntime();
    showResult(state.room.settlement || {
      reason: meta.endReason || 'defeat',
      reward: rewardForRun(state.match?.wave || 0, state.match?.bossesKilled || 0),
      wave: state.match?.wave || 0,
    });
  } else {
    stopHostRuntime();
    stopGuestRuntime();
    showScreen('lobbyScreen');
    renderLobby();
  }
}

function handlePlayersUpdate(players) {
  if (!state.room) return;
  state.room.players = players || {};
  if (state.room.status === 'waiting') renderLobby();
}

function handleSnapshotUpdate(envelope, force = false) {
  if (!envelope) return;
  const seq = Number(envelope.seq) || 0;
  if (!force && seq && seq <= state.lastSnapshotSeq) return;
  if (state.isHost && state.match) return;
  const acknowledged = Array.isArray(envelope.acknowledged)
    ? envelope.acknowledged
    : Object.values(envelope.acknowledged || {});
  acknowledged.forEach((actionId) => state.pendingActions.delete(actionId));
  const snapshot = envelope.state || envelope;
  const hydrated = reconcileMatchSnapshot(snapshot, [...state.pendingActions.values()], state.playerId);
  if (!hydrated) return;
  state.match = hydrated;
  if (!state.isHost) ingestGuestCombatVisuals(hydrated);
  state.lastSnapshotSeq = seq;
  if (state.isHost) state.snapshotSeq = Math.max(state.snapshotSeq, seq);
  state.snapshotSentAt = Number(envelope.sentAt) || Date.now();
  state.guestLastRenderAt = 0;
  if (state.room.status === 'playing' || state.room.status === 'paused') {
    showScreen('battleScreen');
    renderBattleUi();
    if (state.isHost) startHostRuntime();
    else startGuestRuntime();
  }
}

function handleActionResult(snapshot) {
  const result = snapshot.val();
  if (result?.actionId) state.pendingActions.delete(result.actionId);
  if (result && !result.ok) {
    showToast(result.reason || '操作未被房主接受', 'error');
    state.snapshotRef.once('value').then((latest) => handleSnapshotUpdate(latest.val(), true)).catch(() => {});
  }
  snapshot.ref.remove().catch((error) => console.warn('Action result cleanup failed:', error));
}

function renderLobby() {
  for (const playerId of ['p1', 'p2']) {
    const player = state.room?.players?.[playerId];
    const el = byId(playerId === 'p1' ? 'readyP1' : 'readyP2');
    el.classList.toggle('connected', Boolean(player?.connected));
    el.classList.toggle('ready', Boolean(player?.ready));
    el.querySelector('small').textContent = player?.connected ? (player.clientId === clientId ? '你正在使用此身分' : '已加入房間') : '等待加入';
    el.querySelector('b').textContent = player?.ready ? '已準備' : '未準備';
  }
  const me = state.room?.players?.[state.playerId];
  byId('readyBtn').textContent = me?.ready ? '取消準備' : '準備';
  byId('startBtn').style.display = state.isHost ? 'block' : 'none';
  const bothReady = ['p1', 'p2'].every((playerId) => state.room?.players?.[playerId]?.connected && state.room.players[playerId].ready);
  byId('startBtn').disabled = !bothReady;
  byId('lobbyDeck').innerHTML = state.user.deck.map((cardId) => towerArtHtml(cardId, 'lobby-card-art')).join('');
}

async function toggleReady() {
  const me = state.room?.players?.[state.playerId];
  if (!me) return;
  const validation = validateDeck(state.user.deck, state.user.collection);
  if (!validation.valid) return showToast(validation.reason, 'error');
  await state.roomRef.child(`players/${state.playerId}`).update({ ready: !me.ready, deck: state.user.deck, connected: true, lastSeen: serverTime });
}

async function startGame() {
  if (!state.isHost) return;
  const decks = {};
  for (const playerId of ['p1', 'p2']) {
    const player = state.room?.players?.[playerId];
    if (!player?.ready || !Array.isArray(player.deck)) return showToast('雙方尚未準備', 'error');
    decks[playerId] = player.deck;
  }
  const match = createMatch(decks, { seed: Date.now() });
  state.match = match;
  state.settled = false;
  state.snapshotSeq = 1;
  await state.roomRef.update({
    'meta/status': 'playing',
    'meta/startedAt': serverTime,
    'meta/updatedAt': serverTime,
    snapshot: { seq: state.snapshotSeq, sentAt: serverTime, acknowledged: [], state: snapshotMatch(match) },
    settlement: null,
  });
}

function startHostRuntime() {
  stopGuestRuntime();
  if (state.actionRef === null) {
    state.actionRef = state.roomRef.child('actions');
    state.actionListener = state.actionRef.on('child_added', (snapshot) => {
      const action = snapshot.val();
      const actionId = action?.actionId || snapshot.key;
      if (!action || !actionId || !action.clientId || state.processedActions.has(actionId)) {
        snapshot.ref.remove().catch(() => {});
        return;
      }
      state.processedActions.add(actionId);
      if (state.processedActions.size > 120) state.processedActions.delete(state.processedActions.values().next().value);
      const authorized = state.room.players?.[action.playerId]?.clientId === action.clientId;
      const result = authorized && state.match && state.room.status === 'playing'
        ? applyAction(state.match, action.playerId, action.payload, createSeededRandom(action.seed || Date.now()))
        : { ok: false, reason: authorized ? '對局目前不可操作' : '操作身分驗證失敗' };
      queueSnapshotWrite({
        [`actionResults/${action.clientId}/${actionId}`]: {
          actionId,
          ok: result.ok,
          reason: result.reason || '',
          resolvedAt: serverTime,
        },
      });
      snapshot.ref.remove().catch((error) => console.warn('Action cleanup failed:', error));
    });
  }
  if (!state.hostRaf) {
    state.hostLastTime = performance.now();
    state.hostLastRenderAt = 0;
    state.hostRaf = requestAnimationFrame(hostFrame);
  }
}

function stopHostRuntime() {
  if (state.hostRaf) cancelAnimationFrame(state.hostRaf);
  state.hostRaf = 0;
  if (state.actionRef && state.actionListener) state.actionRef.off('child_added', state.actionListener);
  state.actionRef = null;
  state.actionListener = null;
}

function startGuestRuntime() {
  stopHostRuntime();
  if (!state.guestVisualLastAt) state.guestVisualLastAt = performance.now();
  if (!state.guestRaf) state.guestRaf = requestAnimationFrame(guestFrame);
}

function stopGuestRuntime() {
  if (state.guestRaf) cancelAnimationFrame(state.guestRaf);
  state.guestRaf = 0;
  state.guestVisualLastAt = 0;
}

function queueSnapshotWrite(extraUpdates = {}) {
  Object.assign(state.snapshotExtraUpdates, extraUpdates);
  state.snapshotWriteQueued = true;
  flushSnapshotWrite();
}

function flushSnapshotWrite() {
  if (state.snapshotWriteInFlight || !state.snapshotWriteQueued || !state.roomRef || !state.match) return;
  state.snapshotWriteQueued = false;
  state.snapshotWriteInFlight = true;
  state.snapshotSeq += 1;
  const extraUpdates = state.snapshotExtraUpdates;
  state.snapshotExtraUpdates = {};
  const acknowledged = [...state.processedActions].slice(-100);
  state.roomRef.update({
    snapshot: { seq: state.snapshotSeq, sentAt: serverTime, acknowledged, state: snapshotMatch(state.match) },
    'meta/updatedAt': serverTime,
    ...extraUpdates,
  })
    .catch((error) => console.warn('Snapshot update failed:', error))
    .finally(() => {
      state.snapshotWriteInFlight = false;
      flushSnapshotWrite();
    });
}

function setRoomStatus(status, extra = {}) {
  if (state.room.status === status) return;
  state.room.status = status;
  state.metaRef.update({ status, updatedAt: serverTime, ...extra })
    .catch((error) => console.warn('Room status update failed:', error));
}

function hostFrame(now) {
  if (!state.isHost || !state.match || !state.roomRef) {
    state.hostRaf = 0;
    return;
  }
  const connected = ['p1', 'p2'].every((playerId) => state.room?.players?.[playerId]?.connected);
  if (!connected && state.room.status === 'playing') {
    setRoomStatus('paused', { pausedAt: serverTime });
  } else if (connected && state.room.status === 'paused') {
    setRoomStatus('playing', { pausedAt: null });
  }
  if (connected && state.room.status === 'playing') {
    let remaining = Math.min(1.5, Math.max(0, (now - state.hostLastTime) / 1000));
    while (remaining > 0 && state.match.status === 'playing') {
      const step = Math.min(0.05, remaining);
      tickMatch(state.match, step);
      remaining -= step;
    }
  }
  state.hostLastTime = now;
  if (now - state.lastSnapshotAt >= GAME.snapshotIntervalMs) {
    state.lastSnapshotAt = now;
    queueSnapshotWrite();
  }
  const frameInterval = battleCanvas.width <= 500 ? 1000 / 30 : 1000 / 45;
  if (now - state.hostLastRenderAt >= frameInterval) {
    state.hostLastRenderAt = now;
    renderBattleUi();
  }
  if (state.match.status === 'gameover') {
    showSettlementProgress('defeat');
    settleRoom('defeat');
    state.hostRaf = 0;
    return;
  }
  state.hostRaf = requestAnimationFrame(hostFrame);
}

function settlementReasonLabel(reason) {
  return {
    defeat: '夢境核心失守',
    disconnect: '重新連線逾時',
    left: '玩家提前離開',
  }[reason] || '守夜結束';
}

function showSettlementProgress(reason) {
  const overlay = byId('battleOverlay');
  overlay.classList.add('show');
  overlay.querySelector('strong').textContent = settlementReasonLabel(reason);
  overlay.querySelector('span').textContent = '正在結算本局獎勵';
}

function scheduleSettlementRetry(reason) {
  if (state.settlementRetryTimer || !state.roomRef || state.room?.status === 'finished') return;
  state.settlementRetryReason = reason;
  state.settlementRetryTimer = setTimeout(() => {
    state.settlementRetryTimer = 0;
    const retryReason = state.settlementRetryReason;
    state.settlementRetryReason = null;
    settleRoom(retryReason);
  }, SETTLEMENT_RETRY_MS);
}

async function ensurePlayerReward(roomCode, settlement, playerId, roomRef = null) {
  const key = `${roomCode}:${playerId}`;
  if (state.rewardPromises.has(key)) return state.rewardPromises.get(key);
  const promise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const result = await db.ref(`tower_defense/users/${playerId}`)
          .transaction((raw) => rewardUserForSettlement(raw, roomCode, settlement) || undefined);
        const rewarded = normalizeUser(result.snapshot.val()).rewardedRooms[roomCode];
        if (result.committed || rewarded) {
          if (roomRef) await roomRef.child(`settlement/awarded/${playerId}`).set(true);
          return true;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
    throw new Error(`Reward transaction did not commit for ${playerId}`, { cause: lastError });
  })();
  state.rewardPromises.set(key, promise);
  try {
    return await promise;
  } finally {
    state.rewardPromises.delete(key);
  }
}

async function awardSettlement(roomCode, settlement, roomRef) {
  const results = await Promise.allSettled(['p1', 'p2'].map((playerId) => ensurePlayerReward(roomCode, settlement, playerId, roomRef)));
  results.filter((result) => result.status === 'rejected').forEach((result) => console.warn('Reward update failed:', result.reason));
}

async function settleRoom(reason, matchOverride = null) {
  if (state.settlementPromise) return state.settlementPromise;
  const roomRef = state.roomRef;
  const roomCode = state.roomCode;
  const testMode = Boolean(state.room?.testMode);
  if (!roomRef) return null;
  state.settlementPromise = (async () => {
    let finalMatch = matchOverride || (state.isHost ? state.match : null);
    if (!finalMatch) {
      const snapshot = (await roomRef.child('snapshot').once('value')).val();
      finalMatch = reconcileMatchSnapshot(snapshot?.state || snapshot);
    }
    if (!finalMatch) return null;
    finalMatch.status = 'gameover';
    finalMatch.pausedReason = reason;
    const proposed = settlementForMatch(finalMatch, reason);
    const result = await roomRef.child('settlement').transaction((current) => current ? undefined : proposed);
    const settlement = result.snapshot.val() || proposed;
    state.settled = true;
    state.snapshotSeq = Math.max(state.snapshotSeq, state.lastSnapshotSeq) + 1;
    state.room.settlement = settlement;
    state.room.status = 'finished';
    showResult(settlement);
    await roomRef.update({
      'meta/status': 'finished',
      'meta/endReason': settlement.reason,
      'meta/updatedAt': serverTime,
      snapshot: {
        seq: state.snapshotSeq,
        sentAt: serverTime,
        acknowledged: [...state.processedActions].slice(-100),
        state: snapshotMatch(finalMatch),
      },
    });
    if (!testMode) await awardSettlement(roomCode, settlement, roomRef);
    return settlement;
  })();
  try {
    return await state.settlementPromise;
  } catch (error) {
    state.settled = false;
    console.error('Room settlement failed:', error);
    showToast('結算連線中斷，將自動重試', 'error');
    scheduleSettlementRetry(reason);
    return null;
  } finally {
    state.settlementPromise = null;
  }
}

async function sendBattleAction(payload) {
  if (demoMode) {
    const result = applyAction(state.match, state.playerId, payload, createSeededRandom(Date.now()));
    if (!result.ok) showToast(result.reason, 'error');
    else playActionSound(payload.type);
    return result.ok;
  }
  if (!state.roomRef || state.room?.status !== 'playing') return showToast('對局目前已暫停', 'info');
  const actionId = `${clientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const seed = Date.now();
  const action = { actionId, playerId: state.playerId, clientId, payload, seed, createdAt: serverTime };
  if (state.isHost) {
    const result = applyAction(state.match, state.playerId, payload, createSeededRandom(seed));
    if (!result.ok) showToast(result.reason, 'error');
    else {
      playActionSound(payload.type);
      addActionBurst(payload);
      queueSnapshotWrite();
    }
    return result.ok;
  }
  const predicted = applyAction(state.match, state.playerId, payload, createSeededRandom(seed));
  if (!predicted.ok) {
    showToast(predicted.reason, 'error');
    return false;
  }
  state.pendingActions.set(actionId, action);
  playActionSound(payload.type);
  addActionBurst(payload);
  renderBattleUi();
  try {
    await state.roomRef.child(`actions/${actionId}`).set(action);
    return true;
  } catch (error) {
    state.pendingActions.delete(actionId);
    console.error('Guest action send failed:', error);
    showToast('操作同步失敗，正在重新同步', 'error');
    state.snapshotRef.once('value').then((snapshot) => handleSnapshotUpdate(snapshot.val(), true)).catch(() => {});
    return false;
  }
}

async function leaveRoom(removeSelf = true) {
  const shouldSettle = removeSelf && ['playing', 'paused'].includes(state.room?.status);
  const settlement = shouldSettle ? await settleRoom('left') : null;
  if (!shouldSettle && state.room?.status === 'finished' && state.room?.settlement && !state.room?.testMode) {
    await ensurePlayerReward(state.roomCode, state.room.settlement, state.playerId, state.roomRef)
      .catch((error) => console.warn('Reward confirmation before leaving failed:', error));
  }
  stopHostRuntime();
  if (state.roomRef && removeSelf) {
    try {
      await state.roomRef.child(`players/${state.playerId}`).update({ connected: false, ready: false, lastSeen: serverTime });
    } catch (error) {
      console.warn('Leave room update failed:', error);
    }
  }
  leaveRoomListeners();
  localStorage.removeItem(`defense-room-${state.playerId}`);
  state.roomCode = null;
  state.room = null;
  state.match = null;
  state.selectedHand = null;
  state.selectedTower = null;
  clearTowerDrag();
  closeModal('resultModal');
  showScreen('hubScreen');
  await loadUser(state.playerId);
  if (settlement) showToast(`已結算本局，獲得 ${settlement.reward} 枚夢境代幣`, 'info');
}

function leaveRoomListeners() {
  stopHostRuntime();
  stopGuestRuntime();
  if (state.presenceRef) state.presenceRef.onDisconnect().cancel().catch(() => {});
  if (state.connectionRef && state.connectionListener) state.connectionRef.off('value', state.connectionListener);
  if (state.metaRef && state.metaListener) state.metaRef.off('value', state.metaListener);
  if (state.playersRef && state.playersListener) state.playersRef.off('value', state.playersListener);
  if (state.snapshotRef && state.snapshotListener) state.snapshotRef.off('value', state.snapshotListener);
  if (state.resultRef && state.resultListener) state.resultRef.off('child_added', state.resultListener);
  if (state.settlementRef && state.settlementListener) state.settlementRef.off('value', state.settlementListener);
  state.roomRef = null;
  state.presenceRef = null;
  state.metaRef = null;
  state.metaListener = null;
  state.playersRef = null;
  state.playersListener = null;
  state.snapshotRef = null;
  state.snapshotListener = null;
  state.resultRef = null;
  state.resultListener = null;
  state.settlementRef = null;
  state.settlementListener = null;
  state.connectionRef = null;
  state.connectionListener = null;
  state.presenceRecoveryInFlight = false;
  if (state.disconnectSettlementTimer) clearTimeout(state.disconnectSettlementTimer);
  state.disconnectSettlementTimer = 0;
  if (state.settlementRetryTimer) clearTimeout(state.settlementRetryTimer);
  state.settlementRetryTimer = 0;
  state.settlementRetryReason = null;
  state.rewardPromises.clear();
}

function showResult(value) {
  const settlement = typeof value === 'number' ? { reward: value } : value || {};
  const wave = settlement.wave ?? state.match?.wave ?? 0;
  byId('resultReason').textContent = settlementReasonLabel(settlement.reason);
  byId('resultWave').textContent = `抵達第 ${wave} 波`;
  byId('resultReward').textContent = `獲得 ${settlement.reward || 0} 枚夢境代幣`;
  openModal('resultModal');
}

function bossAbilityInfo(enemy) {
  if (!enemy?.boss) return null;
  const interval = ENEMIES[enemy.type]?.abilityInterval;
  if (!interval) return null;
  const cd = Math.max(0, Number(enemy.abilityCd) || 0);
  return {
    label: BOSS_ABILITY_LABELS[enemy.type] || '技能',
    cd,
    interval,
    urgent: cd <= Math.min(2.5, interval * .35),
  };
}

function battleStatusChips(match, playerId) {
  const player = match.players?.[playerId];
  if (!player) return [];
  const chips = [];
  const hateStacks = Math.max(0, Number(player.hateDamageStacks) || 0);
  if (hateStacks > 0) chips.push({ text: `憎恨 +${Math.round(hateStacks * 3)}%`, color: '#B489E6' });
  const silenced = player.board.filter((tower) => tower?.silencedBy).length;
  if (silenced) chips.push({ text: `沉默 ${silenced}`, color: '#CB7373', warn: true });
  const chargeReady = player.board.filter((tower) => tower?.cardId === 'charge_core' && tower.chargeReady).length;
  if (chargeReady) chips.push({ text: `充能就緒 ${chargeReady}`, color: '#55D6F2', warn: true });
  const charging = player.board
    .filter((tower) => tower?.cardId === 'charge_core' && !tower.chargeReady)
    .map((tower) => {
      const stats = cardStats(tower.cardId, tower.rank);
      return `${Math.max(0, Number(tower.charge) || 0)}/${stats.chargeRequired}`;
    });
  if (charging.length) chips.push({ text: `充能 ${charging.join(' ')}`, color: '#55D6F2' });
  const bossInfos = (match.enemies || [])
    .filter((enemy) => enemy.boss && (enemy.lane === playerId || enemyPositionIsShared(enemy)))
    .map((enemy) => bossAbilityInfo(enemy))
    .filter(Boolean)
    .sort((a, b) => a.cd - b.cd)
    .slice(0, 2);
  bossInfos.forEach((info) => chips.push({
    text: `Boss ${info.label} ${info.cd.toFixed(1)}s`,
    color: info.urgent ? '#F0B84B' : '#D0A34F',
    warn: info.urgent,
  }));
  if (state.reducedFx) chips.push({ text: '特效節流', color: '#A9B0A3' });
  return chips;
}

function enemyPositionIsShared(enemy) {
  return enemy.progress >= 0.5;
}

function renderBattleChips(chips) {
  byId('battleAlerts').innerHTML = chips.map((chip) => (
    `<span class="battle-chip ${chip.warn ? 'warn' : ''}" style="--chip-color:${chip.color}">${escapeHtml(chip.text)}</span>`
  )).join('');
}

function renderBattleUi() {
  if (!state.match) return;
  const me = state.match.players?.[state.playerId];
  if (!me) return;
  const partnerId = state.playerId === 'p1' ? 'p2' : 'p1';
  const partner = state.match.players?.[partnerId];
  const now = performance.now();
  if (now - state.lastBattleDomAt >= 100) {
    state.lastBattleDomAt = now;
    byId('waveValue').textContent = state.match.wave;
    byId('livesValue').textContent = `${state.match.lives} / ${GAME.lives}`;
    byId('battleState').textContent = state.room?.status === 'paused'
      ? '等待重連'
      : state.match.waveState === 'break' ? `下一波 ${Math.max(0, state.match.nextWaveIn).toFixed(1)}s` : '防守中';
    byId('resourceValue').textContent = Math.floor(me.resource);
    const bossWave = nextBossWave(state.match.wave);
    byId('nextBossValue').textContent = isBossWave(state.match.wave) ? 'BOSS' : `${bossWave - state.match.wave} 波`;
    byId('partnerValue').textContent = `${Math.floor(partner?.resource || 0)} ✦`;
    battleCanvas.dataset.viewer = state.playerId;
    battleCanvas.dataset.viewMode = VIEW_MODE;
    battleCanvas.dataset.ownBoardSide = 'bottom';
    battleCanvas.dataset.ownTowers = String(me.board.filter(Boolean).length);
    battleCanvas.dataset.partnerTowers = String(partner?.board?.filter(Boolean).length || 0);
    battleCanvas.dataset.enemies = String(state.match.enemies?.length || 0);
    battleCanvas.dataset.enemySignature = (state.match.enemies || [])
      .slice(0, 8)
      .map((enemy) => `${enemy.id}:${enemy.progress.toFixed(3)}:${Math.ceil(enemy.hp)}`)
      .join('|');
    battleCanvas.dataset.ownBoardSignature = me.board
      .map((tower, index) => tower ? `${index}:${tower.cardId}:${tower.rank}` : '')
      .filter(Boolean)
      .join('|');
    battleCanvas.dataset.snapshotSeq = String(state.isHost ? state.snapshotSeq : state.lastSnapshotSeq);
    battleCanvas.dataset.damageNumbers = String(state.match.damageNumbers?.length || 0);
    const connected = state.room?.players?.[partnerId]?.connected !== false;
    const pendingCount = state.pendingActions.size;
    const syncValue = byId('syncValue');
    syncValue.textContent = state.isHost ? '房主' : !connected ? '中斷' : pendingCount ? `同步 ${pendingCount}` : '已同步';
    syncValue.classList.toggle('pending', pendingCount > 0);
    syncValue.classList.toggle('offline', !connected);
    const interval = state.match.wave >= 100 ? 5 : 10;
    const waveProgress = isBossWave(state.match.wave) ? 100 : ((state.match.wave % interval) / interval) * 100;
    byId('waveProgress').style.width = `${Math.max(4, waveProgress)}%`;
    byId('waveTrackText').textContent = isBossWave(state.match.wave) ? 'Boss 波進行中' : `距離 Boss：${bossWave - state.match.wave} 波`;
    const chips = battleStatusChips(state.match, state.playerId);
    renderBattleChips(chips);
    battleCanvas.dataset.statusChips = chips.map((chip) => chip.text).join('|');
  }
  const handSignature = `${me.hand.join('|')}::${state.selectedHand ?? '-'}::${me.resource >= GAME.placeCost ? 'ready' : 'poor'}`;
  if (state.handSignature !== handSignature) {
    state.handSignature = handSignature;
    byId('hand').innerHTML = me.hand.map((cardId, index) => {
      const card = CARDS[cardId];
      const rarity = RARITIES[card.rarity];
      return `<button class="hand-card ${state.selectedHand === index ? 'selected' : ''} ${me.resource < GAME.placeCost ? 'unaffordable' : ''}" data-hand="${index}" style="--card-color:${card.color};--rarity-color:${rarity.color}">${towerArtHtml(cardId)}<small>${escapeHtml(card.name)}</small><i>${escapeHtml(rarity.name)}</i><b>${GAME.placeCost}</b></button>`;
    }).join('');
  }
  const selectedTower = state.selectedTower === null ? null : me.board[state.selectedTower];
  const mergeTargets = selectedTower ? me.board.filter((tower, index) => (
    tower && isValidMergeTarget(state.selectedTower, index)
  )).length : 0;
  byId('battleHelp').textContent = state.selectedHand !== null
    ? me.resource < GAME.placeCost ? '資源不足，擊殺敵人後即可放置。' : '選擇亮起的空格放置卡牌。'
    : selectedTower ? `${CARDS[selectedTower.cardId].name} ${selectedTower.rank} 階 · ${mergeTargets ? `有 ${mergeTargets} 座可合成目標` : '目前沒有可合成目標'}`
      : '選擇手牌放置，或選擇同種同階塔合成。';
  const selectedHandCard = state.selectedHand === null ? null : me.hand[state.selectedHand];
  const infoCardId = selectedTower?.cardId || selectedHandCard;
  const infoRank = selectedTower?.rank || 1;
  const infoPanel = byId('battleCardInfo');
  battleCanvas.dataset.dragTarget = state.dragTarget === null ? '' : String(state.dragTarget);
  infoPanel.classList.toggle('active', Boolean(infoCardId));
  if (infoCardId) {
    const card = CARDS[infoCardId];
    const rarity = RARITIES[card.rarity];
    const stats = cardStats(infoCardId, infoRank);
    infoPanel.style.setProperty('--card-color', card.color);
    byId('battleInfoArt').style.cssText = towerArtStyle(infoCardId);
    byId('battleInfoName').textContent = `${card.name} · ${rarity.name} · ${infoRank} 階`;
    byId('battleInfoDescription').textContent = card.description;
    byId('battleInfoStats').textContent = `傷害 ${Math.round(stats.damage)} · 間隔 ${stats.interval.toFixed(2)} 秒 · ${card.rankEffect}`;
  } else {
    infoPanel.style.removeProperty('--card-color');
    byId('battleInfoArt').style.cssText = '';
    byId('battleInfoName').textContent = '選擇卡牌或塔';
    byId('battleInfoDescription').textContent = '選取後可查看攻擊方式與目前階級數值。';
    byId('battleInfoStats').textContent = '拖曳同種同階塔即可合成';
  }
  const overlay = byId('battleOverlay');
  const paused = state.room?.status === 'paused';
  overlay.classList.toggle('show', paused);
  if (paused) {
    overlay.querySelector('strong').textContent = '等待夥伴重新連線';
    overlay.querySelector('span').textContent = '房間將保留五分鐘';
  }
  resizeBattleCanvas();
  drawBattle(battleCtx, battleCanvas, state.match, state.playerId, {
    selectedTower: state.selectedTower,
    selectedHand: state.selectedHand,
    dragTower: state.dragTower,
    dragTarget: state.dragTarget,
    dragPosition: state.dragPosition,
    enemyProgress: state.isHost ? null : state.guestVisualProgress,
    effects: state.isHost ? null : [...state.guestVisualEffects.values()],
    damageNumbers: state.isHost ? null : [...state.guestVisualDamageNumbers.values()],
    actionBursts: state.actionBursts,
  });
  state.actionBursts = state.actionBursts.filter((burst) => now - burst.startedAt < 650);
  syncEffectSounds(state.match);
}

function guestFrame(now) {
  if (state.isHost || !state.match || !state.roomRef) {
    state.guestRaf = 0;
    return;
  }
  const frameInterval = battleCanvas.width <= 500 ? 1000 / 30 : 1000 / 45;
  if (now - state.guestLastRenderAt < frameInterval) {
    state.guestRaf = requestAnimationFrame(guestFrame);
    return;
  }
  state.guestLastRenderAt = now;
  updateGuestVisuals(now);
  resizeBattleCanvas();
  drawBattle(battleCtx, battleCanvas, state.match, state.playerId, {
    selectedTower: state.selectedTower,
    selectedHand: state.selectedHand,
    dragTower: state.dragTower,
    dragTarget: state.dragTarget,
    dragPosition: state.dragPosition,
    enemyProgress: state.guestVisualProgress,
    effects: [...state.guestVisualEffects.values()],
    damageNumbers: [...state.guestVisualDamageNumbers.values()],
    actionBursts: state.actionBursts,
  });
  battleCanvas.dataset.visualEnemySignature = (state.match.enemies || [])
    .slice(0, 8)
    .map((enemy) => `${enemy.id}:${(state.guestVisualProgress.get(enemy.id) ?? enemy.progress).toFixed(4)}`)
    .join('|');
  battleCanvas.dataset.visualEffectSignature = visualTtlSignature(state.guestVisualEffects.values());
  battleCanvas.dataset.visualDamageSignature = visualTtlSignature(state.guestVisualDamageNumbers.values());
  state.guestRaf = requestAnimationFrame(guestFrame);
}

function guestVisualElapsedSeconds() {
  if (state.room?.status !== 'playing' || !Number.isFinite(state.snapshotSentAt)) return 0;
  return Math.min(MAX_GUEST_VISUAL_LEAD_SECONDS, Math.max(0, (Date.now() - state.snapshotSentAt) / 1000));
}

function visualTtlSignature(items) {
  return [...(items || [])]
    .filter((item) => item.ttl > 0)
    .slice(0, 12)
    .map((item) => `${item.id}:${item.ttl.toFixed(4)}`)
    .join('|');
}

function ingestGuestCombatVisuals(match) {
  for (const effect of match.effects || []) {
    const existing = state.guestVisualEffects.get(effect.id);
    if (existing) Object.assign(existing, effect, { ttl: existing.ttl });
    else state.guestVisualEffects.set(effect.id, { ...effect, ttl: effect.maxTtl || effect.ttl || .48 });
  }
  for (const number of match.damageNumbers || []) {
    if (!state.guestVisualDamageNumbers.has(number.id)) {
      state.guestVisualDamageNumbers.set(number.id, { ...number, ttl: number.maxTtl || number.ttl || .82 });
    }
  }
  const limits = guestVisualLimits(match);
  trimVisualCollection(state.guestVisualEffects, limits.effects);
  trimVisualCollection(state.guestVisualDamageNumbers, limits.damage);
}

function trimVisualCollection(collection, limit) {
  while (collection.size > limit) collection.delete(collection.keys().next().value);
}

function guestVisualLimits(match) {
  const enemyCount = match.enemies?.length || 0;
  const pressure = enemyCount + (match.effects?.length || 0) * .3 + (match.damageNumbers?.length || 0) * .42;
  if (pressure > 58 || state.lastFrameCostMs > BATTLE_EFFECT_TARGET_MS) {
    return { effects: Math.min(90, GUEST_VISUAL_EFFECT_LIMIT), damage: Math.min(62, GUEST_VISUAL_DAMAGE_LIMIT) };
  }
  return { effects: GUEST_VISUAL_EFFECT_LIMIT, damage: GUEST_VISUAL_DAMAGE_LIMIT };
}

function updateGuestVisuals(now) {
  const dt = Math.min(.1, Math.max(0, (now - (state.guestVisualLastAt || now)) / 1000));
  state.guestVisualLastAt = now;
  const predictionSeconds = state.room?.status === 'playing'
    ? guestVisualElapsedSeconds()
    : 0;
  const alive = new Set();
  for (const enemy of state.match?.enemies || []) {
    alive.add(enemy.id);
    const target = Math.min(1, enemy.progress + enemy.speed * (1 - (enemy.slow || 0)) * predictionSeconds);
    const current = state.guestVisualProgress.get(enemy.id);
    if (current === undefined) {
      state.guestVisualProgress.set(enemy.id, target);
      continue;
    }
    const blend = 1 - Math.exp(-GUEST_VISUAL_CONVERGENCE_RATE * dt);
    state.guestVisualProgress.set(enemy.id, current + (target - current) * blend);
  }
  for (const enemyId of state.guestVisualProgress.keys()) {
    if (!alive.has(enemyId)) state.guestVisualProgress.delete(enemyId);
  }
  if (state.room?.status !== 'playing') return;
  for (const collection of [state.guestVisualEffects, state.guestVisualDamageNumbers]) {
    for (const [id, item] of collection) {
      item.ttl -= dt;
      if (item.ttl <= 0) collection.delete(id);
    }
  }
}

function resizeBattleCanvas() {
  const rect = battleCanvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  const size = Math.min(1000, Math.max(360, Math.round(rect.width * scale)));
  if (battleCanvas.width !== size || battleCanvas.height !== size) {
    battleCanvas.width = size;
    battleCanvas.height = size;
  }
}

function drawBattle(ctx, canvas, match, viewer, options = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const frameStart = performance.now();
  const visualProfile = battleVisualProfile(match, canvas);
  const x = (value) => value * width;
  const y = (value) => value * height;
  ctx.clearRect(0, 0, width, height);
  drawBattleBackground(ctx, canvas);
  drawBoards(ctx, canvas, match, viewer, options, visualProfile);
  drawEnemies(ctx, canvas, match, viewer, options.interpolateSeconds || 0, options.enemyProgress, visualProfile);
  drawEffects(ctx, canvas, match, viewer, options.interpolateSeconds || 0, options.enemyProgress, options.effects, visualProfile);
  drawDamageNumbers(ctx, canvas, match, viewer, options.interpolateSeconds || 0, options.damageNumbers, visualProfile);
  drawActionBursts(ctx, canvas, viewer, options.actionBursts || []);
  drawDraggedTower(ctx, canvas, match, viewer, options);

  ctx.fillStyle = 'rgba(244,239,223,.68)';
  ctx.font = `800 ${Math.max(11, width * .015)}px system-ui`;
  ctx.textAlign = 'center';
  const partnerId = viewer === 'p1' ? 'p2' : 'p1';
  ctx.fillText(`${PLAYER_NAMES[partnerId]}防線`, x(.5), y(.045));
  ctx.fillText(`${PLAYER_NAMES[viewer]}防線 · 你`, x(.5), y(.985));
  ctx.fillStyle = '#d0a34f';
  ctx.font = `900 ${Math.max(10, width * .012)}px system-ui`;
  ctx.fillText('共用中線 · 優先鎖定', x(.52), y(.465));
  state.lastFrameCostMs = performance.now() - frameStart;
  state.reducedFx = visualProfile.reduced;
}

function battleVisualProfile(match, canvas) {
  const enemyCount = match.enemies?.length || 0;
  const effectCount = match.effects?.length || 0;
  const damageCount = match.damageNumbers?.length || 0;
  const mobile = canvas.width <= 500;
  const pressure = enemyCount + effectCount * .34 + damageCount * .45;
  const reduced = pressure > (mobile ? 34 : 58)
    || enemyCount > (mobile ? 12 : PERFORMANCE_SOFT_ENEMY_COUNT)
    || state.lastFrameCostMs > BATTLE_EFFECT_TARGET_MS;
  return {
    reduced,
    effectLimit: reduced ? (mobile ? 42 : 68) : 120,
    damageLimit: reduced ? (mobile ? 24 : 42) : 90,
    shadowScale: reduced ? .45 : 1,
  };
}

function drawBattleBackground(ctx, canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const key = `${width}x${height}`;
  let background = battleBackgroundCache.get(key);
  if (!background) {
    background = document.createElement('canvas');
    background.width = width;
    background.height = height;
    const backgroundCtx = background.getContext('2d');
    const bg = backgroundCtx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#161d1c');
    bg.addColorStop(.52, '#171912');
    bg.addColorStop(1, '#111419');
    backgroundCtx.fillStyle = bg;
    backgroundCtx.fillRect(0, 0, width, height);

    const topBand = backgroundCtx.createLinearGradient(0, 0, 0, height * .34);
    topBand.addColorStop(0, 'rgba(131,184,199,.12)');
    topBand.addColorStop(1, 'rgba(131,184,199,.015)');
    backgroundCtx.fillStyle = topBand;
    backgroundCtx.fillRect(0, 0, width, height * .34);
    const bottomBand = backgroundCtx.createLinearGradient(0, height * .66, 0, height);
    bottomBand.addColorStop(0, 'rgba(130,184,120,.015)');
    bottomBand.addColorStop(1, 'rgba(130,184,120,.12)');
    backgroundCtx.fillStyle = bottomBand;
    backgroundCtx.fillRect(0, height * .66, width, height * .34);
    for (let index = 0; index < 46; index += 1) {
      const px = ((index * 83) % 997) / 997 * width;
      const py = ((index * 47) % 991) / 991 * height;
      backgroundCtx.fillStyle = `rgba(244,239,223,${0.06 + (index % 5) * .018})`;
      backgroundCtx.fillRect(px, py, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
    }
    drawRoute(backgroundCtx, background);
    battleBackgroundCache.set(key, background);
    if (battleBackgroundCache.size > 3) battleBackgroundCache.delete(battleBackgroundCache.keys().next().value);
  }
  ctx.drawImage(background, 0, 0);
}

function drawRoute(ctx, canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const x = (value) => value * width;
  const y = (value) => value * height;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const upperLane = [[.09,.04],[.09,.24],[.09,.4],[.09,.5],[.3,.5],[.55,.5],[.78,.5],[.93,.5]];
  const lowerLane = [[.09,.96],[.09,.76],[.09,.6],[.09,.5],[.3,.5],[.55,.5],[.78,.5],[.93,.5]];
  for (const points of [upperLane, lowerLane]) {
    ctx.beginPath();
    points.forEach(([px, py], index) => index ? ctx.lineTo(x(px), y(py)) : ctx.moveTo(x(px), y(py)));
    ctx.strokeStyle = 'rgba(2,4,3,.72)';
    ctx.lineWidth = width * .064;
    ctx.stroke();
    const laneGradient = ctx.createLinearGradient(x(.09), y(.5), x(.93), y(.5));
    laneGradient.addColorStop(0, 'rgba(89,72,40,.78)');
    laneGradient.addColorStop(.5, 'rgba(126,93,45,.84)');
    laneGradient.addColorStop(1, 'rgba(89,72,40,.78)');
    ctx.strokeStyle = laneGradient;
    ctx.lineWidth = width * .044;
    ctx.stroke();
    ctx.setLineDash([width * .012, width * .018]);
    ctx.strokeStyle = 'rgba(255,230,170,.28)';
    ctx.lineWidth = width * .003;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const coreGlow = ctx.createRadialGradient(x(.94), y(.5), 0, x(.94), y(.5), width * .065);
  coreGlow.addColorStop(0, 'rgba(255,225,130,.75)');
  coreGlow.addColorStop(.35, 'rgba(208,163,79,.28)');
  coreGlow.addColorStop(1, 'rgba(208,163,79,0)');
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(x(.94), y(.5), width * .065, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7dc93';
  ctx.beginPath();
  ctx.arc(x(.94), y(.5), width * .024, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6c572d';
  ctx.beginPath();
  ctx.arc(x(.952), y(.49), width * .022, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,242,189,.72)';
  ctx.lineWidth = width * .003;
  ctx.beginPath();
  ctx.arc(x(.94), y(.5), width * .031, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBoards(ctx, canvas, match, viewer, options, visualProfile = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const cellWidth = width * .13;
  const cellHeight = height * .052;
  for (const playerId of ['p1', 'p2']) {
    const player = match.players?.[playerId];
    if (!player) continue;
    player.board.forEach((tower, index) => {
      const pos = viewedBoardPosition(viewer, playerId, index);
      const isOwn = playerId === viewer;
      const selected = isOwn && options.selectedTower === index;
      const selectedTower = player.board[options.selectedTower];
      const canMergeSelected = selectedTower && selectedTower.rank < GAME.maxRank
        && player.resource >= GAME.mergeCosts[selectedTower.rank + 1];
      const mergeTarget = isOwn && options.selectedTower !== null && index !== options.selectedTower && tower
        && canMergeSelected && selectedTower.cardId === tower.cardId && selectedTower.rank === tower.rank;
      const activeDragTarget = mergeTarget && options.dragTarget === index;
      const placementTarget = isOwn && options.selectedHand !== null && !tower;
      ctx.fillStyle = selected ? 'rgba(208,163,79,.25)' : activeDragTarget ? 'rgba(130,184,120,.38)' : mergeTarget ? 'rgba(130,184,120,.18)' : placementTarget ? 'rgba(131,184,199,.12)' : isOwn ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.022)';
      ctx.strokeStyle = selected ? '#f2c96b' : activeDragTarget ? '#c8ffba' : mergeTarget ? '#82b878' : placementTarget ? '#83b8c7' : isOwn ? 'rgba(208,163,79,.3)' : 'rgba(131,184,199,.18)';
      ctx.lineWidth = Math.max(activeDragTarget ? 3 : 1, width * (activeDragTarget ? .005 : .002));
      roundedRect(ctx, pos.x * width - cellWidth / 2, pos.y * height - cellHeight / 2, cellWidth, cellHeight, width * .008);
      ctx.fill();
      ctx.stroke();
      if (mergeTarget || placementTarget) {
        ctx.save();
        ctx.globalAlpha = .28 + Math.sin(performance.now() / 170) * .12;
        ctx.strokeStyle = mergeTarget ? '#a9e69d' : '#a9e9fa';
        ctx.lineWidth = Math.max(2, width * .004);
        ctx.stroke();
        ctx.restore();
      }
      if (!tower) return;
      const card = CARDS[tower.cardId];
      const rarity = RARITIES[card.rarity];
      if (selected) {
        ctx.beginPath();
        ctx.arc(pos.x * width, pos.y * height, cellHeight * .8, 0, Math.PI * 2);
        ctx.fillStyle = `${card.color}22`;
        ctx.strokeStyle = `${card.color}aa`;
        ctx.fill();
        ctx.stroke();
      }
      drawSpriteCell(ctx, towerSprite, TOWER_SPRITES[tower.cardId], 4, 4, pos.x * width - cellHeight * .55, pos.y * height - cellHeight * .58, cellHeight * 1.1, cellHeight * 1.1);
      ctx.beginPath();
      ctx.arc(pos.x * width, pos.y * height, cellHeight * .62, 0, Math.PI * 2);
      ctx.strokeStyle = rarity.color;
      ctx.globalAlpha = .72;
      ctx.lineWidth = Math.max(1.5, width * .002);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = `900 ${cellHeight * .3}px system-ui`;
      ctx.fillStyle = '#f4ce78';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${tower.rank}`, pos.x * width + cellWidth * .36, pos.y * height - cellHeight * .31);
      drawTowerStatus(ctx, canvas, player, tower, pos, cellWidth, cellHeight, visualProfile);
    });
  }
}

function drawTowerStatus(ctx, canvas, player, tower, pos, cellWidth, cellHeight, visualProfile = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = pos.x * width;
  const centerY = pos.y * height;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (tower.cardId === 'charge_core') {
    const stats = cardStats(tower.cardId, tower.rank);
    const charge = Math.max(0, Number(tower.charge) || 0);
    const required = Math.max(1, stats.chargeRequired || 1);
    const pct = Math.max(0, Math.min(1, charge / required));
    const radius = cellHeight * .72;
    ctx.lineWidth = Math.max(2, width * .003);
    ctx.strokeStyle = 'rgba(0,0,0,.58)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = tower.chargeReady ? '#fff1a8' : '#55d6f2';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = visualProfile.reduced ? 4 : 12;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = tower.chargeReady ? '#fff1a8' : '#c5f8ff';
    ctx.font = `950 ${Math.max(8, cellHeight * .2)}px system-ui`;
    ctx.fillText(tower.chargeReady ? 'MAX' : `${charge}/${required}`, centerX - cellWidth * .36, centerY + cellHeight * .32);
  }
  if (tower.cardId === 'hate_dream') {
    const stacks = Math.max(0, Number(player.hateDamageStacks) || 0);
    if (stacks > 0) {
      ctx.fillStyle = 'rgba(18,7,32,.78)';
      ctx.strokeStyle = 'rgba(210,154,255,.82)';
      ctx.lineWidth = Math.max(1, width * .0015);
      roundedRect(ctx, centerX - cellWidth * .45, centerY - cellHeight * .55, cellWidth * .28, cellHeight * .32, width * .006);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8c7ff';
      ctx.font = `950 ${Math.max(7, cellHeight * .18)}px system-ui`;
      ctx.fillText(`+${Math.round(stacks * 3)}`, centerX - cellWidth * .31, centerY - cellHeight * .39);
    }
  }
  if (tower.silencedBy) {
    ctx.globalAlpha = .88;
    ctx.fillStyle = 'rgba(20,20,24,.58)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, cellHeight * .62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2b5b5';
    ctx.lineWidth = Math.max(2, width * .004);
    ctx.beginPath();
    ctx.moveTo(centerX - cellHeight * .4, centerY + cellHeight * .38);
    ctx.lineTo(centerX + cellHeight * .4, centerY - cellHeight * .38);
    ctx.stroke();
    ctx.fillStyle = '#f2b5b5';
    ctx.font = `950 ${Math.max(8, cellHeight * .22)}px system-ui`;
    ctx.fillText('沉', centerX + cellWidth * .31, centerY + cellHeight * .33);
  }
  ctx.restore();
}

function drawActionBursts(ctx, canvas, viewer, bursts) {
  const width = canvas.width;
  const height = canvas.height;
  const now = performance.now();
  bursts.forEach((burst) => {
    const age = (now - burst.startedAt) / 650;
    if (age < 0 || age > 1) return;
    const pos = viewedBoardPosition(viewer, burst.playerId, burst.cellIndex);
    const radius = width * (.018 + age * .055);
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = burst.type === 'merge' ? '#f4ce78' : '#9fe8ff';
    ctx.fillStyle = burst.type === 'merge' ? '#f4ce78' : '#9fe8ff';
    ctx.lineWidth = Math.max(2, width * .005 * (1 - age));
    ctx.beginPath();
    ctx.arc(pos.x * width, pos.y * height, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(pos.x * width + Math.cos(angle) * radius * .45, pos.y * height + Math.sin(angle) * radius * .45);
      ctx.lineTo(pos.x * width + Math.cos(angle) * radius, pos.y * height + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawEnemies(ctx, canvas, match, viewer, interpolateSeconds = 0, enemyProgress = null, visualProfile = {}) {
  const width = canvas.width;
  const height = canvas.height;
  match.enemies?.forEach((enemy) => {
    const pos = viewedEnemyPosition(viewer, {
      ...enemy,
      progress: enemyProgress?.get(enemy.id) ?? Math.min(1, enemy.progress + enemy.speed * (1 - (enemy.slow || 0)) * interpolateSeconds),
    });
    const size = width * (enemy.boss ? .095 : enemy.type === 'tank' ? .07 : enemy.type === 'swarm' ? .05 : .062);
    ctx.save();
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = (enemy.boss ? 24 : 8) * (visualProfile.shadowScale ?? 1);
    drawSpriteCell(ctx, enemySprite, ENEMY_SPRITES[enemy.type] || ENEMY_SPRITES.normal, 4, 3, pos.x * width - size / 2, pos.y * height - size / 2, size, size);
    ctx.restore();
    const hpPct = Math.max(0, enemy.hp / enemy.maxHp);
    const radius = size * .44;
    ctx.fillStyle = 'rgba(0,0,0,.52)';
    roundedRect(ctx, pos.x * width - radius, pos.y * height - size * .54, radius * 2, Math.max(3, width * .005), 3);
    ctx.fill();
    ctx.fillStyle = enemy.boss ? '#d0a34f' : '#82b878';
    roundedRect(ctx, pos.x * width - radius, pos.y * height - size * .54, radius * 2 * hpPct, Math.max(3, width * .005), 3);
    ctx.fill();
    if (enemy.boss) drawBossTelegraph(ctx, canvas, enemy, pos, size, visualProfile);
  });
}

function drawBossTelegraph(ctx, canvas, enemy, pos, size, visualProfile = {}) {
  const info = bossAbilityInfo(enemy);
  if (!info) return;
  const width = canvas.width;
  const height = canvas.height;
  const x = pos.x * width;
  const y = pos.y * height;
  const pct = 1 - Math.max(0, Math.min(1, info.cd / info.interval));
  const pulse = (Math.sin(performance.now() / 95) + 1) / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, width * .004);
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath();
  ctx.arc(x, y, size * .62, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = info.urgent ? '#f4ce78' : '#83b8c7';
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = visualProfile.reduced ? 4 : (info.urgent ? 18 : 9);
  ctx.beginPath();
  ctx.arc(x, y, size * .62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
  if (info.urgent) {
    ctx.globalAlpha = .28 + pulse * .28;
    ctx.beginPath();
    ctx.arc(x, y, size * (.72 + pulse * .2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (!visualProfile.reduced || info.urgent) {
    const labelWidth = Math.max(width * .072, size * 1.05);
    const labelHeight = Math.max(16, width * .022);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(12,14,10,.78)';
    ctx.strokeStyle = info.urgent ? '#f4ce78' : 'rgba(131,184,199,.6)';
    ctx.lineWidth = Math.max(1, width * .0015);
    roundedRect(ctx, x - labelWidth / 2, y - size * .8 - labelHeight / 2, labelWidth, labelHeight, labelHeight / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = info.urgent ? '#fff0b8' : '#d9eff4';
    ctx.font = `950 ${Math.max(9, width * .011)}px system-ui`;
    ctx.fillText(`${info.label} ${info.cd.toFixed(1)}`, x, y - size * .8);
  }
  ctx.restore();
}

function drawEffects(ctx, canvas, match, viewer, interpolateSeconds = 0, enemyProgress = null, visualEffects = null, visualProfile = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const enemyById = new Map((match.enemies || []).map((enemy) => [enemy.id, enemy]));
  const effects = [...(visualEffects ?? match.effects ?? [])].slice(-visualProfile.effectLimit);
  effects.forEach((effect) => {
    const visualTtl = effect.ttl - interpolateSeconds;
    if (visualTtl <= 0) return;
    const life = Math.max(0, Math.min(1, visualTtl / (effect.maxTtl || .48)));
    const progress = 1 - life;
    const eased = 1 - ((1 - progress) ** 3);
    const from = Number.isInteger(effect.fromCellIndex) && effect.playerId
      ? viewedBoardPosition(viewer, effect.playerId, effect.fromCellIndex)
      : orientPosition({ x: effect.fromX, y: effect.fromY }, viewer);
    const targetEnemy = enemyById.get(effect.targetId);
    const target = targetEnemy
      ? viewedEnemyPosition(viewer, {
        ...targetEnemy,
        progress: enemyProgress?.get(targetEnemy.id) ?? targetEnemy.progress,
      })
      : orientPosition({ x: effect.x, y: effect.y }, viewer);
    const fromX = from.x * width;
    const fromY = from.y * height;
    const targetX = target.x * width;
    const targetY = target.y * height;
    const currentX = fromX + (targetX - fromX) * eased;
    const currentY = fromY + (targetY - fromY) * eased;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = (effect.crit ? 22 : 12) * (visualProfile.shadowScale ?? 1);
    if (effect.type === 'chain') {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      for (let segment = 1; segment < 7; segment += 1) {
        const t = segment / 7;
        const jitter = (segment % 2 ? 1 : -1) * width * .006 * life;
        ctx.lineTo(fromX + (targetX - fromX) * t + jitter, fromY + (targetY - fromY) * t - jitter);
      }
      ctx.lineTo(targetX, targetY);
      ctx.lineWidth = width * .004;
      ctx.stroke();
    } else if (effect.type === 'global') {
      ctx.beginPath();
      ctx.moveTo(targetX - width * .065, targetY - height * .11);
      ctx.lineTo(targetX, targetY);
      ctx.lineWidth = width * .008 * life;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(targetX, targetY, width * (.012 + progress * .03), 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === 'laser') {
      ctx.globalAlpha = Math.min(1, life * 1.5);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(targetX, targetY);
      ctx.lineWidth = width * (.011 + .006 * life);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(244,239,223,.86)';
      ctx.lineWidth = width * .0035;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(targetX, targetY, width * (.01 + progress * .024), 0, Math.PI * 2);
      ctx.strokeStyle = effect.color;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(currentX, currentY);
      ctx.lineWidth = width * (effect.type === 'burst' ? .006 : .003) * life;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(currentX, currentY, width * (effect.crit ? .012 : .008), 0, Math.PI * 2);
      ctx.fill();
      if (effect.type === 'splash' || effect.type === 'slow' || progress > .72) {
        ctx.beginPath();
        ctx.arc(targetX, targetY, width * (.012 + progress * (effect.type === 'splash' ? .065 : .035)), 0, Math.PI * 2);
        ctx.globalAlpha = life;
        ctx.lineWidth = width * .004;
        ctx.stroke();
      }
      if (effect.type === 'dot') {
        for (let particle = 0; particle < 4; particle += 1) {
          ctx.beginPath();
          ctx.arc(targetX + Math.sin(particle * 2.1 + progress * 5) * width * .014, targetY - progress * width * (.018 + particle * .006), width * .004, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (effect.crit) {
      ctx.fillStyle = effect.color;
      ctx.font = `900 ${width * .018}px system-ui`;
      ctx.fillText('CRIT', targetX, targetY - width * .025);
    }
    ctx.restore();
  });
}

function drawDamageNumbers(ctx, canvas, match, viewer, interpolateSeconds = 0, visualDamageNumbers = null, visualProfile = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const numbers = [...(visualDamageNumbers ?? match.damageNumbers ?? [])].slice(-visualProfile.damageLimit);
  numbers.forEach((number) => {
    const visualTtl = number.ttl - interpolateSeconds;
    if (visualTtl <= 0) return;
    const life = Math.max(0, Math.min(1, visualTtl / (number.maxTtl || .82)));
    const progress = 1 - life;
    const pos = orientPosition({ x: number.x, y: number.y }, viewer);
    ctx.save();
    ctx.globalAlpha = Math.min(1, life * 1.8);
    ctx.fillStyle = number.crit ? '#ffe18a' : '#f4efe0';
    ctx.strokeStyle = 'rgba(15,17,12,.82)';
    ctx.lineWidth = Math.max(2, width * .003);
    ctx.font = `950 ${width * (number.crit ? .023 : .018)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `${number.crit ? '!' : ''}${Math.max(1, Math.round(number.damage))}`;
    const drawX = pos.x * width;
    const drawY = pos.y * height - width * (.028 + progress * .055);
    ctx.strokeText(label, drawX, drawY);
    ctx.fillText(label, drawX, drawY);
    ctx.restore();
  });
}

function drawDraggedTower(ctx, canvas, match, viewer, options) {
  if (options.dragTower === null || !options.dragPosition) return;
  const tower = match.players?.[viewer]?.board?.[options.dragTower];
  if (!tower) return;
  const width = canvas.width;
  const height = canvas.height;
  const size = height * .07;
  ctx.save();
  ctx.globalAlpha = .88;
  ctx.shadowColor = CARDS[tower.cardId].color;
  ctx.shadowBlur = width * .025;
  drawSpriteCell(ctx, towerSprite, TOWER_SPRITES[tower.cardId], 4, 4, options.dragPosition.x * width - size / 2, options.dragPosition.y * height - size / 2, size, size);
  ctx.restore();
}

function drawSpriteCell(ctx, image, cell, cols, rows, dx, dy, dw, dh) {
  if (!image.complete || !image.naturalWidth) return;
  const sourceWidth = image.naturalWidth / cols;
  const sourceHeight = image.naturalHeight / rows;
  ctx.drawImage(image, cell[0] * sourceWidth, cell[1] * sourceHeight, sourceWidth, sourceHeight, dx, dy, dw, dh);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function battlePointFromEvent(event) {
  const rect = battleCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function battleCellFromPoint(point) {
  let closest = null;
  let distance = Infinity;
  for (let index = 0; index < GAME.rows * GAME.cols; index += 1) {
    const pos = viewedBoardPosition(state.playerId, state.playerId, index);
    const dx = Math.abs(point.x - pos.x) / .075;
    const dy = Math.abs(point.y - pos.y) / .0325;
    const nextDistance = Math.hypot(dx, dy);
    if (nextDistance < distance) {
      distance = nextDistance;
      closest = index;
    }
  }
  return distance <= 1 ? closest : null;
}

function battleCellFromEvent(event) {
  return battleCellFromPoint(battlePointFromEvent(event));
}

function isValidMergeTarget(fromIndex, toIndex) {
  const board = state.match?.players?.[state.playerId]?.board;
  const resource = state.match?.players?.[state.playerId]?.resource || 0;
  const from = board?.[fromIndex];
  const to = board?.[toIndex];
  return Boolean(
    from
    && to
    && fromIndex !== toIndex
    && from.cardId === to.cardId
    && from.rank === to.rank
    && from.rank < GAME.maxRank
    && resource >= GAME.mergeCosts[from.rank + 1],
  );
}

function clearTowerDrag() {
  state.dragTower = null;
  state.dragTarget = null;
  state.dragPosition = null;
  state.dragStart = null;
  state.dragPreviousSelection = null;
  state.dragMoved = false;
  state.dragPointerId = null;
  battleCanvas.classList.remove('dragging');
}

function handleBattlePointerDown(event) {
  if (!state.match || state.room?.status !== 'playing' || state.selectedHand !== null) return;
  const cellIndex = battleCellFromEvent(event);
  const tower = state.match.players?.[state.playerId]?.board?.[cellIndex];
  if (cellIndex === null || !tower) return;
  state.dragTower = cellIndex;
  state.dragPreviousSelection = state.selectedTower;
  state.selectedTower = cellIndex;
  state.dragTarget = null;
  state.dragPosition = battlePointFromEvent(event);
  state.dragStart = { x: event.clientX, y: event.clientY };
  state.dragMoved = false;
  state.dragPointerId = event.pointerId;
  state.suppressBattleClick = true;
  battleCanvas.classList.add('dragging');
  battleCanvas.setPointerCapture?.(event.pointerId);
  renderBattleUi();
}

function handleBattlePointerMove(event) {
  if (state.dragPointerId !== event.pointerId || state.dragTower === null) return;
  const point = battlePointFromEvent(event);
  state.dragPosition = point;
  state.dragMoved ||= Math.hypot(event.clientX - state.dragStart.x, event.clientY - state.dragStart.y) > 6;
  const target = battleCellFromPoint(point);
  state.dragTarget = isValidMergeTarget(state.dragTower, target) ? target : null;
  renderBattleUi();
}

async function finishTowerDrag(event, cancelled = false) {
  if (state.dragPointerId !== event.pointerId || state.dragTower === null) return;
  const fromIndex = state.dragTower;
  const toIndex = state.dragTarget;
  const moved = state.dragMoved;
  const previousSelection = state.dragPreviousSelection;
  clearTowerDrag();
  if (!cancelled && moved && toIndex !== null) {
    const ok = await sendBattleAction({ type: 'merge', fromIndex: toIndex, toIndex: fromIndex });
    state.selectedTower = ok ? null : fromIndex;
  } else if (!moved && !cancelled) {
    state.selectedTower = previousSelection === fromIndex ? null : fromIndex;
  } else {
    state.selectedTower = fromIndex;
    if (cancelled) state.suppressBattleClick = false;
  }
  renderBattleUi();
}

async function handleBattleCanvasClick(event) {
  if (state.suppressBattleClick) {
    state.suppressBattleClick = false;
    return;
  }
  if (!state.match || state.room?.status !== 'playing') return;
  const cellIndex = battleCellFromEvent(event);
  if (cellIndex === null) return;
  const tower = state.match.players[state.playerId].board[cellIndex];
  if (state.selectedHand !== null && !tower) {
    const ok = await sendBattleAction({ type: 'place', handIndex: state.selectedHand, cellIndex });
    if (ok) state.selectedHand = null;
  } else if (tower) {
    if (state.selectedTower === null) {
      state.selectedTower = cellIndex;
      state.selectedHand = null;
    } else if (state.selectedTower === cellIndex) {
      state.selectedTower = null;
    } else {
      const ok = await sendBattleAction({ type: 'merge', fromIndex: state.selectedTower, toIndex: cellIndex });
      state.selectedTower = null;
      if (!ok) state.selectedTower = cellIndex;
    }
  } else {
    state.selectedTower = null;
  }
  renderBattleUi();
}

function bindEvents() {
  document.querySelectorAll('[data-player]').forEach((button) => button.addEventListener('click', () => {
    ensureAudio();
    selectIdentity(button.dataset.player);
  }));
  byId('homeBtn').addEventListener('click', () => state.roomCode ? leaveRoom() : showScreen('hubScreen'));
  document.querySelectorAll('.tab-btn').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.hub-tab').forEach((tab) => tab.classList.toggle('active', tab.id === `${button.dataset.tab}Tab`));
  }));
  byId('collectionGrid').addEventListener('click', (event) => event.target.closest('[data-card]') && openCardDetail(event.target.closest('[data-card]').dataset.card));
  byId('deckCollectionGrid').addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      event.stopPropagation();
      addDeckCard(add.dataset.add);
      return;
    }
    const card = event.target.closest('[data-card]');
    if (card) openCardDetail(card.dataset.card);
  });
  byId('deckStrip').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) removeDeckCard(Number(remove.dataset.remove));
  });
  byId('collectionFilter').addEventListener('change', (event) => {
    state.collectionFilter = event.currentTarget.value;
    renderCollection();
  });
  byId('collectionSort').addEventListener('change', (event) => {
    state.collectionSort = event.currentTarget.value;
    renderCollection();
  });
  byId('deckFilter').addEventListener('change', (event) => {
    state.deckFilter = event.currentTarget.value;
    renderDeck();
  });
  byId('deckSort').addEventListener('change', (event) => {
    state.deckSort = event.currentTarget.value;
    renderDeck();
  });
  byId('gachaBtn').addEventListener('click', gacha);
  byId('saveDeckBtn').addEventListener('click', saveDeck);
  byId('createRoomBtn').addEventListener('click', createRoom);
  byId('joinRoomBtn').addEventListener('click', () => joinRoom(byId('roomCodeInput').value));
  byId('roomCodeInput').addEventListener('keydown', (event) => event.key === 'Enter' && joinRoom(event.currentTarget.value));
  byId('leaveRoomBtn').addEventListener('click', () => leaveRoom());
  byId('leaveBattleBtn').addEventListener('click', () => leaveRoom());
  byId('readyBtn').addEventListener('click', toggleReady);
  byId('startBtn').addEventListener('click', startGame);
  byId('hand').addEventListener('click', (event) => {
    const button = event.target.closest('[data-hand]');
    if (!button) return;
    const index = Number(button.dataset.hand);
    state.selectedHand = state.selectedHand === index ? null : index;
    state.selectedTower = null;
    renderBattleUi();
  });
  battleCanvas.addEventListener('pointerdown', handleBattlePointerDown);
  battleCanvas.addEventListener('pointermove', handleBattlePointerMove);
  battleCanvas.addEventListener('pointerup', (event) => finishTowerDrag(event));
  battleCanvas.addEventListener('pointercancel', (event) => finishTowerDrag(event, true));
  battleCanvas.addEventListener('click', handleBattleCanvasClick);
  byId('soundBtn').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('defense-sound', state.soundEnabled ? 'on' : 'off');
    byId('soundBtn').classList.toggle('muted', !state.soundEnabled);
    byId('soundBtn').textContent = state.soundEnabled ? '♪' : '×';
    if (state.soundEnabled) {
      ensureAudio();
      tone(520, 0.08, 'triangle', 0.035);
    }
  });
  byId('closeCardModal').addEventListener('click', () => closeModal('cardModal'));
  byId('cardModal').addEventListener('click', (event) => event.target === byId('cardModal') && closeModal('cardModal'));
  byId('rankSwitch').addEventListener('click', (event) => {
    const button = event.target.closest('[data-rank]');
    if (!button) return;
    state.previewRank = Number(button.dataset.rank);
    refreshPreview();
  });
  byId('resultHomeBtn').addEventListener('click', async () => {
    closeModal('resultModal');
    await leaveRoom();
  });
}

bindEvents();
byId('soundBtn').classList.toggle('muted', !state.soundEnabled);
byId('soundBtn').textContent = state.soundEnabled ? '♪' : '×';
const demoMode = urlParams.get('demo') === '1';
if (demoMode) {
  state.playerId = 'p1';
  state.user = normalizeUser();
  state.workingDeck = [...state.user.deck];
  state.roomCode = 'DEMO01';
  state.isHost = true;
  state.match = createMatch({ p1: state.user.deck, p2: state.user.deck }, { seed: 23 });
  state.room = {
    status: 'playing',
    players: {
      p1: { connected: true, ready: true },
      p2: { connected: true, ready: true },
    },
  };
  showScreen('battleScreen');
  renderBattleUi();
  let demoLast = performance.now();
  const demoLoop = (now) => {
    tickMatch(state.match, Math.min(.1, (now - demoLast) / 1000));
    demoLast = now;
    renderBattleUi();
    requestAnimationFrame(demoLoop);
  };
  requestAnimationFrame(demoLoop);
} else {
  showScreen('identityScreen');
}

if (e2eMode) {
  globalThis.__defenseE2E = {
    forceDefeat() {
      if (!state.isHost || !state.match) return false;
      state.match.lives = 0;
      state.match.status = 'gameover';
      return true;
    },
  };
}
