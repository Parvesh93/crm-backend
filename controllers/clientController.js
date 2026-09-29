const Client = require("../models/Client");

const createClient = async (req, res) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      website,
      serviceType,
      platforms,
      teamMembers,
      status,
      notes,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Client name and email are required" });
    }

    const client = await Client.create({
      name,
      company,
      email,
      phone,
      website,
      serviceType,
      platforms: platforms || [],
      teamMembers: teamMembers || [],
      status,
      notes,
      createdBy: req.user._id,
    });

    const populatedClient = await Client.findById(client._id)
      .populate("platforms", "name slug")
      .populate("teamMembers", "name email role designation");

    res.status(201).json({ message: "Client created successfully", client: populatedClient });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getClients = async (req, res) => {
  try {
    const filter = {};
    if (req.query.platform) filter.platforms = req.query.platform;
    if (req.query.teamMember) filter.teamMembers = req.query.teamMember;

    const clients = await Client.find(filter)
      .populate("createdBy", "name email role")
      .populate("platforms", "name slug")
      .populate("teamMembers", "name email role designation")
      .sort({ createdAt: -1 });

    res.status(200).json({ count: clients.length, clients });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("platforms", "name slug")
      .populate("teamMembers", "name email role designation");

    if (!client) return res.status(404).json({ message: "Client not found" });

    res.status(200).json({ client });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateClient = async (req, res) => {
  try {
    const updatedClient = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("platforms", "name slug")
      .populate("teamMembers", "name email role designation");

    if (!updatedClient) return res.status(404).json({ message: "Client not found" });

    res.status(200).json({ message: "Client updated successfully", client: updatedClient });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    await client.deleteOne();
    res.status(200).json({ message: "Client deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
};
