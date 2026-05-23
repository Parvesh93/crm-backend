const rolePermissions = {
  super_admin: [
    "manage_users",
    "view_clients",
    "manage_clients",
    "delete_clients",
    "view_projects",
    "manage_projects",
    "delete_projects",
    "view_tasks",
    "manage_tasks",
    "update_task_status",
    "delete_tasks",
    "generate_ai",
    "view_dashboard",
  ],

  admin: [
    "manage_users",
    "view_clients",
    "manage_clients",
    "delete_clients",
    "view_projects",
    "manage_projects",
    "delete_projects",
    "view_tasks",
    "manage_tasks",
    "update_task_status",
    "delete_tasks",
    "generate_ai",
    "view_dashboard",
  ],

  manager: [
    "view_clients",
    "manage_clients",
    "view_projects",
    "manage_projects",
    "view_tasks",
    "manage_tasks",
    "update_task_status",
    "generate_ai",
    "view_dashboard",
  ],

  developer: [
    "view_projects",
    "view_tasks",
    "update_task_status",
    "view_dashboard",
  ],

  client: [
    "view_own_projects",
    "view_own_tasks",
  ],
};

module.exports = rolePermissions;