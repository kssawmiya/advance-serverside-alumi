'use strict';

require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const cron = require('node-cron');
const { runWinnerSelection } = require('./jobs/winnerSelection');
const { runMonthlyReset } = require('./jobs/monthlyReset');

const PORT = process.env.PORT || 3000;

async function startServer() {

  await connectDB();

  app.listen(PORT, () => {
    console.log('════════════════════════════════════════');
    console.log(`  Alumni Influencers API`);
    console.log(`  Server: http://localhost:${PORT}`);
    console.log(`  API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('════════════════════════════════════════');
  });

  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Triggering winner selection job...');
    try {
      await runWinnerSelection();
    } catch (err) {

      console.error('[CRON] Winner selection job threw an unexpected error:', err.message);
    }
  });

  console.log('[CRON] Winner selection scheduled: daily at midnight');

  cron.schedule('0 0 1 * *', async () => {
    console.log('[CRON] Triggering monthly reset job...');
    try {
      await runMonthlyReset();
    } catch (err) {
      console.error('[CRON] Monthly reset job threw an unexpected error:', err.message);
    }
  });

  console.log('[CRON] Monthly reset scheduled: 1st of each month at midnight');

  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Running token cleanup...');
    try {
      const User = require('./models/User');
      const now = new Date();

      const verifyResult = await User.updateMany(
        { verificationExpiry: { $lt: now } },
        { $unset: { verificationToken: '', verificationExpiry: '' } }
      );

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

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);

});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});
