/**
 * Score model - stores individual game results for leaderboard
 * Indexed by mode + score for fast leaderboard queries
 */
const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  mode: {
    type: String,
    enum: ['classic', 'timed', 'obstacle', 'wallpass', 'endless'],
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 0
  },
  length: {
    type: Number,
    required: true,
    min: 1
  },
  duration: {
    type: Number,  // seconds
    required: true,
    min: 0
  },
  foodEaten: {
    type: Number,
    default: 0
  },
  // For daily leaderboard reset
  isDaily: {
    type: Boolean,
    default: false
  },
  // Anti-cheat: server-side validation flag
  isValid: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for leaderboard queries
scoreSchema.index({ mode: 1, score: -1 });
scoreSchema.index({ mode: 1, isDaily: 1, score: -1 });
scoreSchema.index({ userId: 1, mode: 1 });

module.exports = mongoose.model('Score', scoreSchema);
