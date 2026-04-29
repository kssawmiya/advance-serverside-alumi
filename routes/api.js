'use strict';

const express = require('express');
const router = express.Router();
const requireApiKey = require('../middleware/requireApiKey');
const { requireScope } = require('../middleware/requireApiKey');
const { apiLimiter } = require('../middleware/rateLimiter');
const developerController = require('../controllers/developerController');

/**
 * @swagger
 * /api/v1/alumni-of-day:
 *   get:
 *     summary: Get today's Alumni of the Day
 *     tags: [Public API (v1)]
 *     security:
 *       - ApiKeyAuth: []
 *     description: >
 *       Returns the profile of the current Alumni of the Day.
 *       This endpoint is accessible to third-party developers using an API key.
 *
 *       **Authentication**: Use your API key as a Bearer token:
 *       `Authorization: Bearer <your-api-key>`
 *
 *       The Alumni of the Day is selected daily at midnight by the winner selection
 *       algorithm (highest bid wins). The profile changes once per day.
 *
 *       **Rate limit**: 100 requests per 15 minutes per IP.
 *     responses:
 *       200:
 *         description: Alumni of the Day profile
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
 *                     fullName:
 *                       type: string
 *                       example: Jane Smith
 *                     bio:
 *                       type: string
 *                       example: Software engineer specialising in cloud architecture
 *                     linkedinUrl:
 *                       type: string
 *                       format: uri
 *                       example: https://linkedin.com/in/janesmith
 *                     profileImage:
 *                       type: string
 *                       example: public/uploads/1712345678-avatar.jpg
 *                     degrees:
 *                       type: array
 *                       items:
 *                         type: object
 *                     certifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                     licences:
 *                       type: array
 *                       items:
 *                         type: object
 *                     professionalCourses:
 *                       type: array
 *                       items:
 *                         type: object
 *                     employmentHistory:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized — invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Unauthorized — invalid or revoked API key
 *       404:
 *         description: No Alumni of the Day selected yet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: No Alumni of the Day has been selected yet
 *       429:
 *         description: Rate limit exceeded (100 requests per 15 minutes)
 */
router.get(
  '/alumni-of-day',
  apiLimiter,
  requireApiKey,
  requireScope('read:alumni_of_day'),
  developerController.getAlumniOfDay
);

module.exports = router;
