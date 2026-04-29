'use strict';

const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema(
  {

    apiKeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey',
      required: [true, 'apiKeyId is required'],
    },

    endpoint: {
      type: String,
    },

    method: {
      type: String,
    },

    statusCode: {
      type: Number,
    },

    ipAddress: {
      type: String,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

apiLogSchema.index({ apiKeyId: 1, timestamp: -1 });

apiLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

const ApiLog = mongoose.model('ApiLog', apiLogSchema);

module.exports = ApiLog;
