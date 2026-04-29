'use strict';

const mongoose = require('mongoose');
const { URL } = require('url');

const isValidUrl = (value) => {
  if (!value || value.trim() === '') return true;
  try {
    new URL(value);
    return true;
  } catch (_) {
    return false;
  }
};

const degreeSchema = new mongoose.Schema({

  title: { type: String, trim: true },

  institution: { type: String, trim: true },

  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for degree' },
  },

  completionDate: { type: Date },
});

const certificationSchema = new mongoose.Schema({

  title: { type: String, trim: true },

  body: { type: String, trim: true },

  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for certification' },
  },

  completionDate: { type: Date },
});

const licenceSchema = new mongoose.Schema({

  title: { type: String, trim: true },

  body: { type: String, trim: true },

  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for licence' },
  },

  completionDate: { type: Date },
});

const professionalCourseSchema = new mongoose.Schema({

  title: { type: String, trim: true },

  provider: { type: String, trim: true },

  url: {
    type: String,
    validate: { validator: isValidUrl, message: 'Invalid URL for professional course' },
  },

  completionDate: { type: Date },
});

const employmentHistorySchema = new mongoose.Schema({

  company: { type: String, trim: true },

  role: { type: String, trim: true },

  startDate: { type: Date },

  endDate: { type: Date },

  location: { type: String, trim: true },
});

const profileSchema = new mongoose.Schema(
  {

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      unique: true,
    },

    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },

    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      trim: true,
      default: '',
    },

    linkedinUrl: {
      type: String,
      validate: {
        validator: isValidUrl,
        message: 'Invalid LinkedIn URL',
      },
      default: '',
    },

    profileImage: {
      type: String,
      default: '',
    },

    degrees: [degreeSchema],

    certifications: [certificationSchema],

    licences: [licenceSchema],

    professionalCourses: [professionalCourseSchema],

    employmentHistory: [employmentHistorySchema],

    isAlumniOfDay: {
      type: Boolean,
      default: false,
    },

    monthlyWinCount: {
      type: Number,
      default: 0,
    },

    attendedEventThisMonth: {
      type: Boolean,
      default: false,
    },

    lastResetMonth: {
      type: String,
      default: '',
    },

    programme: { type: String, trim: true, default: '' },

    graduationYear: {
      type: Number,
      min: [1950, 'Graduation year must be 1950 or later'],
      max: [new Date().getFullYear() + 5, 'Graduation year cannot be in the far future'],
    },

    industrySector: { type: String, trim: true, default: '' },

    currentLocation: { type: String, trim: true, default: '' },
  },
  {
    versionKey: false,

    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;
