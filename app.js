'use strict';

/**
 * @file app.js
 * @description Express application setup and middleware configuration.
 * Exports the configured app for use by server.js.
 * Does NOT start the HTTP server (server.js handles that).
 */

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const Profile = require('./models/Profile');

const app = express();

// ─── 1. Security Middleware (order matters — security first) ──────────────────

/**
 * Helmet sets various HTTP response headers to improve security:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Strict-Transport-Security (HSTS)
 * - X-XSS-Protection
 * - Content-Security-Policy (customised below)
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow images from same origin, data URIs (for base64), and blob URLs (for canvas)
        imgSrc: ["'self'", 'data:', 'blob:'],
        // Allow inline scripts for Swagger UI
        scriptSrc: ["'self'", "'unsafe-inline'"],
        // Allow inline styles for Swagger UI
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

/**
 * CORS configuration:
 * - Only allows origins listed in ALLOWED_ORIGINS (comma-separated in .env)
 * - Allows credentials (for cookie-based auth if ever added)
 * - Restricts methods to what the API actually uses
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

// ─── 2. Body Parsing ──────────────────────────────────────────────────────────

/**
 * Parse JSON request bodies.
 * Limit: 10kb — prevents large payload attacks while allowing normal API usage.
 */
app.use(express.json({ limit: '10kb' }));

/**
 * Parse URL-encoded bodies (for HTML form submissions).
 * extended: true allows parsing of nested objects.
 */
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Parse cookies from incoming requests.
 * Used for CSRF token validation (double-submit cookie pattern).
 */
app.use(cookieParser());

// ─── 3. Static Files ──────────────────────────────────────────────────────────

/**
 * Serve uploaded profile images from the public/uploads directory.
 * Accessible at: GET /uploads/<filename>
 */
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

/**
 * Serve other static files from the public directory.
 */
app.use(express.static(path.join(__dirname, 'public')));

// ─── 4. View Engine ───────────────────────────────────────────────────────────

/**
 * Set EJS as the view engine for server-side rendered pages (landing page only).
 * Most of this application is API-first — EJS is used minimally.
 */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── 5. Swagger API Documentation ────────────────────────────────────────────

/**
 * Swagger/OpenAPI 3.0 configuration.
 * Documentation is auto-generated from JSDoc comments in route files.
 * Available at: GET /api-docs
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alumni Influencers API',
      version: '1.0.0',
      description:
        'Alumni Management & Blind Bidding System.' +
        'All protected routes require a Bearer JWT token. ' +
        'Public API routes (/api/v1/*) require a Bearer API key.',
      contact: {
        name: 'API Support',
        email: 'support@eastminster.ac.uk',
      },
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:3000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        /**
         * BearerAuth: Used for authenticated alumni and developer routes.
         * Obtain via POST /api/auth/login.
         * Include in header: Authorization: Bearer <jwt-token>
         */
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from POST /api/auth/login',
        },
        /**
         * ApiKeyAuth: Used for public developer API routes (/api/v1/*).
         * Generate via POST /api/developer/keys.
         * Include in header: Authorization: Bearer <api-key>
         */
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API Key generated via POST /api/developer/keys',
        },
      },
    },
  },
  // Scan all route files for @swagger JSDoc comments
  apis: [path.join(__dirname, 'routes', '*.js')],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Mount Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }', // Hide default Swagger topbar
  swaggerOptions: {
    persistAuthorization: true, // Keep auth token between page refreshes
  },
}));

// Expose raw swagger JSON for external tools
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ─── 6. CSRF Protection ──────────────────────────────────────────────────────

/**
 * CSRF PROTECTION — Double-Submit Cookie Pattern:
 *
 * Although this API uses stateless JWT tokens (which are inherently resistant
 * to traditional CSRF attacks since browsers do not auto-attach Authorization
 * headers), we implement CSRF protection for the server-rendered HTML forms
 * (login, register, forgot-password, reset-password) to provide defence-in-depth
 * and satisfy security audit requirements.
 *
 * How it works:
 * 1. On every page render, a cryptographically random CSRF token is generated.
 * 2. The token is set as a cookie (_csrf) and embedded as a <meta> tag in the page.
 * 3. Client-side JavaScript reads the meta tag and sends it as an X-CSRF-Token header.
 * 4. The server validates that the header matches the cookie (double-submit pattern).
 *
 * This prevents cross-origin attackers from forging requests because:
 * - They cannot read the meta tag (blocked by same-origin policy)
 * - They cannot set custom headers on cross-origin form submissions
 *
 * Reference: OWASP Double Submit Cookie
 * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */
