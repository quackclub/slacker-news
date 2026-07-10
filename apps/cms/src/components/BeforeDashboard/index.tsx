'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Banner } from '@payloadcms/ui/elements/Banner'
import { toast } from '@payloadcms/ui'

import './index.scss'

const baseClass = 'before-dashboard'

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

const BeforeDashboard: React.FC = () => {
  const [files, setFiles] = useState<MdxFile[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState<string | null>(null)
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

      if (result.imported.length > 0) {
        toast.success(`Imported ${result.imported.length} posts`)
      }
      if (result.skipped.length > 0) {
        toast.info(`${result.skipped.length} already existed, skipped`)
      }
      for (const err of result.errors) {
        toast.error(`Failed: ${err.slug} — ${err.error}`)
      }

      await fetchFiles()
    } catch {
      toast.error('Import failed')
    } finally {
      setImporting(null)
    }
  }, [fetchFiles])

  const grouped: Record<string, MdxFile[]> = {}
  for (const cat of CATEGORIES) grouped[cat] = []
  for (const f of files) {
    if (grouped[f.category]) grouped[f.category].push(f)
  }

  return (
    <div className={baseClass}>
      <Banner className={`${baseClass}__banner`} type="success">
        <h4>Import MDX Posts</h4>
      </Banner>

      {loading ? (
        <p>Loading MDX files…</p>
      ) : files.length === 0 ? (
        <p>All posts have been imported, or no MDX files found in <code>packages/content/posts/</code>.</p>
      ) : (
        <>
          <p>
            {files.length} posts available to import from <code>packages/content/posts/</code>.
            Posts with a matching slug will be skipped.
          </p>

          <div className={`${baseClass}__actions`}>
            <button
              className={`${baseClass}__import-all`}
              onClick={importAll}
              disabled={importing !== null}
            >
              {importing === 'all' ? 'Importing…' : `Import All (${files.length})`}
            </button>
            <button
              className={`${baseClass}__toggle`}
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Hide files' : 'Show by category'}
            </button>
          </div>

          {expanded && (
            <div className={`${baseClass}__files`}>
              {CATEGORIES.map((cat) => {
                const catFiles = grouped[cat]
                if (!catFiles || catFiles.length === 0) return null
                return (
                  <div key={cat} className={`${baseClass}__category`}>
                    <h5 className={`${baseClass}__category-title`}>
                      {categoryLabels[cat]} ({catFiles.length})
                    </h5>
                    <ul className={`${baseClass}__file-list`}>
                      {catFiles.map((f) => (
                        <li key={f.slug} className={`${baseClass}__file-item`}>
                          <span className={`${baseClass}__file-name`}>
                            {f.title || f.slug}
                            <span className={`${baseClass}__file-slug`}>{f.slug}</span>
                          </span>
                          <button
                            className={`${baseClass}__import-btn`}
                            onClick={() => importSingle(f.category, f.slug)}
                            disabled={importing !== null}
                          >
                            {importing === f.slug ? '…' : 'Import'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default BeforeDashboard
