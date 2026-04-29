'use strict';

const rateLimit = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';

const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: 'Too many requests, please try again later.',
  });
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
});

module.exports = { authLimiter, apiLimiter, generalLimiter };
