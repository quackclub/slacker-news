import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import fs from 'fs'
import path from 'path'

const CATEGORIES = ['news', 'opinion', 'essays', 'changelogs'] as const

function getContentDir(): string {
  if (process.env.CONTENT_DIR) return process.env.CONTENT_DIR
  // Walk up from apps/cms to monorepo root, then into packages/content/posts
  return path.resolve(process.cwd(), '../../packages/content/posts')
}

// ── Frontmatter parsing ──────────────────────────────────────────────────────

interface Frontmatter {
  title?: string
  date?: string
  author?: string | string[]
  responseTo?: string | string[]
  followUpTo?: string | string[]
}

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const fence = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!fence) return { data: {}, body: raw }

  const data: Record<string, unknown> = {}
  let currentKey: string | null = null
  let listBuffer: string[] | null = null

  for (const line of fence[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)/)
    if (kv) {
      // flush any open list
      if (listBuffer && currentKey) {
        data[currentKey] = listBuffer
        listBuffer = null
      }

      currentKey = kv[1]
      const rawVal = kv[2].trim()

      if (rawVal === '' || rawVal === '[]') {
        // could be a multi-line array
        listBuffer = []
        data[currentKey] = listBuffer
        continue
      }

      // single-value (possibly quoted)
      data[currentKey] = rawVal.replace(/^['"]|['"]$/g, '')
    } else if (listBuffer !== null && line.trim().startsWith('-')) {
      listBuffer.push(line.replace(/^\s*-\s*/, '').replace(/^['"]|['"]$/g, '').trim())
    }
  }

  return { data: data as Frontmatter, body: fence[2] }
}

// ── Markdown → Lexical conversion ────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripAstroComponents(text: string): string {
  return text
    .replace(/<SlackChannel\s+id="([^"]+)"\s*\/>/g, '#$1')
    .replace(/<SlackMention\s+name="([^"]+)"\s+id="[^"]*"\s*\/>/g, '@$1')
    .replace(/<Emoji\s+name="([^"]+)"\s*\/?>/g, ':$1:')
    .replace(/<Caption[^>]*>([\s\S]*?)<\/Caption>/gi, '$1')
    .replace(/<RawHtml[^>]*\/?>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*import\s+.*/gm, '')
    .replace(/^\s*export\s+.*/gm, '')
}

type LexNode = Record<string, unknown>

function parseInline(text: string): LexNode[] {
  const nodes: LexNode[] = []
  let rest = text
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\))/

  while (rest.length > 0) {
    const m = rest.match(re)
    if (!m) {
      if (rest.trim()) nodes.push({ type: 'text', text: esc(rest) })
      break
    }
    if (m.index && m.index > 0) {
      const before = rest.slice(0, m.index)
      if (before.trim()) nodes.push({ type: 'text', text: esc(before) })
    }
    if (m[1].startsWith('***')) {
      nodes.push({ type: 'text', text: esc(m[2]), format: 3 })
    } else if (m[1].startsWith('**')) {
      nodes.push({ type: 'text', text: esc(m[3]), format: 1 })
    } else if (m[1].startsWith('*')) {
      nodes.push({ type: 'text', text: esc(m[4]), format: 2 })
    } else if (m[1].startsWith('`')) {
      nodes.push({ type: 'text', text: esc(m[5]), code: true })
    } else if (m[1].startsWith('![')) {
      // image → plain text placeholder
      nodes.push({ type: 'text', text: `[Image: ${m[6]}](${m[7]})` })
    } else if (m[1].startsWith('[')) {
      nodes.push({ type: 'text', text: esc(m[8]), format: 0, link: m[9] })
    }
    rest = rest.slice((m.index || 0) + m[0].length)
  }
  return nodes
}

function mdToLexical(md: string): LexNode {
  const cleaned = stripAstroComponents(md)
  const children: LexNode[] = []
  const lines = cleaned.split('\n')

  let quote: LexNode | null = null
  let bulletList: LexNode | null = null
  let numberedList: LexNode | null = null

  const flushLists = () => {
    bulletList = null
    numberedList = null
  }
  const flushQuote = () => {
    quote = null
  }

  for (const line of lines) {
    // blank line → reset block state
    if (line.trim() === '') {
      flushQuote()
      flushLists()
      continue
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.+)/)
    if (h) {
      flushQuote()
      flushLists()
      children.push({
        type: 'heading',
        tag: `h${h[1].length}`,
        children: parseInline(h[2]),
        format: '',
        indent: 0,
        version: 1,
      })
      continue
    }

    // blockquote
    const bq = line.match(/^>\s?(.*)/)
    if (bq) {
      flushLists()
      if (!quote) {
        quote = { type: 'quote', children: [], format: '', indent: 0, version: 1 }
        children.push(quote)
      }
      if (bq[1].trim()) {
        ;(quote.children as LexNode[]).push({
          type: 'paragraph',
          children: parseInline(bq[1]),
          format: '',
          indent: 0,
          version: 1,
        })
      }
      continue
    }

    // unordered list
    const ul = line.match(/^[-*]\s+(.+)/)
    if (ul) {
      flushQuote()
      numberedList = null
      if (!bulletList) {
        bulletList = { type: 'list', listType: 'bullet', children: [], format: '', indent: 0, version: 1 }
        children.push(bulletList)
      }
      ;(bulletList.children as LexNode[]).push({
        type: 'listitem',
        children: parseInline(ul[1]),
        value: 1,
        format: '',
        indent: 0,
        version: 1,
      })
      continue
    }

    // ordered list
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) {
      flushQuote()
      bulletList = null
      if (!numberedList) {
        numberedList = { type: 'list', listType: 'number', children: [], format: '', indent: 0, version: 1 }
        children.push(numberedList)
      }
      ;(numberedList.children as LexNode[]).push({
        type: 'listitem',
        children: parseInline(ol[1]),
        value: 1,
        format: '',
        indent: 0,
        version: 1,
      })
      continue
    }

    // image (standalone line)
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (img) {
      flushQuote()
      flushLists()
      children.push({
        type: 'paragraph',
        children: [{ type: 'text', text: `[Image: ${img[1]}](${img[2]})` }],
        format: '',
        indent: 0,
        version: 1,
      })
      continue
    }

    // horizontal rule
    if (/^---+\s*$/.test(line.trim())) {
      flushQuote()
      flushLists()
      children.push({ type: 'horizontalrule', format: '', indent: 0, version: 1 })
      continue
    }

    // regular paragraph
    flushQuote()
    flushLists()
    const textNodes = parseInline(line)
    if (textNodes.length > 0) {
      children.push({
        type: 'paragraph',
        children: textNodes,
        format: '',
        indent: 0,
        version: 1,
      })
    }
  }

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children,
      direction: null,
    },
  }
}

