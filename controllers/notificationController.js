const { testEmailConnection } = require("../services/notificationService");

const testEmail = async (req, res) => {
  try {
    const to = String(req.body.to || "").trim();

    if (!to) {
      return res.status(400).json({
        message: "Recipient email is required",
      });
    }

    const result = await testEmailConnection({ to });

    res.status(200).json({
      message: "Test email sent successfully",
      result,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  testEmail,
};
