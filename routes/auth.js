'use strict';

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authLimiter } = require('../middleware/rateLimiter');
const { verifyToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

const csrfProtect = (req, res, next) => {
  const validateCsrf = req.app.locals.validateCsrf;
  if (validateCsrf) return validateCsrf(req, res, next);
  next();
};

const validateRegister = [
  body('email')
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail()
    .custom((value) => {
      const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';
      if (!value.endsWith(`@${domain}`)) {
        throw new Error(`Only @${domain} email addresses are allowed`);
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage(
      'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    ),
  body('fullName')
    .notEmpty()
    .withMessage('Full name is required')
    .trim()
    .escape(),
];

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new alumni account
 *     tags: [Authentication]
 *     description: >
 *       Registers a new user with a university email address.
 *       Sends a verification email. User cannot log in until email is verified.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@eastminster.ac.uk
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: SecurePass1!
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: Registration successful, verification email sent
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
 *                   example: Registration successful. Please verify your email.
 *       400:
 *         description: Validation error (invalid email, weak password, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       message:
 *                         type: string
 *       409:
 *         description: Email already registered
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
 *                   example: An account with this email already exists
 *       429:
 *         description: Too many requests (rate limit exceeded)
 */
router.post('/register', authLimiter, csrfProtect, validateRegister, authController.register);

/**
 * @swagger
 * /api/auth/verify/{token}:
 *   get:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     description: >
 *       Verifies the user's email address using the single-use token
 *       sent to their email on registration. Token expires after 24 hours.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token (64-char hex string)
 *         example: a3f8c2e1d0b4...
 *     responses:
 *       200:
 *         description: Email verified successfully
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
 *                   example: Email verified successfully. You can now log in.
 *       400:
 *         description: Invalid or expired verification token
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
 *                   example: Invalid or expired verification token
 */
router.get('/verify/:token', authController.verifyEmail);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in and receive a JWT
 *     tags: [Authentication]
 *     description: >
 *       Authenticates a user with email and password.
 *       Returns a JWT (valid for 7 days) for use in Authorization headers.
 *       User must have verified their email before logging in.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@eastminster.ac.uk
 *               password:
 *                 type: string
 *                 example: SecurePass1!
 *     responses:
 *       200:
 *         description: Login successful, JWT returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   description: JWT access token (use in Authorization Bearer header)
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Invalid credentials or email not verified
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
 *                   example: Invalid credentials or email not verified
 *       429:
 *         description: Too many login attempts (rate limit exceeded)
 */
router.post('/login', authLimiter, csrfProtect, validateLogin, authController.login);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Authentication]
 *     description: >
 *       Sends a password reset link to the provided email address.
 *       Always returns 200 regardless of whether the email exists
 *       (to prevent email enumeration attacks).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@eastminster.ac.uk
 *     responses:
 *       200:
 *         description: Reset link sent (or silently not sent if email not found)
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
 *                   example: If that email exists, a reset link has been sent.
 *       429:
 *         description: Too many requests (rate limit exceeded)
 */
router.post('/forgot-password', authLimiter, csrfProtect, authController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password using a reset token
 *     tags: [Authentication]
 *     description: >
 *       Sets a new password using the reset token received by email.
 *       Token is single-use and expires after 1 hour.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token (64-char hex string)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: New password (must meet strength requirements)
 *                 example: NewSecurePass1!
 *     responses:
 *       200:
 *         description: Password reset successfully
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
 *                   example: Password reset successfully.
 *       400:
 *         description: Invalid or expired reset token, or weak password
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
 */
router.post('/reset-password/:token', authLimiter, csrfProtect, authController.resetPassword);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out the authenticated user
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Acknowledges logout server-side. Because this API uses stateless JWT tokens
 *       (no server-side sessions), the client is responsible for discarding the token.
 *       This endpoint confirms the token is valid at the time of logout.
 *     responses:
 *       200:
 *         description: Logged out successfully
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
 *                   example: Logged out successfully. Please discard your token on the client side.
 *       401:
 *         description: Unauthorized — no valid token provided
 */
router.post('/logout', verifyToken, authController.logout);

module.exports = router;
