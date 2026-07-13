/**
 * User model - stores account info, game stats, unlocked skins & achievements
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 20
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  // Game statistics
  stats: {
    totalGames: { type: Number, default: 0 },
    totalPlayTime: { type: Number, default: 0 },       // seconds
    totalScore: { type: Number, default: 0 },
    totalFoodEaten: { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    highestLength: { type: Number, default: 0 },
    averageGameTime: { type: Number, default: 0 },       // seconds
    // Per-mode best scores
    bestScores: {
      classic: { type: Number, default: 0 },
      timed: { type: Number, default: 0 },
      obstacle: { type: Number, default: 0 },
      wallpass: { type: Number, default: 0 },
      endless: { type: Number, default: 0 }
    }
  },
  // Unlocked items
  unlockedSkins: {
    type: [String],
    default: ['classic-green', 'classic-blue', 'classic-red']
  },
  activeSkin: {
    type: String,
    default: 'classic-green'
  },
  unlockedAchievements: [{
    id: String,
    unlockedAt: { type: Date, default: Date.now }
  }],
  // Currency
  coins: {
    type: Number,
    default: 0
  },
  // Account metadata
  isGuest: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Return safe user object (no password)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
