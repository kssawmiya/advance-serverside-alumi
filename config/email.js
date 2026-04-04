'use strict';

/**
 * @file config/email.js
 * @description Nodemailer transporter configuration and email sending utilities.
 * All send functions are fire-and-forget safe — they log errors but do not throw,
 * so a failed email never crashes the application flow.
 */

const nodemailer = require('nodemailer');

/**
 * Nodemailer SMTP transporter configured from environment variables.
 * For development, use Ethereal (https://ethereal.email) credentials.
 * For production, replace with a real SMTP provider (SendGrid, SES, etc.).
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  // Use STARTTLS (false) for port 587; use true for port 465 (SSL)
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends an email verification link to a newly registered user.
 * The verification token is single-use and expires in 24 hours.
 *
 * @async
 * @function sendVerificationEmail
 * @param {string} email - Recipient's email address
 * @param {string} token - Raw verification token (hex string from crypto.randomBytes)
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (email, token) => {
  try {
    const verifyUrl = `${process.env.BASE_URL}/api/auth/verify/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@eastminster.ac.uk',
      to: email,
      subject: 'Verify your Alumni Influencers account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Welcome to Alumni Influencers!</h2>
          <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
          <a href="${verifyUrl}"
             style="display: inline-block; padding: 12px 24px; background-color: #3498db;
                    color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Verify Email Address
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in <strong>24 hours</strong>. If you did not register, ignore this email.
          </p>
          <p style="color: #666; font-size: 12px;">
            Or copy this URL: <br /><code>${verifyUrl}</code>
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Verification email sent to ${email} — Message ID: ${info.messageId}`);

    // In development, print the verification URL directly to the console so it can
    // be used without a real email inbox (Ethereal or no SMTP configured).
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] ✅ Email verification URL for ${email}:`);
      console.log(`[DEV] 👉 ${verifyUrl}\n`);
    }
  } catch (err) {
    // Non-critical: log but do not propagate — user can request a resend
    console.error(`[Email] Failed to send verification email to ${email}:`, err.message);

    // Even if email fails, still print the URL in development so testing is not blocked
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] ✅ Email sending failed but here is the verification URL for ${email}:`);
      console.log(`[DEV] 👉 ${process.env.BASE_URL}/api/auth/verify/${token}\n`);
    }
  }
};

/**
 * Sends a password reset link to the user's email address.
 * The reset token is single-use and expires in 1 hour.
 *
 * @async
 * @function sendPasswordResetEmail
 * @param {string} email - Recipient's email address
 * @param {string} token - Raw reset token (hex string from crypto.randomBytes)
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (email, token) => {
  try {
    // Points to the reset-password web page (GET /reset-password/:token)
    // which renders the form — NOT directly to the API endpoint
    const resetUrl = `${process.env.BASE_URL}/reset-password/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@eastminster.ac.uk',
      to: email,
      subject: 'Reset your Alumni Influencers password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Password Reset Request</h2>
          <p>We received a request to reset your password. Click the link below to proceed:</p>
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 24px; background-color: #e74c3c;
                    color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in <strong>1 hour</strong>. If you did not request a reset, ignore this email.
          </p>
          <p style="color: #666; font-size: 12px;">
            Or copy this URL: <br /><code>${resetUrl}</code>
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Password reset email sent to ${email} — Message ID: ${info.messageId}`);

    // In development, print the reset URL directly to the console
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] 🔑 Password reset URL for ${email}:`);
      console.log(`[DEV] 👉 ${resetUrl}\n`);
    }
  } catch (err) {
    // Non-critical: log but do not propagate
    console.error(`[Email] Failed to send password reset email to ${email}:`, err.message);

    // Even if email fails, still print the URL in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] 🔑 Email sending failed but here is the reset URL for ${email}:`);
      console.log(`[DEV] 👉 ${process.env.BASE_URL}/reset-password/${token}\n`);
    }
  }
};

/**
 * Sends a bid result notification email telling the alumnus if they won or lost
 * the Alumni of the Day slot for a given date.
 *
 * @async
 * @function sendBidResultEmail
 * @param {string} email - Recipient's email address
 * @param {boolean} isWinner - True if the alumnus won the slot, false otherwise
 * @param {Date|string} bidDate - The date of the bid slot (displayed in the email)
 * @returns {Promise<void>}
 */
const sendBidResultEmail = async (email, isWinner, bidDate) => {
  try {
    const dateStr = new Date(bidDate).toDateString();

    const subject = isWinner
      ? '🏆 Congratulations! You are Alumni of the Day!'
      : 'Bid Result — Alumni of the Day';

    const bodyHtml = isWinner
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #27ae60;">Congratulations! You won the Alumni of the Day slot!</h2>
          <p>Your bid was the highest for <strong>${dateStr}</strong>.</p>
          <p>Your profile will be featured as Alumni of the Day.
             Make sure your profile is up to date!</p>
          <p style="color: #666; font-size: 14px;">
            Visit <a href="${process.env.BASE_URL}/api/v1/alumni-of-day">your public profile</a>.
          </p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">Better luck next time!</h2>
          <p>Unfortunately your bid was not the highest for <strong>${dateStr}</strong>.</p>
          <p>You can place a new bid for tomorrow — keep trying!</p>
          <p style="color: #666; font-size: 14px;">
            Log in at <a href="${process.env.BASE_URL}">${process.env.BASE_URL}</a> to bid again.
          </p>
        </div>
      `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@eastminster.ac.uk',
      to: email,
      subject,
      html: bodyHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Bid result email (winner=${isWinner}) sent to ${email} — ID: ${info.messageId}`);
  } catch (err) {
    // Non-critical: results are already saved in DB — email is informational only
    console.error(`[Email] Failed to send bid result email to ${email}:`, err.message);
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBidResultEmail,
};
