import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback
      const showDetails = import.meta.env.DEV
      return (
        <div className="min-h-screen bg-zuri-light flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
            <h1 className="text-xl font-bold text-zuri-black mb-2">Something went wrong</h1>
            {showDetails ? (
              <p className="text-gray-600 text-sm mb-4 break-all">{this.state.error.message}</p>
            ) : (
              <p className="text-gray-600 text-sm mb-4">
                An unexpected error occurred. Please refresh the page or go back home.
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="bg-zuri-black text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 transition mr-2"
            >
              Try again
            </button>
            <a href="/" className="inline-block bg-zuri-yellow text-zuri-black px-4 py-2 rounded-lg font-semibold hover:bg-yellow-400 transition">
              Go home
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
