/**
 * Game configuration constants and defaults
 * All tunable game parameters are centralized here
 */
const CONFIG = {
  // Grid & Canvas
  GRID_COLS: 20,
  GRID_ROWS: 20,
  CELL_SIZE: 30,            // Base cell size in px (canvas: 600x600)
  CANVAS_PADDING: 0,

  // Snake defaults
  SNAKE_INITIAL_LENGTH: 3,
  SNAKE_INITIAL_SPEED: 150,  // ms per tick (starts at 150ms)
  SNAKE_MIN_SPEED: 60,       // Fastest (60ms per tick)
  SNAKE_SPEED_DECREMENT: 2,  // ms faster per food eaten
  SNAKE_START_X: 10,
  SNAKE_START_Y: 10,

  // Food
  FOOD_SCORE: 10,
  FOOD_COMBO_WINDOW: 2000,   // ms window for combo multiplier
  FOOD_COMBO_MULTIPLIER: 0.5, // Extra 50% per combo level

  // Items / Power-ups
  ITEM_SPAWN_CHANCE: 0.15,   // 15% chance per food eaten
  ITEM_DURATIONS: {
    doubleScore: 10000,      // 10 seconds
    slowDown: 8000,          // 8 seconds
    shield: Infinity,        // Until consumed
    shrink: 0,               // Instant
    magnet: 5000             // 5 seconds
  },
  ITEM_COLORS: {
    doubleScore: '#ffd700',
    slowDown: '#4fc3f7',
    shield: '#7c4dff',
    shrink: '#ff7043',
    magnet: '#ff4081'
  },
  ITEM_ICONS: {
    doubleScore: '×2',
    slowDown: '🐢',
    shield: '🛡',
    shrink: '✂',
    magnet: '🧲'
  },

  // Game modes
  MODE_TIMED_DURATION: 300,  // Default 5 minutes
  MODE_OBSTACLE_COUNT: 8,
  MODE_ENDLESS_INITIAL_SHIELDS: 1,

  // Difficulty presets
  DIFFICULTY: {
    easy: { initialSpeed: 180, speedDecrement: 1, minSpeed: 90 },
    normal: { initialSpeed: 150, speedDecrement: 2, minSpeed: 60 },
    hard: { initialSpeed: 120, speedDecrement: 3, minSpeed: 45 }
  },

  // Particles
  PARTICLE_MAX: 200,
  PARTICLE_EAT_COUNT: 12,
  PARTICLE_DEATH_COUNT: 30,

  // Audio (procedural, no files needed)
  AUDIO_ENABLED: true,
  AUDIO_BGM_VOLUME: 0.4,
  AUDIO_SFX_VOLUME: 0.7,

  // API (empty string = same origin in production, localhost for dev)
  // On GitHub Pages (github.io), API is unavailable → game runs in offline/local mode
  API_BASE_URL: (window.location.port === '5500' || window.location.port === '8080')
    ? 'http://localhost:3000/api'
    : (window.location.hostname.endsWith('github.io') || window.location.hostname.endsWith('gitpod.io'))
      ? null  // GitHub Pages: no backend, game uses local storage only
      : '/api',

  // Standalone mode (no backend) — set automatically for GitHub Pages
  STANDALONE: (function() {
    return window.location.hostname.endsWith('github.io') ||
           window.location.hostname.endsWith('gitpod.io');
  })(),

  // Storage keys
  STORAGE_KEYS: {
    SETTINGS: 'snake_settings',
    STATS: 'snake_stats',
    SKINS: 'snake_skins',
    ACHIEVEMENTS: 'snake_achievements',
    SCORES_LOCAL: 'snake_local_scores',
    AUTH_TOKEN: 'snake_token',
    USER: 'snake_user'
  },

  // Skins definition
  SKINS: [
    { id: 'classic-green', name: '经典翠绿', price: 0, colors: { head: '#4caf50', body: '#66bb6a', tail: '#a5d6a7', glow: 'rgba(76,175,80,0.5)' } },
    { id: 'classic-blue', name: '经典湖蓝', price: 0, colors: { head: '#2196f3', body: '#42a5f5', tail: '#90caf9', glow: 'rgba(33,150,243,0.5)' } },
    { id: 'classic-red', name: '经典赤红', price: 0, colors: { head: '#f44336', body: '#ef5350', tail: '#ef9a9a', glow: 'rgba(244,67,54,0.5)' } },
    { id: 'neon-purple', name: '霓虹幻紫', price: 200, colors: { head: '#e040fb', body: '#ce93d8', tail: '#f3e5f5', glow: 'rgba(224,64,251,0.6)' } },
    { id: 'golden', name: '流光鎏金', price: 500, colors: { head: '#ffd700', body: '#ffc107', tail: '#fff176', glow: 'rgba(255,215,0,0.6)' } },
    { id: 'ice-dragon', name: '冰霜巨龙', price: 800, colors: { head: '#00e5ff', body: '#80deea', tail: '#e0f7fa', glow: 'rgba(0,229,255,0.7)' } },
    { id: 'fire-serpent', name: '烈焰之蛇', price: 800, colors: { head: '#ff6d00', body: '#ff9800', tail: '#ffcc80', glow: 'rgba(255,109,0,0.7)' } },
    { id: 'galaxy', name: '银河星云', price: 1200, colors: { head: '#7c4dff', body: '#b388ff', tail: '#ede7f6', glow: 'rgba(124,77,255,0.7)', particle: true } },
    { id: 'rainbow', name: '彩虹幻彩', price: 1500, colors: { rainbow: true, glow: 'rgba(255,255,255,0.6)', particle: true } },
    { id: 'shadow', name: '暗影潜行', price: 1000, colors: { head: '#212121', body: '#424242', tail: '#757575', glow: 'rgba(0,0,0,0.5)' } },
    { id: 'candy', name: '糖果甜心', price: 600, colors: { head: '#ff4081', body: '#f48fb1', tail: '#fce4ec', glow: 'rgba(255,64,129,0.5)' } },
    { id: 'ocean', name: '深海传说', price: 700, colors: { head: '#006064', body: '#0097a7', tail: '#b2ebf2', glow: 'rgba(0,150,136,0.5)' } },
    { id: 'lava', name: '岩浆领主', price: 1500, colors: { head: '#ff1744', body: '#ff5252', tail: '#ffcdd2', glow: 'rgba(255,23,68,0.7)', particle: true } },
  ],

  // Achievements definition
  ACHIEVEMENTS: [
    { id: 'first_game', name: '初次出洞', desc: '完成第一局游戏', icon: '🐣', reward: 10 },
    { id: 'score_100', name: '初露锋芒', desc: '单局得分超过 100', icon: '⭐', reward: 20 },
    { id: 'score_500', name: '渐入佳境', desc: '单局得分超过 500', icon: '🌟', reward: 50 },
    { id: 'score_1000', name: '得分高手', desc: '单局得分超过 1000', icon: '💎', reward: 100 },
    { id: 'score_2000', name: '蛇王降临', desc: '单局得分超过 2000', icon: '👑', reward: 200 },
    { id: 'length_20', name: '长长长长', desc: '蛇身长度达到 20', icon: '📏', reward: 30 },
    { id: 'length_50', name: '贪吃巨蟒', desc: '蛇身长度达到 50', icon: '🐍', reward: 100 },
    { id: 'zero_death_5', name: '零失误', desc: '经典模式下 5 局未撞墙', icon: '🎯', reward: 80 },
    { id: 'combo_5', name: '连击新手', desc: '连续吃食物连击 ×5', icon: '🔥', reward: 20 },
    { id: 'combo_10', name: '连击达人', desc: '连续吃食物连击 ×10', icon: '💥', reward: 50 },
    { id: 'total_10_games', name: '常客', desc: '累计完成 10 局游戏', icon: '🎮', reward: 30 },
    { id: 'total_100_games', name: '游戏达人', desc: '累计完成 100 局游戏', icon: '🕹', reward: 100 },
    { id: 'play_1h', name: '轻度沉迷', desc: '累计游戏时长 1 小时', icon: '⏰', reward: 50 },
    { id: 'play_10h', name: '重度沉迷', desc: '累计游戏时长 10 小时', icon: '⌛', reward: 200 },
    { id: 'food_100', name: '吃货入门', desc: '累计吃掉 100 个食物', icon: '🍎', reward: 20 },
    { id: 'food_1000', name: '大胃王', desc: '累计吃掉 1000 个食物', icon: '🍽', reward: 100 },
    { id: 'all_modes', name: '全能选手', desc: '体验过所有游戏模式', icon: '🎯', reward: 80 },
    { id: 'timed_500', name: '争分夺秒', desc: '限时模式得分超过 500', icon: '⏱', reward: 80 },
    { id: 'obstacle_300', name: '披荆斩棘', desc: '障碍模式得分超过 300', icon: '🗡', reward: 60 },
    { id: 'wallpass_1000', name: '穿墙大师', desc: '穿墙模式得分超过 1000', icon: '🌀', reward: 100 },
    { id: 'endless_shield_5', name: '坚不可摧', desc: '无尽模式中累计获得 5 个护盾', icon: '🛡', reward: 100 },
    { id: 'item_collector', name: '道具大师', desc: '累计拾取 20 个道具', icon: '🎁', reward: 50 },
    { id: 'skin_collector', name: '时尚达人', desc: '解锁 5 款皮肤', icon: '👗', reward: 80 },
    { id: 'coin_1000', name: '小富翁', desc: '累计获得 1000 金币', icon: '💰', reward: 100 },
    { id: 'perfect_run', name: '完美一局', desc: '不带护盾通关任意模式且未死亡', icon: '🏅', reward: 200 },
  ],

  // ===== Game Background Themes =====
  BACKGROUNDS: [
    {
      id: 'nebula',
      name: '星空星云',
      icon: '🌌',
      colors: { top: '#0a0a2e', mid: '#1a0a3e', bottom: '#0d0d24', accent: '#6c5ce7', accent2: '#00d2ff' }
    },
    {
      id: 'ocean',
      name: '深海世界',
      icon: '🌊',
      colors: { top: '#0a4a7a', mid: '#062a4a', bottom: '#001a33', accent: '#00b4d8', accent2: '#90e0ef' }
    },
    {
      id: 'sakura',
      name: '樱花庭院',
      icon: '🌸',
      colors: { top: '#fce4ec', mid: '#f8bbd0', bottom: '#e8ded0', accent: '#f06292', accent2: '#f48fb1' }
    },
    {
      id: 'aurora',
      name: '极光之夜',
      icon: '🌠',
      colors: { top: '#0a0a1a', mid: '#0f1a2e', bottom: '#0d1a1a', accent: '#00ff88', accent2: '#7cffc4' }
    },
    {
      id: 'cyber',
      name: '赛博都市',
      icon: '🌃',
      colors: { top: '#050510', mid: '#0a0a20', bottom: '#0a0a15', accent: '#ff00ff', accent2: '#00ffff' }
    },
    {
      id: 'sunset',
      name: '日落黄昏',
      icon: '🌅',
      colors: { top: '#1a0a2e', mid: '#6b2a4a', bottom: '#e8784a', accent: '#ff6b6b', accent2: '#ffd93d' }
    },
    {
      id: 'bamboo',
      name: '竹林清风',
      icon: '🎋',
      colors: { top: '#e8f5e9', mid: '#c8e6c9', bottom: '#a5d6a7', accent: '#4caf50', accent2: '#81c784' }
    },
    {
      id: 'lava',
      name: '熔岩地心',
      icon: '🌋',
      colors: { top: '#1a0a0a', mid: '#2a0a0a', bottom: '#3a0a0a', accent: '#ff4500', accent2: '#ffa500' }
    }
  ],

  // Item types for random spawning (weighted)
  ITEM_TYPES: [
    { type: 'doubleScore', weight: 20, label: '双倍分数', color: '#ffd700' },
    { type: 'slowDown', weight: 20, label: '减速', color: '#4fc3f7' },
    { type: 'shield', weight: 25, label: '护盾', color: '#7c4dff' },
    { type: 'shrink', weight: 15, label: '缩短', color: '#ff7043' },
    { type: 'magnet', weight: 20, label: '磁铁', color: '#ff4081' },
  ]
};

// Freeze to prevent accidental mutation
Object.freeze(CONFIG.SKINS);
Object.freeze(CONFIG.ACHIEVEMENTS);
Object.freeze(CONFIG.ITEM_TYPES);
Object.freeze(CONFIG.BACKGROUNDS);
