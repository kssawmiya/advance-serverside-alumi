'use strict';

/**
 * @file controllers/authController.js
 * @description Authentication controller handling registration, email verification,
 * login, password reset flows. Uses JWT for stateless auth and bcrypt (12 rounds)
 * for password hashing. No sessions used.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const User = require('../models/User');
const Profile = require('../models/Profile');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../config/email');

/** Number of bcrypt salt rounds — higher is more secure but slower */
const BCRYPT_ROUNDS = 12;

/**
 * Validates password strength.
 * Requirements: min 8 chars, at least one lowercase, uppercase, digit, special char.
 *
 * @param {string} password - The password to validate
 * @returns {boolean} True if password meets requirements
 */
const isStrongPassword = (password) => {
  const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return pattern.test(password);
};

/**
 * POST /api/auth/register
 * Registers a new alumni user.
 *
 * Steps:
 * 1. Run express-validator checks
 * 2. Verify email domain matches UNIVERSITY_DOMAIN
 * 3. Verify password strength
 * 4. Check for duplicate email
 * 5. Hash password with bcrypt (12 rounds)
 * 6. Generate email verification token (crypto.randomBytes(32))
 * 7. Create User and linked Profile documents
 * 8. Send verification email (non-blocking)
 * 9. Return 201 success (no token yet — user must verify first)
 *
 * @async
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const register = async (req, res) => {
  try {
    // Check express-validator results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { email, password, fullName } = req.body;

    // Double-check university domain (also enforced at model level)
    const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';
    if (!email.endsWith(`@${domain}`)) {
      return res.status(400).json({
        success: false,
        error: `Only ${domain} email addresses are allowed`,
      });
    }

    // Validate password strength
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&)',
      });
    }

    // Check if email already registered
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
      });
    }

    /**
     * Hash the password with bcrypt using 12 salt rounds.
     * The higher the rounds, the more resistant to brute-force attacks.
     * 12 rounds provides a good balance of security and performance (~300ms on modern hardware).
     */
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    /**
     * Generate a cryptographically secure verification token.
     * crypto.randomBytes(32) gives 256 bits of randomness — effectively unguessable.
     * Stored as a hex string (64 characters).
     */
    const verificationToken = crypto.randomBytes(32).toString('hex');

    /**
     * Set token expiry to 24 hours from now.
     * After this, the token is invalid and the user must request a new one.
     */
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    /**
     * In development mode, auto-verify the user so they can log in immediately
     * without needing to click the verification email (which goes to Ethereal,
     * a fake SMTP inbox that never delivers to a real address).
     * In production, isVerified stays false until the user clicks the email link.
     */
    const isDev = process.env.NODE_ENV !== 'production';

    // Create the User document
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      verificationToken: isDev ? undefined : verificationToken,
      verificationExpiry: isDev ? undefined : verificationExpiry,
      isVerified: isDev ? true : false,
      role: 'alumni',
    });

    /**
     * Create an empty Profile document linked to the new user.
     * fullName comes from the registration form.
     * All other fields default to empty/false.
     *
     * If Profile creation fails, we must delete the User document we just created
     * to avoid leaving an orphaned User with no Profile in the database.
     * Without this cleanup, the user would be unable to re-register (duplicate email)
     * but also unable to log in (no profile exists).
     */
    try {
      await Profile.create({
        userId: user._id,
        fullName: fullName.trim(),
      });
    } catch (profileErr) {
      console.error('[Auth] Profile.create failed — rolling back User:', profileErr.message, '| code:', profileErr.code);
      // Roll back: delete the User document to prevent orphaned records
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Registration failed. Please try again.'
          : `Registration failed: could not create profile (${profileErr.message})`,
      });
    }

    // Send verification email only in production (in dev the user is auto-verified)
    if (!isDev) {
      await sendVerificationEmail(email, verificationToken);
    } else {
      console.log(`[DEV] ✅ Auto-verified account for ${email} — you can log in immediately.`);
    }

    return res.status(201).json({
      success: true,
      message: isDev
        ? 'Registration successful. Your account has been automatically verified. You can log in now.'
        : 'Registration successful. Please check your email and verify your account before logging in.',
    });
  } catch (err) {
    console.error('[Auth] register error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.',
    });
  }
};