app.use((req, res, next) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = csrfToken;
  res.cookie('_csrf', csrfToken, {
    httpOnly: false,   // JS needs to read meta tag, not cookie directly
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000, // 30 minutes
  });
  next();
});

/**
 * CSRF validation middleware for server-rendered form submissions.
 * Compares the X-CSRF-Token header against the _csrf cookie.
 * Applied to POST routes that are submitted from EJS-rendered pages.
 */
const validateCsrf = (req, res, next) => {
  const tokenFromHeader = req.headers['x-csrf-token'];
  const tokenFromCookie = req.cookies && req.cookies['_csrf'];
  if (!tokenFromHeader || !tokenFromCookie || tokenFromHeader !== tokenFromCookie) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token validation failed. Please refresh the page and try again.',
    });
  }
  next();
};

// Make validateCsrf accessible to route files via app.locals
app.locals.validateCsrf = validateCsrf;

// ─── 7. Routes with Global Rate Limiter ──────────────────────────────────────

const { generalLimiter } = require('./middleware/rateLimiter');

/**
 * Apply general rate limiter globally (200 requests/15 min).
 * More specific limiters (authLimiter, apiLimiter) are applied at route level.
 */
app.use(generalLimiter);

/**
 * Mount route modules.
 * Each module handles its own middleware (auth, validation, specific rate limiting).
 */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/developer', require('./routes/developer'));
app.use('/api/v1', require('./routes/api'));

// ─── 8. Web Application Pages ─────────────────────────────────────────────────

/**
 * Web page routes — serve EJS-rendered HTML pages for the front-end interface.
 * These pages use the REST API via client-side fetch calls.
 * They are server-side rendered (EJS) but are otherwise API-agnostic.
 */

const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';

/** Landing page — also displays Alumni of the Day if one is selected */
app.get('/', async (req, res) => {
  let alumniOfDay = null;
  try {
    alumniOfDay = await Profile.findOne({ isAlumniOfDay: true })
      .select('fullName bio linkedinUrl profileImage degrees certifications licences professionalCourses employmentHistory')
      .lean();
  } catch (err) {
    console.error('[Homepage] Failed to load Alumni of the Day:', err.message);
  }
  res.render('index', {
    apiDocsUrl: '/api-docs',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    domain,
    alumniOfDay,
  });
});

/** Registration page */
app.get('/register', (req, res) => {
  res.render('register', { domain });
});

/** Login page */
app.get('/login', (req, res) => {
  res.render('login', { domain });
});

/** Forgot password page */
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { domain });
});

/**
 * Password reset page.
 * The user arrives here from the link in the password reset email.
 * The token is extracted from the URL and used by the client-side JS
 * to POST the new password to /api/auth/reset-password/:token.
 */
app.get('/reset-password/:token', (req, res) => {
  res.render('reset-password', { domain, token: req.params.token });
});

/**
 * Profile management dashboard.
 * Authentication is handled client-side via localStorage JWT.
 */
app.get('/dashboard', (req, res) => {
  res.render('dashboard', { domain });
});

/**
 * Blind bidding interface.
 * Authentication is handled client-side via localStorage JWT.
 */
app.get('/bid', (req, res) => {
  res.render('bid', { domain });
});

// ─── 9. Health Check Endpoint ────────────────────────────────────────────────

/**
 * GET /health
 * Simple health check endpoint for load balancers, monitoring tools, etc.
 * Returns 200 with current server timestamp.
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── 10. 404 Handler ──────────────────────────────────────────────────────────

/**
 * Catch-all for unmatched routes.
 * Returns 404 JSON instead of the default Express HTML error page.
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── 11. Global Error Handler ─────────────────────────────────────────────────

/**
 * Express error handling middleware (must have 4 parameters: err, req, res, next).
 * Catches errors passed via next(err) from any route or middleware.
 *
 * SECURITY: In production, only returns a generic message (not the stack trace).
 * In development, returns the full error message for debugging.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err.stack || err.message);

  // Handle multer-specific errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum allowed size is 2MB.',
    });
  }

  if (err.message && err.message.includes('Only JPEG and PNG')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Only JPEG and PNG images are allowed.',
    });
  }

  // Handle CORS errors
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      error: 'CORS: Origin not allowed',
    });
  }

  // Generic server error response
  const statusCode = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
});

module.exports = app;
