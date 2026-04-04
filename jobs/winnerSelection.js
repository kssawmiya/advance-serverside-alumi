'use strict';

/**
 * @file jobs/winnerSelection.js
 * @description Daily winner selection cron job for the blind bidding system.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WINNER SELECTION ALGORITHM — DETAILED EXPLANATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Schedule: '0 18 * * *' — runs every day at 6:00 PM (server local time).
 *
 * STEP-BY-STEP ALGORITHM:
 *
 * 1. IDENTIFY TODAY'S SLOT
 *    Compute today's date at midnight UTC. This is the bidDate that all
 *    bids for "tomorrow" were targeting (bids are placed the day before).
 *
 * 2. FETCH ALL ACTIVE BIDS FOR TODAY
 *    Query: Bid.find({ bidDate: todayMidnight, isActive: true })
 *    Only active bids are considered — cancelled bids are ignored.
 *
 * 3. SORT BY AMOUNT DESC, THEN createdAt ASC (TIE-BREAKING)
 *    Primary sort: highest amount first.
 *    Tie-breaking: if two bids have equal amounts, the one placed EARLIER wins.
 *    This rewards participants who commit early rather than last-minute bidding.
 *
 * 4. SELECT WINNER WITH MONTHLY LIMIT CHECK
 *    Take the top bid from the sorted list.
 *    Check: winner's monthlyWinCount < limit (3, or 4 with event bonus).
 *    If AT LIMIT: skip this bidder and try the next highest bidder.
 *    This process continues until we find an eligible winner or exhaust all bids.
 *
 * 5. MARK WINNER BID
 *    Set winning bid's isWinner = true.
 *    All other active bids remain marked as isWinner = false (losers).
 *
 * 6. UPDATE ALUMNI OF THE DAY
 *    a. First: clear the previous day's Alumni of the Day
 *       Profile.updateMany({ isAlumniOfDay: true }, { $set: { isAlumniOfDay: false } })
 *    b. Set winner's profile: isAlumniOfDay = true
 *    c. Increment winner's monthlyWinCount by 1
 *
 * 7. SEND EMAIL NOTIFICATIONS
 *    a. Winner email: congratulations + profile URL
 *    b. Loser emails: better luck next time (one per non-winning bidder)
 *    Emails are sent asynchronously and failures are logged but not fatal.
 *
 * 8. LOG COMPLETION
 *    Console log with winner's name, date, and winning bid details.
 *
 * EDGE CASES:
 * - No bids: no winner selected, isAlumniOfDay stays as previous day's winner
 *   (or none if first day). A log message is emitted.
 * - All bidders at monthly limit: no winner selected, logged as warning.
 * - Database errors: caught and logged, cron job recovers on next run.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const Bid = require('../models/Bid');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { sendBidResultEmail } = require('../config/email');

/**
 * Computes today's date at midnight UTC.
 * Bids placed yesterday for "tomorrow" used this date as their bidDate.
 *
 * @returns {Date} Today at 00:00:00.000 UTC
 */
const getTodayMidnightUTC = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
};

/**
 * runWinnerSelection
 *
 * Executes the complete winner selection algorithm.
 * Called by the cron scheduler at 6 PM daily, and also exported for manual testing.
 *
 * @async
 * @function runWinnerSelection
 * @returns {Promise<void>}
 */
