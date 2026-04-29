'use strict';

const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {

    alumniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: [true, 'alumniId is required'],
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    amount: {
      type: Number,
      required: [true, 'Bid amount is required'],
      min: [0, 'Bid amount cannot be negative'],
    },

    bidDate: {
      type: Date,
      required: [true, 'Bid date is required'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isWinner: {
      type: Boolean,
      default: false,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

bidSchema.index({ alumniId: 1, bidDate: 1 });

bidSchema.index({ bidDate: 1, isActive: 1 });

bidSchema.index({ userId: 1 });

const Bid = mongoose.model('Bid', bidSchema);

module.exports = Bid;
