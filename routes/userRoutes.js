const express = require("express");

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
} = require("../controllers/userController");

const {
  protect,
  authorizePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorizePermission("manage_users"), getUsers);


router.post("/", protect, authorizePermission("manage_users"), createUser);

router.get("/:id", protect, authorizePermission("manage_users"), getUserById);

router.put("/:id", protect, authorizePermission("manage_users"), updateUser);

router.put(
  "/:id/password",
  protect,
  authorizePermission("manage_users"),
  updateUserPassword
);

router.delete("/:id", protect, authorizePermission("manage_users"), deleteUser);

module.exports = router;