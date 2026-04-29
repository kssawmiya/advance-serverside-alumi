'use strict';

const Profile = require('../models/Profile');
const Bid = require('../models/Bid');
const { validationResult } = require('express-validator');

const getTomorrowMidnightUTC = () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
};

const placeBid = async (req, res) => {
  try {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { amount } = req.body;

    const profile = await Profile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Alumni profile not found. Please complete your profile first.',
      });
    }

    const monthlyLimit = profile.attendedEventThisMonth ? 4 : 3;

    if (profile.monthlyWinCount >= monthlyLimit) {
      return res.status(403).json({
        success: false,
        error: `Monthly bid limit reached. You have won ${profile.monthlyWinCount} time(s) this month (max ${monthlyLimit}).`,
      });
    }

    const bidDate = getTomorrowMidnightUTC();

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

    const bid = await Bid.create({
      alumniId: profile._id,
      userId: req.user.id,
      amount: Number(amount),
      bidDate,
      isActive: true,
      isWinner: false,
    });

    return res.status(201).json({
      success: true,
      data: {
        bidId: bid._id,
        bidDate: bid.bidDate,
        message: 'Bid placed successfully. Winner announced daily at midnight.',
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

    if (Number(amount) <= bid.amount) {
      return res.status(400).json({
        success: false,
        error: `New bid amount (${amount}) must be greater than your current bid (${bid.amount}). Bids can only be increased.`,
      });
    }

    bid.amount = Number(amount);
    bid.updatedAt = new Date();
    await bid.save();

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

const cancelBid = async (req, res) => {
  try {
    const { id } = req.params;

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

const getBidStatus = async (req, res) => {
  try {
    const bidDate = getTomorrowMidnightUTC();

    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    const userBid = await Bid.findOne({
      alumniId: profile._id,
      bidDate,
      isActive: true,
    }).lean();

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

    const higherBidCount = await Bid.countDocuments({
      bidDate,
      isActive: true,
      amount: { $gt: userBid.amount },
      _id: { $ne: userBid._id },
    });

    const status = higherBidCount === 0 ? 'winning' : 'not_winning';

    return res.status(200).json({
      success: true,
      data: {
        status,
        yourBid: userBid.amount,
        bidDate: userBid.bidDate,
        message:
          status === 'winning'
            ? 'You are currently the highest bidder! Winner announced at midnight.'
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

const getBidHistory = async (req, res) => {
  try {

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

const getMonthlyLimit = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

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
