/**
 * Tests for dagre-adapter utilities — focused on clipEndpointsToNodes().
 *
 * Verifies that edge endpoints are correctly clipped to node boundaries
 * after orthogonal snapping changes the approach direction.
 */
import { describe, it, expect } from 'bun:test'
import { clipEndpointsToNodes, snapToOrthogonal, type NodeRect } from '../dagre-adapter.ts'

/** A node centered at (200, 250) with width=120, height=68 (like a class box) */
const courseNode: NodeRect = { cx: 200, cy: 250, hw: 60, hh: 34 }

/** A node centered at (100, 50) with width=120, height=60 */
const teacherNode: NodeRect = { cx: 100, cy: 50, hw: 60, hh: 30 }

/** A node centered at (300, 50) with same size */
const studentNode: NodeRect = { cx: 300, cy: 50, hw: 60, hh: 30 }

// ============================================================================
// clipEndpointsToNodes — basic behavior
// ============================================================================

describe('clipEndpointsToNodes', () => {
  it('returns 2-point edges unchanged (direct orthogonal connections)', () => {
    const points = [{ x: 100, y: 80 }, { x: 100, y: 216 }]
    const result = clipEndpointsToNodes(points, teacherNode, courseNode)
    expect(result).toEqual(points)
  })

  it('returns 1-point or empty edges unchanged', () => {
    expect(clipEndpointsToNodes([], null, null)).toEqual([])
    expect(clipEndpointsToNodes([{ x: 0, y: 0 }], null, null)).toEqual([{ x: 0, y: 0 }])
  })

  it('does not mutate the input array', () => {
    const points = [
      { x: 100, y: 80 },
      { x: 100, y: 216 },
      { x: 200, y: 216 },
    ]
    const original = points.map(p => ({ ...p }))
    clipEndpointsToNodes(points, teacherNode, courseNode)
    expect(points).toEqual(original)
  })

  // ============================================================================
  // Target endpoint — horizontal last segment
  // ============================================================================

  describe('target endpoint — horizontal last segment', () => {
    it('clips to LEFT side at vertical center when approaching from left', () => {
      // Last segment goes left→right, ending at top of course
      const points = [
        { x: 100, y: 80 },    // source bottom
        { x: 100, y: 216 },   // bend
        { x: 200, y: 216 },   // target (top edge, wrong!)
      ]
      const result = clipEndpointsToNodes(points, null, courseNode)

      // Last point should be on LEFT side (cx - hw = 140) at vertical center (cy = 250)
      expect(result[2]!.x).toBe(140)
      expect(result[2]!.y).toBe(250)
      // Bend point Y adjusted to match
      expect(result[1]!.y).toBe(250)
      // Bend point X preserved
      expect(result[1]!.x).toBe(100)
    })

    it('clips to RIGHT side at vertical center when approaching from right', () => {
      // Last segment goes right→left
      const points = [
        { x: 300, y: 80 },
        { x: 300, y: 216 },
        { x: 200, y: 216 },   // approaching from right
      ]
      const result = clipEndpointsToNodes(points, null, courseNode)

      // Last point should be on RIGHT side (cx + hw = 260) at vertical center
      expect(result[2]!.x).toBe(260)
      expect(result[2]!.y).toBe(250)
      expect(result[1]!.y).toBe(250)
    })
  })

  // ============================================================================
  // Target endpoint — vertical last segment
  // ============================================================================

  describe('target endpoint — vertical last segment', () => {
    it('clips to TOP at horizontal center when approaching from above', () => {
      // Last segment goes top→bottom
      const points = [
        { x: 200, y: 80 },
        { x: 200, y: 150 },
        { x: 200, y: 250 },   // at center (wrong, should be at top boundary)
      ]
      const result = clipEndpointsToNodes(points, null, courseNode)

      // Last point: top edge (cy - hh = 216) at horizontal center (cx = 200)
      expect(result[2]!.x).toBe(200)
      expect(result[2]!.y).toBe(216)
      // Bend X adjusted
      expect(result[1]!.x).toBe(200)
    })

    it('clips to BOTTOM at horizontal center when approaching from below', () => {
      const points = [
        { x: 200, y: 400 },
        { x: 200, y: 350 },
        { x: 200, y: 250 },   // approaching from below
      ]
      const result = clipEndpointsToNodes(points, null, courseNode)

      // Last point: bottom edge (cy + hh = 284)
      expect(result[2]!.x).toBe(200)
      expect(result[2]!.y).toBe(284)
    })
  })

  // ============================================================================
  // Source endpoint — horizontal first segment
  // ============================================================================

  describe('source endpoint — horizontal first segment', () => {
    it('clips to RIGHT side at vertical center when exiting rightward', () => {
      const points = [
        { x: 100, y: 80 },   // at bottom, maybe off-center
        { x: 200, y: 80 },   // horizontal exit
        { x: 200, y: 216 },
      ]
      const result = clipEndpointsToNodes(points, teacherNode, null)

      // First point: right side (cx + hw = 160) at vertical center (cy = 50)
      expect(result[0]!.x).toBe(160)
      expect(result[0]!.y).toBe(50)
      // Second point Y adjusted
      expect(result[1]!.y).toBe(50)
    })

    it('clips to LEFT side at vertical center when exiting leftward', () => {
      const points = [
        { x: 100, y: 80 },
        { x: 50, y: 80 },
        { x: 50, y: 216 },
      ]
      const result = clipEndpointsToNodes(points, teacherNode, null)

      // First point: left side (cx - hw = 40) at vertical center
      expect(result[0]!.x).toBe(40)
      expect(result[0]!.y).toBe(50)
    })
  })

  // ============================================================================
  // Source endpoint — vertical first segment
  // ============================================================================

  describe('source endpoint — vertical first segment', () => {
    it('clips to BOTTOM at horizontal center when exiting downward', () => {
      const points = [
        { x: 115, y: 80 },    // slightly off-center
        { x: 115, y: 150 },
        { x: 200, y: 150 },
      ]
      const result = clipEndpointsToNodes(points, teacherNode, null)

      // First point: bottom edge (cy + hh = 80) at horizontal center (cx = 100)
      expect(result[0]!.x).toBe(100)
      expect(result[0]!.y).toBe(80)
      // Second point X adjusted to match
      expect(result[1]!.x).toBe(100)
    })

    it('clips to TOP at horizontal center when exiting upward', () => {
      const points = [
        { x: 100, y: 50 },
        { x: 100, y: 10 },
        { x: 200, y: 10 },
      ]
      const result = clipEndpointsToNodes(points, teacherNode, null)

      // First point: top edge (cy - hh = 20) at horizontal center
      expect(result[0]!.x).toBe(100)
      expect(result[0]!.y).toBe(20)
    })
  })

  // ============================================================================
  // Both endpoints adjusted
  // ============================================================================

  describe('both endpoints adjusted', () => {
    it('fixes both source and target in a multi-segment path', () => {
      // Simulates: Teacher (top-left) → Course (bottom-center)
      // After snapToOrthogonal(verticalFirst=true):
      // path goes: down from source, right, down, right to target top
      const points = [
        { x: 115, y: 80 },     // source bottom (off-center)
        { x: 115, y: 150 },    // bend
        { x: 150, y: 150 },    // bend
        { x: 150, y: 216 },    // bend
        { x: 200, y: 216 },    // target top (wrong side)
      ]
      const result = clipEndpointsToNodes(points, teacherNode, courseNode)

      // Source: vertical exit downward → bottom at horizontal center
      expect(result[0]!.x).toBe(100)  // teacherNode.cx
      expect(result[0]!.y).toBe(80)   // teacherNode.cy + hh
      expect(result[1]!.x).toBe(100)  // adjusted to match

      // Target: horizontal approach from left → left side at vertical center
      expect(result[4]!.x).toBe(140)  // courseNode.cx - hw
      expect(result[4]!.y).toBe(250)  // courseNode.cy
      expect(result[3]!.y).toBe(250)  // adjusted to match
    })
  })

  // ============================================================================
  // null node skipping
  // ============================================================================

  describe('null node handling', () => {
    it('skips source clipping when sourceNode is null', () => {
      const points = [
        { x: 115, y: 80 },
        { x: 115, y: 216 },
        { x: 200, y: 216 },
      ]
      const result = clipEndpointsToNodes(points, null, courseNode)

      // Source unchanged
      expect(result[0]).toEqual({ x: 115, y: 80 })
      // Target adjusted
      expect(result[2]!.x).toBe(140)
    })

    it('skips target clipping when targetNode is null', () => {
      const points = [
        { x: 115, y: 80 },
        { x: 115, y: 216 },
        { x: 200, y: 216 },
      ]
      const result = clipEndpointsToNodes(points, teacherNode, null)

      // Target unchanged
      expect(result[2]).toEqual({ x: 200, y: 216 })
      // Source adjusted
      expect(result[0]!.x).toBe(100)
    })

    it('returns copy unchanged when both nodes are null', () => {
      const points = [
        { x: 100, y: 80 },
        { x: 100, y: 150 },
        { x: 200, y: 150 },
      ]
      const result = clipEndpointsToNodes(points, null, null)
      expect(result).toEqual(points)
    })
  })

  // ============================================================================
  // Orthogonality preservation
  // ============================================================================

  describe('orthogonality preservation', () => {
    it('maintains orthogonal segments after clipping', () => {
      const points = [
        { x: 115, y: 80 },
        { x: 115, y: 150 },
        { x: 150, y: 150 },
        { x: 150, y: 216 },
        { x: 200, y: 216 },
      ]
      const result = clipEndpointsToNodes(points, teacherNode, courseNode)

      // Verify each consecutive pair is orthogonal (same x or same y)
      for (let i = 0; i < result.length - 1; i++) {
        const a = result[i]!
        const b = result[i + 1]!
        const sameX = Math.abs(a.x - b.x) < 1
        const sameY = Math.abs(a.y - b.y) < 1
        expect(sameX || sameY).toBe(true)
      }
    })
  })
})

