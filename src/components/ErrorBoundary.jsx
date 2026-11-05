import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full flex items-center justify-center p-6 text-center" data-testid="error-boundary">
        <div className="max-w-[44ch]">
          <p className="m-0 font-medium">{this.props.title ?? 'This part of turnbase failed to load.'}</p>
          <p className="mt-1 mb-4 text-graphite text-[0.8125rem]">
            Your solves are safe: they are stored separately on this device. {String(this.state.error?.message ?? '')}
          </p>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
