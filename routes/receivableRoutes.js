const express = require("express");
const { getReceivables } = require("../controllers/receivableController");
const { protect, authorizePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizePermission("view_earnings"), getReceivables);

module.exports = router;
