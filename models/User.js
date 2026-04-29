'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {

        validator: function (value) {
          const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';
          return value.endsWith(`@${domain}`);
        },
        message: (props) =>
          `${props.value} is not a valid university email address`,
      },
    },

    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: {
      type: String,
      default: undefined,
    },

    verificationExpiry: {
      type: Date,
      default: undefined,
    },

    resetToken: {
      type: String,
      default: undefined,
    },

    resetExpiry: {
      type: Date,
      default: undefined,
    },

    role: {
      type: String,
      enum: {
        values: ['alumni', 'developer', 'admin', 'university_staff'],
        message: '{VALUE} is not a valid role',
      },
      default: 'alumni',
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {

    versionKey: false,
  }
);

userSchema.index({ verificationToken: 1 }, { sparse: true });

userSchema.index({ resetToken: 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
