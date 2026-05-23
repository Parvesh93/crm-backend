const express = require("express");

const {
  createTask,
  getTasks,
  getTaskById,
  getTasksByProject,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

const {
  protect,
  authorizeRoles,
  authorizePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorizePermission("manage_tasks"), createTask);

router.get("/", protect, authorizePermission("view_tasks"), getTasks);

router.get("/project/:projectId", protect, authorizePermission("view_tasks"), getTasksByProject);

router.get("/:id", protect, getTaskById);

router.put("/:id", protect, authorizePermission("update_task_status"), updateTask);

router.delete("/:id", protect, authorizePermission("delete_tasks"), deleteTask);

module.exports = router;