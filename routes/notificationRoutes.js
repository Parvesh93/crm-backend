const express = require("express");
const { testEmail } = require("../controllers/notificationController");
const {
  protect,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/test-email",
  protect,
  authorizeRoles("super_admin"),
  testEmail
);

module.exports = router;
