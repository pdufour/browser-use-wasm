import { ScreenshotStage } from './ScreenshotStage.jsx';

/**
 * Collapsible developer panel — matches browse / gallery task runner layout.
 */
export function DeveloperDetails({ status, raw }) {
  return (
    <div className="dev-details-shell">
      <details id="dev-details" className="dev-details">
        <summary className="dev-details__summary">
          <span className="dev-details__title">Developer details</span>
          <span id="dev-status-badge" className="dev-status-badge" data-state="idle">
            Ready
          </span>
        </summary>
        <div className="dev-details__body">
          <div id="dev-action-pipeline" className="dev-action-pipeline" hidden />
          <p id="arena-status" className="arena-technical" hidden />
          <span
            id="model-status"
            className="dev-chrome-line"
            data-testid="model-status"
            aria-live="polite"
          >
            {status}
          </span>

          <section className="dev-panel">
            <header className="dev-panel__head">
              <h3 className="dev-panel__title">Screenshot buffer</h3>
              <p className="dev-panel__hint">
                SnapDOM capture the model sees — red dot is the grounded click
              </p>
            </header>
            <ScreenshotStage />
          </section>

          <section className="dev-panel dev-panel--output">
            <header className="dev-panel__head">
              <h3 className="dev-panel__title">Model output</h3>
            </header>
            <pre id="raw-output" className="raw-output" data-testid="raw-output">
              {raw || 'Model output will appear here.'}
            </pre>
          </section>
        </div>
      </details>
    </div>
  );
}
