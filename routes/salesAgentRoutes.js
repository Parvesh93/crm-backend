const express = require("express");
const {
  getStatus,
  runNow,
} = require("../controllers/salesAgentController");
const {
  protect,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, authorizeRoles("super_admin"));
router.get("/status", getStatus);
router.post("/run", runNow);

module.exports = router;
