'use strict';

const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const ApiLog = require('../models/ApiLog');
const { validationResult } = require('express-validator');

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

    const rawKey = crypto.randomBytes(32).toString('hex');

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const validScopes = ['read:alumni', 'read:analytics', 'read:alumni_of_day'];
    const requestedScopes = Array.isArray(scopes) ? scopes : ['read:alumni'];
    const filteredScopes = requestedScopes.filter((s) => validScopes.includes(s));
    const finalScopes = filteredScopes.length > 0 ? filteredScopes : ['read:alumni'];

    const apiKey = await ApiKey.create({
      developerId: req.user.id,
      keyHash,
      name: name.trim(),
      scopes: finalScopes,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
        key: rawKey,
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

const listKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find({ developerId: req.user.id })
      .select('-keyHash')
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

const revokeKey = async (req, res) => {
  try {
    const { id } = req.params;

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

const getStats = async (req, res) => {
  try {

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

    const logStats = await ApiLog.aggregate([
      {
        $match: { apiKeyId: { $in: keyIds } },
      },
      {
        $group: {
          _id: '$apiKeyId',
          totalCalls: { $sum: 1 },
          lastCall: { $max: '$timestamp' },

          endpoints: { $push: '$endpoint' },
        },
      },
    ]);

    const statsMap = {};
    for (const stat of logStats) {

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
