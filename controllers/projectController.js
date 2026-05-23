const Project = require("../models/Project");
const Client = require("../models/Client");

// CREATE PROJECT
const createProject = async (req, res) => {
  try {
    const {
      client,
      title,
      type,
      budget,
      startDate,
      deadline,
      status,
      notes,
    } = req.body;

    if (!client || !title) {
      return res.status(400).json({
        message: "Client and project title are required",
      });
    }

    const clientExists = await Client.findById(client);

    if (!clientExists) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    const project = await Project.create({
      client,
      title,
      type,
      budget,
      startDate,
      deadline,
      status,
      notes,
      createdBy: req.user._id,
    });

    res.status(201).json({
      message: "Project created successfully",
      project,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET ALL PROJECTS
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate("client", "name company email")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: projects.length,
      projects,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET SINGLE PROJECT
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("client", "name company email phone website")
      .populate("createdBy", "name email role");

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    res.status(200).json({
      project,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET PROJECTS BY CLIENT
const getProjectsByClient = async (req, res) => {
  try {
    const projects = await Project.find({
      client: req.params.clientId,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      count: projects.length,
      projects,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// UPDATE PROJECT
const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      message: "Project updated successfully",
      project: updatedProject,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// DELETE PROJECT
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    await project.deleteOne();

    res.status(200).json({
      message: "Project deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  getProjectsByClient,
  updateProject,
  deleteProject,
};