'use strict';

const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const ApiLog = require('../models/ApiLog');

const requireApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — API key required (Authorization: Bearer <key>)',
      });
    }

    const rawKey = authHeader.split(' ')[1];

    if (!rawKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — API key missing',
      });
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await ApiKey.findOne({ keyHash, revokedAt: null });

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — invalid or revoked API key',
      });
    }

    ApiKey.updateOne({ _id: apiKey._id }, { $set: { lastUsed: new Date() } }).catch(
      (err) => console.error('[ApiKey] Failed to update lastUsed:', err.message)
    );

    ApiLog.create({
      apiKeyId: apiKey._id,
      endpoint: req.path,
      method: req.method,

      statusCode: 200,
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      timestamp: new Date(),
    }).catch(
      (err) => console.error('[ApiLog] Failed to create log entry:', err.message)
    );

    req.apiKey = apiKey;

    next();
  } catch (err) {
    console.error('[requireApiKey] Unexpected error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during API key authentication',
    });
  }
};

const requireScope = (scope) => (req, res, next) => {
  if (!req.apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized — API key authentication required before scope check',
    });
  }

  if (!req.apiKey.scopes || !req.apiKey.scopes.includes(scope)) {
    return res.status(403).json({
      success: false,
      error: `Forbidden — API key lacks required scope: ${scope}`,
      yourScopes: req.apiKey.scopes || [],
      required: scope,
    });
  }

  next();
};

module.exports = requireApiKey;
module.exports.requireScope = requireScope;
