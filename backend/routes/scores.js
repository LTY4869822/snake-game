/**
 * Score routes
 * POST /api/scores/submit    - Submit a game score (requires auth)
 * GET  /api/scores/leaderboard - Get leaderboard with pagination
 * GET  /api/scores/personal  - Get personal best scores
 */
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Score = require('../models/Score');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { scoreLimiter } = require('../middleware/rateLimiter');
const { antiCheatMiddleware } = require('../middleware/antiCheat');

const router = express.Router();

// POST /api/scores/submit
router.post('/submit', authMiddleware, scoreLimiter, antiCheatMiddleware, [
  body('mode').isIn(['classic', 'timed', 'obstacle', 'wallpass', 'endless']).withMessage('Invalid game mode'),
  body('score').isInt({ min: 0 }).withMessage('Score must be non-negative'),
  body('length').isInt({ min: 1 }).withMessage('Length must be at least 1'),
  body('duration').isFloat({ min: 0 }).withMessage('Duration must be non-negative'),
  body('foodEaten').isInt({ min: 0 }).withMessage('Food eaten must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { mode, score, length, duration, foodEaten } = req.body;

    // Save score record
    const scoreRecord = new Score({
      userId: req.userId,
      username: req.username,
      mode,
      score: parseInt(score),
      length: parseInt(length),
      duration: parseFloat(duration),
      foodEaten: parseInt(foodEaten),
      isValid: true
    });

    await scoreRecord.save();

    // Update user stats
    const user = await User.findById(req.userId);
    if (user) {
      user.stats.totalGames += 1;
      user.stats.totalScore += parseInt(score);
      user.stats.totalFoodEaten += parseInt(foodEaten);
      user.stats.totalPlayTime += parseFloat(duration);

      // Update averages
      user.stats.averageGameTime =
        user.stats.totalPlayTime / user.stats.totalGames;

      // Update best scores
      if (parseInt(score) > user.stats.highestScore) {
        user.stats.highestScore = parseInt(score);
      }
      if (parseInt(length) > user.stats.highestLength) {
        user.stats.highestLength = parseInt(length);
      }
      if (parseInt(score) > (user.stats.bestScores[mode] || 0)) {
        user.stats.bestScores[mode] = parseInt(score);
      }

      // Earn coins (10% of score)
      const earnedCoins = Math.floor(parseInt(score) * 0.1);
      user.coins += earnedCoins;

      await user.save();
    }

    res.status(201).json({
      success: true,
      data: {
        scoreId: scoreRecord._id,
        coinsEarned: Math.floor(parseInt(score) * 0.1)
      }
    });
  } catch (err) {
    console.error('[Scores] Submit error:', err.message);
    res.status(500).json({ success: false, error: 'Server error submitting score' });
  }
});

// GET /api/scores/leaderboard
router.get('/leaderboard', [
  query('mode').optional().isIn(['classic', 'timed', 'obstacle', 'wallpass', 'endless']),
  query('type').optional().isIn(['all', 'daily']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const {
      mode = 'classic',
      type = 'all',
      page = 1,
      limit = 50
    } = req.query;

    const query = { mode, isValid: true };

    // Filter for daily leaderboard
    if (type === 'daily') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: today };
      query.isDaily = true;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [scores, total] = await Promise.all([
      Score.find(query)
        .sort({ score: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('username score length duration mode createdAt')
        .lean(),
      Score.countDocuments(query)
    ]);

    // Add rank to each score
    const rankedScores = scores.map((s, i) => ({
      ...s,
      rank: skip + i + 1
    }));

    res.json({
      success: true,
      data: {
        scores: rankedScores,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (err) {
    console.error('[Scores] Leaderboard error:', err.message);
    res.status(500).json({ success: false, error: 'Server error fetching leaderboard' });
  }
});

// GET /api/scores/personal
router.get('/personal', authMiddleware, async (req, res) => {
  try {
    const scores = await Score.find({ userId: req.userId, isValid: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('mode score length duration createdAt')
      .lean();

    // Get best per mode
    const bestPerMode = {};
    for (const s of scores) {
      if (!bestPerMode[s.mode] || s.score > bestPerMode[s.mode].score) {
        bestPerMode[s.mode] = s;
      }
    }

    res.json({
      success: true,
      data: {
        recent: scores.slice(0, 20),
        bestPerMode
      }
    });
  } catch (err) {
    console.error('[Scores] Personal error:', err.message);
    res.status(500).json({ success: false, error: 'Server error fetching personal scores' });
  }
});

module.exports = router;
