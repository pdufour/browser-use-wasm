import {
  MODELS,
  BROWSER_VALIDATED_MODEL_IDS,
  canDownloadModelInBrowser,
  MODEL_SWITCHER_ID,
  MODEL_SWITCHER_TEST_ID,
} from 'browser-use-wasm';

function optionSuffix(model, cachedIds) {
  const parts = [];
  if (!BROWSER_VALIDATED_MODEL_IDS.includes(model.id)) parts.push('(experimental)');
  if (cachedIds.has(model.id)) parts.push('pre-cached');
  else if (canDownloadModelInBrowser(model)) parts.push('downloads on load');
  else parts.push('cache required');
  return parts.length ? ` — ${parts.join(', ')}` : '';
}

function isPickerEnabled(model, cachedIds) {
  return cachedIds.has(model.id) || canDownloadModelInBrowser(model);
}

export function ModelSwitcher({ value, cachedIds, onSwitch, disabled = false }) {
  return (
    <div className="model-row" aria-label="Model selection">
      <label htmlFor={MODEL_SWITCHER_ID}>Model</label>
      <select
        id={MODEL_SWITCHER_ID}
        className="model-switcher"
        data-testid={MODEL_SWITCHER_TEST_ID}
        value={value}
        disabled={disabled}
        onChange={(e) => onSwitch(e.target.value)}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id} disabled={!isPickerEnabled(m, cachedIds)}>
            {m.label}
            {optionSuffix(m, cachedIds)}
          </option>
        ))}
      </select>
    </div>
  );
}
