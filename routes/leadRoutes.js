const express = require("express");
const {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getPipelineSummary,
  convertLead,
} = require("../controllers/leadController");
const { protect, authorizePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizePermission("view_leads"), getLeads);
router.get("/summary", protect, authorizePermission("view_leads"), getPipelineSummary);
router.get("/:id", protect, authorizePermission("view_leads"), getLeadById);
router.post("/", protect, authorizePermission("manage_leads"), createLead);
router.put("/:id", protect, authorizePermission("manage_leads"), updateLead);
router.post("/:id/convert", protect, authorizePermission("manage_leads"), convertLead);
router.delete("/:id", protect, authorizePermission("manage_leads"), deleteLead);

module.exports = router;
