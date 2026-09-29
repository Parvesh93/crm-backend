const Lead = require("../models/Lead");
const Client = require("../models/Client");
const Project = require("../models/Project");

const isSuperAdmin = (req) => req.user?.role === "super_admin";

const populateLead = (query) =>
  query
    .populate("platform", "name slug")
    .populate("owner", "name email role designation")
    .populate("createdBy", "name email")
    .populate("convertedClient", "name company email")
    .populate("convertedProject", "title status budget");

const sanitizeLead = (lead, req) => {
  if (!lead) return lead;

  const data =
    typeof lead.toObject === "function"
      ? lead.toObject()
      : { ...lead };

  if (!isSuperAdmin(req)) {
    delete data.estimatedValue;

    if (data.convertedProject) {
      delete data.convertedProject.budget;
    }
  }

  return data;
};

const sanitizeLeads = (leads, req) =>
  leads.map((lead) => sanitizeLead(lead, req));

const createLead = async (req, res) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      website,
      platform,
      owner,
      source,
      stage,
      estimatedValue,
      probability,
      nextFollowUp,
      lastContactedAt,
      notes,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Lead name is required" });
    }

    const leadData = {
      name,
      company,
      email,
      phone,
      website,
      platform: platform || undefined,
      owner: owner || req.user._id,
      source,
      stage,
      probability,
      nextFollowUp: nextFollowUp || undefined,
      lastContactedAt: lastContactedAt || undefined,
      notes,
      createdBy: req.user._id,
    };

    if (isSuperAdmin(req)) {
      leadData.estimatedValue = Number(estimatedValue || 0);
    }

    const lead = await Lead.create(leadData);

    const populated = await populateLead(Lead.findById(lead._id));

    res.status(201).json({
      message: "Lead created successfully",
      lead: sanitizeLead(populated, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLeads = async (req, res) => {
  try {
    const filter = {};

    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.platform) filter.platform = req.query.platform;
    if (req.query.owner) filter.owner = req.query.owner;

    const leads = await populateLead(
      Lead.find(filter).sort({ nextFollowUp: 1, createdAt: -1 })
    );

    res.status(200).json({
      count: leads.length,
      leads: sanitizeLeads(leads, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLeadById = async (req, res) => {
  try {
    const lead = await populateLead(Lead.findById(req.params.id));

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    res.status(200).json({
      lead: sanitizeLead(lead, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateLead = async (req, res) => {
  try {
    const update = { ...req.body };

    if (isSuperAdmin(req)) {
      if (update.estimatedValue !== undefined) {
        update.estimatedValue = Number(update.estimatedValue || 0);
      }
    } else {
      delete update.estimatedValue;
    }

    const lead = await populateLead(
      Lead.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true,
      })
    );

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    res.status(200).json({
      message: "Lead updated successfully",
      lead: sanitizeLead(lead, req),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    await lead.deleteOne();

    res.status(200).json({ message: "Lead deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPipelineSummary = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      const rows = await Lead.aggregate([
        {
          $group: {
            _id: "$stage",
            count: { $sum: 1 },
          },
        },
      ]);

      const total = rows.reduce(
        (acc, row) => {
          acc.count += row.count;
          return acc;
        },
        { count: 0 }
      );

      return res.status(200).json({
        stages: rows,
        total,
      });
    }

    const rows = await Lead.aggregate([
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 },
          value: { $sum: "$estimatedValue" },
          weightedValue: {
            $sum: {
              $multiply: [
                "$estimatedValue",
                { $divide: ["$probability", 100] },
              ],
            },
          },
        },
      },
    ]);

    const total = rows.reduce(
      (acc, row) => {
        acc.count += row.count;
        acc.value += row.value;
        acc.weightedValue += row.weightedValue;
        return acc;
      },
      { count: 0, value: 0, weightedValue: 0 }
    );

    res.status(200).json({ stages: rows, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const convertLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    if (lead.convertedClient) {
      return res.status(400).json({ message: "Lead has already been converted" });
    }

    const {
      createProject = true,
      projectTitle,
      projectValue,
      teamMembers = [],
      deadline,
      paymentDueDate,
      paymentTerms,
    } = req.body;

    const client = await Client.create({
      name: lead.name,
      company: lead.company,
      email: lead.email || `lead-${lead._id}@placeholder.local`,
      phone: lead.phone,
      website: lead.website,
      platforms: lead.platform ? [lead.platform] : [],
      teamMembers,
      status: "Active",
      notes: lead.notes,
      createdBy: req.user._id,
    });

    let project = null;

    if (createProject) {
      const projectData = {
        client: client._id,
        title: projectTitle || lead.company || `${lead.name} Project`,
        platform: lead.platform || undefined,
        teamMembers,
        startDate: new Date(),
        deadline: deadline || undefined,
        status: "Pending",
        notes: lead.notes,
        createdBy: req.user._id,
      };

      if (isSuperAdmin(req)) {
        projectData.budget = Number(
          projectValue ?? lead.estimatedValue ?? 0
        );
        projectData.paymentDueDate = paymentDueDate || undefined;
        projectData.paymentTerms = paymentTerms;
      }

      project = await Project.create(projectData);
    }

    lead.stage = "Won";
    lead.convertedClient = client._id;
    lead.convertedProject = project?._id;
    await lead.save();

    const populated = await populateLead(Lead.findById(lead._id));

    const responseProject = project
      ? project.toObject()
      : null;

    if (responseProject && !isSuperAdmin(req)) {
      delete responseProject.budget;
      delete responseProject.paymentDueDate;
      delete responseProject.paymentTerms;
    }

    res.status(200).json({
      message: "Lead converted successfully",
      lead: sanitizeLead(populated, req),
      client,
      project: responseProject,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getPipelineSummary,
  convertLead,
};
