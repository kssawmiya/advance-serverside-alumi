'use strict';

/**
 * @file models/Profile.js
 * @description Mongoose schema for Alumni profiles.
 * Each User has exactly one Profile (enforced by unique index on userId).
 * Contains professional information, credentials, employment history,
 * and bidding-related tracking fields.
 */

const mongoose = require('mongoose');
const { URL } = require('url');

/**
 * Helper validator function: validates a URL string using Node's built-in URL parser.
 * Returns true for empty/undefined values (URL is optional in sub-documents).
 *
 * @param {string} value - The URL string to validate
 * @returns {boolean} True if valid URL or empty
 */
const isValidUrl = (value) => {
  if (!value || value.trim() === '') return true; // optional field
  try {
    new URL(value);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Sub-document schema for academic degrees.
 * @typedef {Object} DegreeSubDoc
 */
const degreeSchema = new mongoose.Schema({
  /** Degree title, e.g. "BSc Computer Science" */
  title: { type: String, trim: true },
  /** Name of the awarding institution */
  institution: { type: String, trim: true },
  /** URL to degree certificate or verification page */
  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for degree' },
  },
  /** Date the degree was completed */
  completionDate: { type: Date },
});

/**
 * Sub-document schema for professional certifications.
 * @typedef {Object} CertificationSubDoc
 */
const certificationSchema = new mongoose.Schema({
  /** Certification title, e.g. "AWS Certified Solutions Architect" */
  title: { type: String, trim: true },
  /** Awarding body, e.g. "Amazon Web Services" */
  body: { type: String, trim: true },
  /** URL to the certification badge or verification link */
  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for certification' },
  },
  /** Date the certification was awarded */
  completionDate: { type: Date },
});

/**
 * Sub-document schema for professional licences.
 * @typedef {Object} LicenceSubDoc
 */
const licenceSchema = new mongoose.Schema({
  /** Licence title, e.g. "PMP" */
  title: { type: String, trim: true },
  /** Issuing body, e.g. "PMI" */
  body: { type: String, trim: true },
  /** URL to licence verification */
  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for licence' },
  },
  /** Date the licence was issued */
  completionDate: { type: Date },
});

/**
 * Sub-document schema for professional / online courses.
 * @typedef {Object} ProfessionalCourseSubDoc
 */
const professionalCourseSchema = new mongoose.Schema({
  /** Course title */
  title: { type: String, trim: true },
  /** Course provider, e.g. "Coursera", "Udemy" */
  provider: { type: String, trim: true },
  /** URL to course completion certificate */
  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for professional course' },
  },
  /** Date the course was completed */
  completionDate: { type: Date },
});

/**
 * Sub-document schema for employment history entries.
 * @typedef {Object} EmploymentHistorySubDoc
 */
const employmentHistorySchema = new mongoose.Schema({
  /** Company or organisation name */
  company: { type: String, trim: true },
  /** Job title / role */
  role: { type: String, trim: true },
  /** Start date of employment */
  startDate: { type: Date },
  /** End date of employment (null/undefined = current employer) */
  endDate: { type: Date },
});

/**
 * Main Profile schema.
 * @typedef {Object} ProfileSchema
 * @property {ObjectId}  userId               - Reference to the owning User document
 * @property {string}    fullName             - Alumni's full display name
 * @property {string}    bio                  - Short biography (max 500 chars)
 * @property {string}    linkedinUrl          - LinkedIn profile URL
 * @property {string}    profileImage         - Filesystem path to uploaded profile image
 * @property {Array}     degrees              - Academic degrees
 * @property {Array}     certifications       - Professional certifications
 * @property {Array}     licences             - Professional licences
 * @property {Array}     professionalCourses  - Completed professional/online courses
 * @property {Array}     employmentHistory    - Past and current employers
 * @property {boolean}   isAlumniOfDay        - Whether this alumnus is currently featured
 * @property {number}    monthlyWinCount      - How many times won Alumni of the Day this month
 * @property {boolean}   attendedEventThisMonth - Grants an extra win slot (4 instead of 3)
 * @property {string}    lastResetMonth       - 'YYYY-MM' of the last monthly reset
 */
const profileSchema = new mongoose.Schema(
  {
    /**
     * One-to-one relationship with User.
     * Unique index ensures each user has only one profile.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      unique: true,
    },

    /** Full display name of the alumnus */
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },

    /** Short biography or professional summary */
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      trim: true,
      default: '',
    },

    /** LinkedIn public profile URL */
    linkedinUrl: {
      type: String,
      validate: {
        validator: isValidUrl,
        message: 'Invalid LinkedIn URL',
      },
      default: '',
    },

    /**
     * Relative filesystem path to the uploaded profile image.
     * e.g. 'public/uploads/1712345678901-avatar.jpg'
     */
    profileImage: {
      type: String,
      default: '',
    },

    /** Academic degrees awarded to the alumnus */
    degrees: [degreeSchema],

    /** Professional certifications held by the alumnus */
    certifications: [certificationSchema],

    /** Professional licences held by the alumnus */
    licences: [licenceSchema],

    /** Professional or online courses completed */
    professionalCourses: [professionalCourseSchema],

    /** Employment history entries (current and past) */
    employmentHistory: [employmentHistorySchema],

    /**
     * Set to true when this alumnus wins the daily bid and is featured.
     * Only one profile should have this set to true at any time.
     * Reset to false when a new winner is selected.
     */
    isAlumniOfDay: {
      type: Boolean,
      default: false,
    },

    /**
     * Number of times this alumnus has won Alumni of the Day in the current month.
     * Maximum is 3 (or 4 if attendedEventThisMonth is true).
     * Reset to 0 by the monthly cron job on the 1st of each month.
     */
    monthlyWinCount: {
      type: Number,
      default: 0,
    },

    /**
     * If true, the alumnus attended a university event this month
     * and is granted a 4th win slot instead of the default 3.
     * Reset to false by the monthly cron job.
     */
    attendedEventThisMonth: {
      type: Boolean,
      default: false,
    },

    /**
     * Tracks when the last monthly reset was performed.
     * Format: 'YYYY-MM' (e.g., '2025-06').
     * Used to detect if a reset is needed without relying solely on the cron schedule.
     */
    lastResetMonth: {
      type: String,
      default: '',
    },
  },
  {
    versionKey: false,
    // Include virtual fields when converting to JSON (e.g., in API responses)
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Profile model.
 * @type {mongoose.Model}
 */
const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;
