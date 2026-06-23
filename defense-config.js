export const GAME = Object.freeze({
  rows: 4,
  cols: 5,
  handSize: 5,
  minDeck: 15,
  maxDeck: 20,
  maxCopies: 3,
  maxRank: 6,
  startResource: 30,
  placeCost: 10,
  mergeCosts: Object.freeze({ 2: 10, 3: 20, 4: 40, 5: 80, 6: 160 }),
  critChance: 0.2,
  critMultiplier: 1.5,
  damageRankMultiplier: 2.05,
  lives: 3,
  normalKillResource: 1,
  bossKillResource: 10,
  roomReconnectMs: 5 * 60 * 1000,
  snapshotIntervalMs: 300,
  actionPollMs: 100,
  tickMs: 50,
  waveBreakMs: 3600,
});

const card = (data) => Object.freeze({
  starter: false,
  color: '#D0A34F',
  rarity: 'common',
  attackType: 'projectile',
  damage: 14,
  interval: 1.1,
  range: 0.27,
  description: '',
  rankEffect: '',
  ...data,
});

export const CARDS = Object.freeze({
  pillow_guard: card({
    name: '枕頭守衛',
    icon: '🛏️',
    starter: true,
    color: '#D0A34F',
    damage: 17,
    interval: 1.05,
    range: 0.28,
    description: '穩定追蹤最接近終點的敵人，暴擊時造成更高傷害。',
    rankEffect: '每階額外提高暴擊傷害 12%。',
    effect: 'critPower',
  }),
  alarm_turret: card({
    name: '鬧鐘砲塔',
    icon: '⏰',
    starter: true,
    color: '#E06C75',
    damage: 8,
    interval: 0.48,
    range: 0.24,
    description: '快速發射聲波彈，適合清除大量低血量敵人。',
    rankEffect: '每階縮短 7% 攻擊間隔。',
    effect: 'haste',
  }),
  night_light: card({
    name: '夜燈',
    icon: '🏮',
    starter: true,
    color: '#F2B95F',
    rarity: 'rare',
    damage: 13,
    interval: 1.3,
    range: 0.25,
    description: '命中時產生光圈，對目標附近敵人造成範圍傷害。',
    rankEffect: '每階擴大爆炸範圍。',
    effect: 'splash',
    splash: 0.055,
  }),
  white_noise: card({
    name: '白噪音機',
    icon: '🌧️',
    starter: true,
    color: '#72B7C9',
    damage: 7,
    interval: 1.15,
    range: 0.27,
    description: '攻擊附帶減速，使敵人更久停留在火力範圍內。',
    rankEffect: '每階提高減速比例與持續時間。',
    effect: 'slow',
    slow: 0.24,
    slowDuration: 1.4,
  }),
  dream_catcher: card({
    name: '捕夢網',
    icon: '🕸️',
    starter: true,
    color: '#9A8FC1',
    rarity: 'rare',
    damage: 29,
    interval: 1.85,
    range: 0.34,
    description: '低攻速高傷害，擅長封鎖雙方共同防守的中線。',
    rankEffect: '每階提高對共用中線敵人的傷害。',
    effect: 'shared',
    sharedMultiplier: 1.25,
  }),
  mosquito_coil: card({
    name: '蚊香',
    icon: '🌀',
    color: '#7EAE78',
    damage: 5,
    interval: 1.2,
    range: 0.25,
    description: '命中後留下持續傷害，適合處理高血量敵人。',
    rankEffect: '每階延長持續傷害時間。',
    effect: 'dot',
    dotDamage: 3,
    dotDuration: 2.2,
  }),
  moon_prism: card({
    name: '月光稜鏡',
    icon: '🔷',
    color: '#8FAEC8',
    rarity: 'epic',
    damage: 11,
    interval: 1.35,
    range: 0.28,
    description: '月光會在鄰近敵人之間連鎖跳躍。',
    rankEffect: '第 2、4、6 階增加一個連鎖目標。',
    effect: 'chain',
    chain: 2,
  }),
  sheep_counter: card({
    name: '數羊機',
    icon: '🐑',
    color: '#E9E0C6',
    rarity: 'rare',
    damage: 10,
    interval: 0.82,
    range: 0.25,
    description: '每第五次攻擊會同時攻擊多個敵人。',
    rankEffect: '每兩階增加一次第五擊的額外目標。',
    effect: 'fifthBurst',
    burstTargets: 2,
  }),
  gravity_blanket: card({
    name: '重力被',
    icon: '🛌',
    color: '#B58B6A',
    rarity: 'epic',
    damage: 4,
    interval: 1.7,
    range: 0.2,
    description: '攻擊力較低，但會提高附近友方塔的傷害。',
    rankEffect: '每階提高增傷與支援範圍。',
    effect: 'aura',
    auraBoost: 0.12,
    auraRange: 1.45,
  }),
  sleep_cap_sniper: card({
    name: '睡帽狙擊手',
    icon: '🎯',
    color: '#C47070',
    rarity: 'epic',
    damage: 43,
    interval: 2.35,
    range: 0.42,
    description: '鎖定最接近終點的單體目標，暴擊傷害特別高。',
    rankEffect: '每階提高暴擊傷害。',
    effect: 'sniper',
  }),
  meteor_projector: card({
    name: '流星投影燈',
    icon: '🌠',
    color: '#C084C6',
    rarity: 'legendary',
    damage: 9,
    interval: 4.8,
    range: 1,
    description: '週期性轟擊全線所有敵人。',
    rankEffect: '每階縮短全線攻擊冷卻。',
    effect: 'global',
  }),
  orange_guard: card({
    name: '胖橘守衛',
    icon: '🐈',
    color: '#D98F50',
    rarity: 'legendary',
    damage: 16,
    interval: 1.15,
    range: 0.27,
    description: '對 Boss 造成額外傷害，是後期 Boss 波的重要火力。',
    rankEffect: '每階提高對 Boss 傷害倍率。',
    effect: 'boss',
    bossMultiplier: 1.65,
  }),
  hate_dream: card({
    name: '憎恨之夢',
    icon: '◆',
    color: '#8A4CE3',
    rarity: 'epic',
    damage: 10,
    interval: 1.05,
    range: 0.27,
    description: '每次合成自己的憎恨之夢，都會永久提高自己所有憎恨之夢的傷害。',
    rankEffect: '每階些微提高攻速，合成會堆疊自己的憎恨傷害。',
    effect: 'hate',
    hateStackDamage: 0.03,
  }),
  charge_core: card({
    name: '充能核心',
    icon: '◇',
    color: '#55D6F2',
    rarity: 'legendary',
    damage: 9,
    interval: 1.15,
    range: 0.27,
    description: '每次普通攻擊累積能量，充滿後下一次攻擊發射全線雷射。',
    rankEffect: '每階些微提高攻速與傷害，並提高雷射最大生命傷害；高階減少充能次數。',
    effect: 'charge',
    chargeRequired: 5,
    maxHpPct: 0.01,
  }),
});