const runWinnerSelection = async () => {
  const jobStart = new Date();
  console.log(`[WinnerSelection] Starting at ${jobStart.toISOString()}`);

  try {
    // ─── STEP 1: Identify today's bid date slot ─────────────────────────────
    const todayMidnightUTC = getTodayMidnightUTC();
    console.log(`[WinnerSelection] Processing slot: ${todayMidnightUTC.toISOString()}`);

    // ─── STEP 2: Fetch all active bids for today's slot ────────────────────
    /**
     * Find all active bids for today's date.
     * We populate alumniId to get Profile data (monthlyWinCount, attendedEventThisMonth)
     * and userId to get User data (email for notifications).
     */
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

    // ─── STEP 3: Sort bids — highest amount first, earliest createdAt as tiebreaker ──
    /**
     * Primary sort: amount DESC (highest bid wins)
     * Tie-breaking sort: createdAt ASC (earliest bid wins ties)
     *
     * This sort ensures:
     * - The algorithm always considers the most competitive bids first
     * - Early bidders have an advantage in equal-amount scenarios
     */
    const sortedBids = [...allBids].sort((a, b) => {
      if (b.amount !== a.amount) {
        return b.amount - a.amount; // Higher amount first
      }
      // Tie-break: earlier createdAt wins (ascending sort on timestamp)
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    // ─── STEP 4: Find an eligible winner (respecting monthly limit) ─────────
    /**
     * Iterate through sorted bids (highest first) until we find an alumnus
     * who has not exceeded their monthly win limit.
     *
     * Monthly limit rules:
     * - Standard: max 3 wins per calendar month
     * - With event bonus (attendedEventThisMonth): max 4 wins per month
     *
     * If the top bidder is at their limit, we skip to the next highest bidder.
     * This prevents a single alumnus from winning every day in a month.
     */
    let winnerBid = null;
    let winnerProfile = null;

    for (const bid of sortedBids) {
      const profile = bid.alumniId; // Populated Profile document

      if (!profile) {
        // Edge case: profile was deleted after bid was placed — skip this bid
        console.warn(`[WinnerSelection] Bid ${bid._id} has no associated profile — skipping.`);
        continue;
      }

      // Calculate this bidder's monthly win limit
      const monthlyLimit = profile.attendedEventThisMonth ? 4 : 3;

      if (profile.monthlyWinCount < monthlyLimit) {
        // This bidder is eligible — they haven't hit their limit
        winnerBid = bid;
        winnerProfile = profile;
        console.log(
          `[WinnerSelection] Winner found: ${profile.fullName} ` +
            `(wins this month: ${profile.monthlyWinCount}/${monthlyLimit}, ` +
            `bid: ${bid.amount})`
        );
        break; // Stop searching — we have our winner
      } else {
        // This bidder is at their limit — skip and try next
        console.log(
          `[WinnerSelection] Skipping ${profile.fullName} — monthly limit reached ` +
            `(${profile.monthlyWinCount}/${monthlyLimit} wins used).`
        );
      }
    }

    // If all bidders are at their monthly limit, no winner can be selected
    if (!winnerBid || !winnerProfile) {
      console.warn(
        '[WinnerSelection] No eligible winner found — all bidders have reached their monthly limit.'
      );
      return;
    }

    // ─── STEP 5: Mark the winning bid ───────────────────────────────────────
    /**
     * Update the winning bid's isWinner flag.
     * All other bids remain with isWinner = false (their default).
     */
    await Bid.updateOne(
      { _id: winnerBid._id },
      { $set: { isWinner: true, updatedAt: new Date() } }
    );

    console.log(`[WinnerSelection] Bid ${winnerBid._id} marked as winner.`);

    // ─── STEP 6: Update Alumni of the Day on profiles ──────────────────────

    /**
     * Step 6a: Clear the previous Alumni of the Day.
     * Only one profile should have isAlumniOfDay = true at any time.
     * We unset everyone first, then set the new winner.
     */
    const previousDayCount = await Profile.countDocuments({ isAlumniOfDay: true });
    if (previousDayCount > 0) {
      await Profile.updateMany(
        { isAlumniOfDay: true },
        { $set: { isAlumniOfDay: false } }
      );
      console.log(`[WinnerSelection] Cleared isAlumniOfDay from ${previousDayCount} profile(s).`);
    }

    /**
     * Step 6b: Set the winner's profile as Alumni of the Day.
     * Step 6c: Increment their monthly win count by 1.
     */
    await Profile.updateOne(
      { _id: winnerProfile._id },
      {
        $set: { isAlumniOfDay: true },
        $inc: { monthlyWinCount: 1 }, // Atomic increment
      }
    );

    console.log(
      `[WinnerSelection] Profile ${winnerProfile._id} (${winnerProfile.fullName}) ` +
        `set as Alumni of the Day. monthlyWinCount now: ${winnerProfile.monthlyWinCount + 1}`
    );

    // ─── STEP 7: Send email notifications ───────────────────────────────────

    /**
     * Prepare the list of all participating user IDs for loser notifications.
     * Exclude the winner from loser notifications.
     */
    const loserBids = sortedBids.filter(
      (bid) => bid._id.toString() !== winnerBid._id.toString()
    );

    /**
     * Step 7a: Send winner notification.
     * The winner's email is in bid.userId.email (populated from User model).
     */
    if (winnerBid.userId && winnerBid.userId.email) {
      // Fire-and-forget — don't await, don't block the main flow
      sendBidResultEmail(winnerBid.userId.email, true, todayMidnightUTC).catch((err) =>
        console.error('[WinnerSelection] Failed to send winner email:', err.message)
      );
    }

    /**
     * Step 7b: Send loser notifications to all other bidders.
     * Each loser gets a "better luck next time" email.
     * All sent asynchronously — we don't await any of them.
     */
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

    // ─── STEP 8: Log completion ─────────────────────────────────────────────
    const duration = Date.now() - jobStart.getTime();
    console.log(
      `[WinnerSelection] Completed in ${duration}ms. ` +
        `Winner: ${winnerProfile.fullName}, ` +
        `Bid: ${winnerBid.amount}, ` +
        `Date: ${todayMidnightUTC.toDateString()}, ` +
        `Losers notified: ${loserBids.length}`
    );
  } catch (err) {
    // Catch all errors to prevent the cron job from crashing the server
    console.error('[WinnerSelection] FATAL ERROR during winner selection:', err.message);
    console.error(err.stack);
    // The cron job will run again tomorrow — no need to exit the process
  }
};

/**
 * The cron schedule string for winner selection.
 * '0 18 * * *' = At 18:00 (6 PM) every day.
 *
 * @type {string}
 */
const WINNER_SELECTION_SCHEDULE = '0 18 * * *';

module.exports = {
  runWinnerSelection,
  WINNER_SELECTION_SCHEDULE,
};
