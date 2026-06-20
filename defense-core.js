import {
  CARDS,
  ENEMIES,
  GAME,
  RARITIES,
  STARTER_COLLECTION,
  STARTER_DECK,
  bossTypeForWave,
  cardStats,
  enemyStats,
  isBossWave,
  nextBossWave,
  waveEnemyCount,
  waveEnemySequence,
  waveEnemyType,
} from './defense-config.js';

export function createSeededRandom(seed = Date.now()) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function shuffle(list, random = Math.random) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function normalizeUser(raw = {}) {
  const collection = { ...STARTER_COLLECTION, ...(raw.collection || {}) };
  Object.keys(collection).forEach((key) => {
    collection[key] = Math.max(0, Math.min(GAME.maxCopies, Number(collection[key]) || 0));
  });
  const proposedDeck = Array.isArray(raw.deck) ? raw.deck : [...STARTER_DECK];
  const deck = validateDeck(proposedDeck, collection).valid ? [...proposedDeck] : [...STARTER_DECK];
  const rewardedRooms = Object.fromEntries(Object.entries(raw.rewardedRooms || {})
    .filter(([roomCode, settledAt]) => /^[A-Z2-9]{6}$/.test(roomCode) && Number.isFinite(Number(settledAt)))
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .slice(-100));
  return {
    collection,
    deck,
    tokens: Math.max(0, Number(raw.tokens) || 0),
    stats: {
      bestWave: Math.max(0, Number(raw.stats?.bestWave) || 0),
      gamesPlayed: Math.max(0, Number(raw.stats?.gamesPlayed) || 0),
    },
    rewardedRooms,
  };
}

export function validateDeck(deck, collection) {
  if (!Array.isArray(deck)) return { valid: false, reason: '牌組格式錯誤' };
  if (deck.length < GAME.minDeck || deck.length > GAME.maxDeck) {
    return { valid: false, reason: `牌組需為 ${GAME.minDeck}–${GAME.maxDeck} 張` };
  }
  const counts = {};
  for (const cardId of deck) {
    if (!CARDS[cardId]) return { valid: false, reason: '牌組包含未知卡牌' };
    counts[cardId] = (counts[cardId] || 0) + 1;
    if (counts[cardId] > GAME.maxCopies) return { valid: false, reason: '同卡最多攜帶 3 張' };
    if (counts[cardId] > (collection?.[cardId] || 0)) return { valid: false, reason: '牌組超過持有數量' };
  }
  return { valid: true, reason: '' };
}

export function availableGachaCards(collection) {
  return Object.keys(CARDS).filter((cardId) => (collection?.[cardId] || 0) < GAME.maxCopies);
}

export function drawGachaCard(collection, random = Math.random) {
  const available = availableGachaCards(collection);
  if (!available.length) return null;
  const buckets = Object.entries(RARITIES)
    .map(([rarity, config]) => ({
      rarity,
      weight: config.gachaWeight || 0,
      cards: available.filter((cardId) => CARDS[cardId].rarity === rarity),
    }))
    .filter((bucket) => bucket.weight > 0 && bucket.cards.length);
  const totalWeight = buckets.reduce((total, bucket) => total + bucket.weight, 0);
  let roll = random() * totalWeight;
  const bucket = buckets.find((candidate) => {
    roll -= candidate.weight;
    return roll < 0;
  }) || buckets[buckets.length - 1];
  return bucket.cards[Math.floor(random() * bucket.cards.length)];
}

export function rewardForRun(wave, bossesKilled) {
  return Math.max(0, Number(wave) || 0) * 2 + Math.max(0, Number(bossesKilled) || 0) * 10;
}

export function settlementForMatch(match, reason, settledAt = Date.now()) {
  const allowedReasons = ['defeat', 'disconnect', 'left'];
  const safeReason = allowedReasons.includes(reason) ? reason : 'defeat';
  const wave = Math.max(0, Number(match?.wave) || 0);
  const bossesKilled = Math.max(0, Number(match?.bossesKilled) || 0);
  return {
    reason: safeReason,
    reward: rewardForRun(wave, bossesKilled),
    wave,
    bossesKilled,
    settledAt,
  };
}

