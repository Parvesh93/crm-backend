const express = require("express");

const {
  createProject,
  getProjects,
  getProjectById,
  getProjectsByClient,
  updateProject,
  deleteProject,
} = require("../controllers/projectController");

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorizeRoles("admin", "team"), createProject);

router.get("/", protect, getProjects);

router.get("/client/:clientId", protect, getProjectsByClient);

router.get("/:id", protect, getProjectById);

router.put("/:id", protect, authorizeRoles("admin", "team"), updateProject);

router.delete("/:id", protect, authorizeRoles("admin"), deleteProject);

module.exports = router;