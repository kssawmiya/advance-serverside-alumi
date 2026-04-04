'use strict';

/**
 * @file controllers/bidController.js
 * @description BLIND BIDDING controller.
 *
 * ═══════════════════════════════════════════════════════
 * BLIND BIDDING MECHANIC OVERVIEW
 * ═══════════════════════════════════════════════════════
 *
 * 1. BLIND: Users place bids without knowing any other user's bid amount.
 *    The system NEVER returns other users' amounts.
 *
 * 2. SLOT: Every bid targets TOMORROW's date slot (midnight UTC).
 *    Only future slots can be bid on.
 *
 * 3. ONE BID PER SLOT: Each alumnus may have only ONE active bid per date.
 *    They may increase the bid but never decrease it (increase-only rule).
 *
 * 4. MONTHLY LIMIT: An alumnus can win at most 3 times per month.
 *    If they attended a university event, they get a 4th win slot.
 *
 * 5. WINNER SELECTION: Happens at 6 PM daily via cron job (not in this file).
 *    The winner is the alumnus with the highest active bid for that day.
 *    Tie-breaking: earliest bid wins (createdAt ASC).
 *
 * 6. STATUS: The status endpoint tells a user if they are currently "winning"
 *    (i.e. their bid is highest at this moment), but this is not a guarantee
 *    since other users can still raise their bids until 6 PM.
 * ═══════════════════════════════════════════════════════
 */

const Profile = require('../models/Profile');
const Bid = require('../models/Bid');
const { validationResult } = require('express-validator');

/**
 * Returns tomorrow's date at midnight UTC.
 * All bid slots are keyed to midnight UTC so that time zone differences
 * don't cause bids to land on different day slots.
 *
 * @returns {Date} Tomorrow at 00:00:00.000 UTC
 */
const getTomorrowMidnightUTC = () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0); // Set to exact midnight UTC
  return tomorrow;
};

/**
 * POST /api/bids
 * Places a blind bid for tomorrow's Alumni of the Day slot.
 *
 * BLIND BIDDING RULES ENFORCED:
 *  - Alumnus must not have reached monthly win limit (3 or 4 with event bonus)
 *  - Only one active bid per alumnus per date slot
 *  - bidDate is always set to TOMORROW by the server (client cannot choose date)
 *  - The response NEVER reveals other users' bids or ranking
 *
 * @async
 * @param {import('express').Request}  req - req.user.id (JWT), req.body.amount
 * @param {import('express').Response} res
 */
const placeBid = async (req, res) => {
  try {
    // Check express-validator results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { amount } = req.body;

    /**
     * Step 1: Find the alumnus's profile to check monthly win limits.
     * The profile contains monthlyWinCount and attendedEventThisMonth.
     */
    const profile = await Profile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Alumni profile not found. Please complete your profile first.',
      });
    }

    /**
     * Step 2: Determine the monthly win limit.
     * Default: 3 wins per month
     * With event attendance bonus: 4 wins per month
     *
     * This prevents a single alumnus from dominating the platform.
     */
    const monthlyLimit = profile.attendedEventThisMonth ? 4 : 3;

    if (profile.monthlyWinCount >= monthlyLimit) {
      return res.status(403).json({
        success: false,
        error: `Monthly bid limit reached. You have won ${profile.monthlyWinCount} time(s) this month (max ${monthlyLimit}).`,
      });
    }

    /**
     * Step 3: Set the bid date to TOMORROW at midnight UTC.
     * This is enforced server-side — clients cannot specify a custom bid date.
     * This ensures the system is always bidding for the next day's slot.
     */
    const bidDate = getTomorrowMidnightUTC();

    /**
     * Step 4: Check for existing active bid for this alumnus on this date.
     * Each alumnus may have only ONE active bid per day slot.
     * If they want to change their bid, they must use the update endpoint.
     */
    const existingBid = await Bid.findOne({
      alumniId: profile._id,
      bidDate,
      isActive: true,
    });

    if (existingBid) {
      return res.status(409).json({
        success: false,
        error: 'You already have an active bid for tomorrow. Use the update endpoint to increase your bid.',
      });
    }

    /**
     * Step 5: Create the bid document.
     * Both alumniId (for winner selection) and userId (for ownership verification)
     * are stored.
     */
    const bid = await Bid.create({
      alumniId: profile._id,
      userId: req.user.id,
      amount: Number(amount),
      bidDate,
      isActive: true,
      isWinner: false,
    });

    /**
     * BLIND BIDDING CRITICAL:
     * The response contains the bid ID and date — but NOT the amount
     * in relation to other bids, and NOT any ranking information.
     * Users know their own bid amount but not where they stand.
     */
    return res.status(201).json({
      success: true,
      data: {
        bidId: bid._id,
        bidDate: bid.bidDate,
        message: 'Bid placed successfully. Winner announced daily at 6 PM.',
      },
    });
  } catch (err) {
    console.error('[Bid] placeBid error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to place bid. Please try again.',
    });
  }
};

