'use strict';

const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — no token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — token missing',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {

    return res.status(401).json({
      success: false,
      error: 'Unauthorized — invalid or expired token',
    });
  }
};

const requireRole = (role) => {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — authentication required',
      });
    }

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
