/**
 * User routes
 * GET  /api/users/profile     - Get user profile with stats
 * PUT  /api/users/profile     - Update profile (skin, achievements, etc.)
 * POST /api/users/sync        - Sync local data to cloud
 * GET  /api/users/achievements - Get user achievements
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    console.error('[Users] Profile get error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PUT /api/users/profile
router.put('/profile', authMiddleware, [
  body('activeSkin').optional().isString(),
  body('unlockedSkins').optional().isArray(),
  body('unlockedAchievements').optional().isArray(),
  body('coins').optional().isInt({ min: 0 }),
  body('stats').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const allowedFields = ['activeSkin', 'unlockedSkins', 'unlockedAchievements', 'coins', 'stats'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    console.error('[Users] Profile update error:', err.message);
    res.status(500).json({ success: false, error: 'Server error updating profile' });
  }
});

// POST /api/users/sync
// Sync local game data to cloud (for when user logs in after playing offline)
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const { stats, unlockedSkins, activeSkin, unlockedAchievements, coins } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Merge stats (take max values)
    if (stats) {
      if (stats.highestScore > user.stats.highestScore) {
        user.stats.highestScore = stats.highestScore;
      }
      if (stats.highestLength > user.stats.highestLength) {
        user.stats.highestLength = stats.highestLength;
      }
      user.stats.totalGames += stats.totalGames || 0;
      user.stats.totalPlayTime += stats.totalPlayTime || 0;
      user.stats.totalScore += stats.totalScore || 0;
      user.stats.totalFoodEaten += stats.totalFoodEaten || 0;

      // Merge per-mode best scores
      if (stats.bestScores) {
        for (const mode of Object.keys(stats.bestScores)) {
          if (stats.bestScores[mode] > (user.stats.bestScores[mode] || 0)) {
            user.stats.bestScores[mode] = stats.bestScores[mode];
          }
        }
      }
    }

    // Merge skins
    if (unlockedSkins && Array.isArray(unlockedSkins)) {
      const mergedSkins = new Set([...user.unlockedSkins, ...unlockedSkins]);
      user.unlockedSkins = [...mergedSkins];
    }
    if (activeSkin) user.activeSkin = activeSkin;

    // Merge achievements
    if (unlockedAchievements && Array.isArray(unlockedAchievements)) {
      const existingIds = new Set(user.unlockedAchievements.map(a => a.id));
      for (const ach of unlockedAchievements) {
        if (!existingIds.has(ach.id || ach)) {
          user.unlockedAchievements.push({
            id: ach.id || ach,
            unlockedAt: new Date()
          });
        }
      }
    }

    // Merge coins (add, don't max)
    if (coins) user.coins += coins;

    await user.save();

    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    console.error('[Users] Sync error:', err.message);
    res.status(500).json({ success: false, error: 'Server error during sync' });
  }
});

// GET /api/users/achievements
router.get('/achievements', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('unlockedAchievements');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: { achievements: user.unlockedAchievements } });
  } catch (err) {
    console.error('[Users] Achievements error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
