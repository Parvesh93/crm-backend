const mongoose = require("mongoose");

const outreachRunSchema = new mongoose.Schema(
  {
    trigger: {
      type: String,
      enum: ["scheduled", "manual"],
      default: "scheduled",
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    candidates: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    errors: [{ type: String }],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

outreachRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("OutreachRun", outreachRunSchema);
