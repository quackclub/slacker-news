'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { toast } from '@payloadcms/ui'
import { Button } from '@/components/ui/button'

interface MdxFile {
  category: string
  slug: string
  filename: string
  title?: string
  date?: string
  author?: string | string[]
}

interface ImportResult {
  imported: string[]
  skipped: string[]
  errors: Array<{ slug: string; error: string }>
}

const CATEGORIES = ['news', 'opinion', 'essays', 'changelogs'] as const

const categoryLabels: Record<string, string> = {
  news: 'News',
  opinion: 'Opinion',
  essays: 'Essays',
  changelogs: 'Changelogs',
}

export const ImportMdxButton: React.FC = () => {
  const [files, setFiles] = useState<MdxFile[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState<string | null>(null) // slug being imported, or 'all'
  const [expanded, setExpanded] = useState(false)

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/next/import-mdx', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch files')
      const data = await res.json()
      setFiles(data.files || [])
    } catch {
      toast.error('Failed to load MDX files')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchFiles()
  }, [fetchFiles])

  const importSingle = useCallback(
    async (category: string, slug: string) => {
      setImporting(slug)
      try {
        const res = await fetch('/next/import-mdx', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'single', category, slug }),
        })
        if (!res.ok) throw new Error('Import failed')
        const result: ImportResult = await res.json()

        if (result.imported.length > 0) {
          toast.success(`Imported: ${result.imported.join(', ')}`)
          setFiles((prev) => prev.filter((f) => !result.imported.includes(f.slug)))
        }
        if (result.skipped.length > 0) {
          toast.info(`Skipped (already exist): ${result.skipped.join(', ')}`)
        }
        for (const err of result.errors) {
          toast.error(`Failed to import ${err.slug}: ${err.error}`)
        }
      } catch {
        toast.error('Import failed')
      } finally {
        setImporting(null)
      }
    },
    [],
  )

  const importAll = useCallback(async () => {
    setImporting('all')
    try {
      const res = await fetch('/next/import-mdx', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      })
      if (!res.ok) throw new Error('Import failed')
      const result: ImportResult = await res.json()

      const total = result.imported.length + result.skipped.length
      if (result.imported.length > 0) {
        toast.success(`Imported ${result.imported.length} posts`)
      }
      if (result.skipped.length > 0) {
        toast.info(`${result.skipped.length} already existed, skipped`)
      }
      for (const err of result.errors) {
        toast.error(`Failed: ${err.slug} — ${err.error}`)
      }

      // refresh list
      await fetchFiles()
    } catch {
      toast.error('Import failed')
    } finally {
      setImporting(null)
    }
  }, [fetchFiles])

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', color: '#666', fontSize: '0.85rem' }}>
        Loading MDX files…
      </div>
    )
  }

  const grouped: Record<string, MdxFile[]> = {}
  for (const cat of CATEGORIES) grouped[cat] = []
  for (const f of files) {
    if (grouped[f.category]) grouped[f.category].push(f)
  }

  return (
    <div
      style={{
        border: '1px solid #e2e2e2',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
        background: '#fafafa',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: expanded ? '12px' : 0,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
          Import MDX Posts
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Hide' : `Show ${files.length} files`}
        </Button>
        {files.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={importAll}
            disabled={importing !== null}
          >
            {importing === 'all' ? 'Importing…' : 'Import All'}
          </Button>
        )}
      </div>

      {expanded && (
        <div style={{ fontSize: '0.85rem' }}>
          {files.length === 0 ? (
            <p style={{ color: '#888', margin: '8px 0' }}>
              No MDX files found. All posts may already be imported.
            </p>
          ) : (
            CATEGORIES.map((cat) => {
              const catFiles = grouped[cat]
              if (!catFiles || catFiles.length === 0) return null
              return (
                <div key={cat} style={{ marginBottom: '12px' }}>
                  <div
                    style={{
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      letterSpacing: '0.08em',
                      color: '#555',
                      marginBottom: '4px',
                    }}
                  >
                    {categoryLabels[cat]} ({catFiles.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {catFiles.map((f) => (
                      <div
                        key={f.slug}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: '#fff',
                          borderRadius: '4px',
                          border: '1px solid #eee',
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.title || f.slug}
                          <span style={{ color: '#999', marginLeft: '8px' }}>
                            {f.slug}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => importSingle(f.category, f.slug)}
                          disabled={importing !== null}
                          style={{ marginLeft: '8px', flexShrink: 0 }}
                        >
                          {importing === f.slug ? '…' : 'Import'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
