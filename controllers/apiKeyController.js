'use strict';

/**
 * @file controllers/apiKeyController.js
 * @description Developer API key management controller.
 *
 * SECURITY DESIGN:
 * - Raw API keys use crypto.randomBytes(32) — 256 bits of entropy
 * - Only SHA-256 hashes of raw keys are stored in the database
 * - The raw key is returned ONCE at creation time and never again
 * - Revoked keys cannot be recovered or reactivated
 */

const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const ApiLog = require('../models/ApiLog');
const { validationResult } = require('express-validator');

/**
 * POST /api/developer/keys
 * Generates a new API key for the authenticated developer.
 *
 * SECURITY FLOW:
 * 1. Generate a cryptographically random 32-byte key (64 hex chars)
 * 2. Compute SHA-256 hash of the raw key
 * 3. Store ONLY the hash in the database
 * 4. Return the raw key in the response — this is the ONE AND ONLY TIME it's shown
 *
 * @async
 * @param {import('express').Request}  req - req.user.id (developer JWT), req.body.name, req.body.scopes
 * @param {import('express').Response} res
 */
const generateKey = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { name, scopes } = req.body;

    /**
     * Generate a cryptographically secure random API key.
     * crypto.randomBytes(32) produces 32 bytes (256 bits) of secure random data.
     * Encoded as hex: 64 characters, e.g. "a3f8c2e1d0b4..."
     * This is computationally infeasible to guess by brute force.
     */
    const rawKey = crypto.randomBytes(32).toString('hex');

    /**
     * Compute SHA-256 hash of the raw key.
     * ONLY this hash is stored in the database — NEVER the raw key.
     * On future requests, the incoming key is hashed and compared to this value.
     */
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // Validate and sanitise scopes input
    const validScopes = ['read:alumni'];
    const requestedScopes = Array.isArray(scopes) ? scopes : ['read:alumni'];
    const filteredScopes = requestedScopes.filter((s) => validScopes.includes(s));
    const finalScopes = filteredScopes.length > 0 ? filteredScopes : ['read:alumni'];

    // Create the ApiKey document — stores hash, never raw key
    const apiKey = await ApiKey.create({
      developerId: req.user.id,
      keyHash,
      name: name.trim(),
      scopes: finalScopes,
    });

    /**
     * CRITICAL: Return the rawKey ONCE.
     * After this response, the raw key is gone forever.
     * The developer must save it immediately.
     */
    return res.status(201).json({
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
        key: rawKey, // ← ONLY time raw key is returned
        message:
          'IMPORTANT: Save this API key now — it will not be shown again. Store it securely.',
      },
    });
  } catch (err) {
    console.error('[ApiKey] generateKey error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate API key',
    });
  }
};

/**
 * GET /api/developer/keys
 * Lists all API keys for the authenticated developer.
 *
 * SECURITY: Never returns keyHash or the raw key.
 * Only metadata fields (name, scopes, lastUsed, revokedAt, createdAt) are returned.
 *
 * @async
 * @param {import('express').Request}  req - req.user.id (developer JWT)
 * @param {import('express').Response} res
 */
const listKeys = async (req, res) => {
  try {
    /**
     * Select only safe-to-display fields.
     * Explicitly exclude keyHash using -keyHash to prevent accidental exposure.
     */
    const keys = await ApiKey.find({ developerId: req.user.id })
      .select('-keyHash') // Never return the hash
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: keys,
      count: keys.length,
    });
  } catch (err) {
    console.error('[ApiKey] listKeys error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve API keys',
    });
  }
};

/**
 * DELETE /api/developer/keys/:id
 * Revokes an API key (soft delete — sets revokedAt timestamp).
 *
 * Revoked keys are immediately rejected by requireApiKey middleware.
 * The key record is kept for audit purposes.
 *
 * @async
 * @param {import('express').Request}  req - req.params.id, req.user.id
 * @param {import('express').Response} res
 */
const revokeKey = async (req, res) => {
  try {
    const { id } = req.params;

    /**
     * Find the key and verify it belongs to this developer.
     * Only the owner can revoke their own keys.
     * Also check revokedAt is null — can't revoke an already-revoked key.
     */
    const apiKey = await ApiKey.findOne({
      _id: id,
      developerId: req.user.id,
      revokedAt: null,
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found, already revoked, or does not belong to you',
      });
    }

    // Soft-revoke by setting the revocation timestamp
    apiKey.revokedAt = new Date();
    await apiKey.save();

    return res.status(200).json({
      success: true,
      message: 'API key revoked successfully. It will no longer be accepted.',
    });
  } catch (err) {
    console.error('[ApiKey] revokeKey error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to revoke API key',
    });
  }
};