export const RARITIES = Object.freeze({
  common: Object.freeze({ name: '普通', color: '#A9B0A3', gachaWeight: 60 }),
  rare: Object.freeze({ name: '稀有', color: '#62B8D8', gachaWeight: 25 }),
  epic: Object.freeze({ name: '史詩', color: '#B489E6', gachaWeight: 10 }),
  legendary: Object.freeze({ name: '傳說', color: '#F0B84B', gachaWeight: 5 }),
});

export const STARTER_COLLECTION = Object.freeze(
  Object.fromEntries(Object.entries(CARDS).filter(([, value]) => value.starter).map(([key]) => [key, 3])),
);

export const STARTER_DECK = Object.freeze(
  Object.keys(STARTER_COLLECTION).flatMap((key) => [key, key, key]),
);

export const ENEMIES = Object.freeze({
  normal: Object.freeze({ name: '夢遊者', color: '#E5D5B8', hp: 58, speed: 0.046, radius: 8 }),
  fast: Object.freeze({ name: '驚醒念頭', color: '#E99875', hp: 38, speed: 0.075, radius: 7 }),
  tank: Object.freeze({ name: '厚重夢魘', color: '#8E82A8', hp: 128, speed: 0.031, radius: 10 }),
  swarm: Object.freeze({ name: '雜念', color: '#A8C98F', hp: 24, speed: 0.061, radius: 5 }),
  insomnia_beast: Object.freeze({ name: '失眠巨獸', color: '#D0A34F', hp: 1120, speed: 0.023, radius: 15, boss: true, abilityInterval: 5 }),
  fear_demon: Object.freeze({ name: '恐懼魔', color: '#9A75D6', hp: 980, speed: 0.025, radius: 15, boss: true, abilityInterval: 7 }),
  volcano_captain: Object.freeze({ name: '火山大隊長', color: '#D66A45', hp: 1280, speed: 0.021, radius: 16, boss: true, abilityInterval: 9 }),
  silence_serpent: Object.freeze({ name: '沉默蛇老大', color: '#66C2A5', hp: 1080, speed: 0.024, radius: 15, boss: true, abilityInterval: 8 }),
  boss: Object.freeze({ name: '失眠巨獸', color: '#D0A34F', hp: 1120, speed: 0.023, radius: 15, boss: true, abilityInterval: 5 }),
});

