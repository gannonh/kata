import type {
  ArtifactType,
  ParsedContext,
  ParsedContextSection,
  ParsedDecision,
  ParsedDecisions,
  ParsedRequirement,
  ParsedRequirements,
  ParsedRoadmap,
  ParsedRoadmapBoundarySection,
  ParsedRoadmapSlice,
  RequirementStatus,
  RoadmapRisk,
} from '@shared/types'

const SECTION_HEADING_PATTERN = /^##(?!#)\s+(.+)$/gm
const CONTEXT_HEADING_PATTERN = /^(#{2,3})\s+(.+)$/gm

export function detectArtifactType(title: string): ArtifactType | null {
  const normalized = title.trim().toUpperCase()

  if (/-ROADMAP(?:\b|$)/.test(normalized) || normalized === 'ROADMAP') {
    return 'roadmap'
  }

  if (normalized === 'REQUIREMENTS' || /-REQUIREMENTS(?:\b|$)/.test(normalized)) {
    return 'requirements'
  }

  if (normalized === 'DECISIONS' || /-DECISIONS(?:\b|$)/.test(normalized)) {
    return 'decisions'
  }

  if (/-CONTEXT(?:\b|$)/.test(normalized) || normalized === 'CONTEXT') {
    return 'context'
  }

  return null
}

export function parseRoadmap(markdown: string): ParsedRoadmap | null {
  const slicesSection = extractSection(markdown, 'Slices')
  if (!slicesSection) {
    return null
  }

  const lines = slicesSection.split('\n')
  const slices: ParsedRoadmapSlice[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const parsedSlice = parseRoadmapSliceLine(line)
    if (!parsedSlice) {
      continue
    }

    const demo = findDemoLine(lines, lineIndex + 1)
    slices.push({
      ...parsedSlice,
      demo,
    })
  }

  if (slices.length === 0) {
    return null
  }

  return {
    vision: parseVision(markdown),
    successCriteria: parseRoadmapSuccessCriteria(markdown),
    slices,
    boundaryMap: parseBoundaryMap(markdown),
  }
}

export function parseRequirements(markdown: string): ParsedRequirements | null {
  const parsed: ParsedRequirements = {
    active: parseRequirementSection(markdown, 'Active', 'active'),
    validated: parseRequirementSection(markdown, 'Validated', 'validated'),
    deferred: parseRequirementSection(markdown, 'Deferred', 'deferred'),
    outOfScope: parseRequirementSection(markdown, 'Out of Scope', 'outOfScope'),
  }

  const requirementCount =
    parsed.active.length +
    parsed.validated.length +
    parsed.deferred.length +
    parsed.outOfScope.length

  if (requirementCount === 0) {
    return null
  }

  return parsed
}

export function parseDecisions(markdown: string): ParsedDecisions | null {
  const tableLines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))

  if (tableLines.length < 3) {
    return null
  }

  const header = splitTableRow(tableLines[0] ?? '')
  const headerIndexByName = buildHeaderIndexMap(header)

  const idIndex = headerIndexByName.get('#') ?? headerIndexByName.get('id')
  const whenIndex = headerIndexByName.get('when')
  const scopeIndex = headerIndexByName.get('scope')
  const decisionIndex = headerIndexByName.get('decision')
  const choiceIndex = headerIndexByName.get('choice')
  const rationaleIndex = headerIndexByName.get('rationale')
  const revisableIndex = headerIndexByName.get('revisable')

  if (
    idIndex === undefined ||
    whenIndex === undefined ||
    scopeIndex === undefined ||
    decisionIndex === undefined ||
    choiceIndex === undefined ||
    revisableIndex === undefined
  ) {
    return null
  }

  const rows: ParsedDecision[] = []

  for (const tableLine of tableLines.slice(2)) {
    const cells = splitTableRow(tableLine)
    const id = cells[idIndex]?.trim() ?? ''
    if (!id) {
      continue
    }

    const revisableLabel = (cells[revisableIndex] ?? '').trim()
    const revisable = parseRevisableCell(revisableLabel)

    rows.push({
      id,
      when: (cells[whenIndex] ?? '').trim(),
      scope: (cells[scopeIndex] ?? '').trim(),
      decision: (cells[decisionIndex] ?? '').trim(),
      choice: (cells[choiceIndex] ?? '').trim(),
      rationale: rationaleIndex === undefined ? '' : (cells[rationaleIndex] ?? '').trim(),
      revisable: revisable.value,
      revisableCondition: revisable.condition,
      revisableLabel,
    })
  }

  if (rows.length === 0) {
    return null
  }

  return { rows }
}

