const express = require("express");

const { protect } = require("../middleware/authMiddleware");

const {
  getDashboardStats,
} = require("../controllers/dashboardController");

const router = express.Router();

router.get("/stats", protect, getDashboardStats);

module.exports = router;