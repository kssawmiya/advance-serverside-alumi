'use strict';

const Bid = require('../models/Bid');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { sendBidResultEmail } = require('../config/email');

const getTodayMidnightUTC = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
};

const runWinnerSelection = async () => {
  const jobStart = new Date();
  console.log(`[WinnerSelection] Starting at ${jobStart.toISOString()}`);

  try {

    const todayMidnightUTC = getTodayMidnightUTC();
    console.log(`[WinnerSelection] Processing slot: ${todayMidnightUTC.toISOString()}`);

    const allBids = await Bid.find({
      bidDate: todayMidnightUTC,
      isActive: true,
    })
      .populate('alumniId', 'fullName monthlyWinCount attendedEventThisMonth userId')
      .populate('userId', 'email')
      .lean();

    if (allBids.length === 0) {
      console.log('[WinnerSelection] No active bids for today. No winner selected.');
      return;
    }

    console.log(`[WinnerSelection] Found ${allBids.length} active bid(s) for processing.`);

    const sortedBids = [...allBids].sort((a, b) => {
      if (b.amount !== a.amount) {
        return b.amount - a.amount;
      }

      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    let winnerBid = null;
    let winnerProfile = null;

    for (const bid of sortedBids) {
      const profile = bid.alumniId;

      if (!profile) {

        console.warn(`[WinnerSelection] Bid ${bid._id} has no associated profile — skipping.`);
        continue;
      }

      const monthlyLimit = profile.attendedEventThisMonth ? 4 : 3;

      if (profile.monthlyWinCount < monthlyLimit) {

        winnerBid = bid;
        winnerProfile = profile;
        console.log(
          `[WinnerSelection] Winner found: ${profile.fullName} ` +
            `(wins this month: ${profile.monthlyWinCount}/${monthlyLimit}, ` +
            `bid: ${bid.amount})`
        );
        break;
      } else {

        console.log(
          `[WinnerSelection] Skipping ${profile.fullName} — monthly limit reached ` +
            `(${profile.monthlyWinCount}/${monthlyLimit} wins used).`
        );
      }
    }

    if (!winnerBid || !winnerProfile) {
      console.warn(
        '[WinnerSelection] No eligible winner found — all bidders have reached their monthly limit.'
      );
      return;
    }

    await Bid.updateOne(
      { _id: winnerBid._id },
      { $set: { isWinner: true, updatedAt: new Date() } }
    );

    console.log(`[WinnerSelection] Bid ${winnerBid._id} marked as winner.`);

    const previousDayCount = await Profile.countDocuments({ isAlumniOfDay: true });
    if (previousDayCount > 0) {
      await Profile.updateMany(
        { isAlumniOfDay: true },
        { $set: { isAlumniOfDay: false } }
      );
      console.log(`[WinnerSelection] Cleared isAlumniOfDay from ${previousDayCount} profile(s).`);
    }

    await Profile.updateOne(
      { _id: winnerProfile._id },
      {
        $set: { isAlumniOfDay: true },
        $inc: { monthlyWinCount: 1 },
      }
    );

    console.log(
      `[WinnerSelection] Profile ${winnerProfile._id} (${winnerProfile.fullName}) ` +
        `set as Alumni of the Day. monthlyWinCount now: ${winnerProfile.monthlyWinCount + 1}`
    );

    const loserBids = sortedBids.filter(
      (bid) => bid._id.toString() !== winnerBid._id.toString()
    );

    if (winnerBid.userId && winnerBid.userId.email) {

      sendBidResultEmail(winnerBid.userId.email, true, todayMidnightUTC).catch((err) =>
        console.error('[WinnerSelection] Failed to send winner email:', err.message)
      );
    }

    for (const loserBid of loserBids) {
      if (loserBid.userId && loserBid.userId.email) {
        sendBidResultEmail(loserBid.userId.email, false, todayMidnightUTC).catch((err) =>
          console.error(
            `[WinnerSelection] Failed to send loser email to ${loserBid.userId.email}:`,
            err.message
          )
        );
      }
    }

    const duration = Date.now() - jobStart.getTime();
    console.log(
      `[WinnerSelection] Completed in ${duration}ms. ` +
        `Winner: ${winnerProfile.fullName}, ` +
        `Bid: ${winnerBid.amount}, ` +
        `Date: ${todayMidnightUTC.toDateString()}, ` +
        `Losers notified: ${loserBids.length}`
    );
  } catch (err) {

    console.error('[WinnerSelection] FATAL ERROR during winner selection:', err.message);
    console.error(err.stack);

  }
};

const WINNER_SELECTION_SCHEDULE = '0 0 * * *';

module.exports = {
  runWinnerSelection,
  WINNER_SELECTION_SCHEDULE,
};