export function rewardUserForSettlement(rawUser, roomCode, settlement) {
  const user = normalizeUser(rawUser);
  if (!roomCode || user.rewardedRooms[roomCode]) return null;
  user.tokens += Math.max(0, Number(settlement?.reward) || 0);
  user.stats.gamesPlayed += 1;
  user.stats.bestWave = Math.max(user.stats.bestWave, Math.max(0, Number(settlement?.wave) || 0));
  user.rewardedRooms = {
    ...user.rewardedRooms,
    [roomCode]: Math.max(1, Number(settlement?.settledAt) || Date.now()),
  };
  return user;
}

function createPlayer(deck, random) {
  const drawPile = shuffle(deck, random);
  const player = {
    resource: GAME.startResource,
    hateDamageStacks: 0,
    board: Array(GAME.rows * GAME.cols).fill(null),
    deck: [...deck],
    drawPile,
    hand: [],
    selectedTower: null,
  };
  refillHand(player, random);
  return player;
}

export function refillHand(player, random = Math.random) {
  while (player.hand.length < GAME.handSize) {
    if (!player.drawPile.length) player.drawPile = shuffle(player.deck, random);
    const next = player.drawPile.shift();
    if (!next) break;
    player.hand.push(next);
  }
  return player.hand;
}

export function createMatch(decks, options = {}) {
  const seed = options.seed ?? Date.now();
  const random = createSeededRandom(seed);
  return {
    version: 1,
    seed,
    status: 'playing',
    pausedReason: '',
    elapsed: 0,
    wave: 0,
    waveState: 'break',
    nextWaveIn: 1.2,
    spawnRemaining: 0,
    spawnCooldown: 0,
    lives: GAME.lives,
    bossesKilled: 0,
    nextEntityId: 1,
    enemies: [],
    effects: [],
    pendingHits: [],
    damageNumbers: [],
    players: {
      p1: createPlayer(decks.p1, random),
      p2: createPlayer(decks.p2, random),
    },
  };
}

function firebaseList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).sort((left, right) => Number(left) - Number(right)).map((key) => value[key]);
}

function hydrateBoard(value) {
  const board = Array(GAME.rows * GAME.cols).fill(null);
  if (Array.isArray(value)) {
    value.forEach((tower, index) => { if (tower) board[index] = tower; });
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([index, tower]) => { if (tower) board[Number(index)] = tower; });
  }
  return board;
}

export function hydrateMatchSnapshot(snapshot) {
  if (!snapshot) return null;
  const match = { ...snapshot };
  match.enemies = firebaseList(snapshot.enemies);
  match.effects = firebaseList(snapshot.effects);
  match.pendingHits = firebaseList(snapshot.pendingHits);
  match.damageNumbers = firebaseList(snapshot.damageNumbers);
  match.players = Object.fromEntries(['p1', 'p2'].map((playerId) => {
    const player = snapshot.players?.[playerId] || {};
    return [playerId, {
      ...player,
      hateDamageStacks: Math.max(0, Number(player.hateDamageStacks) || 0),
      board: hydrateBoard(player.board),
      deck: firebaseList(player.deck),
      drawPile: firebaseList(player.drawPile),
      hand: firebaseList(player.hand),
    }];
  }));
  return match;
}

export function reconcileMatchSnapshot(snapshot, pendingActions = [], playerId = null) {
  const match = hydrateMatchSnapshot(snapshot);
  if (!match || !playerId) return match;
  for (const action of pendingActions) {
    applyAction(match, playerId, action.payload, createSeededRandom(action.seed));
  }
  return match;
}

export function resolveHostClientId(meta, reconnectingPlayerId, reconnectingClientId) {
  if (!meta || !reconnectingPlayerId || !reconnectingClientId) return meta?.hostClientId || null;
  return meta.hostPlayerId === reconnectingPlayerId ? reconnectingClientId : meta.hostClientId;
}

export function applyAction(match, playerId, action, random = Math.random) {
  if (match.status !== 'playing') return { ok: false, reason: '對局目前不可操作' };
  const player = match.players[playerId];
  if (!player) return { ok: false, reason: '玩家不存在' };
  if (action.type === 'place') return placeTower(player, action.handIndex, action.cellIndex, random);
  if (action.type === 'merge') return mergeTowers(player, action.fromIndex, action.toIndex);
  return { ok: false, reason: '未知操作' };
}

