const Client = require("../models/Client");

// CREATE CLIENT
const createClient = async (req, res) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      website,
      serviceType,
      status,
      notes,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: "Client name and email are required",
      });
    }

    const client = await Client.create({
      name,
      company,
      email,
      phone,
      website,
      serviceType,
      status,
      notes,
      createdBy: req.user._id,
    });

    res.status(201).json({
      message: "Client created successfully",
      client,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET ALL CLIENTS
const getClients = async (req, res) => {
  try {
    const clients = await Client.find()
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: clients.length,
      clients,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET SINGLE CLIENT
const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate(
      "createdBy",
      "name email role"
    );

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    res.status(200).json({
      client,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// UPDATE CLIENT
const updateClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      message: "Client updated successfully",
      client: updatedClient,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// DELETE CLIENT
const deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    await client.deleteOne();

    res.status(200).json({
      message: "Client deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
};