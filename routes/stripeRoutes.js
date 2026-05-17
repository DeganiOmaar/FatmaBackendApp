const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');

router.post('/pay', stripeController.processPayment);
router.post('/confirm', stripeController.confirmPayment);

module.exports = router;