export function placeTower(player, handIndex, cellIndex, random = Math.random) {
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= player.hand.length) {
    return { ok: false, reason: '手牌不存在' };
  }
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= player.board.length) {
    return { ok: false, reason: '格子不存在' };
  }
  if (player.board[cellIndex]) return { ok: false, reason: '格子已有塔' };
  if (player.resource < GAME.placeCost) return { ok: false, reason: '資源不足' };
  const cardId = player.hand.splice(handIndex, 1)[0];
  const tower = { cardId, rank: 1, cooldown: 0, attackCount: 0 };
  if (cardId === 'charge_core') {
    tower.charge = 0;
    tower.chargeReady = false;
  }
  player.board[cellIndex] = tower;
  player.resource -= GAME.placeCost;
  refillHand(player, random);
  return { ok: true, reason: '' };
}

export function mergeTowers(player, fromIndex, toIndex) {
  const from = player.board[fromIndex];
  const to = player.board[toIndex];
  if (!from || !to || fromIndex === toIndex) return { ok: false, reason: '請選擇兩座塔' };
  if (from.cardId !== to.cardId || from.rank !== to.rank) return { ok: false, reason: '只能合成同種同階塔' };
  if (from.rank >= GAME.maxRank) return { ok: false, reason: '已達最高階' };
  const targetRank = from.rank + 1;
  const cost = GAME.mergeCosts[targetRank];
  if (player.resource < cost) return { ok: false, reason: '資源不足' };
  player.resource -= cost;
  from.rank = targetRank;
  from.cooldown = Math.min(from.cooldown, 0.25);
  if (from.cardId === 'hate_dream') player.hateDamageStacks = Math.max(0, Number(player.hateDamageStacks) || 0) + 1;
  if (from.cardId === 'charge_core') {
    const required = cardStats(from.cardId, from.rank).chargeRequired;
    from.charge = Math.min(required, Math.max(0, Number(from.charge) || 0));
    from.chargeReady = from.charge >= required;
  }
  player.board[toIndex] = null;
  return { ok: true, reason: '' };
}

export function boardPosition(playerId, cellIndex) {
  const row = Math.floor(cellIndex / GAME.cols);
  const col = cellIndex % GAME.cols;
  return {
    x: 0.18 + col * 0.16,
    y: (playerId === 'p1' ? 0.72 : 0.08) + row * 0.065,
  };
}

export function orientPosition(position, viewer) {
  if (viewer !== 'p2') return { ...position };
  return { ...position, y: 1 - position.y };
}

export function viewedBoardPosition(viewer, playerId, cellIndex) {
  const row = Math.floor(cellIndex / GAME.cols);
  const col = cellIndex % GAME.cols;
  return {
    x: 0.18 + col * 0.16,
    y: (viewer === playerId ? 0.72 : 0.08) + row * 0.065,
  };
}

export function enemyPosition(enemy) {
  const progress = Math.max(0, Math.min(1, enemy.progress));
  const privateLaneEnd = 0.34;
  if (progress < privateLaneEnd) {
    const local = progress / privateLaneEnd;
    return {
      x: 0.09,
      y: enemy.lane === 'p1' ? 0.94 - local * 0.44 : 0.06 + local * 0.44,
      shared: false,
    };
  }
  const local = (progress - privateLaneEnd) / (1 - privateLaneEnd);
  return { x: 0.09 + local * 0.84, y: 0.5, shared: true };
}

export function viewedEnemyPosition(viewer, enemy) {
  return orientPosition(enemyPosition(enemy), viewer);
}

export function findTarget(match, playerId, tower, cellIndex) {
  let best = null;
  let bestShared = false;
  for (const enemy of match.enemies) {
    if (enemy.hp <= 0) continue;
    const shared = enemyPosition(enemy).shared;
    if (!shared && enemy.lane !== playerId) continue;
    if (!best || (shared && !bestShared) || shared === bestShared && enemy.progress > best.progress) {
      best = enemy;
      bestShared = shared;
    }
  }
  return best;
}

function validLaneTarget(enemy, playerId) {
  if (!enemy || enemy.hp <= 0) return false;
  const shared = enemyPosition(enemy).shared;
  return shared || enemy.lane === playerId;
}

function laneTargets(match, playerId) {
  return match.enemies
    .filter((enemy) => validLaneTarget(enemy, playerId))
    .sort((a, b) => b.progress - a.progress);
}

