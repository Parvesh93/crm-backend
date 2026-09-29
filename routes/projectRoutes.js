const express = require("express");

const {
  createProject,
  getProjects,
  getProjectById,
  getProjectsByClient,
  updateProject,
  deleteProject,
} = require("../controllers/projectController");

const { protect, authorizePermission } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorizePermission("manage_projects"), createProject);
router.get("/", protect, authorizePermission("view_projects"), getProjects);
router.get("/client/:clientId", protect, authorizePermission("view_projects"), getProjectsByClient);
router.get("/:id", protect, authorizePermission("view_projects"), getProjectById);
router.put("/:id", protect, authorizePermission("manage_projects"), updateProject);
router.delete("/:id", protect, authorizePermission("delete_projects"), deleteProject);

module.exports = router;
