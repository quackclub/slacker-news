import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const POSTS_DIR = path.join(__dirname, 'posts')
export const CATEGORIES = ['news', 'opinion', 'essays', 'changelogs'] as const

export interface MdxFrontmatter {
  title?: string
  date?: string
  author?: string | string[]
  responseTo?: string
  followUpTo?: string | string[]
}

export interface MdxFile {
  category: string
  slug: string
  filename: string
  frontmatter: MdxFrontmatter
}

function parseFrontmatter(text: string): { data: MdxFrontmatter; content: string } {
  const match = text.match(/^---\s*\n([\s\S]*?)\n(?:---|\.\.\.)\s*\n([\s\S]*)$/)
  if (!match) return { data: {}, content: text }

  const frontmatter: Record<string, unknown> = {}
  let key: string | null = null

  for (const line of match[1].split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.*)/)
    if (kvMatch) {
      key = kvMatch[1]
      let value: string | boolean = kvMatch[2].replace(/^['"]|['"]$/g, '').trim()
      if (value === 'true') value = true
      else if (value === 'false') value = false
      frontmatter[key] = value
    } else if (key && line.startsWith('  ')) {
      frontmatter[key] += '\n' + line.trim()
    }
  }

  return { data: frontmatter as MdxFrontmatter, content: match[2] }
}

export function listMdxFiles(): MdxFile[] {
  const files: MdxFile[] = []

  for (const category of CATEGORIES) {
    const dir = path.join(POSTS_DIR, category)
    if (!fs.existsSync(dir)) continue

    const mdxFiles = fs.readdirSync(dir).filter(f => f.endsWith('.mdx'))
    for (const filename of mdxFiles) {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf-8')
      const { data } = parseFrontmatter(raw)
      files.push({
        category,
        slug: filename.replace(/\.mdx$/, ''),
        filename,
        frontmatter: data,
      })
    }
  }

  return files
}

export function readMdxFile(category: string, slug: string): { frontmatter: MdxFrontmatter; content: string } | null {
  const filePath = path.join(POSTS_DIR, category, `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  return parseFrontmatter(raw)
}