export const ELITE_TRAITS = Object.freeze({
  shield: Object.freeze({
    name: '嘲諷護盾',
    color: '#55D6F2',
    hpMultiplier: 1.25,
    sizeMultiplier: 1.12,
    shieldRatio: 0.5,
  }),
  splitter: Object.freeze({
    name: '分裂',
    color: '#8ED37D',
    hpMultiplier: 1.25,
    sizeMultiplier: 1.12,
    childCount: 3,
    childHpRatio: 0.4,
  }),
  frenzy: Object.freeze({
    name: '狂暴',
    color: '#F07167',
    hpMultiplier: 1.25,
    sizeMultiplier: 1.12,
    triggerHpRatio: 0.5,
    speedMultiplier: 1.6,
  }),
});

export const WAVE_THEMES = Object.freeze({
  calm: Object.freeze({
    name: '深眠前兆',
    color: '#A9B0A3',
    hint: '普通暖身波',
    pattern: Object.freeze(['normal']),
    countOffset: 0,
    spawnIntervalMultiplier: 1,
    eliteTrait: null,
  }),
  swarm: Object.freeze({
    name: '雜念潮',
    color: '#8ED37D',
    hint: '範圍／連鎖塔有效',
    pattern: Object.freeze(['swarm', 'normal', 'swarm', 'swarm', 'fast']),
    countOffset: 1,
    spawnIntervalMultiplier: 0.82,
    eliteTrait: 'splitter',
  }),
  rush: Object.freeze({
    name: '驚醒突襲',
    color: '#F09A72',
    hint: '減速／爆發塔有效',
    pattern: Object.freeze(['fast', 'normal', 'fast', 'normal', 'fast']),
    countOffset: 0,
    spawnIntervalMultiplier: 0.9,
    eliteTrait: 'frenzy',
  }),
  siege: Object.freeze({
    name: '重壓夢境',
    color: '#A997C4',
    hint: '高傷／持續傷害塔有效',
    pattern: Object.freeze(['tank', 'normal', 'tank', 'normal', 'normal']),
    countOffset: -1,
    spawnIntervalMultiplier: 1.15,
    eliteTrait: 'shield',
  }),
  mixed: Object.freeze({
    name: '扭曲混合',
    color: '#D0A34F',
    hint: '均衡配置較穩定',
    pattern: Object.freeze(['normal', 'swarm', 'fast', 'normal', 'tank']),
    countOffset: 0,
    spawnIntervalMultiplier: 1,
    eliteTrait: null,
  }),
  boss: Object.freeze({
    name: 'Boss 波',
    color: '#F0B84B',
    hint: '集中火力守住核心',
    pattern: Object.freeze([]),
    countOffset: 0,
    spawnIntervalMultiplier: 1,
    eliteTrait: null,
  }),
});

const WAVE_THEME_CYCLE = Object.freeze(['swarm', 'rush', 'siege', 'mixed']);
const MIXED_ELITE_CYCLE = Object.freeze(['shield', 'splitter', 'frenzy']);

export const PLAYER_NAMES = Object.freeze({ p1: '至凱', p2: '柏致' });

export function cardStats(cardId, rank = 1) {
  const base = CARDS[cardId];
  if (!base) throw new Error(`Unknown card: ${cardId}`);
  const safeRank = Math.max(1, Math.min(GAME.maxRank, rank));
  const level = safeRank - 1;
  const stats = {
    ...base,
    rank: safeRank,
    damage: base.damage * (GAME.damageRankMultiplier ** level),
    interval: base.interval,
    range: base.range,
    critMultiplier: GAME.critMultiplier,
  };

  if (base.effect === 'critPower') stats.critMultiplier += level * 0.12;
  if (base.effect === 'haste') stats.interval *= 0.93 ** level;
  if (base.effect === 'splash') stats.splash = base.splash + level * 0.012;
  if (base.effect === 'slow') {
    stats.slow = Math.min(0.68, base.slow + level * 0.055);
    stats.slowDuration = base.slowDuration + level * 0.28;
  }
  if (base.effect === 'shared') stats.sharedMultiplier = base.sharedMultiplier + level * 0.16;
  if (base.effect === 'dot') stats.dotDuration = base.dotDuration + level * 0.55;
  if (base.effect === 'chain') stats.chain = base.chain + Math.floor((safeRank - 1) / 2);
  if (base.effect === 'fifthBurst') stats.burstTargets = base.burstTargets + Math.floor((safeRank - 1) / 2);
  if (base.effect === 'aura') {
    stats.auraBoost = base.auraBoost + level * 0.035;
    stats.auraRange = base.auraRange + level * 0.13;
  }
  if (base.effect === 'sniper') {
    stats.critMultiplier += 0.35 + level * 0.1;
  }
  if (base.effect === 'global') stats.interval *= 0.88 ** level;
  if (base.effect === 'boss') stats.bossMultiplier = base.bossMultiplier + level * 0.18;
  if (base.effect === 'hate') stats.interval *= 0.96 ** level;
  if (base.effect === 'charge') {
    stats.interval *= 0.96 ** level;
    stats.chargeRequired = Math.max(3, base.chargeRequired - Math.floor(level / 2));
    stats.maxHpPct = base.maxHpPct + level * 0.005;
  }
  return stats;
}

