const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["Shopify", "WordPress", "WooCommerce", "Laravel", "Maintenance", "Other"],
      default: "Other",
    },

    budget: {
      type: Number,
      default: 0,
    },

    startDate: {
      type: Date,
    },

    deadline: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["Pending", "In Progress", "Review", "Completed", "On Hold"],
      default: "Pending",
    },

    notes: {
      type: String,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Project", projectSchema);