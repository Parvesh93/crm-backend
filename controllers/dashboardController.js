const Client = require("../models/Client");
const Project = require("../models/Project");

const getDashboardStats = async (req, res) => {
  try {
    // CLIENT STATS
    const totalClients = await Client.countDocuments();

    const activeClients = await Client.countDocuments({
      status: "Active",
    });

    const leadClients = await Client.countDocuments({
      status: "Lead",
    });

    const completedClients = await Client.countDocuments({
      status: "Completed",
    });

    // PROJECT STATS
    const totalProjects = await Project.countDocuments();

    const activeProjects = await Project.countDocuments({
      status: "In Progress",
    });

    const completedProjects = await Project.countDocuments({
      status: "Completed",
    });

    // TOTAL REVENUE
    const revenueData = await Project.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: "$budget",
          },
        },
      },
    ]);

    const totalRevenue =
      revenueData.length > 0
        ? revenueData[0].totalRevenue
        : 0;

    res.status(200).json({
      totalClients,
      activeClients,
      leadClients,
      completedClients,

      totalProjects,
      activeProjects,
      completedProjects,

      totalRevenue,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
};