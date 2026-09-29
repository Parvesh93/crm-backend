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
      projectValueData,
      revenueData,
    ] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: "Active" }),
      Client.countDocuments({ status: "Lead" }),
      Client.countDocuments({ status: "Completed" }),
      Project.countDocuments(),
      Project.countDocuments({ status: "In Progress" }),
      Project.countDocuments({ status: "Completed" }),
      Project.aggregate([
        { $group: { _id: null, totalProjectValue: { $sum: "$budget" } } },
      ]),
      Payment.aggregate([
        { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
      ]),
    ]);

    const totalProjectValue = projectValueData[0]?.totalProjectValue || 0;
    const totalRevenue = revenueData[0]?.totalRevenue || 0;
    const totalOutstanding = Math.max(0, totalProjectValue - totalRevenue);

    res.status(200).json({
      totalClients,
      activeClients,
      leadClients,
      completedClients,
      totalProjects,
      activeProjects,
      completedProjects,
      totalProjectValue,
      totalRevenue,
      totalOutstanding,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
