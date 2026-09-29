const Task = require("../models/Task");
const TaskComment = require("../models/TaskComment");
const { notifyTaskAssignee } = require("../services/notificationService");

const getTaskComments = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const comments = await TaskComment.find({
      task: req.params.taskId,
    })
      .populate("createdBy", "name email role designation")
      .sort({ createdAt: 1 });

    res.status(200).json({
      count: comments.length,
      comments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addTaskComment = async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        message: "Comment cannot be empty",
      });
    }

    const task = await Task.findById(req.params.taskId)
      .populate("assignedTo", "name email phone")
      .populate("project", "title");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const comment = await TaskComment.create({
      task: task._id,
      message,
      createdBy: req.user._id,
    });

    const populatedComment = await TaskComment.findById(comment._id)
      .populate("createdBy", "name email role designation");

    res.status(201).json({
      message: "Comment added successfully",
      comment: populatedComment,
    });

    notifyTaskAssignee({
      assignee: task.assignedTo,
      task,
      actor: req.user,
      eventLabel: "New comment",
      detail: message,
    }).catch((error) => {
      console.error("Comment notification error:", error.message);
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTaskComments,
  addTaskComment,
};
