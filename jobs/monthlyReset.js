'use strict';

const Profile = require('../models/Profile');

const runMonthlyReset = async () => {
  const jobStart = new Date();
  console.log(`[MonthlyReset] Starting at ${jobStart.toISOString()}`);

  try {

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const currentMonthStr = `${year}-${month}`;

    console.log(`[MonthlyReset] Resetting for month: ${currentMonthStr}`);

    const result = await Profile.updateMany(
      {},
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

    console.error('[MonthlyReset] ERROR during monthly reset:', err.message);
    console.error(err.stack);
  }
};

const MONTHLY_RESET_SCHEDULE = '0 0 1 * *';

module.exports = {
  runMonthlyReset,
  MONTHLY_RESET_SCHEDULE,
};
