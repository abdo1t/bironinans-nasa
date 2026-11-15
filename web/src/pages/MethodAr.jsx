import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { METHOD_V1_DOC_URL } from '../lib/methodV1.js'
import '../styles/missiontests.css'

// Renders public/method-v1/METHOD_ar.md (method v1 explanation, Arabic) inside the app, right to
// left. A deliberately small Markdown subset — headings, paragraphs, lists, tables, code blocks,
// rules, **bold** and `code` — built as React elements (no HTML injection, no new dependency).

function inline(text, keyBase) {
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>)
    else
      out.push(
        <code key={`${keyBase}-${i++}`} dir="ltr">
          {tok.slice(1, -1)}
        </code>,
      )
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Pipes that belong to the text, e.g. "arctan(|∇z|)" or an escaped "\|", are protected
// before the row is split into cells.
const PIPE = '\u0000'
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .replace(/\\\||\(\||\|\)/g, (m) => m.replace('|', PIPE).replace('\\', ''))
    .split('|')
    .map((c) => c.trim().split(PIPE).join('|'))

/** Parse the Markdown subset into React blocks. */
function renderMarkdown(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    if (line.startsWith('```')) {
      const body = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i += 1
      blocks.push(
        <pre key={k++} dir="ltr" className="md-pre">
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const Tag = `h${Math.min(h[1].length + 1, 5)}`
      blocks.push(<Tag key={k++}>{inline(h[2], `h${k}`)}</Tag>)
      i += 1
      continue
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={k++} />)
      i += 1
      continue
    }
    if (line.trim().startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++])
      const [head, , ...body] = rows
      blocks.push(
        <div key={k++} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {cells(head).map((c, j) => (
                  <th key={j}>{inline(c, `th${k}-${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {cells(r).map((c, j) => (
                    <td key={j}>{inline(c, `td${k}-${ri}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items = []
      while (i < lines.length && /^\s*(-|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(-|\d+\.)\s+/, ''))
        i += 1
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={k++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `li${k}-${j}`)}</li>
          ))}
        </List>,
      )
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||\s*(-|\d+\.)\s+|---+\s*$)/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={k++}>{inline(para.join(' '), `p${k}`)}</p>)
  }
  return blocks
}

export default function MethodAr() {
  const [state, setState] = useState({ status: 'loading', text: '' })
  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}${METHOD_V1_DOC_URL}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => alive && setState({ status: 'ready', text }))
      .catch((e) => alive && setState({ status: 'error', text: e.message }))
    return () => {
      alive = false
    }
  }, [])

  return (
    <article className="page md-page" dir="rtl" lang="ar" aria-label="شرح المنهجية">
      <p className="md-back" dir="ltr">
        <Link to="/tests">← Mission tests</Link> ·{' '}
        <a href={`${import.meta.env.BASE_URL}${METHOD_V1_DOC_URL}`} download>
          Download METHOD_ar.md
        </a>
      </p>
      {state.status === 'loading' && (
        <p className="status" role="status">
          جارٍ التحميل…
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert">تعذّر تحميل ملف المنهجية ({state.text}).</p>
      )}
      {state.status === 'ready' && <div className="md-body">{renderMarkdown(state.text)}</div>}
    </article>
  )
}
