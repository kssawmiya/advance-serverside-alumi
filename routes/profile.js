'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyToken } = require('../middleware/auth');
const profileController = require('../controllers/profileController');

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },

  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG and PNG images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

router.use(verifyToken);

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get authenticated user's profile
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     description: Returns the full profile of the currently authenticated user.
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Full profile document
 *       401:
 *         description: Unauthorized — JWT required
 *       404:
 *         description: Profile not found
 */
router.get('/', profileController.getMyProfile);

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Update profile top-level fields
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               bio:
 *                 type: string
 *                 maxLength: 500
 *                 example: Software engineer and alumnus
 *               linkedinUrl:
 *                 type: string
 *                 format: uri
 *                 example: https://linkedin.com/in/johndoe
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: No valid fields provided
 *       401:
 *         description: Unauthorized
 */
router.put('/', profileController.updateProfile);

/**
 * @swagger
 * /api/profile/image:
 *   post:
 *     summary: Upload a profile image
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: JPEG or PNG image, max 2MB
 *     responses:
 *       200:
 *         description: Image uploaded and profile updated
 *       400:
 *         description: No file provided or invalid file type
 *       401:
 *         description: Unauthorized
 */
router.post('/image', upload.single('image'), profileController.uploadImage);

/**
 * @swagger
 * /api/profile/completion:
 *   get:
 *     summary: Get profile completion status
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Returns a completion percentage and per-section breakdown showing which
 *       parts of the profile are filled in. Useful for prompting alumni to
 *       complete their profiles before bidding.
 *     responses:
 *       200:
 *         description: Profile completion status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     completionPercentage:
 *                       type: number
 *                       example: 70
 *                     sections:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           completed:
 *                             type: boolean
 *                           weight:
 *                             type: number
 *                     incomplete:
 *                       type: array
 *                       items:
 *                         type: string
 *                     message:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.get('/completion', profileController.getCompletionStatus);

/**
 * @swagger
 * /api/profile/degrees:
 *   post:
 *     summary: Add a degree
 *     tags: [Profile - Degrees]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: BSc Computer Science
 *               institution:
 *                 type: string
 *                 example: Eastminster University
 *               url:
 *                 type: string
 *                 format: uri
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Degree added successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/degrees', profileController.addDegree);

/**
 * @swagger
 * /api/profile/degrees/{id}:
 *   put:
 *     summary: Update a degree entry
 *     tags: [Profile - Degrees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Degree subdocument _id
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Degree updated
 *       404:
 *         description: Degree not found
 */
router.put('/degrees/:id', profileController.updateDegree);

/**
 * @swagger
 * /api/profile/degrees/{id}:
 *   delete:
 *     summary: Delete a degree entry
 *     tags: [Profile - Degrees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Degree deleted
 *       404:
 *         description: Profile not found
 */
router.delete('/degrees/:id', profileController.deleteDegree);

/**
 * @swagger
 * /api/profile/certifications:
 *   post:
 *     summary: Add a certification
 *     tags: [Profile - Certifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Certification added
 */
router.post('/certifications', profileController.addCertification);

/**
 * @swagger
 * /api/profile/certifications/{id}:
 *   put:
 *     summary: Update a certification
 *     tags: [Profile - Certifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Certification updated
 */
router.put('/certifications/:id', profileController.updateCertification);

/**
 * @swagger
 * /api/profile/certifications/{id}:
 *   delete:
 *     summary: Delete a certification
 *     tags: [Profile - Certifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certification deleted
 */
router.delete('/certifications/:id', profileController.deleteCertification);

/**
 * @swagger
 * /api/profile/licences:
 *   post:
 *     summary: Add a licence
 *     tags: [Profile - Licences]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Licence added
 */
router.post('/licences', profileController.addLicence);

/**
 * @swagger
 * /api/profile/licences/{id}:
 *   put:
 *     summary: Update a licence
 *     tags: [Profile - Licences]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Licence updated
 */
router.put('/licences/:id', profileController.updateLicence);

/**
 * @swagger
 * /api/profile/licences/{id}:
 *   delete:
 *     summary: Delete a licence
 *     tags: [Profile - Licences]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Licence deleted
 */
router.delete('/licences/:id', profileController.deleteLicence);

/**
 * @swagger
 * /api/profile/professionalCourses:
 *   post:
 *     summary: Add a professional course
 *     tags: [Profile - Professional Courses]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               provider:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               completionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Professional course added
 */
router.post('/professionalCourses', profileController.addProfessionalCourse);

/**
 * @swagger
 * /api/profile/professionalCourses/{id}:
 *   put:
 *     summary: Update a professional course
 *     tags: [Profile - Professional Courses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Course updated
 */
router.put('/professionalCourses/:id', profileController.updateProfessionalCourse);

/**
 * @swagger
 * /api/profile/professionalCourses/{id}:
 *   delete:
 *     summary: Delete a professional course
 *     tags: [Profile - Professional Courses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course deleted
 */
router.delete('/professionalCourses/:id', profileController.deleteProfessionalCourse);

/**
 * @swagger
 * /api/profile/employmentHistory:
 *   post:
 *     summary: Add an employment history entry
 *     tags: [Profile - Employment History]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company:
 *                 type: string
 *               role:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 description: Leave null if currently employed here
 *     responses:
 *       201:
 *         description: Employment entry added
 */
router.post('/employmentHistory', profileController.addEmployment);

/**
 * @swagger
 * /api/profile/employmentHistory/{id}:
 *   put:
 *     summary: Update an employment history entry
 *     tags: [Profile - Employment History]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Employment entry updated
 */
router.put('/employmentHistory/:id', profileController.updateEmployment);

/**
 * @swagger
 * /api/profile/employmentHistory/{id}:
 *   delete:
 *     summary: Delete an employment history entry
 *     tags: [Profile - Employment History]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employment entry deleted
 */
router.delete('/employmentHistory/:id', profileController.deleteEmployment);

module.exports = router;
