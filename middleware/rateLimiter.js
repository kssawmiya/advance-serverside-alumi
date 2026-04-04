'use strict';

/**
 * @file middleware/rateLimiter.js
 * @description Rate limiting middleware using express-rate-limit.
 * Three limiters are provided for different route sensitivity levels:
 *
 * - authLimiter:    Strict — 5 req/15 min in production, 100 req/15 min in development
 * - apiLimiter:     Medium — 100 req/15 min (developer API endpoints)
 * - generalLimiter: Loose  — 200 req/15 min (all other routes)
 *
 * In development mode (NODE_ENV !== 'production'), rate limiting is relaxed
 * to avoid blocking requests during testing and demos.
 *
 * All limiters return consistent JSON error responses.
 */

const rateLimit = require('express-rate-limit');

/** True when running in production environment */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Standard error response handler for all rate limiters.
 * Returns JSON instead of the default plain-text response.
 *
 * @param {import('express').Request}  req  - Express request
 * @param {import('express').Response} res  - Express response
 */
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: 'Too many requests, please try again later.',
  });
};

/**
 * authLimiter
 * Applied to sensitive authentication endpoints:
 *   - POST /api/auth/login
 *   - POST /api/auth/forgot-password
 *   - POST /api/auth/register
 *
 * Production: Max 5 requests per 15 minutes per IP (brute-force protection).
 * Development: Max 100 requests per 15 minutes per IP (allows testing/demos).
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes in milliseconds
  max: isProduction ? 5 : 100,         // Strict in production, relaxed in development
  standardHeaders: true,               // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,                // Disable deprecated X-RateLimit-* headers
  handler: rateLimitHandler,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

/**
 * apiLimiter
 * Applied to the public developer API (/api/v1/*).
 * Max: 100 requests per 15 minutes per IP.
 *
 * Allows reasonable third-party API usage while preventing abuse.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // Maximum 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

/**
 * generalLimiter
 * Applied globally to all routes as a baseline protection layer.
 * Max: 200 requests per 15 minutes per IP.
 *
 * Catches misconfigured clients and general abuse without blocking
 * normal application usage.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // Maximum 200 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

module.exports = { authLimiter, apiLimiter, generalLimiter };
