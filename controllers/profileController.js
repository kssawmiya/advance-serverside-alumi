'use strict';

const Profile = require('../models/Profile');

const getMyProfile = async (req, res) => {
  try {

    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found. Please contact support.',
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    console.error('[Profile] getMyProfile error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile',
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { fullName, bio, linkedinUrl, programme, graduationYear, industrySector, currentLocation } = req.body;

    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl.trim();

    if (programme !== undefined) updates.programme = programme.trim();
    if (graduationYear !== undefined) updates.graduationYear = parseInt(graduationYear) || undefined;
    if (industrySector !== undefined) updates.industrySector = industrySector.trim();
    if (currentLocation !== undefined) updates.currentLocation = currentLocation.trim();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided for update',
      });
    }

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    console.error('[Profile] updateProfile error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
};

const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
    }

    const imagePath = req.file.path.replace(/\\/g, '/');

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { profileImage: imagePath } },
      { new: true }
    ).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: { profileImage: profile.profileImage },
      message: 'Profile image updated successfully',
    });
  } catch (err) {
    console.error('[Profile] uploadImage error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload image',
    });
  }
};

const getCompletionStatus = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    const sections = [
      {
        name: 'Full name',
        completed: Boolean(profile.fullName && profile.fullName.trim()),
        weight: 10,
      },
      {
        name: 'Biography',
        completed: Boolean(profile.bio && profile.bio.trim()),
        weight: 10,
      },
      {
        name: 'LinkedIn URL',
        completed: Boolean(profile.linkedinUrl && profile.linkedinUrl.trim()),
        weight: 10,
      },
      {
        name: 'Profile image',
        completed: Boolean(profile.profileImage && profile.profileImage.trim()),
        weight: 10,
      },
      {
        name: 'At least one degree',
        completed: profile.degrees && profile.degrees.length > 0,
        weight: 15,
      },
      {
        name: 'At least one certification',
        completed: profile.certifications && profile.certifications.length > 0,
        weight: 15,
      },
      {
        name: 'At least one licence',
        completed: profile.licences && profile.licences.length > 0,
        weight: 10,
      },
      {
        name: 'At least one professional course',
        completed: profile.professionalCourses && profile.professionalCourses.length > 0,
        weight: 10,
      },
      {
        name: 'At least one employment entry',
        completed: profile.employmentHistory && profile.employmentHistory.length > 0,
        weight: 10,
      },
    ];

    const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0);
    const earnedWeight = sections
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + s.weight, 0);

    const completionPercentage = Math.round((earnedWeight / totalWeight) * 100);

    const incomplete = sections.filter((s) => !s.completed).map((s) => s.name);

    return res.status(200).json({
      success: true,
      data: {
        completionPercentage,
        sections,
        incomplete,
        message:
          completionPercentage === 100
            ? 'Your profile is complete!'
            : `Your profile is ${completionPercentage}% complete. Complete the following sections: ${incomplete.join(', ')}.`,
      },
    });
  } catch (err) {
    console.error('[Profile] getCompletionStatus error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile completion status',
    });
  }
};

const addSubResource = (resource) => async (req, res) => {
  try {
    const newItem = req.body;

    if (!newItem || Object.keys(newItem).length === 0) {
      return res.status(400).json({
        success: false,
        error: `No data provided for ${resource}`,
      });
    }

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $push: { [resource]: newItem } },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    return res.status(201).json({
      success: true,
      data: profile[resource],
      message: `${resource} item added successfully`,
    });
  } catch (err) {
    console.error(`[Profile] addSubResource(${resource}) error:`, err.message);
    return res.status(500).json({
      success: false,
      error: `Failed to add ${resource} item`,
    });
  }
};

const updateSubResource = (resource) => async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No update data provided',
      });
    }

    const setFields = {};
    for (const [key, value] of Object.entries(updates)) {
      setFields[`${resource}.$.${key}`] = value;
    }

    const profile = await Profile.findOneAndUpdate(
      {
        userId: req.user.id,
        [`${resource}._id`]: id,
      },
      { $set: setFields },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `${resource} item not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: profile[resource],
      message: `${resource} item updated successfully`,
    });
  } catch (err) {
    console.error(`[Profile] updateSubResource(${resource}) error:`, err.message);
    return res.status(500).json({
      success: false,
      error: `Failed to update ${resource} item`,
    });
  }
};

const deleteSubResource = (resource) => async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { [resource]: { _id: id } } },
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: profile[resource],
      message: `${resource} item deleted successfully`,
    });
  } catch (err) {
    console.error(`[Profile] deleteSubResource(${resource}) error:`, err.message);
    return res.status(500).json({
      success: false,
      error: `Failed to delete ${resource} item`,
    });
  }
};

const addDegree          = addSubResource('degrees');
const updateDegree       = updateSubResource('degrees');
const deleteDegree       = deleteSubResource('degrees');

const addCertification   = addSubResource('certifications');
const updateCertification = updateSubResource('certifications');
const deleteCertification = deleteSubResource('certifications');

const addLicence         = addSubResource('licences');
const updateLicence      = updateSubResource('licences');
const deleteLicence      = deleteSubResource('licences');

const addProfessionalCourse    = addSubResource('professionalCourses');
const updateProfessionalCourse = updateSubResource('professionalCourses');
const deleteProfessionalCourse = deleteSubResource('professionalCourses');

const addEmployment    = addSubResource('employmentHistory');
const updateEmployment = updateSubResource('employmentHistory');
const deleteEmployment = deleteSubResource('employmentHistory');

module.exports = {
  getMyProfile,
  updateProfile,
  uploadImage,
  getCompletionStatus,

  addDegree,
  updateDegree,
  deleteDegree,

  addCertification,
  updateCertification,
  deleteCertification,

  addLicence,
  updateLicence,
  deleteLicence,

  addProfessionalCourse,
  updateProfessionalCourse,
  deleteProfessionalCourse,

  addEmployment,
  updateEmployment,
  deleteEmployment,
};
