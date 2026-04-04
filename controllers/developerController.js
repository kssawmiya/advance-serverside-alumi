'use strict';

/**
 * @file controllers/developerController.js
 * @description Public developer API controller.
 * Provides the externally-accessible Alumni of the Day endpoint,
 * authenticated via API key (not JWT).
 */

const Profile = require('../models/Profile');

/**
 * GET /api/v1/alumni-of-day
 * Returns the currently featured Alumni of the Day profile.
 *
 * This endpoint is protected by API key authentication (requireApiKey middleware)
 * rather than JWT, allowing third-party developers to access alumni data.
 *
 * The alumni of the day is set by the nightly winner selection cron job
 * (jobs/winnerSelection.js) which runs at 6 PM daily.
 *
 * Fields returned:
 *  - fullName, bio, linkedinUrl, profileImage
 *  - degrees, certifications, licences, professionalCourses
 *  - employmentHistory
 * Internal tracking fields (monthlyWinCount, bidding internals) are excluded
 * to keep the public API clean and privacy-conscious.
 *
 * @async
 * @param {import('express').Request}  req - req.apiKey (attached by requireApiKey middleware)
 * @param {import('express').Response} res
 */
const getAlumniOfDay = async (req, res) => {
  try {
    /**
     * Find the single profile marked as Alumni of the Day.
     * Only one profile should have isAlumniOfDay = true at any time.
     *
     * Select only public-facing fields — exclude internal tracking fields
     * such as monthlyWinCount, attendedEventThisMonth, lastResetMonth.
     */
    const profile = await Profile.findOne({ isAlumniOfDay: true })
      .select(
        'fullName bio linkedinUrl profileImage degrees certifications licences professionalCourses employmentHistory userId'
      )
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'No Alumni of the Day has been selected yet. Please check back after 6 PM.',
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    console.error('[Developer] getAlumniOfDay error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve Alumni of the Day',
    });
  }
};

module.exports = {
  getAlumniOfDay,
};
