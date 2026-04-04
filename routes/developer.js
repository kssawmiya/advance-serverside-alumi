'use strict';

/**
 * @file routes/developer.js
 * @description Developer portal routes for API key management.
 * All routes require JWT authentication.
 * These routes are for managing API keys — the actual developer API is in routes/api.js.
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const apiKeyController = require('../controllers/apiKeyController');

// ─── All developer routes require JWT authentication ──────────────────────────
router.use(verifyToken);

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates the API key name:
 * - Required, non-empty
 * - Trimmed of whitespace
 */
const validateKeyName = [
  body('name')
    .notEmpty()
    .withMessage('API key name is required')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Key name must be between 1 and 100 characters'),
];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/developer/keys:
 *   post:
 *     summary: Generate a new API key
 *     tags: [Developer Portal]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Generates a new cryptographically random API key.
 *       **IMPORTANT**: The raw key is returned ONCE in this response only.
 *       Save it immediately — it cannot be retrieved again.
 *       Only the SHA-256 hash is stored in the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Production App
 *                 description: Human-readable label for this key
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read:alumni]
 *                 example: [read:alumni]
 *                 description: Permission scopes for this key
 *     responses:
 *       201:
 *         description: API key generated — save the key value immediately
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *                     key:
 *                       type: string
 *                       description: Raw API key — shown ONCE, store immediately
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/keys', validateKeyName, apiKeyController.generateKey);

/**
 * @swagger
 * /api/developer/keys:
 *   get:
 *     summary: List all API keys for the authenticated developer
 *     tags: [Developer Portal]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Returns all API keys belonging to the developer.
 *       Raw keys and key hashes are NEVER returned — only metadata.
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       scopes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       lastUsed:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       revokedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/keys', apiKeyController.listKeys);

/**
 * @swagger
 * /api/developer/keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [Developer Portal]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Revokes an API key immediately. Revoked keys are rejected by all API endpoints.
 *       The key record is kept for audit purposes but cannot be reactivated.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key document _id
 *     responses:
 *       200:
 *         description: Key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Key not found or already revoked
 */
router.delete('/keys/:id', apiKeyController.revokeKey);

/**
 * @swagger
 * /api/developer/stats:
 *   get:
 *     summary: Get API usage statistics
 *     tags: [Developer Portal]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Returns aggregated usage statistics for all of the developer's API keys.
 *       Shows total call counts, per-endpoint breakdowns, and last-used timestamps.
 *     responses:
 *       200:
 *         description: Usage statistics retrieved
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
 *                     keys:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           usage:
 *                             type: object
 *                             properties:
 *                               totalCalls:
 *                                 type: number
 *                               lastCall:
 *                                 type: string
 *                                 format: date-time
 *                               byEndpoint:
 *                                 type: object
 *                     totalCalls:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', apiKeyController.getStats);

/**
 * @swagger
 * /api/developer/alumni/{userId}/event-attendance:
 *   post:
 *     summary: Record university event attendance for an alumnus
 *     tags: [Developer Portal]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Marks an alumnus as having attended a university event this month.
 *       This grants them a 4th bid slot for the current calendar month
 *       (the default maximum is 3 wins per month).
 *       The flag is automatically cleared by the monthly reset job on the 1st of each month.
 *       Requires 'developer' or 'admin' role.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The User document _id of the alumnus to update
 *     responses:
 *       200:
 *         description: Event attendance recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     fullName:
 *                       type: string
 *                     attendedEventThisMonth:
 *                       type: boolean
 *                       example: true
 *                     monthlyWinCount:
 *                       type: number
 *                     monthlyLimit:
 *                       type: number
 *                       example: 4
 *                     remainingSlots:
 *                       type: number
 *       400:
 *         description: Missing userId parameter
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Alumni profile not found
 */
router.post('/alumni/:userId/event-attendance', apiKeyController.markEventAttendance);

module.exports = router;