export function parseContext(markdown: string): ParsedContext | null {
  const matches = Array.from(markdown.matchAll(CONTEXT_HEADING_PATTERN))
  const sections: ParsedContextSection[] = []

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const nextMatch = matches[index + 1]

    if (!match || match.index === undefined) {
      continue
    }

    const level = match[1]?.length ?? 2
    const heading = (match[2] ?? '').trim()

    if (!heading) {
      continue
    }

    const start = match.index + match[0].length
    const end = nextMatch?.index ?? markdown.length
    const content = markdown.slice(start, end).trim()

    sections.push({
      heading,
      content,
      level,
    })
  }

  if (sections.length === 0) {
    return null
  }

  return { sections }
}

function parseVision(markdown: string): string | null {
  const visionMatch = markdown.match(/\*\*Vision:\*\*\s*(.+)/i)
  return visionMatch?.[1]?.trim() || null
}

function parseRoadmapSuccessCriteria(markdown: string): string[] {
  const successCriteriaSection = extractSection(markdown, 'Success Criteria')
  if (!successCriteriaSection) {
    return []
  }

  return successCriteriaSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
}

function parseRoadmapSliceLine(line: string): Omit<ParsedRoadmapSlice, 'demo'> | null {
  const sliceMatch = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*\*\*S(\d+):\s*(.+?)\*\*(.*)$/)
  if (!sliceMatch) {
    return null
  }

  const done = (sliceMatch[1] ?? '').toLowerCase() === 'x'
  const id = `S${sliceMatch[2]}`
  const title = (sliceMatch[3] ?? '').trim()
  const metadata = sliceMatch[4] ?? ''

  const tags = Array.from(metadata.matchAll(/`([^`]+)`/g)).map((match) => match[1] ?? '')

  const riskTag = tags.find((tag) => tag.toLowerCase().startsWith('risk:')) ?? 'risk:low'
  const risk = normalizeRoadmapRisk(riskTag.split(':')[1])

  const dependsTag = tags.find((tag) => tag.toLowerCase().startsWith('depends:'))
  const depends = parseDependsValue(dependsTag)

  return {
    id,
    title,
    risk,
    depends,
    done,
  }
}

function normalizeRoadmapRisk(value?: string): RoadmapRisk {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized
  }

  return 'low'
}

function parseDependsValue(dependsTag?: string): string[] {
  if (!dependsTag) {
    return []
  }

  const dependsMatch = dependsTag.match(/depends:\[([^\]]*)\]/i)
  const dependsValue = dependsMatch?.[1]?.trim() ?? ''

  if (!dependsValue) {
    return []
  }

  return dependsValue
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean)
}

function findDemoLine(lines: string[], startIndex: number): string | null {
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]?.trim() ?? ''

    if (!line) {
      continue
    }

    if (/^[-*]\s*\[( |x|X)\]\s*\*\*S\d+:/.test(line)) {
      break
    }

    if (line.startsWith('>')) {
      return line.replace(/^>\s*/, '').trim()
    }
  }

  return null
}

function parseBoundaryMap(markdown: string): ParsedRoadmapBoundarySection[] {
  const boundaryMapSection = extractSection(markdown, 'Boundary Map')
  if (!boundaryMapSection) {
    return []
  }

  const lines = boundaryMapSection.split('\n')
  const sections: ParsedRoadmapBoundarySection[] = []
  let currentSection: ParsedRoadmapBoundarySection | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.+)$/)
    if (headingMatch) {
      currentSection = {
        heading: headingMatch[1]?.trim() ?? 'Boundary',
        content: '',
      }
      sections.push(currentSection)
      continue
    }

    if (!currentSection) {
      continue
    }

    currentSection.content = [currentSection.content, line]
      .filter((chunk) => chunk.length > 0)
      .join('\n')
      .trim()
  }

  return sections.filter((section) => section.content.length > 0)
}

function parseRequirementSection(
  markdown: string,
  sectionHeading: string,
  fallbackStatus: RequirementStatus,
): ParsedRequirement[] {
  const section = extractSection(markdown, sectionHeading)
  if (!section) {
    return []
  }

  const requirementHeadingPattern = /^###\s+R(\d+)\s+[—-]\s+(.+)$/gm
  const headingMatches = Array.from(section.matchAll(requirementHeadingPattern))
  const requirements: ParsedRequirement[] = []

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index]
    const nextMatch = headingMatches[index + 1]

    if (!match || match.index === undefined) {
      continue
    }

    const id = `R${match[1]}`
    const title = (match[2] ?? '').trim()
    const blockStart = match.index + match[0].length
    const blockEnd = nextMatch?.index ?? section.length
    const block = section.slice(blockStart, blockEnd)

    requirements.push({
      id,
      title,
      class: parseRequirementField(block, 'Class'),
      status: parseRequirementField(block, 'Status') || fallbackStatus,
      description: parseRequirementField(block, 'Description'),
      owner: parseRequirementField(block, 'Primary owning slice'),
      validation: parseRequirementField(block, 'Validation'),
    })
  }

  return requirements
}

function parseRequirementField(block: string, fieldName: string): string {
  const escapedFieldName = escapeRegExp(fieldName)
  const matcher = new RegExp(`^[*-]\\s*${escapedFieldName}:\\s*(.+)$`, 'im')
  const fieldMatch = block.match(matcher)
  return fieldMatch?.[1]?.trim() ?? ''
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function buildHeaderIndexMap(headers: string[]): Map<string, number> {
  const headerMap = new Map<string, number>()

  headers.forEach((header, index) => {
    const normalized = header
      .toLowerCase()
      .replace(/\\#/g, '#')
      .replace(/\?/g, '')
      .trim()

    if (normalized) {
      headerMap.set(normalized, index)
    }
  })

  return headerMap
}

function parseRevisableCell(value: string): { value: boolean | null; condition: string | null } {
  const trimmed = value.trim()
  const normalized = trimmed.toLowerCase()

  if (normalized.startsWith('no')) {
    return { value: false, condition: null }
  }

  if (normalized.startsWith('yes')) {
    const conditionMatch = trimmed.match(/^yes\s*[—-]\s*(.+)$/i)
    return {
      value: true,
      condition: conditionMatch?.[1]?.trim() || null,
    }
  }

  return { value: null, condition: null }
}

function extractSection(markdown: string, heading: string): string | null {
  const headingMatches = Array.from(markdown.matchAll(SECTION_HEADING_PATTERN))

  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index]
    if (!match || match.index === undefined) {
      continue
    }

    if ((match[1] ?? '').trim().toLowerCase() !== heading.toLowerCase()) {
      continue
    }

    const nextMatch = headingMatches[index + 1]
    const start = match.index + match[0].length
    const end = nextMatch?.index ?? markdown.length

    return markdown.slice(start, end).trim() || null
  }

  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function listTopLevelSections(markdown: string): string[] {
  return Array.from(markdown.matchAll(SECTION_HEADING_PATTERN)).map((match) => match[1]?.trim() ?? '')
}
