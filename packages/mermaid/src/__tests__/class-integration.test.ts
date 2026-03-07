/**
 * Integration tests for class diagrams — end-to-end parse → layout → render.
 */
import { describe, it, expect } from 'bun:test'
import { renderMermaid } from '../index.ts'

describe('renderMermaid – class diagrams', () => {
  it('renders a basic class diagram to valid SVG', async () => {
    const svg = await renderMermaid(`classDiagram
      class Animal {
        +String name
        +eat() void
      }`)
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('Animal')
    expect(svg).toContain('name')
    expect(svg).toContain('eat')
  })

  it('renders class with annotation', async () => {
    const svg = await renderMermaid(`classDiagram
      class Flyable {
        <<interface>>
        +fly() void
      }`)
    expect(svg).toContain('interface')
    expect(svg).toContain('Flyable')
    expect(svg).toContain('fly')
  })

  it('renders inheritance relationship with triangle marker', async () => {
    const svg = await renderMermaid(`classDiagram
      Animal <|-- Dog`)
    expect(svg).toContain('Animal')
    expect(svg).toContain('Dog')
    // Inheritance uses a hollow triangle marker
    expect(svg).toContain('cls-inherit')
  })

  it('renders composition with filled diamond', async () => {
    const svg = await renderMermaid(`classDiagram
      Car *-- Engine`)
    expect(svg).toContain('cls-composition')
  })

  it('renders aggregation with hollow diamond', async () => {
    const svg = await renderMermaid(`classDiagram
      University o-- Department`)
    expect(svg).toContain('cls-aggregation')
  })

  it('renders dependency with dashed line', async () => {
    const svg = await renderMermaid(`classDiagram
      Service ..> Repository`)
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('cls-arrow')
  })

  it('renders realization with dashed line and triangle', async () => {
    const svg = await renderMermaid(`classDiagram
      Bird ..|> Flyable`)
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('cls-inherit')
  })

  it('renders relationship labels', async () => {
    const svg = await renderMermaid(`classDiagram
      Customer --> Order : places`)
    expect(svg).toContain('places')
  })

  it('renders class compartments with divider lines', async () => {
    const svg = await renderMermaid(`classDiagram
      class Animal {
        +String name
        +eat() void
      }`)
    // Should have horizontal divider lines between compartments
    const lines = svg.match(/<line /g) ?? []
    // At least 2 dividers (header-attrs, attrs-methods)
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })

  it('renders with dark colors', async () => {
    const svg = await renderMermaid(`classDiagram
      class A {
        +x int
      }`, { bg: '#18181B', fg: '#FAFAFA' })
    expect(svg).toContain('--bg:#18181B')
  })

  it('renders a complete class hierarchy', async () => {
    const svg = await renderMermaid(`classDiagram
      class Animal {
        <<abstract>>
        +String name
        +eat() void
      }
      class Dog {
        +String breed
        +bark() void
      }
      class Cat {
        +bool isIndoor
        +meow() void
      }
      Animal <|-- Dog
      Animal <|-- Cat`)
    expect(svg).toContain('Animal')
    expect(svg).toContain('Dog')
    expect(svg).toContain('Cat')
    expect(svg).toContain('abstract')
  })
})
