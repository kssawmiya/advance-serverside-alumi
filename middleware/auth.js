'use strict';

/**
 * @file middleware/auth.js
 * @description JWT authentication and role-based authorization middleware.
 * Uses jsonwebtoken library — NO sessions or cookies.
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware: verifyToken
 *
 * Extracts the JWT from the Authorization header (Bearer scheme),
 * verifies its signature against JWT_SECRET, and attaches the decoded
 * payload to req.user.
 *
 * Flow:
 * 1. Check for "Authorization: Bearer <token>" header
 * 2. Extract the token string after "Bearer "
 * 3. Verify using jwt.verify(token, process.env.JWT_SECRET)
 * 4. On success: attach { id, email, role } to req.user and call next()
 * 5. On missing token: 401 Unauthorized
 * 6. On invalid/expired token: 401 Unauthorized
 *
 * @param {import('express').Request}  req  - Express request object
 * @param {import('express').Response} res  - Express response object
 * @param {import('express').NextFunction} next - Express next middleware
 */
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    // Header must be present and follow "Bearer <token>" format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — no token provided',
      });
    }

    // Extract the raw token string (everything after "Bearer ")
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — token missing',
      });
    }

    // Verify the token against the JWT_SECRET
    // jwt.verify throws if: signature invalid, expired, malformed
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    /**
     * Attach the decoded payload to req.user.
     * The JWT payload (signed at login) contains: { id, email, role }
     * Downstream middleware and controllers access req.user.id, req.user.role, etc.
     */
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    // Catch all JWT errors: TokenExpiredError, JsonWebTokenError, NotBeforeError
    return res.status(401).json({
      success: false,
      error: 'Unauthorized — invalid or expired token',
    });
  }
};

/**
 * Middleware factory: requireRole
 *
 * Returns a middleware function that checks whether the authenticated user
 * has the specified role. Must be used AFTER verifyToken in the middleware chain.
 *
 * Usage:
 *   router.delete('/admin/users/:id', verifyToken, requireRole('admin'), handler)
 *
 * @param {string | string[]} role - Required role string or array of allowed roles
 * @returns {import('express').RequestHandler} Express middleware
 *
 * @example
 * router.post('/keys', verifyToken, requireRole('developer'), apiKeyController.generateKey);
 * router.get('/admin', verifyToken, requireRole(['admin', 'developer']), adminHandler);
 */
const requireRole = (role) => {
  return (req, res, next) => {
    // verifyToken must have run first and attached req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — authentication required',
      });
    }

    // Support both single role string and array of allowed roles
    const allowedRoles = Array.isArray(role) ? role : [role];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden — requires role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
};

module.exports = { verifyToken, requireRole };
