/**
 * Authentication routes
 * POST /api/auth/register  - Create new account
 * POST /api/auth/login     - Login to existing account
 * POST /api/auth/guest-migrate - Migrate guest data to new account
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authLimiter } = require('../middleware/rateLimiter');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token (7 day expiry)
function generateToken(user) {
  return jwt.sign(
    { userId: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', authLimiter, [
  body('username').trim().isLength({ min: 2, max: 20 }).withMessage('Username must be 2-20 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { username, password } = req.body;

    // Check if username exists
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }

    const user = new User({
      username: username.toLowerCase(),
      password,
      isGuest: false
    });

    await user.save();

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: user.toSafeObject()
      }
    });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { username, password } = req.body;

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        token,
        user: user.toSafeObject()
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

// POST /api/auth/guest-migrate
// Migrate guest local data to a newly created account
router.post('/guest-migrate', authLimiter, [
  body('username').trim().isLength({ min: 2, max: 20 }).withMessage('Username must be 2-20 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { username, password, guestData } = req.body;

    // Check if username exists
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }

    // Create user with guest data merged
    const userData = {
      username: username.toLowerCase(),
      password,
      isGuest: false
    };

    // Merge guest stats if provided
    if (guestData) {
      if (guestData.stats) Object.assign(userData, { stats: guestData.stats });
      if (guestData.unlockedSkins) userData.unlockedSkins = guestData.unlockedSkins;
      if (guestData.activeSkin) userData.activeSkin = guestData.activeSkin;
      if (guestData.unlockedAchievements) userData.unlockedAchievements = guestData.unlockedAchievements;
      if (guestData.coins) userData.coins = guestData.coins;
    }

    const user = new User(userData);
    await user.save();

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: user.toSafeObject()
      }
    });
  } catch (err) {
    console.error('[Auth] Guest migrate error:', err.message);
    res.status(500).json({ success: false, error: 'Server error during migration' });
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    console.error('[Auth] Me error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
