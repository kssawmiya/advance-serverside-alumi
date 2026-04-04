'use strict';

/**
 * @file server.js
 * @description Application entry point.
 * Connects to MongoDB, starts the HTTP server, and schedules all cron jobs.
 */

require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const cron = require('node-cron');
const { runWinnerSelection } = require('./jobs/winnerSelection');
const { runMonthlyReset } = require('./jobs/monthlyReset');

const PORT = process.env.PORT || 3000;

/**
 * startServer
 * Bootstraps the application:
 * 1. Connects to MongoDB
 * 2. Starts the HTTP server
 * 3. Registers all cron jobs
 *
 * @async
 * @function startServer
 * @returns {Promise<void>}
 */
async function startServer() {
  // ─── Step 1: Connect to MongoDB ─────────────────────────────────────────
  // connectDB exits with code 1 on failure — no need to handle error here
  await connectDB();

  // ─── Step 2: Start HTTP server ───────────────────────────────────────────
  app.listen(PORT, () => {
    console.log('════════════════════════════════════════');
    console.log(`  Alumni Influencers API`);
    console.log(`  Server: http://localhost:${PORT}`);
    console.log(`  API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('════════════════════════════════════════');
  });

  // ─── Step 3: Schedule Cron Jobs ──────────────────────────────────────────

  /**
   * CRON JOB 1: Daily Winner Selection
   * Schedule: '0 18 * * *' — Every day at 6:00 PM (server local time)
   *
   * Selects the highest eligible bidder as Alumni of the Day.
   * Sends winner and loser email notifications.
   * Updates profile isAlumniOfDay flag and increments monthlyWinCount.
   */
  cron.schedule('0 18 * * *', async () => {
    console.log('[CRON] Triggering winner selection job...');
    try {
      await runWinnerSelection();
    } catch (err) {
      // Extra safety catch — runWinnerSelection has its own error handling
      console.error('[CRON] Winner selection job threw an unexpected error:', err.message);
    }
  });

  console.log('[CRON] Winner selection scheduled: daily at 6:00 PM');

  /**
   * CRON JOB 2: Monthly Reset
   * Schedule: '0 0 1 * *' — At midnight on the 1st of every month
   *
   * Resets for all profiles:
   * - monthlyWinCount → 0
   * - attendedEventThisMonth → false
   * - lastResetMonth → current 'YYYY-MM'
   */
  cron.schedule('0 0 1 * *', async () => {
    console.log('[CRON] Triggering monthly reset job...');
    try {
      await runMonthlyReset();
    } catch (err) {
      console.error('[CRON] Monthly reset job threw an unexpected error:', err.message);
    }
  });

  console.log('[CRON] Monthly reset scheduled: 1st of each month at midnight');

  /**
   * CRON JOB 3: Token Cleanup
   * Schedule: '0 2 * * *' — Every day at 2:00 AM
   *
   * Cleans up expired verification and password reset tokens from User documents.
   * This prevents the database from accumulating stale token data.
   * Note: Tokens are automatically invalid after expiry — this cleanup is cosmetic.
   */
  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Running token cleanup...');
    try {
      const User = require('./models/User');
      const now = new Date();

      /**
       * Remove expired verification tokens.
       * We use $unset to delete the fields entirely rather than setting them to null,
       * keeping documents clean and indexes sparse.
       */
      const verifyResult = await User.updateMany(
        { verificationExpiry: { $lt: now } },
        { $unset: { verificationToken: '', verificationExpiry: '' } }
      );

      /**
       * Remove expired password reset tokens.
       */
      const resetResult = await User.updateMany(
        { resetExpiry: { $lt: now } },
        { $unset: { resetToken: '', resetExpiry: '' } }
      );

      console.log(
        `[CRON] Token cleanup complete. ` +
          `Verification tokens cleared: ${verifyResult.modifiedCount}. ` +
          `Reset tokens cleared: ${resetResult.modifiedCount}.`
      );
    } catch (err) {
      console.error('[CRON] Token cleanup error:', err.message);
    }
  });

  console.log('[CRON] Token cleanup scheduled: daily at 2:00 AM');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});

// Handle unhandled promise rejections (safety net)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  // In production, consider restarting gracefully instead of exiting
});

// Handle uncaught exceptions (safety net)
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});
