import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    useAPIKey: true
  },
  admin: {
    useAsTitle: "email"
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "contributor",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
        { label: "Contributor", value: "contributor" }
      ]
    }
  ]
};
