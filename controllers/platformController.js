const Platform = require("../models/Platform");

const DEFAULT_PLATFORMS = [
  { name: "Shopify", slug: "shopify" },
  { name: "WordPress / WooCommerce", slug: "wordpress-woocommerce" },
  { name: "Custom Development", slug: "custom-development" },
  { name: "UI/UX / Figma", slug: "ui-ux-figma" },
  { name: "Website Maintenance", slug: "website-maintenance" },
  { name: "Other", slug: "other" },
];

const ensureDefaults = async () => {
  for (const platform of DEFAULT_PLATFORMS) {
    await Platform.updateOne(
      { slug: platform.slug },
      { $setOnInsert: platform },
      { upsert: true }
    );
  }
};

const validateAllocations = (allocations = []) => {
  const cleaned = allocations
    .filter((item) => item.user && Number(item.percentage) > 0)
    .map((item) => ({
      user: item.user,
      percentage: Number(item.percentage),
    }));

  const total = cleaned.reduce((sum, item) => sum + item.percentage, 0);

  if (total > 100.001) {
    const error = new Error("Default team allocation cannot exceed 100%");
    error.statusCode = 400;
    throw error;
  }

  return cleaned;
};

const getPlatforms = async (req, res) => {
  try {
    await ensureDefaults();
    const platforms = await Platform.find({ isActive: true })
      .populate("defaultAllocations.user", "name email designation role")
      .sort({ name: 1 });

    res.status(200).json({ count: platforms.length, platforms });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const createPlatform = async (req, res) => {
  try {
    const { name, slug, description, isActive, defaultAllocations } = req.body;
    if (!name) return res.status(400).json({ message: "Platform name is required" });

    const finalSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const platform = await Platform.create({
      name,
      slug: finalSlug,
      description,
      isActive,
      defaultAllocations: validateAllocations(defaultAllocations),
    });

    const populated = await Platform.findById(platform._id)
      .populate("defaultAllocations.user", "name email designation role");

    res.status(201).json({ message: "Platform created successfully", platform: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const updatePlatform = async (req, res) => {
  try {
    const update = { ...req.body };

    if (Object.prototype.hasOwnProperty.call(update, "defaultAllocations")) {
      update.defaultAllocations = validateAllocations(update.defaultAllocations);
    }

    const platform = await Platform.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate("defaultAllocations.user", "name email designation role");

    if (!platform) return res.status(404).json({ message: "Platform not found" });

    res.status(200).json({ message: "Platform updated successfully", platform });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { getPlatforms, createPlatform, updatePlatform, ensureDefaults };