function damageWithCrit(stats, random) {
  const crit = random() < GAME.critChance;
  return { damage: stats.damage * (crit ? stats.critMultiplier : 1), crit };
}

function queueDamage(match, enemy, damage, source) {
  if (!enemy || enemy.hp <= 0) return;
  const target = enemyPosition(enemy);
  const duration = source.ttl || 0.48;
  const effectId = match.nextEntityId++;
  match.effects.push({
    id: effectId,
    targetId: enemy.id,
    type: source.type || 'hit',
    x: target.x,
    y: target.y,
    fromX: source.fromX ?? target.x,
    fromY: source.fromY ?? target.y,
    fromCellIndex: Number.isInteger(source.fromCellIndex) ? source.fromCellIndex : null,
    playerId: source.playerId || null,
    color: source.color,
    ttl: duration,
    maxTtl: duration,
    crit: source.crit || false,
  });
  if (match.effects.length > 80) match.effects.splice(0, match.effects.length - 80);
  match.pendingHits ||= [];
  match.pendingHits.push({
    effectId,
    targetId: enemy.id,
    playerId: source.playerId || null,
    damage,
    crit: source.crit || false,
    ttl: duration,
    slow: source.slow || 0,
    slowDuration: source.slowDuration || 0,
    dot: source.dot || 0,
    dotDuration: source.dotDuration || 0,
  });
}

function resolvePendingHits(match, dt) {
  match.pendingHits ||= [];
  const remaining = [];
  const enemyById = new Map(match.enemies.map((enemy) => [enemy.id, enemy]));
  const effectById = new Map(match.effects.map((effect) => [effect.id, effect]));
  for (const hit of match.pendingHits) {
    hit.ttl -= dt;
    let enemy = enemyById.get(hit.targetId);
    if (enemy?.hp <= 0) enemy = null;
    if (!enemy) {
      enemy = hit.playerId
        ? findTarget(match, hit.playerId, null, 0)
        : [...match.enemies].filter((candidate) => candidate.hp > 0).sort((a, b) => b.progress - a.progress)[0];
      if (enemy) {
        hit.targetId = enemy.id;
        const effect = effectById.get(hit.effectId);
        if (effect) effect.targetId = enemy.id;
      }
    }
    if (!enemy) {
      remaining.push(hit);
      continue;
    }
    if (hit.ttl > 0 && enemy.progress < 1) {
      remaining.push(hit);
      continue;
    }
    const position = enemyPosition(enemy);
    enemy.hp -= hit.damage;
    match.damageNumbers ||= [];
    match.damageNumbers.push({
      id: match.nextEntityId++,
      x: position.x,
      y: position.y,
      damage: hit.damage,
      crit: hit.crit || false,
      ttl: 0.82,
      maxTtl: 0.82,
    });
    if (match.damageNumbers.length > 60) match.damageNumbers.splice(0, match.damageNumbers.length - 60);
    if (hit.slow) {
      enemy.slow = Math.max(enemy.slow || 0, hit.slow);
      enemy.slowTtl = Math.max(enemy.slowTtl || 0, hit.slowDuration);
    }
    if (hit.dot) {
      enemy.dot = Math.max(enemy.dot || 0, hit.dot);
      enemy.dotTtl = Math.max(enemy.dotTtl || 0, hit.dotDuration);
    }
  }
  match.pendingHits = remaining;
}

function attackChargeLaser(match, playerId, tower, cellIndex, stats) {
  const targets = laneTargets(match, playerId);
  if (!targets.length) return false;
  const origin = boardPosition(playerId, cellIndex);
  targets.forEach((enemy) => {
    const damage = stats.damage + (enemy.maxHp || enemy.hp || 0) * stats.maxHpPct;
    queueDamage(match, enemy, damage, {
      playerId,
      fromCellIndex: cellIndex,
      type: 'laser',
      color: stats.color,
      fromX: origin.x,
      fromY: origin.y,
      ttl: 0.32,
    });
  });
  tower.charge = 0;
  tower.chargeReady = false;
  return true;
}

