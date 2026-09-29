const Project = require("../models/Project");
const Payment = require("../models/Payment");

const getReceivables = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate("client", "name company email phone")
      .populate("platform", "name slug")
      .sort({ paymentDueDate: 1, createdAt: -1 });

    const paymentTotals = await Payment.aggregate([
      {
        $group: {
          _id: "$project",
          received: { $sum: "$amount" },
          lastPaymentDate: { $max: "$paymentDate" },
          paymentCount: { $sum: 1 },
        },
      },
    ]);

    const totalsMap = new Map(
      paymentTotals.map((item) => [String(item._id), item])
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const receivables = projects
      .map((project) => {
        const payment = totalsMap.get(String(project._id));
        const projectValue = Number(project.budget || 0);
        const received = Number(payment?.received || 0);
        const outstanding = Math.max(0, projectValue - received);

        let overdueDays = 0;
        let paymentStatus = "Pending";

        if (outstanding <= 0) {
          paymentStatus = "Paid";
        } else if (project.paymentDueDate) {
          const dueDate = new Date(project.paymentDueDate);
          dueDate.setHours(0, 0, 0, 0);

          if (dueDate < today) {
            paymentStatus = "Overdue";
            overdueDays = Math.floor(
              (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            );
          } else {
            paymentStatus = received > 0 ? "Partially Paid" : "Pending";
          }
        } else {
          paymentStatus = received > 0 ? "Partially Paid" : "Pending";
        }

        return {
          _id: project._id,
          title: project.title,
          client: project.client,
          platform: project.platform,
          status: project.status,
          projectValue,
          received,
          outstanding,
          paymentDueDate: project.paymentDueDate,
          paymentTerms: project.paymentTerms,
          paymentStatus,
          overdueDays,
          lastPaymentDate: payment?.lastPaymentDate || null,
          paymentCount: payment?.paymentCount || 0,
        };
      })
      .filter((item) => item.projectValue > 0 || item.received > 0);

    const outstandingProjects = receivables.filter(
      (item) => item.outstanding > 0
    );

    const summary = {
      totalProjectValue: receivables.reduce(
        (sum, item) => sum + item.projectValue,
        0
      ),
      totalReceived: receivables.reduce(
        (sum, item) => sum + item.received,
        0
      ),
      totalOutstanding: outstandingProjects.reduce(
        (sum, item) => sum + item.outstanding,
        0
      ),
      overdueAmount: outstandingProjects
        .filter((item) => item.paymentStatus === "Overdue")
        .reduce((sum, item) => sum + item.outstanding, 0),
      overdueCount: outstandingProjects.filter(
        (item) => item.paymentStatus === "Overdue"
      ).length,
      outstandingCount: outstandingProjects.length,
    };

    res.status(200).json({
      summary,
      receivables,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getReceivables,
};
