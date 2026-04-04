'use strict';

/**
 * @file models/Bid.js
 * @description Mongoose schema for blind bidding entries.
 *
 * KEY DESIGN NOTES (Blind Bidding):
 * - Bid amounts are stored but NEVER returned directly to users via the status API.
 * - The bidDate represents the DATE SLOT being competed for (always set to tomorrow at midnight UTC).
 * - Compound index on {alumniId, bidDate} enforces the one-active-bid-per-alumni-per-date rule.
 * - Winners are selected by the nightly cron job at 6 PM, not at bid time.
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} BidSchema
 * @property {ObjectId} _id        - Auto-generated MongoDB ObjectId
 * @property {ObjectId} alumniId   - Reference to the bidding Profile document
 * @property {ObjectId} userId     - Reference to the User (for ownership checks)
 * @property {number}   amount     - The bid amount (must be >= 0)
 * @property {Date}     bidDate    - The date slot being bid for (midnight UTC tomorrow)
 * @property {boolean}  isActive   - False if the bid has been cancelled
 * @property {boolean}  isWinner   - Set to true by the winner selection cron job
 * @property {Date}     createdAt  - When the bid was originally placed
 * @property {Date}     updatedAt  - When the bid was last modified (e.g., amount increased)
 */
const bidSchema = new mongoose.Schema(
  {
    /**
     * Reference to the alumnus's Profile document.
     * Used to look up and update isAlumniOfDay, monthlyWinCount, etc.
     */
    alumniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Profile',
      required: [true, 'alumniId is required'],
    },

    /**
     * Reference to the User document — used for ownership checks
     * when a user tries to update or cancel their own bid.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    /**
     * The bid amount in arbitrary units.
     * BLIND BIDDING: Users cannot see other bids, so they choose their amount without
     * knowledge of competing bids. The winner is whoever bid highest.
     * Cannot be negative; can only be increased after initial placement.
     */
    amount: {
      type: Number,
      required: [true, 'Bid amount is required'],
      min: [0, 'Bid amount cannot be negative'],
    },

    /**
     * The UTC midnight date of the slot being bid for.
     * Always set to TOMORROW's date at midnight UTC by the controller.
     * This ensures bids are always for future slots.
     */
    bidDate: {
      type: Date,
      required: [true, 'Bid date is required'],
    },

    /**
     * Whether this bid is currently active (not cancelled).
     * Set to false when the alumni cancels their bid.
     * Cancelled bids are excluded from winner selection.
     */
    isActive: {
      type: Boolean,
      default: true,
    },

    /**
     * Set to true by the winner selection cron job when this bid wins.
     * This flag is used for bid history display (showing past wins/losses).
     * Only one bid per bidDate should have isWinner = true.
     */
    isWinner: {
      type: Boolean,
      default: false,
    },

    /** Timestamp of when the bid was originally created */
    createdAt: {
      type: Date,
      default: Date.now,
    },

    /** Timestamp of the last modification (used for tie-breaking: earliest bid wins) */
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

/**
 * Compound index on alumniId + bidDate to enforce the business rule:
 * one active bid per alumni per date slot.
 * Sparse: false because we need this enforced for all documents.
 */
bidSchema.index({ alumniId: 1, bidDate: 1 });

/**
 * Index on bidDate + isActive for efficient winner selection queries:
 * "find all active bids for today's date slot"
 */
bidSchema.index({ bidDate: 1, isActive: 1 });

/**
 * Index on userId for efficient bid history queries per user.
 */
bidSchema.index({ userId: 1 });

/**
 * Bid model.
 * @type {mongoose.Model}
 */
const Bid = mongoose.model('Bid', bidSchema);

module.exports = Bid;