function attackTower(match, playerId, tower, cellIndex, random) {
  const stats = cardStats(tower.cardId, tower.rank);
  const origin = boardPosition(playerId, cellIndex);
  const target = findTarget(match, playerId, tower, cellIndex);
  if (stats.effect === 'charge' && tower.chargeReady) return attackChargeLaser(match, playerId, tower, cellIndex, stats);
  if (!target && stats.effect !== 'global') return false;
  tower.attackCount = (tower.attackCount || 0) + 1;
  const roll = damageWithCrit(stats, random);
  let damage = roll.damage * auraMultiplier(match.players[playerId], playerId, cellIndex);
  if (stats.effect === 'hate') damage *= 1 + (Math.max(0, Number(match.players[playerId].hateDamageStacks) || 0) * stats.hateStackDamage);
  if (stats.effect === 'boss' && target?.boss) damage *= stats.bossMultiplier;
  if (stats.effect === 'shared' && target && enemyPosition(target).shared) damage *= stats.sharedMultiplier;

  if (stats.effect === 'global') {
    match.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => {
      queueDamage(match, enemy, damage, { playerId, fromCellIndex: cellIndex, type: 'global', color: stats.color, crit: roll.crit, fromX: origin.x, fromY: origin.y, ttl: 0.7 });
    });
    return true;
  }

  const primaryType = stats.effect === 'chain' ? 'chain' : stats.effect === 'splash' ? 'splash' : stats.effect === 'slow' ? 'slow' : stats.effect === 'dot' ? 'dot' : stats.effect === 'fifthBurst' && tower.attackCount % 5 === 0 ? 'burst' : stats.attackType;
  queueDamage(match, target, damage, {
    type: primaryType,
    playerId,
    fromCellIndex: cellIndex,
    color: stats.color,
    crit: roll.crit,
    fromX: origin.x,
    fromY: origin.y,
    slow: stats.effect === 'slow' ? stats.slow : 0,
    slowDuration: stats.effect === 'slow' ? stats.slowDuration : 0,
    dot: stats.effect === 'dot' ? stats.dotDamage * tower.rank : 0,
    dotDuration: stats.effect === 'dot' ? stats.dotDuration : 0,
  });
  if (stats.effect === 'splash') {
    const targetPos = enemyPosition(target);
    match.enemies.filter((enemy) => enemy !== target && enemy.hp > 0).forEach((enemy) => {
      const pos = enemyPosition(enemy);
      if (Math.hypot(pos.x - targetPos.x, pos.y - targetPos.y) <= stats.splash) {
        queueDamage(match, enemy, damage * 0.62, { playerId, type: 'splash', color: stats.color, fromX: targetPos.x, fromY: targetPos.y });
      }
    });
  }
  if (stats.effect === 'chain') {
    const others = [...match.enemies]
      .filter((enemy) => enemy !== target && enemy.hp > 0)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, stats.chain - 1);
    let chainFrom = enemyPosition(target);
    others.forEach((enemy, index) => {
      queueDamage(match, enemy, damage * (0.72 ** (index + 1)), { playerId, type: 'chain', color: stats.color, fromX: chainFrom.x, fromY: chainFrom.y });
      chainFrom = enemyPosition(enemy);
    });
  }
  if (stats.effect === 'fifthBurst' && tower.attackCount % 5 === 0) {
    match.enemies
      .filter((enemy) => enemy !== target && enemy.hp > 0)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, stats.burstTargets - 1)
      .forEach((enemy) => queueDamage(match, enemy, damage, { playerId, fromCellIndex: cellIndex, type: 'burst', color: stats.color, fromX: origin.x, fromY: origin.y }));
  }
  if (stats.effect === 'charge') {
    const required = stats.chargeRequired;
    tower.charge = Math.min(required, (Math.max(0, Number(tower.charge) || 0)) + 1);
    tower.chargeReady = tower.charge >= required;
  }
  return true;
}

function auraMultiplier(player, playerId, targetIndex) {
  const target = boardPosition(playerId, targetIndex);
  let multiplier = 1;
  player.board.forEach((tower, index) => {
    if (!tower || tower.cardId !== 'gravity_blanket' || index === targetIndex) return;
    const stats = cardStats(tower.cardId, tower.rank);
    const origin = boardPosition(playerId, index);
    const cellDistance = Math.hypot((origin.x - target.x) / 0.16, (origin.y - target.y) / 0.065);
    if (cellDistance <= stats.auraRange) multiplier += stats.auraBoost;
  });
  return multiplier;
}

