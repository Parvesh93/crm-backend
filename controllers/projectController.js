const Project = require("../models/Project");
const Client = require("../models/Client");
const Task = require("../models/Task");
const TaskComment = require("../models/TaskComment");

const isSuperAdmin = (req) => req.user?.role === "super_admin";

const sanitizeProject = (project, req) => {
  if (!project) return project;

  const data =
    typeof project.toObject === "function"
      ? project.toObject()
      : { ...project };

  if (!isSuperAdmin(req)) {
    delete data.budget;
    delete data.paymentDueDate;
    delete data.paymentTerms;
  }

  return data;
};

const sanitizeProjects = (projects, req) =>
  projects.map((project) => sanitizeProject(project, req));

const createProject = async (req, res) => {
  try {
    const {
      client,
      title,
      type,
      platform,
      teamMembers,
      budget,
      startDate,
      deadline,
      paymentDueDate,
      paymentTerms,
      status,
      notes,
    } = req.body;

    if (!client || !title) {
      return res.status(400).json({ message: "Client and project title are required" });
    }

    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(404).json({ message: "Client not found" });
    }

    const projectData = {
      client,
      title,
      type,
      platform: platform || undefined,
      teamMembers: teamMembers || [],
      startDate,
      deadline,
      status,
      notes,
      createdBy: req.user._id,
    };

    if (isSuperAdmin(req)) {
      projectData.budget = Number(budget || 0);
      projectData.paymentDueDate = paymentDueDate || undefined;
      projectData.paymentTerms = paymentTerms;
    }

    const project = await Project.create(projectData);

    const populatedProject = await Project.findById(project._id)
      .populate("client", "name company email")
      .populate("platform", "name slug")
      .populate("teamMembers", "name email role designation")
      .populate("createdBy", "name email role");

    res.status(201).json({
      message: "Project created successfully",
      project: sanitizeProject(populatedProject, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProjects = async (req, res) => {
  try {
    const filter = {};
    if (req.query.platform) filter.platform = req.query.platform;
    if (req.query.teamMember) filter.teamMembers = req.query.teamMember;

    const projects = await Project.find(filter)
      .populate("client", "name company email")
      .populate("platform", "name slug")
      .populate("teamMembers", "name email role designation")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: projects.length,
      projects: sanitizeProjects(projects, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("client", "name company email phone website")
      .populate("platform", "name slug")
      .populate("teamMembers", "name email role designation")
      .populate("createdBy", "name email role");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.status(200).json({
      project: sanitizeProject(project, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProjectsByClient = async (req, res) => {
  try {
    const projects = await Project.find({ client: req.params.clientId })
      .populate("platform", "name slug")
      .populate("teamMembers", "name email role designation")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: projects.length,
      projects: sanitizeProjects(projects, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProject = async (req, res) => {
  try {
    const update = { ...req.body };

    if (!isSuperAdmin(req)) {
      delete update.budget;
      delete update.paymentDueDate;
      delete update.paymentTerms;
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      update,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("client", "name company email")
      .populate("platform", "name slug")
      .populate("teamMembers", "name email role designation")
      .populate("createdBy", "name email role");

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.status(200).json({
      message: "Project updated successfully",
      project: sanitizeProject(updatedProject, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const tasks = await Task.find({ project: project._id }).select("_id");
    const taskIds = tasks.map((task) => task._id);

    if (taskIds.length > 0) {
      await TaskComment.deleteMany({
        task: { $in: taskIds },
      });

      await Task.deleteMany({
        _id: { $in: taskIds },
      });
    }

    await project.deleteOne();

    res.status(200).json({
      message: "Project and associated tasks deleted successfully",
      deletedTasks: taskIds.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
