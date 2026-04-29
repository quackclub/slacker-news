import { column, defineDb, defineTable } from "astro:db";

const PageStats = defineTable({
  columns: {
    key: column.text({ primaryKey: true }),
    path: column.text(),
    label: column.text(),
    kind: column.text(),
    value: column.number(),
    updatedAt: column.number(),
  },
});

const PageStatsHistory = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    key: column.text(),
    value: column.number(),
    timestamp: column.number(),
  },
});

export default defineDb({
  tables: { PageStats, PageStatsHistory },
});