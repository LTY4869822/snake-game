/**
 * Anti-cheat middleware for score validation
 * Validates that submitted scores are logically possible based on
 * game duration, max achievable speed, and scoring rules
 */

// Maximum possible score constants
const MAX_FOOD_PER_SECOND = 10;   // Impossible to eat more than 10 foods/sec
const POINTS_PER_FOOD = 10;
const MAX_SCORE_PER_SECOND = MAX_FOOD_PER_SECOND * POINTS_PER_FOOD; // 100

// Mode-specific time limits
const MODE_MAX_DURATION = {
  classic: Infinity,
  timed: 300,      // 5 minutes
  obstacle: Infinity,
  wallpass: Infinity,
  endless: Infinity
};

/**
 * Validates a score submission for logical consistency
 * Returns { valid: boolean, reason: string }
 */
function validateScore(score, duration, mode, foodEaten) {
  // Negative or zero duration
  if (duration <= 0) {
    return { valid: false, reason: 'Invalid game duration' };
  }

  // Score can't be negative
  if (score < 0) {
    return { valid: false, reason: 'Negative score not allowed' };
  }

  // Timed mode can't exceed max time
  if (MODE_MAX_DURATION[mode] && duration > MODE_MAX_DURATION[mode] + 5) {
    return { valid: false, reason: 'Duration exceeds mode time limit' };
  }

  // Score can't exceed theoretical maximum
  const maxPossible = duration * MAX_SCORE_PER_SECOND;
  if (score > maxPossible) {
    return { valid: false, reason: `Score ${score} exceeds maximum possible ${Math.floor(maxPossible)} for ${duration}s` };
  }

  // Food eaten must be consistent with score (score should be roughly foodEaten * 10)
  const expectedMinScore = foodEaten * 10;
  // Allow for bonus points (combo, items), but not unreasonably high
  if (foodEaten > 0 && score > expectedMinScore * 5) {
    return { valid: false, reason: 'Score multiplier too high for food count' };
  }

  // Food eaten per second sanity check
  if (foodEaten / duration > MAX_FOOD_PER_SECOND) {
    return { valid: false, reason: 'Food eating rate exceeds maximum' };
  }

  // Minimum game duration for score
  if (score > 0 && duration < 1) {
    return { valid: false, reason: 'Game too short for non-zero score' };
  }

  return { valid: true, reason: 'OK' };
}

/**
 * Express middleware that validates score before passing to route handler
 */
function antiCheatMiddleware(req, res, next) {
  const { score, duration, mode, foodEaten } = req.body;

  const validation = validateScore(
    parseInt(score) || 0,
    parseInt(duration) || 0,
    mode,
    parseInt(foodEaten) || 0
  );

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: 'Score validation failed',
      reason: validation.reason
    });
  }

  req.scoreValidated = true;
  next();
}

module.exports = { antiCheatMiddleware, validateScore };