/**
 * PUT /api/bids/:id
 * Updates the amount of an existing active bid.
 *
 * INCREASE-ONLY RULE:
 * Bids can only be increased, never decreased.
 * This maintains fair competition — once you commit to an amount,
 * you can only show more confidence by raising it higher.
 * Decreasing would let users game the system by placing high bids
 * then backing out.
 *
 * @async
 * @param {import('express').Request}  req - req.params.id, req.body.amount, req.user.id
 * @param {import('express').Response} res
 */
const updateBid = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { id } = req.params;
    const { amount } = req.body;

    /**
     * Find the bid — must belong to this user AND still be active.
     * Inactive (cancelled) bids cannot be updated.
     */
    const bid = await Bid.findOne({
      _id: id,
      userId: req.user.id,
      isActive: true,
    });

    if (!bid) {
      return res.status(404).json({
        success: false,
        error: 'Active bid not found. It may have been cancelled or does not belong to you.',
      });
    }

    /**
     * INCREASE-ONLY ENFORCEMENT:
     * The new amount must be strictly greater than the current amount.
     * Equal amounts are also rejected — the user must actively increase.
     * This rule prevents bid withdrawal and ensures committed escalation.
     */
    if (Number(amount) <= bid.amount) {
      return res.status(400).json({
        success: false,
        error: `New bid amount (${amount}) must be greater than your current bid (${bid.amount}). Bids can only be increased.`,
      });
    }

    // Update the bid amount and timestamp
    bid.amount = Number(amount);
    bid.updatedAt = new Date();
    await bid.save();

    /**
     * BLIND BIDDING: Return the updated bid WITHOUT position information.
     * The user knows their new amount but still cannot see other bids.
     */
    return res.status(200).json({
      success: true,
      data: {
        bidId: bid._id,
        amount: bid.amount,
        bidDate: bid.bidDate,
        updatedAt: bid.updatedAt,
        message: 'Bid updated successfully.',
      },
    });
  } catch (err) {
    console.error('[Bid] updateBid error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update bid. Please try again.',
    });
  }
};

/**
 * DELETE /api/bids/:id
 * Cancels an active bid (soft delete — sets isActive = false).
 *
 * Cancelled bids are excluded from winner selection.
 * The bid record is kept for audit/history purposes.
 *
 * @async
 * @param {import('express').Request}  req - req.params.id, req.user.id
 * @param {import('express').Response} res
 */
const cancelBid = async (req, res) => {
  try {
    const { id } = req.params;

    /**
     * Find and verify ownership — only the bid owner can cancel it.
     * Must still be active (can't cancel an already-cancelled bid).
     */
    const bid = await Bid.findOne({
      _id: id,
      userId: req.user.id,
      isActive: true,
    });

    if (!bid) {
      return res.status(404).json({
        success: false,
        error: 'Active bid not found. It may already be cancelled or not belong to you.',
      });
    }

    // Soft delete: set isActive to false instead of deleting the record
    bid.isActive = false;
    bid.updatedAt = new Date();
    await bid.save();

    return res.status(200).json({
      success: true,
      message: 'Bid cancelled successfully.',
    });
  } catch (err) {
    console.error('[Bid] cancelBid error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel bid. Please try again.',
    });
  }
};

/**
 * GET /api/bids/status
 * Returns the user's current blind bid status for tomorrow's slot.
 *
 * ═══════════════════════════════════════════════════════
 * BLIND STATUS DESIGN (CRITICAL)
 * ═══════════════════════════════════════════════════════
 * The status tells the user if they are CURRENTLY the highest bidder,
 * but it does NOT:
 *   - Reveal the highest bid amount
 *   - Reveal how many other bids exist
 *   - Reveal how much higher they would need to bid to win
 *   - Guarantee they will win (others can raise their bids until 6 PM)
 *
 * Status values:
 *   'no_bid'       — User has not placed a bid for tomorrow
 *   'winning'      — User's bid is currently the highest for tomorrow's slot
 *   'not_winning'  — One or more bids are higher than the user's bid
 * ═══════════════════════════════════════════════════════
 *
 * @async
 * @param {import('express').Request}  req - req.user.id
 * @param {import('express').Response} res
 */
