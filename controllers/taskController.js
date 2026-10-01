const Task = require("../models/Task");
const Project = require("../models/Project");
const User = require("../models/User");
const TaskComment = require("../models/TaskComment");
const {
  notifyTaskAssignee,
  notifyBulkTaskAssignment,
} = require("../services/notificationService");

const getAssignee = async (userId) => {
  if (!userId) return null;
  return User.findById(userId).select("name email phone");
};

const formatDate = (value) => {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-IN");
};

const buildUpdateDetail = (before, update) => {
  const changes = [];

  if (
    Object.prototype.hasOwnProperty.call(update, "status") &&
    update.status !== before.status
  ) {
    changes.push(`Status: ${before.status} -> ${update.status}`);
  }

  if (
    Object.prototype.hasOwnProperty.call(update, "priority") &&
    update.priority !== before.priority
  ) {
    changes.push(`Priority: ${before.priority} -> ${update.priority}`);
  }

  if (
    Object.prototype.hasOwnProperty.call(update, "dueDate") &&
    String(update.dueDate || "") !== String(before.dueDate || "")
  ) {
    changes.push(
      `Due date: ${formatDate(before.dueDate)} -> ${formatDate(update.dueDate)}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(update, "title") &&
    update.title !== before.title
  ) {
    changes.push("Task title was updated");
  }

  if (
    Object.prototype.hasOwnProperty.call(update, "description") &&
    update.description !== before.description
  ) {
    changes.push("Task description was updated");
  }

  return changes.join(" | ") || "Task details were updated.";
};

// CREATE TASK
const createTask = async (req, res) => {
  try {
    const {
      project,
      title,
      description,
      priority,
      status,
      dueDate,
      assignedTo,
    } = req.body;

    if (!project || !title) {
      return res.status(400).json({
        message: "Project and title are required",
      });
    }

    const projectExists = await Project.findById(project);

    if (!projectExists) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const task = await Task.create({
      project,
      title,
      description,
      priority,
      status,
      dueDate,
      assignedTo,
      createdBy: req.user._id,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("project", "title")
      .populate("assignedTo", "name email phone")
      .populate("createdBy", "name");

    res.status(201).json({
      message: "Task created successfully",
      task: populatedTask,
    });

    if (populatedTask.assignedTo) {
      notifyTaskAssignee({
        assignee: populatedTask.assignedTo,
        task: populatedTask,
        actor: req.user,
        eventLabel: "Task assigned to you",
        detail: `Project: ${projectExists.title || "Project"}${dueDate ? ` | Due: ${formatDate(dueDate)}` : ""}`,
      }).catch((error) => {
        console.error("Assignment notification error:", error.message);
      });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const createTasksBulk = async (req, res) => {
  try {
    const {
      project,
      tasks,
      priority = "Medium",
      dueDate,
      assignedTo,
    } = req.body;

    if (!project || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        message: "Project and at least one task are required",
      });
    }

    const projectExists = await Project.findById(project);

    if (!projectExists) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const cleanTasks = tasks
      .map((task) => {
        if (typeof task === "string") {
          return { title: task.trim() };
        }

        return {
          title: String(task.title || "").trim(),
          description: task.description || "",
        };
      })
      .filter((task) => task.title);

    if (cleanTasks.length === 0) {
      return res.status(400).json({
        message: "Please add at least one valid task",
      });
    }

    if (cleanTasks.length > 100) {
      return res.status(400).json({
        message: "You can create up to 100 tasks at one time",
      });
    }

    const docs = cleanTasks.map((task) => ({
      project,
      title: task.title,
      description: task.description,
      priority,
      status: "Pending",
      dueDate: dueDate || undefined,
      assignedTo: assignedTo || undefined,
      createdBy: req.user._id,
    }));

    const createdTasks = await Task.insertMany(docs);

    res.status(201).json({
      message: `${createdTasks.length} tasks created successfully`,
      count: createdTasks.length,
      tasks: createdTasks,
    });

    if (assignedTo) {
      const assignee = await getAssignee(assignedTo);

      notifyBulkTaskAssignment({
        assignee,
        tasks: createdTasks,
        actor: req.user,
        projectTitle: projectExists.title,
      }).catch((error) => {
        console.error("Bulk assignment notification error:", error.message);
      });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET ALL TASKS
const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate({
        path: "project",
        select: "title client",
        populate: {
          path: "client",
          select: "name company",
        },
      })
      .populate("assignedTo", "name email phone")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    const validTasks = tasks.filter((task) => task.project);

    res.status(200).json({
      count: validTasks.length,
      tasks: validTasks,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET SINGLE TASK
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("project", "title")
      .populate("assignedTo", "name email phone")
      .populate("createdBy", "name");

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.status(200).json({
      task,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET TASKS BY PROJECT
const getTasksByProject = async (req, res) => {
  try {
    const tasks = await Task.find({
      project: req.params.projectId,
    })
      .populate("assignedTo", "name email phone")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// UPDATE TASK
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const oldAssigneeId = task.assignedTo
      ? String(task.assignedTo)
      : null;

    const update = { ...req.body };

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      update,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("project", "title")
      .populate("assignedTo", "name email phone")
      .populate("createdBy", "name");

    res.status(200).json({
      message: "Task updated successfully",
      task: updatedTask,
    });

    const newAssigneeId = updatedTask.assignedTo?._id
      ? String(updatedTask.assignedTo._id)
      : null;

    if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
      notifyTaskAssignee({
        assignee: updatedTask.assignedTo,
        task: updatedTask,
        actor: req.user,
        eventLabel: "Task assigned to you",
        detail: `Project: ${updatedTask.project?.title || "Project"}${updatedTask.dueDate ? ` | Due: ${formatDate(updatedTask.dueDate)}` : ""}`,
      }).catch((error) => {
        console.error("Reassignment notification error:", error.message);
      });

      return;
    }

    if (updatedTask.assignedTo) {
      const detail = buildUpdateDetail(task, update);

      notifyTaskAssignee({
        assignee: updatedTask.assignedTo,
        task: updatedTask,
        actor: req.user,
        eventLabel: "Task updated",
        detail,
      }).catch((error) => {
        console.error("Task update notification error:", error.message);
      });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const cleanupOrphanTasks = async (req, res) => {
  try {
    const tasks = await Task.find().select("_id project");
    const projectIds = [
      ...new Set(
        tasks
          .map((task) => task.project && String(task.project))
          .filter(Boolean)
      ),
    ];

    const existingProjects = await Project.find({
      _id: { $in: projectIds },
    }).select("_id");

    const existingProjectIds = new Set(
      existingProjects.map((project) => String(project._id))
    );

    const orphanTaskIds = tasks
      .filter(
        (task) =>
          !task.project ||
          !existingProjectIds.has(String(task.project))
      )
      .map((task) => task._id);

    if (orphanTaskIds.length > 0) {
      await TaskComment.deleteMany({
        task: { $in: orphanTaskIds },
      });

      await Task.deleteMany({
        _id: { $in: orphanTaskIds },
      });
    }

    res.status(200).json({
      message: "Orphan task cleanup completed",
      deletedTasks: orphanTaskIds.length,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// DELETE TASK
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    await TaskComment.deleteMany({ task: task._id });
    await task.deleteOne();

    res.status(200).json({
      message: "Task and comments deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createTask,
  createTasksBulk,
  getTasks,
  getTaskById,
  getTasksByProject,
  updateTask,
  cleanupOrphanTasks,
  deleteTask,
};
