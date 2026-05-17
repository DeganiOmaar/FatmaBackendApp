const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const paymentController = require("../controllers/paymentController");

router.post("/create-intent", requireAuth, paymentController.createPaymentIntent);
router.post("/wallet/topup-intent", requireAuth, paymentController.createWalletTopUpIntent);
router.post("/wallet/confirm-topup", requireAuth, paymentController.confirmWalletTopUp);
router.post("/release-payment", paymentController.releasePayment);

module.exports = router;