/**
 * GET /api/auth/verify/:token
 * Verifies a user's email address using the single-use token sent by email.
 *
 * Steps:
 * 1. Find user where verificationToken matches AND verificationExpiry > now
 * 2. If not found: invalid or expired token
 * 3. Mark user as verified, clear token fields
 * 4. Return 200 success
 *
 * @async
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification token is required',
      });
    }

    /**
     * Find user with matching token that hasn't expired yet.
     * Using $gt: new Date() ensures expired tokens are rejected.
     */
    const user = await User.findOne({
      verificationToken: token,
      verificationExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token. Please register again or request a new link.',
      });
    }

    // Mark email as verified and clear the single-use token fields
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpiry = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (err) {
    console.error('[Auth] verifyEmail error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Email verification failed. Please try again.',
    });
  }
};

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT.
 *
 * Steps:
 * 1. Find user by email
 * 2. Check user exists AND is verified (same error message to prevent email enumeration)
 * 3. Compare password hash with bcrypt.compare
 * 4. Sign JWT with user id, email, role
 * 5. Return token and basic user info
 *
 * @async
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const login = async (req, res) => {
  try {
    // Check express-validator results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { email, password } = req.body;

    /**
     * Find user by email.
     * We use a generic error message for both "not found" and "wrong password"
     * to prevent email enumeration attacks (attacker cannot tell if email exists).
     */
    const user = await User.findOne({ email: email.toLowerCase() });

    // Generic error: same message whether user doesn't exist or password is wrong
    const GENERIC_AUTH_ERROR = 'Invalid credentials or email not verified';

    if (!user || !user.isVerified) {
      return res.status(401).json({
        success: false,
        error: GENERIC_AUTH_ERROR,
      });
    }

    /**
     * Compare the provided password against the stored bcrypt hash.
     * bcrypt.compare is timing-safe and handles the salt internally.
     */
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: GENERIC_AUTH_ERROR,
      });
    }

    /**
     * Generate JWT access token.
     * Payload: { id, email, role } — enough for all downstream middleware.
     * Signed with JWT_SECRET, expires per JWT_EXPIRES_IN env var (default: 7d).
     */
    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] login error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
    });
  }
};

/**
 * POST /api/auth/forgot-password
 * Initiates the password reset flow by sending a reset email.
 *
 * SECURITY: Always returns the same success message regardless of whether the email
 * exists in the database — this prevents email enumeration attacks.
 *
 * @async
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required',
      });
    }

    /**
     * Try to find the user by email.
     * Whether found or not, we always return the same response.
     * This prevents attackers from probing which emails are registered.
     */
    const user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      /**
       * Generate a cryptographically random reset token.
       * Stored as hex; 32 bytes = 256 bits of entropy.
       */
      const resetToken = crypto.randomBytes(32).toString('hex');

      /**
       * Reset token expires in 1 hour (3600 seconds).
       * Short window reduces the risk of stolen tokens being used.
       */
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

      user.resetToken = resetToken;
      user.resetExpiry = resetExpiry;
      await user.save();

      // Send reset email (non-blocking)
      await sendPasswordResetEmail(user.email, resetToken);
    }

    // Always return success to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: 'If that email exists in our system, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('[Auth] forgotPassword error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Password reset request failed. Please try again.',
    });
  }
};

/**
 * POST /api/auth/reset-password/:token
 * Resets the user's password using a valid reset token.
 *
 * Steps:
 * 1. Find user where resetToken matches AND resetExpiry > now
 * 2. Validate new password strength
 * 3. Hash new password with bcrypt
 * 4. Save new hash, clear reset token fields
 * 5. Return success
 *
 * @async
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Reset token and new password are required',
      });
    }

    /**
     * Find user with valid, unexpired reset token.
     * Both conditions must be satisfied.
     */
    const user = await User.findOne({
      resetToken: token,
      resetExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired password reset token. Please request a new reset link.',
      });
    }

    // Validate new password strength before hashing
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&)',
      });
    }

    /**
     * Hash the new password with bcrypt (12 rounds).
     * Always use the same round count for consistency.
     */
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Update user with new hash and clear the single-use reset token
    user.passwordHash = passwordHash;
    user.resetToken = undefined;
    user.resetExpiry = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('[Auth] resetPassword error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Password reset failed. Please try again.',
    });
  }
};

/**
 * POST /api/auth/logout
 * Logs out the authenticated user.
 *
 * Since this API uses stateless JWT tokens (not server-side sessions),
 * true server-side invalidation would require a token blocklist (Redis, etc.).
 * For this implementation, logout is acknowledged server-side and the client
 * is responsible for discarding the token. This is the standard approach for
 * JWT-based APIs without a persistent token store.
 *
 * The verifyToken middleware runs first to confirm the request is authenticated.
 *
 * @async
 * @param {import('express').Request}  req - req.user (from JWT middleware)
 * @param {import('express').Response} res
 */
const logout = async (req, res) => {
  try {
    // With stateless JWT there is nothing to invalidate server-side.
    // The client must delete the token from its storage (localStorage, memory, etc.)
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Please discard your token on the client side.',
    });
  } catch (err) {
    console.error('[Auth] logout error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Logout failed. Please try again.',
    });
  }
};

module.exports = {
  register,
  verifyEmail,
  login,
  logout,
  forgotPassword,
  resetPassword,
};
