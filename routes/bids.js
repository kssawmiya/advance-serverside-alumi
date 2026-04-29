'use strict';

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const bidController = require('../controllers/bidController');

router.use(verifyToken);

const validateAmount = [
  body('amount')
    .notEmpty()
    .withMessage('Bid amount is required')
    .isNumeric()
    .withMessage('Bid amount must be a number')
    .custom((value) => {
      if (Number(value) < 0) {
        throw new Error('Bid amount cannot be negative');
      }
      return true;
    })
    .toFloat(),
];

/**
 * @swagger
 * /api/bids:
 *   post:
 *     summary: Place a blind bid for tomorrow's Alumni of the Day slot
 *     tags: [Blind Bidding]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Places a new bid for tomorrow's Alumni of the Day slot.
 *       **BLIND**: You cannot see other users' bids.
 *       **Date**: Always targets TOMORROW (server-enforced).
 *       **Limit**: Max 3 wins per month (4 if attended event this month).
 *       **One per slot**: Only one active bid per alumni per day.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 example: 150
 *                 description: Your bid amount (blind — no one can see this until winner selection)
 *     responses:
 *       201:
 *         description: Bid placed successfully
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
 *                     bidId:
 *                       type: string
 *                     bidDate:
 *                       type: string
 *                       format: date-time
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized — JWT required
 *       403:
 *         description: Monthly bid limit reached
 *       409:
 *         description: Bid already exists for this date slot
 */
router.post('/', validateAmount, bidController.placeBid);

/**
 * @swagger
 * /api/bids/{id}:
 *   put:
 *     summary: Increase an existing bid (increase-only)
 *     tags: [Blind Bidding]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Updates the amount of an existing active bid.
 *       **INCREASE-ONLY**: New amount must be strictly greater than current amount.
 *       Bids can never be decreased once placed.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bid document _id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 description: New bid amount (must be greater than current bid)
 *                 example: 250
 *     responses:
 *       200:
 *         description: Bid updated successfully
 *       400:
 *         description: New amount not greater than current bid
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Active bid not found
 */
router.put('/:id', validateAmount, bidController.updateBid);

/**
 * @swagger
 * /api/bids/{id}:
 *   delete:
 *     summary: Cancel an active bid
 *     tags: [Blind Bidding]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Cancels an active bid (soft delete — record is kept for audit purposes).
 *       Cancelled bids are excluded from winner selection.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bid document _id
 *     responses:
 *       200:
 *         description: Bid cancelled successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Active bid not found
 */
router.delete('/:id', bidController.cancelBid);

/**
 * @swagger
 * /api/bids/status:
 *   get:
 *     summary: Check current blind bid status for tomorrow
 *     tags: [Blind Bidding]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Returns whether the authenticated user is currently the highest bidder
 *       for tomorrow's Alumni of the Day slot.
 *
 *       **BLIND**: This endpoint does NOT reveal:
 *       - Other users' bid amounts
 *       - The number of competing bids
 *       - How much you need to bid to win
 *
 *       Status values:
 *       - `no_bid`: You haven't placed a bid yet
 *       - `winning`: Your bid is currently the highest
 *       - `not_winning`: One or more bids are higher than yours
 *
 *       Note: `winning` status is not a guarantee — others can raise bids until midnight.
 *     responses:
 *       200:
 *         description: Bid status retrieved
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
 *                     status:
 *                       type: string
 *                       enum: [no_bid, winning, not_winning]
 *                     yourBid:
 *                       type: number
 *                       nullable: true
 *                     bidDate:
 *                       type: string
 *                       format: date-time
 *                     message:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/status', bidController.getBidStatus);

/**
 * @swagger
 * /api/bids/history:
 *   get:
 *     summary: Get bid history for authenticated user
 *     tags: [Blind Bidding]
 *     security:
 *       - BearerAuth: []
 *     description: Returns all bids (active and past) placed by the authenticated user.
 *     responses:
 *       200:
 *         description: Bid history retrieved
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
 *                       amount:
 *                         type: number
 *                       bidDate:
 *                         type: string
 *                         format: date-time
 *                       isActive:
 *                         type: boolean
 *                       isWinner:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/history', bidController.getBidHistory);

/**
 * @swagger
 * /api/bids/monthly-limit:
 *   get:
 *     summary: Get monthly win limit status
 *     tags: [Blind Bidding]
 *     security:
 *       - BearerAuth: []
 *     description: >
 *       Returns the user's monthly win count against their limit.
 *       Standard limit: 3 wins/month. Event attendance bonus: 4 wins/month.
 *     responses:
 *       200:
 *         description: Monthly limit information
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
 *                     used:
 *                       type: number
 *                       example: 1
 *                     limit:
 *                       type: number
 *                       example: 3
 *                     remaining:
 *                       type: number
 *                       example: 2
 *                     eventBonus:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.get('/monthly-limit', bidController.getMonthlyLimit);

module.exports = router;
