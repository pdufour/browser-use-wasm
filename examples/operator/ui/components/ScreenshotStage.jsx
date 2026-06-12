/**
 * Vision buffer mount — canvas and click marker are appended imperatively.
 * Visible inside open Developer details (Cmd/Ctrl+Shift+S toggles snapshot view).
 */
export function ScreenshotStage() {
  return (
    <div
      id="screenshot-stage"
      className="screenshot-stage dev-capture-mount empty"
      data-testid="screenshot-stage"
    />
  );
}
