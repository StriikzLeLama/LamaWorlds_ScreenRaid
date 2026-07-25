import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Prevents a render crash from leaving a blank #root forever. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[SR] ErrorBoundary', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-raid-bg p-8 text-center">
          <h1 className="text-xl font-semibold text-raid-text">Something went wrong</h1>
          <p className="max-w-md text-sm text-raid-text-secondary">
            {this.state.error.message || 'Unexpected UI error'}
          </p>
          <button
            type="button"
            className="rounded-xl bg-raid-accent px-4 py-2 text-sm font-medium text-white hover:bg-raid-accent-hover"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/login');
            }}
          >
            Reload login
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
