const express = require("express");
const {
  createPayment,
  getPayments,
  getEarningsSummary,
  getProjectPaymentSummary,
  deletePayment,
} = require("../controllers/paymentController");
const { protect, authorizePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizePermission("view_earnings"), getPayments);
router.get("/summary", protect, authorizePermission("view_earnings"), getEarningsSummary);
router.get("/project/:projectId/summary", protect, authorizePermission("view_earnings"), getProjectPaymentSummary);
router.post("/", protect, authorizePermission("manage_payments"), createPayment);
router.delete("/:id", protect, authorizePermission("manage_payments"), deletePayment);

module.exports = router;
