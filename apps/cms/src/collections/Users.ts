import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: "email",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => req.user?.role === "admin",
    update: ({ req, id }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return req.user.id === id;
    },
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "contributor",
      saveToJWT: true,
      options: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
        { label: "Contributor", value: "contributor" },
      ],
    },
  ],
};
