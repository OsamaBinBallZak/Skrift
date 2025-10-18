import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import '../styles/globals.css'

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
    
    console.error('React Error Boundary:', error, errorInfo)
    
    // Log to Electron main process if available
    if (window.electronAPI?.logging) {
      window.electronAPI.logging.error(
        {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        },
        { type: 'react_error_boundary', timestamp: new Date().toISOString() }
      ).catch(console.error)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-red-800 mb-4">
              Something went wrong
            </h1>
            <p className="text-red-700 mb-6">
              The application encountered an unexpected error. Please restart the application.
            </p>
            <button
              onClick={() => {
                if (window.electronAPI?.app) {
                  window.electronAPI.app.quit()
                } else {
                  window.location.reload()
                }
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Restart Application
            </button>
            {import.meta.env.DEV && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-red-600 hover:text-red-800">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs text-red-800 bg-red-100 p-2 rounded overflow-auto">
                  {this.state.error?.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Remove loading state
const loadingElement = document.getElementById('loading')
if (loadingElement) {
  loadingElement.remove()
}

// Performance marking
if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('react-start')
}

// Create React root and render
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Performance measurement
if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('react-end')
  performance.measure('react-load-time', 'react-start', 'react-end')
  performance.measure('total-load-time', 'app-start', 'react-end')
  
  // Log performance in development
  if (import.meta.env.DEV) {
    setTimeout(() => {
      const measurements = performance.getEntriesByType('measure')
      measurements.forEach(measure => {
        console.log(`${measure.name}: ${measure.duration.toFixed(2)}ms`)
      })
    }, 100)
  }
}
