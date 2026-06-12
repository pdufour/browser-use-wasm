import { humanStatus } from '../../../shared/user-facing.js';
import { ModelSwitcher } from './ModelSwitcher.jsx';
import { ClearCacheButton } from './ClearCacheButton.jsx';
// Voice disabled for now — DOM hooks render only under ?e2e=1 for Playwright.
import { VoicePanel } from './VoicePanel.jsx';

/**
 * Bottom command bar (advance-branch skin). The send button keeps the
 * `#btn-task` contract id, and the toolbar keeps `.goal-panel` for the E2E
 * snapshot-overlap assertion.
 */
export function CommandBar({
  modelId,
  cachedIds,
  onSwitchModel,
  prompt,
  onPromptChange,
  promptDisabled,
  status,
  taskDisabled,
  onRunTask,
  busy,
  isE2e = false,
}) {
  return (
    <footer id="command-bar" className={`command-bar${busy ? ' is-running' : ''}`} aria-label="Goal command bar">
      <div className="command-bar__progress" hidden={!busy} role="status" aria-live="polite">
        <div className="command-bar__progress-head">
          <span className="command-bar__progress-label">{humanStatus(status)}</span>
          <span className="command-bar__progress-status dev-chrome-tech">{status}</span>
        </div>
        <div className="command-bar__progress-track" aria-hidden="true">
          <div className="command-bar__progress-bar" />
        </div>
      </div>

      <form
        id="goal-form"
        className="command-bar__form"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          onRunTask();
        }}
      >
        <div className="command-bar__sparkle" aria-hidden="true">✦</div>
        <input
          id="prompt"
          className="command-bar__input"
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Complete checkout, click Submit, open Help…"
          data-testid="prompt"
          aria-label="Goal"
          autoComplete="off"
          spellCheck="false"
          disabled={promptDisabled}
        />
        <button
          id="btn-task"
          type="submit"
          className="command-bar__send"
          data-testid="btn-task"
          title="Run the Goal as a task (↵) — ShowUI navigation: CLICK / INPUT / SELECT …"
          disabled={taskDisabled}
        >
          Go
        </button>
      </form>

      <div className="command-bar__toolbar goal-panel">
        <div className="command-bar__human-status" aria-live="polite">
          {humanStatus(status)}
        </div>
        <ClearCacheButton />
        {isE2e ? (
          <ModelSwitcher value={modelId} cachedIds={cachedIds} onSwitch={onSwitchModel} />
        ) : (
          <div className="dev-chrome-toolbar" aria-hidden="true">
            <ModelSwitcher
              value={modelId}
              cachedIds={cachedIds}
              onSwitch={() => {}}
              disabled
            />
          </div>
        )}
        {isE2e ? <VoicePanel /> : null}
      </div>
    </footer>
  );
}