function startWave(match) {
  match.wave += 1;
  match.waveState = 'spawning';
  match.spawnRemaining = waveEnemyCount(match.wave) * 2;
  match.spawnTotal = match.spawnRemaining;
  match.spawnCooldown = 0;
}

function spawnEnemy(match) {
  const total = match.spawnTotal || waveEnemyCount(match.wave) * 2;
  const spawnIndex = Math.floor((total - match.spawnRemaining) / 2);
  const type = isBossWave(match.wave)
    ? bossTypeForWave(match.wave)
    : waveEnemySequence(match.wave)[spawnIndex] || waveEnemyType(match.wave);
  const lane = match.spawnRemaining % 2 === 0 ? 'p1' : 'p2';
  const stats = enemyStats(type, match.wave);
  const enemy = {
    id: match.nextEntityId++,
    type,
    lane,
    progress: 0,
    ...stats,
  };
  if (stats.boss) enemy.abilityCd = stats.abilityInterval || 5;
  match.enemies.push(enemy);
  match.spawnRemaining -= 1;
  match.spawnCooldown = isBossWave(match.wave) ? 0.5 : Math.max(0.22, 0.75 - match.wave * 0.005);
}

function clearSilenceFromBoss(match, boss) {
  if (!boss?.boss || boss.type !== 'silence_serpent') return;
  const player = match.players?.[boss.lane];
  player?.board?.forEach((tower) => {
    if (tower?.silencedBy === boss.id) delete tower.silencedBy;
  });
}

function normalizeTowerRankState(tower) {
  if (tower?.cardId !== 'charge_core') return;
  const required = cardStats(tower.cardId, tower.rank).chargeRequired;
  tower.charge = Math.min(required, Math.max(0, Number(tower.charge) || 0));
  tower.chargeReady = tower.charge >= required;
}

