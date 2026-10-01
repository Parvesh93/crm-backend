const express = require("express");

const {
  createTask,
  createTasksBulk,
  getTasks,
  getTaskById,
  getTasksByProject,
  updateTask,
  cleanupOrphanTasks,
  deleteTask,
} = require("../controllers/taskController");

const {
  getTaskComments,
  addTaskComment,
} = require("../controllers/taskCommentController");

const {
  protect,
  authorizeRoles,
  authorizePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, authorizePermission("manage_tasks"), createTask);
router.post("/bulk", protect, authorizePermission("manage_tasks"), createTasksBulk);

router.get("/", protect, authorizePermission("view_tasks"), getTasks);
router.delete("/cleanup/orphans", protect, authorizeRoles("super_admin"), cleanupOrphanTasks);

router.get("/project/:projectId", protect, authorizePermission("view_tasks"), getTasksByProject);

router.get(
  "/:taskId/comments",
  protect,
  authorizePermission("view_tasks"),
  getTaskComments
);

router.post(
  "/:taskId/comments",
  protect,
  authorizePermission("view_tasks"),
  addTaskComment
);

router.get("/:id", protect, getTaskById);

router.put("/:id", protect, authorizePermission("update_task_status"), updateTask);

router.delete("/:id", protect, authorizePermission("delete_tasks"), deleteTask);

module.exports = router;