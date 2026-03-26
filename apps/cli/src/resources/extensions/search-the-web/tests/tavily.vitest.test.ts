import { describe, test, expect } from 'vitest'
import { normalizeTavilyResult, publishedDateToAge, mapFreshnessToTavily } from '../tavily.js'
import type { TavilyResult } from '../tavily.js'

describe('tavily', () => {
  describe('normalizeTavilyResult', () => {
    test('maps basic result', () => {
      const input: TavilyResult = {
        title: 'Test Title',
        url: 'https://example.com',
        content: 'Some content',
        score: 0.95,
        published_date: null,
      }
      const result = normalizeTavilyResult(input)
      expect(result.title).toBe('Test Title')
      expect(result.url).toBe('https://example.com')
      expect(result.description).toBe('Some content')
      expect(result.age).toBeUndefined()
    })

    test('uses (untitled) for empty title', () => {
      const input: TavilyResult = { title: '', url: 'https://x.com', content: 'c', score: 0.5 }
      expect(normalizeTavilyResult(input).title).toBe('(untitled)')
    })

    test('uses empty string for empty content', () => {
      const input: TavilyResult = { title: 'T', url: 'https://x.com', content: '', score: 0.5 }
      expect(normalizeTavilyResult(input).description).toBe('')
    })

    test('computes age from published_date', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString()
      const input: TavilyResult = {
        title: 'T', url: 'https://x.com', content: 'c', score: 0.5,
        published_date: yesterday,
      }
      expect(normalizeTavilyResult(input).age).toBe('1 day ago')
    })
  })

  describe('publishedDateToAge', () => {
    test('just now for recent dates', () => {
      const now = new Date().toISOString()
      expect(publishedDateToAge(now)).toBe('just now')
    })

    test('minutes ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      expect(publishedDateToAge(fiveMinAgo)).toBe('5 minutes ago')
    })

    test('1 minute ago (singular)', () => {
      const oneMinAgo = new Date(Date.now() - 90 * 1000).toISOString()
      expect(publishedDateToAge(oneMinAgo)).toBe('1 minute ago')
    })

    test('hours ago', () => {
      const threeHrsAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString()
      expect(publishedDateToAge(threeHrsAgo)).toBe('3 hours ago')
    })

    test('1 hour ago (singular)', () => {
      const oneHrAgo = new Date(Date.now() - 3600 * 1000).toISOString()
      expect(publishedDateToAge(oneHrAgo)).toBe('1 hour ago')
    })

    test('days ago', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 86400 * 1000).toISOString()
      expect(publishedDateToAge(fiveDaysAgo)).toBe('5 days ago')
    })

    test('months ago', () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 86400 * 1000).toISOString()
      expect(publishedDateToAge(twoMonthsAgo)).toBe('2 months ago')
    })

    test('years ago', () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 86400 * 1000).toISOString()
      expect(publishedDateToAge(twoYearsAgo)).toBe('2 years ago')
    })

    test('future date returns undefined', () => {
      const future = new Date(Date.now() + 86400 * 1000).toISOString()
      expect(publishedDateToAge(future)).toBeUndefined()
    })

    test('invalid date returns undefined', () => {
      expect(publishedDateToAge('not-a-date')).toBeUndefined()
    })
  })

  describe('mapFreshnessToTavily', () => {
    test('pd → day', () => expect(mapFreshnessToTavily('pd')).toBe('day'))
    test('pw → week', () => expect(mapFreshnessToTavily('pw')).toBe('week'))
    test('pm → month', () => expect(mapFreshnessToTavily('pm')).toBe('month'))
    test('py → year', () => expect(mapFreshnessToTavily('py')).toBe('year'))
    test('null → null', () => expect(mapFreshnessToTavily(null)).toBeNull())
    test('unknown → null', () => expect(mapFreshnessToTavily('unknown')).toBeNull())
  })
})
