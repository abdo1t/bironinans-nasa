// Shared FLIP reorder animation for ranked lists (LiveRanking, SiteCards).
import { useLayoutEffect, useRef } from 'react'

const reduceMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/**
 * FLIP reorder animation: rows keep their DOM node (keyed by site id); after each reorder the
 * row slides from its old position to the new one. A row that changed rank also gets a short
 * tinted flash (up / down). ~380 ms, transform + background only; skipped with reduced motion.
 */
export function useFlip(listRef, orderKey) {
  const last = useRef({ tops: new Map(), ranks: new Map() })
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const tops = new Map()
    const ranks = new Map()
    const animate = !reduceMotion() && typeof Element !== 'undefined' && 'animate' in Element.prototype
    for (const el of list.querySelectorAll('[data-flip-id]')) {
      const id = el.dataset.flipId
      const top = el.offsetTop
      const rank = Number(el.dataset.rank)
      tops.set(id, top)
      ranks.set(id, rank)
      const prevTop = last.current.tops.get(id)
      const prevRank = last.current.ranks.get(id)
      if (!animate || prevTop === undefined) continue
      const dy = prevTop - top
      if (dy) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
          duration: 380,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
      }
      if (prevRank && rank && prevRank !== rank) {
        const tint = rank < prevRank ? 'rgba(110, 214, 168, 0.22)' : 'rgba(242, 166, 90, 0.2)'
        el.animate([{ backgroundColor: tint }, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 1100, easing: 'ease-out' })
      }
    }
    last.current = { tops, ranks }
  }, [listRef, orderKey])
}
