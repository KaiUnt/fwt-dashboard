import { NextRequest, NextResponse } from 'next/server'
import { withAuth, RATE_LIMITS, AuthenticatedUser } from '@/lib/auth-middleware'

interface ParsedRider {
  bib: string
  name: string
  class: string
  sex: string
  nation: string
  points: string
  state: string
  youtubeUrl: string
  youtubeTimestamp: number
}

interface ParsedXmlData {
  eventName: string
  eventDate: string
  year: number
  riders: ParsedRider[]
}

function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function parseYoutubeTimestamp(url: string): { url: string; timestamp: number } {
  try {
    const urlObj = new URL(url)
    const timestamp = parseInt(urlObj.searchParams.get('t') || '0', 10)
    urlObj.searchParams.delete('t')
    return { url: urlObj.toString(), timestamp }
  } catch {
    return { url, timestamp: 0 }
  }
}

function parseXmlContent(xmlContent: string): ParsedXmlData {
  // Extract event info
  const eventMatch = xmlContent.match(/<event[^>]*name="([^"]*)"[^>]*date="([^"]*)"/)
  const eventName = eventMatch?.[1] || 'Unknown Event'
  const eventDateStr = eventMatch?.[2] || ''

  // Parse date (format: DD.MM.YYYY)
  let year = new Date().getFullYear()
  if (eventDateStr) {
    const dateParts = eventDateStr.split('.')
    if (dateParts.length === 3) {
      year = parseInt(dateParts[2], 10)
    }
  }

  // Extract riders
  const riders: ParsedRider[] = []
  const riderRegex = /<rider\s+([^>]*)\/>/g
  let match

  while ((match = riderRegex.exec(xmlContent)) !== null) {
    const attrs = match[1]

    const getAttr = (name: string): string => {
      const attrMatch = attrs.match(new RegExp(`${name}="([^"]*)"`))
      return attrMatch?.[1] || ''
    }

    const riderrunUrl = getAttr('riderrun')
    const { url: youtubeUrl, timestamp: youtubeTimestamp } = parseYoutubeTimestamp(riderrunUrl)

    riders.push({
      bib: getAttr('bib'),
      name: getAttr('name'),
      class: getAttr('class'),
      sex: getAttr('sex'),
      nation: getAttr('nation'),
      points: getAttr('points'),
      state: getAttr('state'),
      youtubeUrl,
      youtubeTimestamp
    })
  }

  return {
    eventName,
    eventDate: eventDateStr,
    year,
    riders
  }
}

async function handler(
  user: AuthenticatedUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { xmlUrl, xmlContent } = body as { xmlUrl?: string; xmlContent?: string }

    let content: string

    if (xmlUrl) {
      // Fetch XML from URL
      const response = await fetch(xmlUrl)
      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch XML: ${response.statusText}` },
          { status: 400 }
        )
      }
      content = await response.text()
    } else if (xmlContent) {
      content = xmlContent
    } else {
      return NextResponse.json(
        { error: 'Either xmlUrl or xmlContent is required' },
        { status: 400 }
      )
    }

    const parsed = parseXmlContent(content)

    return NextResponse.json({
      success: true,
      data: parsed,
      normalizedNames: parsed.riders.map(r => ({
        original: r.name,
        normalized: normalizeString(r.name)
      }))
    })
  } catch (error) {
    console.error('XML parsing error:', error)
    return NextResponse.json(
      { error: 'Failed to parse XML content' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handler, {
  requireAdmin: true,
  rateLimit: RATE_LIMITS.admin
})
