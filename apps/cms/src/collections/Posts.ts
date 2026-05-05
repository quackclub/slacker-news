import type { CollectionConfig, Where } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";


function createSlug(value?: string, title?: string): string {
  const source = value ?? title ?? "";
  return source
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

export const Posts: CollectionConfig = {
  slug: "posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "category", "status", "author", "date"]
  },
  access: {
    read: ({ req }) => {
      if (req.user) {
        return true;
      }

      return { status: { equals: "published" } };
    },
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => {
      if (!req.user) {
        return false;
      }

      if (req.user.role === "admin" || req.user.role === "editor") {
        return true;
      }

      const ownDrafts: Where = {
        and: [
          { author: { equals: String(req.user.id) } },
          { status: { equals: "draft" } }
        ]
      };

      return ownDrafts;
    },
    delete: ({ req }) => req.user?.role === "admin" || req.user?.role === "editor"
  },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc }) => {
        if (doc.status === previousDoc?.status) {
          return;
        }

        console.log(`Post "${doc.title}" status changed: ${previousDoc?.status ?? "new"} -> ${doc.status}`);
      }
    ]
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true
    },
    {
      name: "category",
      type: "select",
      required: true,
      defaultValue: "news",
      options: [
        { label: "News", value: "news" },
        { label: "Opinion", value: "opinion" },
        { label: "Essays", value: "essays" }
      ]
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL slug for the article path, excluding the category prefix."
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => createSlug(typeof value === "string" ? value : undefined, data?.title)
        ]
      }
    },
    {
      name: "excerpt",
      type: "textarea",
      required: true
    },
    {
      name: "date",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        date: {
          pickerAppearance: "dayOnly"
        }
      }
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      defaultValue: ({ user }) => user?.id,
      admin: {
        condition: (_data, _siblingData, { user }) => user?.role === "admin" || user?.role === "editor"
      }
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
        { label: "Archived", value: "archived" }
      ],
      access: {
        update: ({ req }) => req.user?.role === "admin" || req.user?.role === "editor"
      }
    },
    {
      name: "reviewNotes",
      type: "textarea",
      label: "Review Notes",
      admin: {
        condition: (_data, _siblingData, { user }) => user?.role === "admin" || user?.role === "editor",
        description: "Visible to the contributor. Use this to request changes."
      }
    },
    {
      name: "gated",
      type: "checkbox",
      label: "Members only",
      defaultValue: false
    },
    {
  name: "body",
  type: "richText",
  required: true,
  editor: lexicalEditor({}),  // ← explicit instead of relying on global default
},
  ]
};
