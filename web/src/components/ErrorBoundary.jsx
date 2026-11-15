import { Component } from 'react'

/** Shows a recoverable message instead of a blank page when a screen fails to render. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ui] render error', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <section className="page empty-state" role="alert">
        <h1>Something went wrong on this screen</h1>
        <p>The page could not be displayed. Your selection is kept in the address bar, so reloading usually helps.</p>
        <details>
          <summary>Technical details</summary>
          <pre className="app-error__pre">{String(error?.message || error)}</pre>
        </details>
        <p className="app-error__actions">
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn--ghost" href={import.meta.env.BASE_URL}>
            Back to start
          </a>
        </p>
      </section>
    )
  }
}
