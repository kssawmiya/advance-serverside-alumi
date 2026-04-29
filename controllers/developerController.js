'use strict';

const Profile = require('../models/Profile');

const getAlumniOfDay = async (req, res) => {
  try {

    const profile = await Profile.findOne({ isAlumniOfDay: true })
      .select(
        'fullName bio linkedinUrl profileImage degrees certifications licences professionalCourses employmentHistory userId'
      )
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'No Alumni of the Day has been selected yet. Please check back after midnight.',
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
