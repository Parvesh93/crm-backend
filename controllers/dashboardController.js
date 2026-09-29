const Client = require("../models/Client");
const Project = require("../models/Project");
const Payment = require("../models/Payment");
const Task = require("../models/Task");
const Lead = require("../models/Lead");

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
      openTasks,
      completedTasks,
      recentProjects,
      recentPayments,
      openLeads,
      pipelineValueData,
      followUpsToday,
      overdueFollowUps,
      recentLeads,
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
      Task.countDocuments({ status: { $ne: "Completed" } }),
      Task.countDocuments({ status: "Completed" }),
      Project.find()
        .populate("client", "name company")
        .populate("platform", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title status budget client platform createdAt"),
      Payment.find()
        .populate("client", "name company")
        .populate("project", "title")
        .sort({ paymentDate: -1, createdAt: -1 })
        .limit(5)
        .select("amount paymentDate client project paymentMode"),
      Lead.countDocuments({ stage: { $nin: ["Won", "Lost"] } }),
      Lead.aggregate([
        { $match: { stage: { $nin: ["Won", "Lost"] } } },
        {
          $group: {
            _id: null,
            pipelineValue: { $sum: "$estimatedValue" },
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
      ]),
      Lead.countDocuments({
        stage: { $nin: ["Won", "Lost"] },
        nextFollowUp: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
      }),
      Lead.countDocuments({
        stage: { $nin: ["Won", "Lost"] },
        nextFollowUp: {
          $lt: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      }),
      Lead.find({ stage: { $nin: ["Won", "Lost"] } })
        .populate("platform", "name")
        .populate("owner", "name")
        .sort({ nextFollowUp: 1, createdAt: -1 })
        .limit(5)
        .select("name company stage estimatedValue probability nextFollowUp platform owner createdAt"),
    ]);

    const totalProjectValue = projectValueData[0]?.totalProjectValue || 0;
    const totalRevenue = revenueData[0]?.totalRevenue || 0;
    const totalOutstanding = Math.max(0, totalProjectValue - totalRevenue);
    const pipelineValue = pipelineValueData[0]?.pipelineValue || 0;
    const weightedPipelineValue = pipelineValueData[0]?.weightedValue || 0;

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
      openTasks,
      completedTasks,
      recentProjects,
      recentPayments,
      openLeads,
      pipelineValue,
      weightedPipelineValue,
      followUpsToday,
      overdueFollowUps,
      recentLeads,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
