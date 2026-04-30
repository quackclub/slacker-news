import { generateAbacusKey, getAbacusGetUrl } from "../../lib/abacus";
import { db, PageStats, PageStatsHistory } from "astro:db";

export async function GET({ request }) {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  // Get all keys from DB
  const allStats = await db.select().from(PageStats);
  
  const results = [];
  
  for (const row of allStats) {
    const needsRefresh = (row.updatedAt) + ONE_HOUR < now;
    
    if (needsRefresh) {
      try {
        const response = await fetch(getAbacusGetUrl(row.key));
        if (response.ok) {
          const data = await response.json();
          const value = Number(data?.value);
          if (Number.isFinite(value)) {
            await db.insert(PageStats).values({
              key: row.key,
              path: row.path,
              label: row.label,
              kind: row.kind,
              value,
              updatedAt: now,
            }).onConflictDoUpdate({
              target: PageStats.key,
              set: { value, updatedAt: now }
            });

            await db.insert(PageStatsHistory).values({
              key: row.key,
              value,
              timestamp: now,
            });

            results.push({ 
              key: row.key, 
              value, 
              path: row.path,
              label: row.label,
              kind: row.kind 
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to refresh ${row.key}:`, e);
      }
    } else {
      results.push({ 
        key: row.key, 
        value: row.value, 
        path: row.path,
        label: row.label,
        kind: row.kind 
      });
    }
  }

  return new Response(JSON.stringify({
    refreshed: results.filter(r => r.value > 0).length,
    total: results.reduce((sum, r) => sum + r.value, 0),
    timestamp: now
  }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    }
  });
}
