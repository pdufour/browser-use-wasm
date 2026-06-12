/**
 * Off-screen shelf: capture is automatic in the visible UI, but the E2E suite
 * (and power users) still drive `#btn-capture` / `#btn-load-model` directly.
 */
export function E2eShelf({ loadDisabled, onLoadModel, captureDisabled, onCapture }) {
  return (
    <div className="e2e-shelf" aria-hidden="true">
      <button
        id="btn-capture"
        type="button"
        className="btn-operator"
        data-testid="btn-capture"
        disabled={captureDisabled}
        onClick={onCapture}
      >
        Capture page
      </button>
      <button
        id="btn-load-model"
        type="button"
        className="btn-operator"
        data-testid="btn-load-model"
        disabled={loadDisabled}
        onClick={onLoadModel}
      >
        Reload model
      </button>
    </div>
  );
}
