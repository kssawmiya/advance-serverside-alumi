'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const User = require('../models/User');
const Profile = require('../models/Profile');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../config/email');

const BCRYPT_ROUNDS = 12;

const isStrongPassword = (password) => {
  const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return pattern.test(password);
};

const register = async (req, res) => {
  try {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { email, password, fullName, role: requestedRole } = req.body;

    const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';
    if (!email.endsWith(`@${domain}`)) {
      return res.status(400).json({
        success: false,
        error: `Only ${domain} email addresses are allowed`,
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&)',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const isDev = process.env.NODE_ENV !== 'production';

    const SELF_REGISTER_ROLES = ['alumni', 'university_staff'];
    const role = SELF_REGISTER_ROLES.includes(requestedRole) ? requestedRole : 'alumni';

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      verificationToken: isDev ? undefined : verificationToken,
      verificationExpiry: isDev ? undefined : verificationExpiry,
      isVerified: isDev ? true : false,
      role,
    });

    try {
      await Profile.create({
        userId: user._id,
        fullName: fullName.trim(),
      });
    } catch (profileErr) {
      console.error('[Auth] Profile.create failed — rolling back User:', profileErr.message, '| code:', profileErr.code);

      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Registration failed. Please try again.'
          : `Registration failed: could not create profile (${profileErr.message})`,
      });
    }

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

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification token is required',
      });
    }

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

const login = async (req, res) => {
  try {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    const GENERIC_AUTH_ERROR = 'Invalid credentials or email not verified';

    if (!user || !user.isVerified) {
      return res.status(401).json({
        success: false,
        error: GENERIC_AUTH_ERROR,
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: GENERIC_AUTH_ERROR,
      });
    }

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

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (user) {

      const resetToken = crypto.randomBytes(32).toString('hex');

      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

      user.resetToken = resetToken;
      user.resetExpiry = resetExpiry;
      await user.save();

      await sendPasswordResetEmail(user.email, resetToken);
    }

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

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character (@$!%*?&)',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

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

const logout = async (req, res) => {
  try {

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
