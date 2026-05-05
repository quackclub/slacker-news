import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
  },
  access: {
    // anyone logged in can read users
    read: ({ req }) => !!req.user,
    // only admins can create new users
    create: ({ req }) => req.user?.role === "admin",
    // admins can update anyone; users can update themselves
    update: ({ req, id }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return req.user.id === id;
    },
    // only admins can delete
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true
    },
    {
      name: "slackId",
      type: "text",
      label: "Slack User ID",
      admin: {
        description: "The Slack user ID (e.g., U12345678) for linking to Slack profiles"
      }
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "contributor",
      saveToJWT: true,
      options: [
        { label: "Admin",       value: "admin" },
        { label: "Editor",      value: "editor" },
        { label: "Contributor", value: "contributor" },
      ],
    }
  ]
};
