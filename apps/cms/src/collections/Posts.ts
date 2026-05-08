import type { CollectionConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

export const Posts: CollectionConfig = {
  slug: "posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "author", "date"],
  },
  access: {
    read: ({ req }) => {
      if (req.user) return true;
      return { status: { equals: "published" } };
    },
    create: ({ req }) => !!req.user,
    update: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin" || req.user.role === "editor") return true;
      return {
        and: [
          { author: { equals: req.user.id } },
          { status: { equals: "draft" } },
        ],
      };
    },
    delete: ({ req }) =>
      req.user?.role === "admin" || req.user?.role === "editor",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL slug — auto-generated from title, editable.",
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (value) return value;
            return data?.title
              ?.toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "");
          },
        ],
      },
    },
    {
      name: "excerpt",
      type: "textarea",
      required: true,
    },
    {
      name: "date",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      defaultValue: ({ user }) => user?.id,
      admin: {
        condition: (_, __, { user }) =>
          user?.role === "admin" || user?.role === "editor",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "In Review", value: "review" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
      access: {
        update: ({ req }) =>
          req.user?.role === "admin" || req.user?.role === "editor",
      },
    },
    {
      name: "reviewNotes",
      type: "textarea",
      label: "Review Notes",
      admin: {
        condition: (_, __, { user }) =>
          user?.role === "admin" || user?.role === "editor",
        description: "Visible to the contributor. Use to request changes.",
      },
    },
    {
      name: "gated",
      type: "checkbox",
      label: "Members only",
      defaultValue: false,
    },
    {
      name: "body",
      type: "richText",
      required: true,
      editor: lexicalEditor({}),
    },
  ],
};
