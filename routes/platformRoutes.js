const express = require("express");
const { getPlatforms, createPlatform, updatePlatform } = require("../controllers/platformController");
const { protect, authorizePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizePermission("view_platforms"), getPlatforms);
router.post("/", protect, authorizePermission("manage_platforms"), createPlatform);
router.put("/:id", protect, authorizePermission("manage_platforms"), updatePlatform);

module.exports = router;