// ── API handlers ─────────────────────────────────────────────────────────────

interface MdxFileEntry {
  category: string
  slug: string
  filename: string
  title?: string
  date?: string
  author?: string | string[]
}

function listMdxFiles(): MdxFileEntry[] {
  const contentDir = getContentDir()
  const entries: MdxFileEntry[] = []

  for (const cat of CATEGORIES) {
    const dir = path.join(contentDir, cat)
    if (!fs.existsSync(dir)) continue

    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.mdx'))) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      const { data } = parseFrontmatter(raw)
      entries.push({
        category: cat,
        slug: file.replace(/\.mdx$/, ''),
        filename: file,
        title: data.title,
        date: data.date,
        author: data.author,
      })
    }
  }

  return entries
}

export async function GET() {
  try {
    const files = listMdxFiles()
    return NextResponse.json({ files })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mode, category, slug } = body as {
      mode: 'single' | 'all'
      category?: string
      slug?: string
    }

    const payload = await getPayload({ config: configPromise })
    const contentDir = getContentDir()

    // Ensure categories exist
    for (const catName of CATEGORIES) {
      const existing = await payload.find({
        collection: 'categories',
        where: { title: { equals: catName } },
        limit: 1,
      })
      if (existing.totalDocs === 0) {
        await payload.create({
          collection: 'categories',
          data: { title: catName },
          overrideAccess: true,
          draft: true,
        })
      }
    }

    // Build category ID map
    const catIds: Record<string, string> = {}
    for (const catName of CATEGORIES) {
      const found = await payload.find({
        collection: 'categories',
        where: { title: { equals: catName } },
        limit: 1,
      })
      if (found.docs[0]) catIds[catName] = String(found.docs[0].id)
    }

    // Determine which files to import
    const files: Array<{ category: string; slug: string }> = []
    if (mode === 'single') {
      if (!category || !slug) {
        return NextResponse.json({ error: 'category and slug required for single import' }, { status: 400 })
      }
      files.push({ category, slug })
    } else {
      // all
      const all = listMdxFiles()
      for (const f of all) {
        files.push({ category: f.category, slug: f.slug })
      }
    }

    // Get existing post slugs to skip duplicates
    const existingPosts = await payload.find({
      collection: 'posts',
      limit: 10000,
      depth: 0,
      select: { slug: true },
    })
    const existingSlugs = new Set(existingPosts.docs.map((d: any) => d.slug))

    const imported: string[] = []
    const skipped: string[] = []
    const errors: Array<{ slug: string; error: string }> = []

    for (const { category, slug: fileSlug } of files) {
      if (existingSlugs.has(fileSlug)) {
        skipped.push(fileSlug)
        continue
      }

      const filePath = path.join(contentDir, category, `${fileSlug}.mdx`)
      if (!fs.existsSync(filePath)) {
        errors.push({ slug: fileSlug, error: 'File not found' })
        continue
      }

      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const { data, body } = parseFrontmatter(raw)
        const lexical = mdToLexical(body)

        const authorName = Array.isArray(data.author) ? data.author[0] : data.author

        const postData: Record<string, unknown> = {
          title: data.title || fileSlug,
          slug: fileSlug,
          content: lexical,
          authors: authorName ? [{ name: authorName }] : [],
          publishedAt: data.date ? new Date(data.date).toISOString() : null,
          loginRequired: false,
          _status: 'published' as const,
        }

        if (catIds[category]) {
          postData.categories = [catIds[category]]
        }

        if (data.responseTo) {
          postData.responseTo = Array.isArray(data.responseTo) ? data.responseTo[0] : data.responseTo
        }
        if (data.followUpTo) {
          postData.followUpTo = Array.isArray(data.followUpTo) ? data.followUpTo[0] : data.followUpTo
        }

        await payload.create({
          collection: 'posts',
          data: postData,
          overrideAccess: true,
          draft: true,
        })

        imported.push(fileSlug)
      } catch (err) {
        errors.push({ slug: fileSlug, error: String(err) })
      }
    }

    return NextResponse.json({ imported, skipped, errors })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
