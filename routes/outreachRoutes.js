const express = require("express");
const {
  getOutreachStatus,
  runOutreachNow,
  previewLeadEmail,
  previewUpcomingEmails,
  unsubscribeLead,
} = require("../controllers/outreachController");
const {
  protect,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/status",
  protect,
  authorizeRoles("super_admin"),
  getOutreachStatus
);

router.post(
  "/run",
  protect,
  authorizeRoles("super_admin"),
  runOutreachNow
);

router.get(
  "/preview/upcoming",
  protect,
  authorizeRoles("super_admin"),
  previewUpcomingEmails
);

router.get(
  "/preview/:leadId",
  protect,
  authorizeRoles("super_admin"),
  previewLeadEmail
);

router.get("/unsubscribe/:token", unsubscribeLead);

module.exports = router;
