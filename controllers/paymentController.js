const Payment = require("../models/Payment");
const Project = require("../models/Project");
const Platform = require("../models/Platform");

const populatePayment = (query) =>
  query
    .populate("project", "title budget status")
    .populate("client", "name company")
    .populate("platform", "name slug")
    .populate("allocations.user", "name email designation role")
    .populate("createdBy", "name email role");

const createPayment = async (req, res) => {
  try {
    const {
      project,
      amount,
      paymentDate,
      paymentMode,
      reference,
      notes,
      allocations = [],
    } = req.body;

    if (!project || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Project and a valid payment amount are required" });
    }

    const projectDoc = await Project.findById(project);
    if (!projectDoc) return res.status(404).json({ message: "Project not found" });
    if (!projectDoc.platform) {
      return res.status(400).json({ message: "Assign a platform to this project before recording a payment" });
    }

    let cleanedAllocations = allocations
      .filter((item) => item.user && Number(item.amount) > 0)
      .map((item) => ({ user: item.user, amount: Number(item.amount) }));

    if (cleanedAllocations.length === 0) {
      const platformDoc = await Platform.findById(projectDoc.platform);

      if (platformDoc?.defaultAllocations?.length) {
        cleanedAllocations = platformDoc.defaultAllocations
          .filter((item) => item.user && Number(item.percentage) > 0)
          .map((item) => ({
            user: item.user,
            amount: Number(
              ((Number(amount) * Number(item.percentage)) / 100).toFixed(2)
            ),
          }));
      }
    }

    const allocatedTotal = cleanedAllocations.reduce((sum, item) => sum + item.amount, 0);
    if (allocatedTotal > Number(amount) + 0.01) {
      return res.status(400).json({ message: "Team allocation cannot exceed the payment amount" });
    }

    const payment = await Payment.create({
      project: projectDoc._id,
      client: projectDoc.client,
      platform: projectDoc.platform,
      amount: Number(amount),
      paymentDate: paymentDate || new Date(),
      paymentMode,
      reference,
      notes,
      allocations: cleanedAllocations,
      createdBy: req.user._id,
    });

    const populated = await populatePayment(Payment.findById(payment._id));
    res.status(201).json({ message: "Payment recorded successfully", payment: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPayments = async (req, res) => {
  try {
    const filter = {};

    if (req.query.platform) filter.platform = req.query.platform;
    if (req.query.project) filter.project = req.query.project;
    if (req.query.client) filter.client = req.query.client;
    if (req.query.teamMember) filter["allocations.user"] = req.query.teamMember;

    if (req.query.from || req.query.to) {
      filter.paymentDate = {};
      if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
      if (req.query.to) {
        const end = new Date(req.query.to);
        end.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = end;
      }
    }

    const payments = await populatePayment(
      Payment.find(filter).sort({ paymentDate: -1, createdAt: -1 })
    );

    res.status(200).json({ count: payments.length, payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getEarningsSummary = async (req, res) => {
  try {
    const match = {};

    if (req.query.platform) match.platform = req.query.platform;
    if (req.query.from || req.query.to) {
      match.paymentDate = {};
      if (req.query.from) match.paymentDate.$gte = new Date(req.query.from);
      if (req.query.to) {
        const end = new Date(req.query.to);
        end.setHours(23, 59, 59, 999);
        match.paymentDate.$lte = end;
      }
    }

    const [totals, byPlatform, byTeam] = await Promise.all([
      Payment.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalReceived: { $sum: "$amount" },
            totalAllocated: {
              $sum: {
                $reduce: {
                  input: "$allocations",
                  initialValue: 0,
                  in: { $add: ["$$value", "$$this.amount"] },
                },
              },
            },
            paymentCount: { $sum: 1 },
          },
        },
      ]),
      Payment.aggregate([
        { $match: match },
        { $group: { _id: "$platform", amount: { $sum: "$amount" }, payments: { $sum: 1 } } },
        { $lookup: { from: "platforms", localField: "_id", foreignField: "_id", as: "platform" } },
        { $unwind: "$platform" },
        { $project: { _id: 1, amount: 1, payments: 1, name: "$platform.name" } },
        { $sort: { amount: -1 } },
      ]),
      Payment.aggregate([
        { $match: match },
        { $unwind: "$allocations" },
        {
          $group: {
            _id: "$allocations.user",
            amount: { $sum: "$allocations.amount" },
            payments: { $sum: 1 },
          },
        },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        {
          $project: {
            _id: 1,
            amount: 1,
            payments: 1,
            name: "$user.name",
            designation: "$user.designation",
            role: "$user.role",
          },
        },
        { $sort: { amount: -1 } },
      ]),
    ]);

    const summary = totals[0] || { totalReceived: 0, totalAllocated: 0, paymentCount: 0 };

    res.status(200).json({
      ...summary,
      unallocated: Math.max(0, summary.totalReceived - summary.totalAllocated),
      byPlatform,
      byTeam,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    await payment.deleteOne();
    res.status(200).json({ message: "Payment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createPayment,
  getPayments,
  getEarningsSummary,
  deletePayment,
};