const getBidStatus = async (req, res) => {
  try {
    const bidDate = getTomorrowMidnightUTC();

    /**
     * Find the user's Profile first to get the alumniId,
     * since bids are keyed to Profile._id (not User._id).
     */
    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    // Find the user's active bid for tomorrow
    const userBid = await Bid.findOne({
      alumniId: profile._id,
      bidDate,
      isActive: true,
    }).lean();

    // If no bid placed yet, return no_bid status
    if (!userBid) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'no_bid',
          message: 'You have not placed a bid for tomorrow yet.',
          bidDate,
        },
      });
    }

    /**
     * BLIND COMPARISON:
     * Count how many OTHER active bids for tomorrow's slot have a higher amount.
     * We only count bids with amount > userBid.amount.
     * We exclude the user's own bid using the bid's _id.
     *
     * This count tells us whether the user is currently winning,
     * but we do NOT reveal the count or any specific amounts to the user.
     */
    const higherBidCount = await Bid.countDocuments({
      bidDate,
      isActive: true,
      amount: { $gt: userBid.amount }, // Strictly higher than user's amount
      _id: { $ne: userBid._id },       // Exclude user's own bid
    });

    /**
     * Determine win status:
     * - winning: user's bid is the highest (no bids higher than theirs)
     * - not_winning: at least one other bid is higher
     *
     * NOTE: 'winning' is the CURRENT status as of this moment.
     * The final winner is not determined until the 6 PM cron job runs.
     */
    const status = higherBidCount === 0 ? 'winning' : 'not_winning';

    /**
     * BLIND BIDDING CRITICAL:
     * Return:
     *   - status (winning/not_winning) — so user knows their position
     *   - yourBid — user's own amount (they know what they bid)
     * Do NOT return:
     *   - highest bid amount
     *   - number of competitors
     *   - how much to bid to win
     */
    return res.status(200).json({
      success: true,
      data: {
        status,
        yourBid: userBid.amount,
        bidDate: userBid.bidDate,
        message:
          status === 'winning'
            ? 'You are currently the highest bidder! Winner announced at 6 PM.'
            : 'You are currently not winning. Consider increasing your bid.',
      },
    });
  } catch (err) {
    console.error('[Bid] getBidStatus error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve bid status',
    });
  }
};

/**
 * GET /api/bids/history
 * Returns all bids placed by the authenticated user (active and past).
 *
 * Shows historical win/lose outcomes. Past bid amounts are shown since
 * those slots have already closed and the result is final.
 *
 * @async
 * @param {import('express').Request}  req - req.user.id
 * @param {import('express').Response} res
 */
const getBidHistory = async (req, res) => {
  try {
    /**
     * Find all bids for this user — both active and inactive (cancelled).
     * Sort by most recent first.
     * Return lean objects for performance.
     */
    const bids = await Bid.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: bids,
      count: bids.length,
    });
  } catch (err) {
    console.error('[Bid] getBidHistory error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve bid history',
    });
  }
};

/**
 * GET /api/bids/monthly-limit
 * Returns the user's current monthly win count and their limit.
 *
 * @async
 * @param {import('express').Request}  req - req.user.id
 * @param {import('express').Response} res
 */
const getMonthlyLimit = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    /**
     * Calculate limit based on event attendance:
     * - Standard: 3 wins per month
     * - With event bonus: 4 wins per month
     */
    const eventBonus = profile.attendedEventThisMonth;
    const limit = eventBonus ? 4 : 3;
    const used = profile.monthlyWinCount;
    const remaining = Math.max(0, limit - used);

    return res.status(200).json({
      success: true,
      data: {
        used,
        limit,
        remaining,
        eventBonus,
        message:
          remaining === 0
            ? 'Monthly limit reached. Resets on the 1st of next month.'
            : `You have ${remaining} win slot(s) remaining this month.`,
      },
    });
  } catch (err) {
    console.error('[Bid] getMonthlyLimit error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve monthly limit',
    });
  }
};

module.exports = {
  placeBid,
  updateBid,
  cancelBid,
  getBidStatus,
  getBidHistory,
  getMonthlyLimit,
};
