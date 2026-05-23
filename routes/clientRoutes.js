const express = require("express");

const {
  createClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient,
} = require("../controllers/clientController");

const {
  protect,
  authorizeRoles,
  authorizePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();



router.post("/", protect, authorizePermission("manage_clients"), createClient);

router.get("/", protect, authorizePermission("view_clients"), getClients);

router.get("/:id", protect, authorizePermission("view_clients"), getClientById);

router.put("/:id", protect, authorizePermission("manage_clients"), updateClient);

router.delete("/:id", protect, authorizePermission("delete_clients"), deleteClient);

module.exports = router;