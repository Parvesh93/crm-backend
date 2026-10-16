const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../services/notificationService");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// REGISTER USER
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // CHECK REQUIRED FIELDS
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Please fill all fields",
      });
    }

    // CHECK USER EXISTS
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // HASH PASSWORD
    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(password, salt);

    // CREATE USER
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "developer",
    });

    res.status(201).json({
      message: "User registered successfully",
      token: generateToken(user._id),

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getFrontendUrl = () =>
  (process.env.CRM_FRONTEND_URL || "https://app.ppdesigntech.com").replace(/\/$/, "");

const forgotPassword = async (req, res) => {
  const genericMessage =
    "If an account exists for this email, a password reset link has been sent.";

  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email }).select(
      "+resetPasswordToken +resetPasswordExpires +resetPasswordRequestedAt"
    );

    if (!user || user.isActive === false) {
      return res.status(200).json({
        message: genericMessage,
      });
    }

    const now = Date.now();
    const cooldownMs = 60 * 1000;

    if (
      user.resetPasswordRequestedAt &&
      now - new Date(user.resetPasswordRequestedAt).getTime() < cooldownMs
    ) {
      return res.status(200).json({
        message: genericMessage,
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiryMinutes = Math.max(
      10,
      Math.min(
        Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 30),
        120
      )
    );

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(
      now + expiryMinutes * 60 * 1000
    );
    user.resetPasswordRequestedAt = new Date(now);

    await user.save();

    const resetUrl =
      getFrontendUrl() + "/reset-password/" + rawToken;

    const result = await sendEmail({
      to: user.email,
      subject: "Reset your PPDT CRM password",
      text:
        "You requested a password reset for PPDT CRM.\n\n" +
        "Reset your password: " +
        resetUrl +
        "\n\nThis link expires in " +
        expiryMinutes +
        " minutes. If you did not request this, you can ignore this email.",
      html:
        '<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">' +
        '<h2 style="margin-bottom:8px">Reset your PPDT CRM password</h2>' +
        '<p>We received a request to reset your password.</p>' +
        '<p style="margin:24px 0">' +
        '<a href="' +
        resetUrl +
        '" style="background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block">Reset Password</a>' +
        '</p>' +
        '<p>This link expires in ' +
        expiryMinutes +
        ' minutes.</p>' +
        '<p style="color:#6b7280;font-size:13px">If you did not request this, you can safely ignore this email.</p>' +
        '</div>',
    });

    if (!result?.sent) {
      console.error(
        "Password reset email skipped:",
        result?.reason || "Unknown reason"
      );
    }

    return res.status(200).json({
      message: genericMessage,
    });
  } catch (error) {
    console.error("Forgot password error:", error.message);

    return res.status(200).json({
      message: genericMessage,
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    const password = String(req.body.password || "");

    if (!token) {
      return res.status(400).json({
        message: "Reset token is required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select(
      "+resetPasswordToken +resetPasswordExpires +resetPasswordRequestedAt"
    );

    if (!user) {
      return res.status(400).json({
        message:
          "This password reset link is invalid or has expired. Please request a new one.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordRequestedAt = undefined;

    await user.save();

    res.status(200).json({
      message:
        "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Unable to reset password. Please try again.",
    });
  }
};

// LOGIN USER
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // FIND USER
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // CHECK PASSWORD
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    res.status(200).json({
      message: "Login successful",
      token: generateToken(user._id),

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
};