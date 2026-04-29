'use strict';

const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {

    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'developerId is required'],
    },

    keyHash: {
      type: String,
      required: [true, 'keyHash is required'],
    },

    name: {
      type: String,
      required: [true, 'Key name is required'],
      trim: true,
    },

    scopes: {
      type: [String],
      default: ['read:alumni'],
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    lastUsed: {
      type: Date,
    },
  },
  {
    versionKey: false,
  }
);

apiKeySchema.index({ keyHash: 1 });

apiKeySchema.index({ developerId: 1 });

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;
