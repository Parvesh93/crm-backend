const Lead = require("../models/Lead");
const Client = require("../models/Client");
const Project = require("../models/Project");

const populateLead = (query) =>
  query
    .populate("platform", "name slug")
    .populate("owner", "name email role designation")
    .populate("createdBy", "name email")
    .populate("convertedClient", "name company email")
    .populate("convertedProject", "title status budget");

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

    const lead = await Lead.create({
      name,
      company,
      email,
      phone,
      website,
      platform: platform || undefined,
      owner: owner || req.user._id,
      source,
      stage,
      estimatedValue: Number(estimatedValue || 0),
      probability,
      nextFollowUp: nextFollowUp || undefined,
      lastContactedAt: lastContactedAt || undefined,
      notes,
      createdBy: req.user._id,
    });

    const populated = await populateLead(Lead.findById(lead._id));
    res.status(201).json({ message: "Lead created successfully", lead: populated });
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

    res.status(200).json({ count: leads.length, leads });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLeadById = async (req, res) => {
  try {
    const lead = await populateLead(Lead.findById(req.params.id));
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.status(200).json({ lead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateLead = async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.estimatedValue !== undefined) {
      update.estimatedValue = Number(update.estimatedValue || 0);
    }

    const lead = await populateLead(
      Lead.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true,
      })
    );

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    res.status(200).json({ message: "Lead updated successfully", lead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    await lead.deleteOne();
    res.status(200).json({ message: "Lead deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPipelineSummary = async (req, res) => {
  try {
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
    if (!lead) return res.status(404).json({ message: "Lead not found" });

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
      project = await Project.create({
        client: client._id,
        title: projectTitle || lead.company || `${lead.name} Project`,
        platform: lead.platform || undefined,
        teamMembers,
        budget: Number(projectValue ?? lead.estimatedValue ?? 0),
        startDate: new Date(),
        deadline: deadline || undefined,
        paymentDueDate: paymentDueDate || undefined,
        paymentTerms,
        status: "Pending",
        notes: lead.notes,
        createdBy: req.user._id,
      });
    }

    lead.stage = "Won";
    lead.convertedClient = client._id;
    lead.convertedProject = project?._id;
    await lead.save();

    const populated = await populateLead(Lead.findById(lead._id));

    res.status(200).json({
      message: "Lead converted successfully",
      lead: populated,
      client,
      project,
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
