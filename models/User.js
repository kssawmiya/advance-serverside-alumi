'use strict';

/**
 * @file models/User.js
 * @description Mongoose schema and model for User authentication.
 * Stores credentials, verification tokens, and role information.
 * Passwords are NEVER stored in plain text — only bcrypt hashes.
 */

const mongoose = require('mongoose');

/**
 * @typedef {Object} UserSchema
 * @property {ObjectId}  _id               - Auto-generated MongoDB ObjectId
 * @property {string}    email             - Unique university email address (lowercase)
 * @property {string}    passwordHash      - bcrypt hash of the user's password (12 rounds)
 * @property {boolean}   isVerified        - Whether the user has verified their email
 * @property {string}    verificationToken - Single-use token for email verification (crypto hex)
 * @property {Date}      verificationExpiry- When the verification token expires (24h TTL)
 * @property {string}    resetToken        - Single-use token for password reset (crypto hex)
 * @property {Date}      resetExpiry       - When the reset token expires (1h TTL)
 * @property {string}    role              - User role: 'alumni', 'developer', or 'admin'
 * @property {Date}      createdAt         - Timestamp of account creation
 */
const userSchema = new mongoose.Schema(
  {
    /**
     * University email address — must end with the configured UNIVERSITY_DOMAIN.
     * Stored lowercase and trimmed to prevent duplicate entries.
     */
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        /**
         * Custom validator: ensures email belongs to the university domain.
         * Domain is read from the UNIVERSITY_DOMAIN environment variable at runtime.
         */
        validator: function (value) {
          const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';
          return value.endsWith(`@${domain}`);
        },
        message: (props) =>
          `${props.value} is not a valid university email address`,
      },
    },

    /**
     * bcrypt hash of the user's password.
     * Raw passwords are hashed with 12 salt rounds in the controller before saving.
     */
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },

    /**
     * Set to true once the user clicks the verification link in their email.
     * Unverified users cannot log in.
     */
    isVerified: {
      type: Boolean,
      default: false,
    },

    /**
     * Hex-encoded random token (crypto.randomBytes(32)) used for email verification.
     * Set to undefined after successful verification (single-use).
     */
    verificationToken: {
      type: String,
      default: undefined,
    },

    /**
     * Expiry date for the verification token.
     * Set to Date.now() + 24 hours on registration.
     * Tokens older than this are considered invalid.
     */
    verificationExpiry: {
      type: Date,
      default: undefined,
    },

    /**
     * Hex-encoded random token for password reset flow.
     * Set to undefined after successful password reset (single-use).
     */
    resetToken: {
      type: String,
      default: undefined,
    },

    /**
     * Expiry date for the password reset token.
     * Set to Date.now() + 1 hour when a reset is requested.
     */
    resetExpiry: {
      type: Date,
      default: undefined,
    },

    /**
     * User role controlling access to protected routes.
     * - 'alumni': can place bids, manage own profile
     * - 'developer': can create API keys, access developer dashboard
     * - 'admin': full access including admin-only endpoints
     */
    role: {
      type: String,
      enum: {
        values: ['alumni', 'developer', 'admin'],
        message: '{VALUE} is not a valid role',
      },
      default: 'alumni',
    },

    /**
     * UTC timestamp of account creation.
     */
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Disable automatic __v version key to keep documents clean
    versionKey: false,
  }
);

// Note: email index is already created by `unique: true` on the field above.
// Index on verificationToken for fast verification lookups
userSchema.index({ verificationToken: 1 }, { sparse: true });

// Index on resetToken for fast password reset lookups
userSchema.index({ resetToken: 1 }, { sparse: true });

/**
 * User model.
 * @type {mongoose.Model}
 */
const User = mongoose.model('User', userSchema);

module.exports = User;
