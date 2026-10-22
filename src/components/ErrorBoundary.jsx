import { Component } from "react";
import { reportError } from "../lib/monitoring.js";

/** A page that crashes shows a way out instead of a blank screen, and the crash gets reported. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack });
  }

  componentDidUpdate(prev) {
    // moving to another page gives it a fresh try
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page page-narrow">
        <p className="eyebrow">Ошибка</p>
        <h1 className="page-title">Что-то пошло не так</h1>
        <p className="lead">Страница не смогла открыться. Попробуйте обновить её — если не поможет, вернитесь на главную.</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <span className="btn-label">Обновить</span>
          </button>
          <a className="btn btn-ghost" href="/">
            <span className="btn-label">На главную</span>
          </a>
        </div>
      </div>
    );
  }
}
