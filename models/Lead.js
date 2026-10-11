const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },

    platform: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Platform",
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    source: {
      type: String,
      enum: [
        "Website",
        "Referral",
        "Email Outreach",
        "LinkedIn",
        "WhatsApp",
        "Upwork",
        "Existing Client",
        "Other",
      ],
      default: "Other",
    },

    stage: {
      type: String,
      enum: [
        "New Lead",
        "Contacted",
        "Follow-up",
        "Proposal Sent",
        "Negotiation",
        "Won",
        "Lost",
      ],
      default: "New Lead",
    },

    estimatedValue: { type: Number, default: 0, min: 0 },
    probability: { type: Number, default: 10, min: 0, max: 100 },
    nextFollowUp: { type: Date },
    lastContactedAt: { type: Date },
    notes: { type: String, trim: true },

    outreach: {
      status: {
        type: String,
        enum: ["ready", "active", "paused", "replied", "unsubscribed", "bounced", "completed"],
        default: "ready",
      },
      initialDraft: { type: String, trim: true },
      sequenceStep: { type: Number, default: 0, min: 0 },
      emailCount: { type: Number, default: 0, min: 0 },
      nextSendAt: { type: Date },
      lastSentAt: { type: Date },
      lastSubject: { type: String, trim: true },
      lastMessageId: { type: String, trim: true },
      unsubscribeToken: { type: String, trim: true },
      repliedAt: { type: Date },
      unsubscribedAt: { type: Date },
      bouncedAt: { type: Date },
    },

    convertedClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },

    convertedProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

leadSchema.index({ stage: 1, nextFollowUp: 1 });
leadSchema.index({ owner: 1, stage: 1 });
leadSchema.index({ "outreach.status": 1, "outreach.nextSendAt": 1, stage: 1 });

module.exports = mongoose.model("Lead", leadSchema);
