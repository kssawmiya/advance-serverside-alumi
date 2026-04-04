'use strict';

/**
 * @file middleware/requireApiKey.js
 * @description API key authentication middleware for the public developer API (/api/v1/*).
 *
 * SECURITY DESIGN:
 * - Raw API keys are never stored in the database (only SHA-256 hashes).
 * - On each request, the incoming key is hashed and looked up in the ApiKey collection.
 * - Revoked keys (revokedAt != null) are rejected.
 * - Each successful use is logged asynchronously (fire-and-forget) to ApiLog.
 */

const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const ApiLog = require('../models/ApiLog');

/**
 * Middleware: requireApiKey
 *
 * Authenticates requests to the public API using a Bearer API key.
 *
 * Flow:
 * 1. Extract raw key from "Authorization: Bearer <key>" header
 * 2. Hash the raw key with SHA-256 to get keyHash
 * 3. Look up ApiKey document where keyHash matches AND revokedAt is null
 * 4. If not found or revoked: return 401
 * 5. Async (fire-and-forget): update apiKey.lastUsed timestamp
 * 6. Async (fire-and-forget): create an ApiLog entry for this request
 * 7. Attach apiKey document to req.apiKey, call next()
 *
 * @param {import('express').Request}  req  - Express request object
 * @param {import('express').Response} res  - Express response object
 * @param {import('express').NextFunction} next - Express next middleware
 */
const requireApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    // Must have Authorization header with Bearer scheme
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — API key required (Authorization: Bearer <key>)',
      });
    }

    // Extract the raw API key string from the header
    const rawKey = authHeader.split(' ')[1];

    if (!rawKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — API key missing',
      });
    }

    /**
     * Hash the raw key using SHA-256.
     * This must match how the key was stored when it was generated
     * (see apiKeyController.generateKey).
     * We never store or log the raw key.
     */
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    /**
     * Look up the key in the database.
     * Conditions:
     *   - keyHash must match (identifies the key)
     *   - revokedAt must be null (key is not revoked)
     */
    const apiKey = await ApiKey.findOne({ keyHash, revokedAt: null });

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized — invalid or revoked API key',
      });
    }

    /**
     * Fire-and-forget: update lastUsed timestamp.
     * We don't await this — it's a best-effort update and should not
     * delay the API response.
     */
    ApiKey.updateOne({ _id: apiKey._id }, { $set: { lastUsed: new Date() } }).catch(
      (err) => console.error('[ApiKey] Failed to update lastUsed:', err.message)
    );

    /**
     * Fire-and-forget: create an audit log entry.
     * We don't await this either — logging is non-critical.
     * The log captures the endpoint, method, and client IP for usage stats.
     */
    ApiLog.create({
      apiKeyId: apiKey._id,
      endpoint: req.path,
      method: req.method,
      // Status code is not known yet (response hasn't been sent);
      // we log 0 as placeholder — or use a response interceptor pattern
      statusCode: 200, // optimistic — actual code logged if using res.on('finish')
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      timestamp: new Date(),
    }).catch(
      (err) => console.error('[ApiLog] Failed to create log entry:', err.message)
    );

    /**
     * Attach the ApiKey document to the request object.
     * Downstream handlers can access req.apiKey.developerId, req.apiKey.scopes, etc.
     */
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

module.exports = requireApiKey;