// ============================================================================
// Integration: snapToOrthogonal + clipEndpointsToNodes pipeline
// ============================================================================

describe('snapToOrthogonal + clipEndpointsToNodes pipeline', () => {
  it('produces correct path for TB layout with offset nodes', () => {
    // Simulates dagre raw points for Teacher→Course in TB layout
    // Dagre returns: [srcBoundary, midpoint, tgtBoundary]
    const rawPoints = [
      { x: 115, y: 80 },    // bottom of Teacher, slightly right of center
      { x: 150, y: 150 },   // intermediate routing point
      { x: 183, y: 216 },   // top of Course, slightly left of center
    ]

    const ortho = snapToOrthogonal(rawPoints, true)
    const result = clipEndpointsToNodes(ortho, teacherNode, courseNode)

    // Source should exit from bottom center of Teacher
    expect(result[0]!.x).toBe(teacherNode.cx)
    expect(result[0]!.y).toBe(teacherNode.cy + teacherNode.hh)

    // Target should connect to a side at vertical center of Course
    const lastPt = result[result.length - 1]!
    expect(lastPt.y).toBe(courseNode.cy)
    // Should be on left or right boundary
    expect(
      lastPt.x === courseNode.cx - courseNode.hw ||
      lastPt.x === courseNode.cx + courseNode.hw
    ).toBe(true)
  })

  it('produces correct path for LR layout', () => {
    // LR layout: nodes side by side, edge goes left→right
    const leftNode: NodeRect = { cx: 100, cy: 100, hw: 50, hh: 30 }
    const rightNode: NodeRect = { cx: 300, cy: 150, hw: 50, hh: 30 }

    const rawPoints = [
      { x: 150, y: 115 },   // right side of leftNode, slightly below center
      { x: 225, y: 130 },   // midpoint
      { x: 250, y: 145 },   // left side of rightNode, slightly above center
    ]

    const ortho = snapToOrthogonal(rawPoints, false)  // LR → horizontal-first
    const result = clipEndpointsToNodes(ortho, leftNode, rightNode)

    // Source should exit from right side at vertical center
    expect(result[0]!.x).toBe(leftNode.cx + leftNode.hw)
    expect(result[0]!.y).toBe(leftNode.cy)

    // Target should connect at correct boundary
    const lastPt = result[result.length - 1]!
    // Should be at left side or top/bottom at center
    expect(
      lastPt.x === rightNode.cx - rightNode.hw ||
      lastPt.x === rightNode.cx + rightNode.hw ||
      lastPt.y === rightNode.cy - rightNode.hh ||
      lastPt.y === rightNode.cy + rightNode.hh
    ).toBe(true)
  })
})