/**
 * GET /api/developer/stats
 * Returns aggregated usage statistics for all of the developer's API keys.
 *
 * Aggregates ApiLog documents to provide:
 * - Total API calls per key
 * - Breakdown by endpoint
 * - Last used timestamp
 *
 * @async
 * @param {import('express').Request}  req - req.user.id
 * @param {import('express').Response} res
 */
const getStats = async (req, res) => {
  try {
    // First get all keys belonging to this developer
    const developerKeys = await ApiKey.find({ developerId: req.user.id })
      .select('_id name scopes revokedAt lastUsed createdAt')
      .lean();

    if (developerKeys.length === 0) {
      return res.status(200).json({
        success: true,
        data: { keys: [], totalCalls: 0 },
      });
    }

    const keyIds = developerKeys.map((k) => k._id);

    /**
     * Aggregate ApiLog documents grouped by apiKeyId.
     * For each key:
     *  - totalCalls: count of all log entries
     *  - byEndpoint: breakdown of calls per endpoint
     *  - lastCall: most recent call timestamp
     */
    const logStats = await ApiLog.aggregate([
      {
        // Only include logs for this developer's keys
        $match: { apiKeyId: { $in: keyIds } },
      },
      {
        // Group by apiKeyId to get per-key stats
        $group: {
          _id: '$apiKeyId',
          totalCalls: { $sum: 1 },
          lastCall: { $max: '$timestamp' },
          // Collect endpoint strings for further grouping
          endpoints: { $push: '$endpoint' },
        },
      },
    ]);

    /**
     * Build a stats map keyed by apiKeyId string
     * for efficient O(1) lookup when merging with key metadata.
     */
    const statsMap = {};
    for (const stat of logStats) {
      // Count occurrences of each endpoint
      const endpointCounts = stat.endpoints.reduce((acc, ep) => {
        acc[ep] = (acc[ep] || 0) + 1;
        return acc;
      }, {});

      statsMap[stat._id.toString()] = {
        totalCalls: stat.totalCalls,
        lastCall: stat.lastCall,
        byEndpoint: endpointCounts,
      };
    }

    // Merge key metadata with usage stats
    const enrichedKeys = developerKeys.map((key) => {
      const stats = statsMap[key._id.toString()] || {
        totalCalls: 0,
        lastCall: null,
        byEndpoint: {},
      };

      return {
        id: key._id,
        name: key.name,
        scopes: key.scopes,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt,
        lastUsed: key.lastUsed,
        usage: stats,
      };
    });

    // Calculate total calls across all keys
    const totalCalls = enrichedKeys.reduce((sum, k) => sum + k.usage.totalCalls, 0);

    return res.status(200).json({
      success: true,
      data: {
        keys: enrichedKeys,
        totalCalls,
      },
    });
  } catch (err) {
    console.error('[ApiKey] getStats error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve API key statistics',
    });
  }
};

/**
 * POST /api/developer/alumni/:userId/event-attendance
 * Marks an alumnus as having attended a university event this month.
 *
 * This grants the alumnus a 4th bid slot for the current month
 * (instead of the default maximum of 3 wins).
 *
 * Only users with the 'developer' or 'admin' role can call this endpoint.
 * In a real system this would be restricted to admins only, but since
 * the spec defines the developer role as the privileged role, both are
 * allowed here.
 *
 * @async
 * @param {import('express').Request}  req - req.params.userId, req.user (JWT)
 * @param {import('express').Response} res
 */
const markEventAttendance = async (req, res) => {
  try {
    const Profile = require('../models/Profile');
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId parameter is required',
      });
    }

    /**
     * Find the profile by userId and set attendedEventThisMonth = true.
     * This grants the alumnus a 4th win slot for the current calendar month.
     * The monthly reset job (1st of each month) will clear this flag automatically.
     */
    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: { attendedEventThisMonth: true } },
      { new: true }
    ).select('fullName monthlyWinCount attendedEventThisMonth');

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Alumni profile not found for the provided userId',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Event attendance recorded for ${profile.fullName}. They now have a 4th bid slot this month.`,
      data: {
        fullName: profile.fullName,
        attendedEventThisMonth: profile.attendedEventThisMonth,
        monthlyWinCount: profile.monthlyWinCount,
        monthlyLimit: 4,
        remainingSlots: Math.max(0, 4 - profile.monthlyWinCount),
      },
    });
  } catch (err) {
    console.error('[ApiKey] markEventAttendance error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to record event attendance',
    });
  }
};

module.exports = {
  generateKey,
  listKeys,
  revokeKey,
  getStats,
  markEventAttendance,
};
