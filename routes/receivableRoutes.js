const express = require("express");
const { getReceivables } = require("../controllers/receivableController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizeRoles("super_admin"), getReceivables);

module.exports = router;
