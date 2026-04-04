'use strict';

/**
 * @file controllers/profileController.js
 * @description Profile management controller.
 * Handles CRUD for alumni profiles and all sub-resources:
 * degrees, certifications, licences, professionalCourses, employmentHistory.
 * Also handles profile image uploads.
 *
 * All routes require a valid JWT (verifyToken middleware applied at router level).
 */

const Profile = require('../models/Profile');

/**
 * GET /api/profile
 * Returns the authenticated user's full profile.
 *
 * @async
 * @param {import('express').Request}  req - req.user.id from JWT
 * @param {import('express').Response} res
 */
const getMyProfile = async (req, res) => {
  try {
    /**
     * Find profile by userId (one-to-one with User).
     * .lean() returns a plain JS object instead of a Mongoose document
     * for faster serialization since we're only reading.
     */
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

/**
 * PUT /api/profile
 * Updates the top-level profile fields: fullName, bio, linkedinUrl.
 *
 * @async
 * @param {import('express').Request}  req - req.user.id, req.body: { fullName, bio, linkedinUrl }
 * @param {import('express').Response} res
 */
const updateProfile = async (req, res) => {
  try {
    const { fullName, bio, linkedinUrl } = req.body;

    /**
     * Build an update object with only the provided fields.
     * This prevents accidental clearing of fields not included in the request.
     */
    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl.trim();

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
        new: true,    // Return the updated document
        runValidators: true, // Run schema validators on update
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

/**
 * POST /api/profile/image
 * Saves an uploaded profile image path to the profile.
 * Requires multer middleware to have already processed the file upload.
 *
 * @async
 * @param {import('express').Request}  req - req.file from multer, req.user.id from JWT
 * @param {import('express').Response} res
 */
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
    }

    /**
     * Store the relative path returned by multer.
     * On Windows multer may use backslashes; normalise to forward slashes
     * so the path works as a URL segment.
     */
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

/**
 * GET /api/profile/completion
 * Returns a profile completion score showing which sections are filled in.
 *
 * Completion is calculated based on the presence of required and optional fields.
 * Useful for prompting alumni to complete their profiles before bidding.
 *
 * Sections checked:
 *  - Personal info (fullName, bio): 20%
 *  - LinkedIn URL: 10%
 *  - Profile image: 10%
 *  - At least one degree: 15%
 *  - At least one certification: 15%
 *  - At least one licence: 10%
 *  - At least one professional course: 10%
 *  - At least one employment entry: 10%
 *
 * @async
 * @param {import('express').Request}  req - req.user.id from JWT
 * @param {import('express').Response} res
 */
const getCompletionStatus = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id }).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    /**
     * Build a checklist of completion criteria.
     * Each section contributes a weighted percentage.
     */
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

    // Calculate total score as a percentage
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

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-RESOURCE FACTORY FUNCTIONS
   Each sub-resource (degrees, certifications, licences, professionalCourses,
   employmentHistory) follows the same CRUD pattern. Rather than duplicating
   code, we use factory functions that accept the resource name and return
   the appropriate handler function.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Factory: addSubResource
 * Returns an async Express handler that pushes a new item to the given array field.
 *
 * Usage: router.post('/degrees', verifyToken, addSubResource('degrees'))
 *
 * @param {string} resource - The name of the Profile array field (e.g. 'degrees')
 * @returns {import('express').RequestHandler}
 */
const addSubResource = (resource) => async (req, res) => {
  try {
    const newItem = req.body;

    if (!newItem || Object.keys(newItem).length === 0) {
      return res.status(400).json({
        success: false,
        error: `No data provided for ${resource}`,
      });
    }

    /**
     * $push appends the new item to the array.
     * Mongoose generates a new _id for subdocuments automatically.
     * runValidators ensures subdoc validators (e.g. URL format) are run.
     */
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

/**
 * Factory: updateSubResource
 * Returns an async Express handler that finds a subdoc by its _id and updates its fields.
 *
 * Uses positional operator $ to target the matching subdocument.
 *
 * @param {string} resource - The name of the Profile array field (e.g. 'certifications')
 * @returns {import('express').RequestHandler}
 */
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

    /**
     * Build a $set object targeting fields within the matched subdocument.
     * The positional $ operator refers to the first array element matching the filter.
     * e.g. { 'degrees.$.title': 'BSc Computer Science' }
     */
    const setFields = {};
    for (const [key, value] of Object.entries(updates)) {
      setFields[`${resource}.$.${key}`] = value;
    }

    const profile = await Profile.findOneAndUpdate(
      {
        userId: req.user.id,
        [`${resource}._id`]: id, // Match the specific subdocument by its _id
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

/**
 * Factory: deleteSubResource
 * Returns an async Express handler that removes a subdoc from the array by its _id.
 *
 * Uses $pull to atomically remove the matching element.
 *
 * @param {string} resource - The name of the Profile array field (e.g. 'employmentHistory')
 * @returns {import('express').RequestHandler}
 */
const deleteSubResource = (resource) => async (req, res) => {
  try {
    const { id } = req.params;

    /**
     * $pull removes all array elements where _id matches the given id.
     * Since subdoc _ids are unique, this removes exactly one element.
     */
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

// ─── Pre-bound sub-resource handlers ────────────────────────────────────────

/** Degree CRUD handlers */
const addDegree          = addSubResource('degrees');
const updateDegree       = updateSubResource('degrees');
const deleteDegree       = deleteSubResource('degrees');

/** Certification CRUD handlers */
const addCertification   = addSubResource('certifications');
const updateCertification = updateSubResource('certifications');
const deleteCertification = deleteSubResource('certifications');

/** Licence CRUD handlers */
const addLicence         = addSubResource('licences');
const updateLicence      = updateSubResource('licences');
const deleteLicence      = deleteSubResource('licences');

/** Professional Course CRUD handlers */
const addProfessionalCourse    = addSubResource('professionalCourses');
const updateProfessionalCourse = updateSubResource('professionalCourses');
const deleteProfessionalCourse = deleteSubResource('professionalCourses');

/** Employment History CRUD handlers */
const addEmployment    = addSubResource('employmentHistory');
const updateEmployment = updateSubResource('employmentHistory');
const deleteEmployment = deleteSubResource('employmentHistory');

module.exports = {
  getMyProfile,
  updateProfile,
  uploadImage,
  getCompletionStatus,
  // Degrees
  addDegree,
  updateDegree,
  deleteDegree,
  // Certifications
  addCertification,
  updateCertification,
  deleteCertification,
  // Licences
  addLicence,
  updateLicence,
  deleteLicence,
  // Professional Courses
  addProfessionalCourse,
  updateProfessionalCourse,
  deleteProfessionalCourse,
  // Employment History
  addEmployment,
  updateEmployment,
  deleteEmployment,
};
