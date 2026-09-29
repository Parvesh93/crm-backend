const Client = require("../models/Client");
const Project = require("../models/Project");
const Payment = require("../models/Payment");

const getDashboardStats = async (req, res) => {
  try {
    const [
      totalClients,
      activeClients,
      leadClients,
      completedClients,
      totalProjects,
      activeProjects,
      completedProjects,
      revenueData,
    ] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: "Active" }),
      Client.countDocuments({ status: "Lead" }),
      Client.countDocuments({ status: "Completed" }),
      Project.countDocuments(),
      Project.countDocuments({ status: "In Progress" }),
      Project.countDocuments({ status: "Completed" }),
      Payment.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

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
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
