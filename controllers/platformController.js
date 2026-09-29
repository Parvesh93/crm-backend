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

const getPlatforms = async (req, res) => {
  try {
    await ensureDefaults();
    const platforms = await Platform.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ count: platforms.length, platforms });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createPlatform = async (req, res) => {
  try {
    const { name, slug, description, isActive } = req.body;
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
    });

    res.status(201).json({ message: "Platform created successfully", platform });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePlatform = async (req, res) => {
  try {
    const platform = await Platform.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!platform) return res.status(404).json({ message: "Platform not found" });
    res.status(200).json({ message: "Platform updated successfully", platform });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPlatforms, createPlatform, updatePlatform, ensureDefaults };
