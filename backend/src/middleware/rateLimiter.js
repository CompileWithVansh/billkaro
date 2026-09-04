import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for user login attempts.
 * Mitigates brute-force credential stuffing and prevents CPU exhaustion from bcrypt hashes.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per 15 minutes per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  statusCode: 429,
  message: {
    error: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
  validate: { xForwardedForHeader: false },
});

/**
 * Rate limiter for account registrations.
 * Prevents automated account creation spam.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 registrations per hour per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  statusCode: 429,
  message: {
    error: 'Too many accounts created from this IP. Please try again after 1 hour.',
  },
  validate: { xForwardedForHeader: false },
});

/**
 * Rate limiter for KDS 4-digit PIN pairing.
 * Prevents rapid brute-forcing of the 4-digit pairing PIN (1000-9999).
 */
export const kdsPairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per 15 minutes per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  statusCode: 429,
  message: {
    error: 'Too many kitchen pairing attempts. Please try again after 15 minutes.',
  },
  validate: { xForwardedForHeader: false },
});

/**
 * Baseline rate limiter across general API routes.
 * Protects against aggressive scraping and denial-of-service floods.
 * Set comfortably high so standard cashier/POS operations are never impacted.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Max 300 requests per 15 minutes per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  statusCode: 429,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  validate: { xForwardedForHeader: false },
});
