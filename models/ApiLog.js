'use strict';

/**
 * @file models/ApiLog.js
 * @description Mongoose schema for API request audit logs.
 * Logs are automatically deleted after 90 days via a TTL index.
 * Used for developer usage statistics and abuse monitoring.
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} ApiLogSchema
 * @property {ObjectId} _id        - Auto-generated MongoDB ObjectId
 * @property {ObjectId} apiKeyId   - Reference to the ApiKey used for this request
 * @property {string}   endpoint   - The API endpoint path (e.g. '/api/v1/alumni-of-day')
 * @property {string}   method     - HTTP method (GET, POST, etc.)
 * @property {number}   statusCode - HTTP response status code
 * @property {string}   ipAddress  - Client IP address (for abuse detection)
 * @property {Date}     timestamp  - When the request was made (TTL field)
 */
const apiLogSchema = new mongoose.Schema(
  {
    /**
     * Reference to the API key used.
     * Allows statistics to be grouped per key (and thus per developer).
     */
    apiKeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey',
      required: [true, 'apiKeyId is required'],
    },

    /**
     * The request endpoint path.
     * Stored without query string to enable grouping by endpoint.
     */
    endpoint: {
      type: String,
    },

    /** HTTP method of the request */
    method: {
      type: String,
    },

    /**
     * HTTP response status code.
     * Allows filtering of error requests (4xx, 5xx) from successful ones.
     */
    statusCode: {
      type: Number,
    },

    /**
     * Client IP address extracted from req.ip or X-Forwarded-For.
     * Used for rate abuse detection and geo reporting.
     */
    ipAddress: {
      type: String,
    },

    /**
     * Request timestamp.
     * This is also the TTL field — MongoDB will automatically remove documents
     * where timestamp is older than 90 days (7,776,000 seconds).
     */
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

/**
 * Compound index on apiKeyId + timestamp:
 * - Groups logs by key for per-developer statistics
 * - Efficiently supports date-range queries (e.g., "last 7 days")
 */
apiLogSchema.index({ apiKeyId: 1, timestamp: -1 });

/**
 * TTL index: MongoDB automatically deletes log documents 90 days after their timestamp.
 * This keeps the logs collection from growing indefinitely.
 * 90 days = 7,776,000 seconds
 */
apiLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

/**
 * ApiLog model.
 * @type {mongoose.Model}
 */
const ApiLog = mongoose.model('ApiLog', apiLogSchema);

module.exports = ApiLog;
