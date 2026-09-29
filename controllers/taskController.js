const Task = require("../models/Task");
const Project = require("../models/Project");

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

    res.status(201).json({
      message: "Task created successfully",
      task,
    });
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
  .populate("assignedTo", "name email")
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

// GET SINGLE TASK
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("project", "title")
      .populate("assignedTo", "name email")
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
    }).sort({ createdAt: -1 });

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

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      message: "Task updated successfully",
      task: updatedTask,
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

    await task.deleteOne();

    res.status(200).json({
      message: "Task deleted successfully",
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
  deleteTask,
};