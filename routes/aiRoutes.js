const express = require("express");

const {
  generateTasks,
  generateProjectSummary,
} = require("../controllers/aiController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/generate-tasks",
  protect,
  authorizeRoles("admin", "team"),
  generateTasks
);

router.post(
  "/project-summary",
  protect,
  authorizeRoles("admin", "team"),
  generateProjectSummary
);

module.exports = router;