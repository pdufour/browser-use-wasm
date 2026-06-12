/**
 * Rendered once with constant vdom — `createVoiceNavController` owns the
 * textContent/dataset of these nodes, so React must never rewrite them.
 */
export function VoicePanel() {
  return (
    <section className="voice-panel" aria-label="Voice navigation">
      <div className="voice-panel__controls">
        <button
          id="btn-voice-toggle"
          type="button"
          className="voice-panel__toggle"
          data-testid="btn-voice-toggle"
          aria-pressed="false"
        >
          Voice
        </button>
        <span id="voice-status" className="voice-panel__status" data-testid="voice-status">
          Voice: off
        </span>
      </div>
      <p
        id="voice-transcript"
        className="voice-transcript"
        data-testid="voice-transcript"
        data-kind="hint"
      >
        Say a target label or a voice command.
      </p>
    </section>
  );
}
