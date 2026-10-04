const mongoose = require("mongoose");

const salesAgentRunSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    trigger: {
      type: String,
      enum: ["manual", "scheduled"],
      default: "manual",
    },
    markets: [{ type: String }],
    services: [{ type: String }],
    queries: [{ type: String }],
    found: { type: Number, default: 0 },
    withEmail: { type: Number, default: 0 },
    qualified: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    errors: [{ type: String }],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

salesAgentRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SalesAgentRun", salesAgentRunSchema);