export function isBossWave(wave) {
  return wave > 0 && (wave <= 100 ? wave % 10 === 0 : wave % 5 === 0);
}

export function nextBossWave(wave) {
  const safeWave = Math.max(0, Number(wave) || 0);
  if (safeWave < 100) return Math.max(10, Math.ceil((safeWave + 0.001) / 10) * 10);
  return Math.ceil((safeWave + 0.001) / 5) * 5;
}

export function waveEnemyType(wave) {
  if (isBossWave(wave)) return bossTypeForWave(wave);
  return waveEnemySequence(wave)[0] || 'normal';
}

export function waveThemeForWave(wave) {
  const safeWave = Math.max(1, Number(wave) || 1);
  if (isBossWave(safeWave)) return 'boss';
  if (safeWave === 1) return 'calm';
  return WAVE_THEME_CYCLE[(safeWave - 2) % WAVE_THEME_CYCLE.length];
}

export function waveEnemyCount(wave) {
  if (isBossWave(wave)) return 1;
  const baseCount = 6 + Math.floor((wave + 1) / 3);
  const theme = WAVE_THEMES[waveThemeForWave(wave)] || WAVE_THEMES.calm;
  return Math.max(4, baseCount + theme.countOffset);
}

export function bossTypeForWave(wave) {
  if (!isBossWave(wave)) return null;
  const bossTypes = ['insomnia_beast', 'fear_demon', 'volcano_captain', 'silence_serpent'];
  const bossIndex = wave <= 100 ? Math.floor(wave / 10) - 1 : 9 + Math.floor((wave - 100) / 5);
  return bossTypes[((bossIndex % bossTypes.length) + bossTypes.length) % bossTypes.length];
}

export function waveEnemySequence(wave) {
  if (isBossWave(wave)) return [bossTypeForWave(wave)];
  const count = waveEnemyCount(wave);
  const theme = WAVE_THEMES[waveThemeForWave(wave)] || WAVE_THEMES.calm;
  return Array.from({ length: count }, (_, index) => theme.pattern[index % theme.pattern.length]);
}

export function waveSpawnInterval(wave) {
  if (isBossWave(wave)) return 0.5;
  const theme = WAVE_THEMES[waveThemeForWave(wave)] || WAVE_THEMES.calm;
  const baseInterval = Math.max(0.2, 0.66 - wave * 0.006);
  return Math.max(0.18, baseInterval * theme.spawnIntervalMultiplier);
}

export function eliteTraitForSpawn(wave, spawnIndex, enemyCount = waveEnemyCount(wave)) {
  if (wave < 6 || isBossWave(wave)) return null;
  const eliteIndex = Math.floor((Math.max(1, enemyCount) - 1) / 2);
  if (spawnIndex !== eliteIndex) return null;
  const themeId = waveThemeForWave(wave);
  const theme = WAVE_THEMES[themeId] || WAVE_THEMES.calm;
  if (theme.eliteTrait) return theme.eliteTrait;
  const mixedRound = Math.max(0, Math.floor((wave - 9) / WAVE_THEME_CYCLE.length));
  return MIXED_ELITE_CYCLE[mixedRound % MIXED_ELITE_CYCLE.length];
}

export function effectiveEnemySpeed(enemy) {
  const speed = Math.max(0, Number(enemy?.speed) || 0);
  const multiplier = Math.max(0, Number(enemy?.speedMultiplier) || 1);
  const slow = Math.max(0, Math.min(0.95, Number(enemy?.slow) || 0));
  return speed * multiplier * (1 - slow);
}

export function enemyStats(type, wave) {
  const base = ENEMIES[type];
  const hpScale = 1 + (wave - 1) * 0.115 + Math.max(0, wave - 40) * 0.015;
  const speedScale = Math.min(1.72, 1 + Math.floor(wave / 12) * 0.045);
  return {
    ...base,
    hp: Math.round(base.hp * hpScale),
    maxHp: Math.round(base.hp * hpScale),
    speed: base.speed * speedScale,
  };
}