function takeRandomItems(list, count, random) {
  const pool = [...list];
  const result = [];
  while (pool.length && result.length < count) {
    const index = Math.floor(random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

function summonFearMinions(match, boss) {
  for (let index = 0; index < 2; index += 1) {
    const stats = enemyStats('swarm', match.wave);
    const hp = Math.max(1, Math.round(stats.hp * 0.55));
    match.enemies.push({
      id: match.nextEntityId++,
      type: 'swarm',
      lane: boss.lane,
      progress: Math.max(0, boss.progress - 0.025 * (index + 1)),
      ...stats,
      hp,
      maxHp: hp,
    });
  }
}

function applyBossAbility(match, boss, random) {
  if (boss.type === 'insomnia_beast') {
    boss.progress = Math.min(0.99, boss.progress + 0.055);
    return;
  }
  if (boss.type === 'fear_demon') {
    summonFearMinions(match, boss);
    return;
  }
  const player = match.players?.[boss.lane];
  if (!player) return;
  if (boss.type === 'volcano_captain') {
    const candidates = player.board
      .map((tower, index) => ({ tower, index }))
      .filter(({ tower }) => tower && tower.rank > 1);
    takeRandomItems(candidates, 3, random).forEach(({ tower }) => {
      tower.rank = Math.max(1, tower.rank - 2);
      tower.cooldown = Math.min(tower.cooldown || 0, 0.25);
      normalizeTowerRankState(tower);
    });
    return;
  }
  if (boss.type === 'silence_serpent') {
    const candidates = player.board
      .map((tower, index) => ({ tower, index }))
      .filter(({ tower }) => tower && !tower.silencedBy);
    const [target] = takeRandomItems(candidates, 1, random);
    if (target) target.tower.silencedBy = boss.id;
  }
}

function updateBossAbilities(match, dt, random) {
  match.enemies.forEach((enemy) => {
    if (!enemy.boss || enemy.hp <= 0) return;
    const interval = ENEMIES[enemy.type]?.abilityInterval;
    if (!interval) return;
    enemy.abilityCd = Number.isFinite(Number(enemy.abilityCd)) ? Number(enemy.abilityCd) - dt : interval;
    if (enemy.abilityCd > 0) return;
    applyBossAbility(match, enemy, random);
    enemy.abilityCd += interval;
  });
}

function resolveDeaths(match) {
  const alive = [];
  for (const enemy of match.enemies) {
    if (enemy.hp > 0) {
      alive.push(enemy);
      continue;
    }
    clearSilenceFromBoss(match, enemy);
    const reward = enemy.boss ? GAME.bossKillResource : GAME.normalKillResource;
    match.players.p1.resource += reward;
    match.players.p2.resource += reward;
    if (enemy.boss) match.bossesKilled += 1;
  }
  match.enemies = alive;
}

export function tickMatch(match, dt, random = Math.random) {
  if (match.status !== 'playing') return match;
  const safeDt = Math.min(0.1, Math.max(0, dt));
  match.elapsed += safeDt;
  match.effects.forEach((effect) => { effect.ttl -= safeDt; });
  match.effects = match.effects.filter((effect) => effect.ttl > 0);
  match.damageNumbers ||= [];
  match.damageNumbers.forEach((number) => { number.ttl -= safeDt; });
  match.damageNumbers = match.damageNumbers.filter((number) => number.ttl > 0);

  if (match.waveState === 'break') {
    match.nextWaveIn -= safeDt;
    if (match.nextWaveIn <= 0) startWave(match);
  }
  if (match.waveState === 'spawning') {
    match.spawnCooldown -= safeDt;
    if (match.spawnRemaining > 0 && match.spawnCooldown <= 0) spawnEnemy(match);
  }

  match.enemies.forEach((enemy) => {
    if (enemy.dotTtl > 0) {
      enemy.hp -= (enemy.dot || 0) * safeDt;
      enemy.dotTtl -= safeDt;
    }
    if (enemy.slowTtl > 0) enemy.slowTtl -= safeDt;
    else enemy.slow = 0;
    enemy.progress += enemy.speed * (1 - (enemy.slow || 0)) * safeDt;
  });
  updateBossAbilities(match, safeDt, random);
  resolvePendingHits(match, safeDt);
  const enemyById = new Map(match.enemies.map((enemy) => [enemy.id, enemy]));
  match.effects.forEach((effect) => {
    const target = enemyById.get(effect.targetId);
    if (!target) return;
    const position = enemyPosition(target);
    effect.x = position.x;
    effect.y = position.y;
  });
  resolveDeaths(match);

  let leaked = 0;
  match.enemies = match.enemies.filter((enemy) => {
    if (enemy.progress < 1) return true;
    clearSilenceFromBoss(match, enemy);
    leaked += 1;
    return false;
  });
  if (leaked) {
    match.lives = Math.max(0, match.lives - leaked);
    if (match.lives <= 0) {
      match.status = 'gameover';
      return match;
    }
  }

  for (const playerId of ['p1', 'p2']) {
    const player = match.players[playerId];
    player.board.forEach((tower, cellIndex) => {
      if (!tower) return;
      if (tower.silencedBy) return;
      tower.cooldown -= safeDt;
      if (tower.cooldown > 0) return;
      const stats = cardStats(tower.cardId, tower.rank);
      if (attackTower(match, playerId, tower, cellIndex, random)) tower.cooldown = stats.interval;
    });
  }
  resolveDeaths(match);

  if (match.waveState === 'spawning' && match.spawnRemaining <= 0) match.waveState = 'active';
  if (match.waveState === 'active' && match.enemies.length === 0) {
    match.waveState = 'break';
    match.nextWaveIn = GAME.waveBreakMs / 1000;
  }
  return match;
}

export function snapshotMatch(match) {
  return JSON.parse(JSON.stringify(match));
}

export function createPreviewMatch(cardId, rank = 1) {
  const deck = Array(GAME.minDeck).fill(cardId);
  const match = createMatch({ p1: deck, p2: deck }, { seed: 42 });
  match.wave = 1;
  match.waveState = 'active';
  match.nextWaveIn = 999;
  match.players.p1.board[19] = { cardId, rank, cooldown: 0, attackCount: 0 };
  match.players.p2.board = Array(GAME.rows * GAME.cols).fill(null);
  const type = cardId === 'orange_guard' ? 'boss' : 'normal';
  match.enemies = [0, 1, 2].map((offset) => ({
    id: match.nextEntityId++,
    type,
    lane: 'p1',
    progress: 0.43 - offset * 0.07,
    ...enemyStats(type, 1),
  }));
  return match;
}

export { CARDS, ENEMIES, GAME, RARITIES, bossTypeForWave, cardStats, isBossWave, nextBossWave, waveEnemySequence };
