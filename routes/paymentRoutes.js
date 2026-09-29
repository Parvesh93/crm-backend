const express = require("express");
const {
  createPayment,
  getPayments,
  getEarningsSummary,
  getProjectPaymentSummary,
  deletePayment,
} = require("../controllers/paymentController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizeRoles("super_admin"), getPayments);
router.get("/summary", protect, authorizeRoles("super_admin"), getEarningsSummary);
router.get("/project/:projectId/summary", protect, authorizeRoles("super_admin"), getProjectPaymentSummary);
router.post("/", protect, authorizeRoles("super_admin"), createPayment);
router.delete("/:id", protect, authorizeRoles("super_admin"), deletePayment);

module.exports = router;
