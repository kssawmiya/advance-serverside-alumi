'use strict';

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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        imgSrc: ["'self'", 'data:', 'blob:'],

        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],

        styleSrc: ["'self'", "'unsafe-inline'"],

        connectSrc: ["'self'"],
      },
    },
  })
);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

app.use(
  cors({
    origin: (origin, callback) => {

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

app.use(express.json({ limit: '10kb' }));

app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from POST /api/auth/login',
        },

        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API Key generated via POST /api/developer/keys',
        },
      },
    },
  },

  apis: [path.join(__dirname, 'routes', '*.js')],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use((req, res, next) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = csrfToken;
  res.cookie('_csrf', csrfToken, {
    httpOnly: false,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000,
  });
  next();
});

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

app.locals.validateCsrf = validateCsrf;

const { generalLimiter } = require('./middleware/rateLimiter');

app.use(generalLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/developer', require('./routes/developer'));
app.use('/api/v1', require('./routes/api'));

app.use('/api/analytics', require('./routes/analytics'));

const domain = process.env.UNIVERSITY_DOMAIN || 'eastminster.ac.uk';

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

app.get('/register', (req, res) => {
  res.render('register', { domain });
});

app.get('/login', (req, res) => {
  res.render('login', { domain });
});

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { domain });
});

app.get('/reset-password/:token', (req, res) => {
  res.render('reset-password', { domain, token: req.params.token });
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard', { domain });
});

app.get('/bid', (req, res) => {
  res.render('bid', { domain });
});

app.get('/university/login', (req, res) => {
  res.render('university/login', { domain });
});

app.get('/university/register', (req, res) => {
  res.render('university/register', { domain });
});

app.get('/university/forgot-password', (req, res) => {
  res.render('university/forgot-password', { domain });
});

app.get('/university/reset-password/:token', (req, res) => {
  res.render('university/reset-password', { domain, token: req.params.token });
});

app.get('/university/dashboard', (req, res) => {
  res.render('university/dashboard', { domain });
});

app.get('/university/alumni', (req, res) => {
  res.render('university/alumni', { domain });
});

app.get('/university/usage', (req, res) => {
  res.render('university/usage', { domain });
});

app.get('/university', (req, res) => {
  res.redirect('/university/dashboard');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err.stack || err.message);

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

  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      error: 'CORS: Origin not allowed',
    });
  }

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
