'use strict';

/**
 * @file models/ApiKey.js
 * @description Mongoose schema for developer API keys.
 *
 * SECURITY DESIGN:
 * - Raw API keys are NEVER stored in the database.
 * - Only the SHA-256 hash of the raw key is stored (keyHash field).
 * - The raw key is shown to the developer exactly ONCE at creation and never again.
 * - On each API request, the incoming key is hashed and compared against keyHash.
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} ApiKeySchema
 * @property {ObjectId}  _id          - Auto-generated MongoDB ObjectId
 * @property {ObjectId}  developerId  - Reference to the developer's User document
 * @property {string}    keyHash      - SHA-256 hex digest of the raw API key
 * @property {string}    name         - Human-readable label for this key
 * @property {string[]}  scopes       - Permissions granted (e.g. 'read:alumni')
 * @property {Date|null} revokedAt    - When the key was revoked (null = still active)
 * @property {Date}      createdAt    - When the key was generated
 * @property {Date}      lastUsed     - Last time the key was used in an API call
 */
const apiKeySchema = new mongoose.Schema(
  {
    /**
     * The developer user who owns this API key.
     * Only the owner can list, use, or revoke the key.
     */
    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'developerId is required'],
    },

    /**
     * SHA-256 hex hash of the raw API key.
     * SECURITY: The raw key is never stored — only this irreversible hash.
     * When a request arrives with a Bearer key, we hash it and look up this field.
     */
    keyHash: {
      type: String,
      required: [true, 'keyHash is required'],
    },

    /**
     * Human-readable label to help the developer identify the key's purpose.
     * e.g. "Production App", "Testing", "Mobile Client"
     */
    name: {
      type: String,
      required: [true, 'Key name is required'],
      trim: true,
    },

    /**
     * Array of permission scopes granted to this key.
     * Currently supported: 'read:alumni'
     * Future: 'write:alumni', 'admin', etc.
     */
    scopes: {
      type: [String],
      default: ['read:alumni'],
    },

    /**
     * Timestamp of when the key was revoked.
     * Null means the key is currently active.
     * Revoked keys are rejected by the requireApiKey middleware.
     */
    revokedAt: {
      type: Date,
      default: null,
    },

    /** Timestamp of key creation */
    createdAt: {
      type: Date,
      default: Date.now,
    },

    /**
     * Timestamp of the last time this key was used to make an API call.
     * Updated asynchronously on each successful API request (fire and forget).
     */
    lastUsed: {
      type: Date,
    },
  },
  {
    versionKey: false,
  }
);

/**
 * Index on keyHash for O(1) lookup on every authenticated API request.
 * This is the most critical index for API key authentication performance.
 */
apiKeySchema.index({ keyHash: 1 });

/**
 * Index on developerId to efficiently list all keys belonging to a developer.
 */
apiKeySchema.index({ developerId: 1 });

/**
 * ApiKey model.
 * @type {mongoose.Model}
 */
const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;
