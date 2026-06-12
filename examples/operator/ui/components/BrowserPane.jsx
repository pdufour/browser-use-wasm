import { BUILTIN_BROWSE_PATH } from '../../../shared/browse-defaults.js';

export function BrowserPane({
  address,
  onAddressChange,
  onNavigate,
  onRefresh,
  loading,
  orbitPulse,
}) {
  return (
    <div className={`browser-pane${orbitPulse ? ' is-orbit-pulse' : ''}`}>
      <div className="browser-url-bar">
        <div className="browser-nav">
          <button
            type="button"
            className="browser-icon-btn"
            id="btn-browser-refresh"
            data-testid="btn-browser-refresh"
            aria-label="Reload page"
            title="Reload page (⌘R)"
            onClick={onRefresh}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"
              />
              <path
                fill="currentColor"
                d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"
              />
            </svg>
          </button>
        </div>
        <input
          id="browser-address"
          className="browser-address"
          type="url"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onNavigate();
            }
          }}
          placeholder="https://example.com or /browse-fixture/index.html"
          aria-label="Address"
          spellCheck="false"
        />
      </div>

      <div
        className={`browser-viewport${loading ? ' is-loading' : ''}`}
        id="browser-viewport"
        data-testid="browser-viewport"
      >
        <div
          className="browser-loading"
          id="browser-loading"
          data-testid="browser-loading"
          hidden={!loading}
          aria-live="polite"
        >
          Loading page…
        </div>
        <iframe
          id="browse-frame"
          className="browse-frame viewport-live"
          data-testid="browse-frame"
          title="Browse"
          src={BUILTIN_BROWSE_PATH}
        />
      </div>
    </div>
  );
}
