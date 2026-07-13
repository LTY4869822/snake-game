/**
 * Rate limiting middleware
 * Prevents abuse of API endpoints
 */
const rateLimit = require('express-rate-limit');

// General API rate limiter (100 requests per minute)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again in a minute.'
  }
});

// Auth endpoints stricter limit (10 requests per minute)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in a minute.'
  }
});

// Score submission limit (30 per minute)
const scoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many score submissions. Please slow down.'
  }
});

module.exports = { generalLimiter, authLimiter, scoreLimiter };
