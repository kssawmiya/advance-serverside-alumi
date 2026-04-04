'use strict';

/**
 * @file jobs/monthlyReset.js
 * @description Monthly reset cron job for the bidding system.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MONTHLY RESET JOB — EXPLANATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Schedule: '0 0 1 * *' — runs at midnight (00:00) on the 1st of every month.
 *
 * PURPOSE:
 * The blind bidding system limits each alumnus to 3 wins per calendar month
 * (4 if they attended a university event that month). This job resets those
 * counters at the start of each new month so all alumni start fresh.
 *
 * WHAT IS RESET:
 * 1. monthlyWinCount → 0
 *    Clears the count of how many times each alumnus has won this month.
 *
 * 2. attendedEventThisMonth → false
 *    Clears the event attendance bonus. Alumni must have event attendance
 *    recorded again each month to receive the bonus win slot.
 *
 * 3. lastResetMonth → 'YYYY-MM' (current month)
 *    Records when the reset was last run. Can be used to detect if the
 *    monthly reset was somehow missed (e.g., server downtime on the 1st).
 *
 * WHAT IS NOT RESET:
 * - isAlumniOfDay: The current Alumni of the Day stays set until the next
 *   winner selection at 6 PM (handled by winnerSelection.js).
 * - Total historical wins: Only the monthly counter is reset.
 *
 * IDEMPOTENCY:
 * Profile.updateMany with $set is idempotent — running it multiple times
 * in the same month is safe (just resets to the same values).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const Profile = require('../models/Profile');

/**
 * runMonthlyReset
 *
 * Resets monthly bidding counters for all alumni profiles.
 * Called by the cron scheduler on the 1st of each month at midnight,
 * and exported for manual triggering (admin use / testing).
 *
 * @async
 * @function runMonthlyReset
 * @returns {Promise<void>}
 */
const runMonthlyReset = async () => {
  const jobStart = new Date();
  console.log(`[MonthlyReset] Starting at ${jobStart.toISOString()}`);

  try {
    /**
     * Format the current month as 'YYYY-MM' for the lastResetMonth field.
     * Example: '2025-07' for July 2025.
     *
     * Using padStart(2, '0') ensures two-digit months (e.g. '07' not '7').
     */
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const currentMonthStr = `${year}-${month}`;

    console.log(`[MonthlyReset] Resetting for month: ${currentMonthStr}`);

    /**
     * Use Profile.updateMany to reset all profiles in a single atomic operation.
     *
     * {} as filter — matches ALL profile documents.
     *
     * $set operations:
     * - monthlyWinCount: 0       → Reset wins to zero for the new month
     * - attendedEventThisMonth: false → Remove event bonus; must be re-granted each month
     * - lastResetMonth: 'YYYY-MM' → Record this reset for auditing/debugging
     *
     * updateMany is preferred over updating each profile individually because:
     * 1. Single database round-trip (O(1) vs O(n))
     * 2. Atomic — either all profiles are updated or none are (no partial state)
     * 3. Efficient — MongoDB applies the update at the storage level
     */
    const result = await Profile.updateMany(
      {}, // Match ALL profiles — no filter
      {
        $set: {
          monthlyWinCount: 0,
          attendedEventThisMonth: false,
          lastResetMonth: currentMonthStr,
        },
      }
    );

    const duration = Date.now() - jobStart.getTime();

    console.log(
      `[MonthlyReset] Completed in ${duration}ms. ` +
        `Reset ${result.modifiedCount} profile(s) for month ${currentMonthStr}.`
    );
  } catch (err) {
    // Log the error but don't crash the server — the job can be retried manually
    console.error('[MonthlyReset] ERROR during monthly reset:', err.message);
    console.error(err.stack);
  }
};

/**
 * The cron schedule string for the monthly reset.
 * '0 0 1 * *' = At 00:00 on day 1 of every month.
 *
 * @type {string}
 */
const MONTHLY_RESET_SCHEDULE = '0 0 1 * *';

module.exports = {
  runMonthlyReset,
  MONTHLY_RESET_SCHEDULE,
};
