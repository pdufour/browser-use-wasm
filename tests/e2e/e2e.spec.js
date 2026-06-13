import { test } from '@playwright/test';
import {
  openE2eSession,
  runE2EAutoloadSmoke,
  runE2EBrowseRefreshReady,
  runE2ETaskBlockedWithoutCapture,
  runE2ERecaptureAfterTask,
  runE2EProductionJourney,
  runE2EProductionExperimentalFallback,
  runE2EPromptEmptyBlocksTask,
  runE2ESwitchUncachedReverts,
  runE2EGreenRound,
  runE2ETaskSignInNotSubmitBand,
  runE2ENoMarkerUntilTask,
  runE2ETaskCancelNotGreen,
  runE2ESecondTaskSubmit,
  runE2EFakeCursor,
  runE2EVoiceClickSubmit,
  runE2EVoiceBareSubmit,
  runE2EVoiceCapturePage,
  runE2EUiHelpOpensModal,
  runE2EVoicePressTab,
  runE2EVoiceModalEscape,
  runE2EVoiceToggleRemember,
  runE2EVoiceTypeEmail,
  runE2EVoiceFocusEmail,
  runE2EVoiceClearEmail,
  runE2EVoiceScrollDown,
  runE2EVoiceSelectCountry,
  runE2EVoiceHoverCancel,
  runE2EVoiceScrollToTop,
  runE2ETaskTypeEmailInput,
  runE2EPromptEnterSubmitsTask,
  runE2ESnapshotToggleShortcut,
  runE2EAddressBarNavigationTask,
  appendE2eResult,
  installE2eConsole,
  readManifestCachedModelIds,
  resolveUncachedPickerTarget,
  E2E_MODEL_ID,
  E2E_SWITCH_MODEL_ID,
  E2E_TEST_TIMEOUT_MS,
  E2E_BENCHMARK,
  E2E_BENCHMARK_TEST_TIMEOUT_MS,
  resolveBenchmarkModelIds,
  runE2EModelExpensiveSmoke,
  runE2ESwitchRoundTrip,
  runE2EGemmaNanoPromptApiTurnShape,
  runE2EGemmaNanoBootSmoke,
  runE2EGemmaNanoPixelPositionNorm,
  runE2EGemmaNanoClickSubmit,
} from './e2e.js';

/** @type {Set<string>} */
const manifestCached = readManifestCachedModelIds();
const uncachedPickerTarget = resolveUncachedPickerTarget(manifestCached);

/**
 * Serial gate — one validated model (`E2E_MODEL_ID`, default ShowUI-2B).
 * Multi-model comparison: `npm run test:benchmark` only.
 * @see `.cursor/rules/blackbox-e2e.mdc`
 */
test.describe.configure({ mode: 'serial', timeout: E2E_TEST_TIMEOUT_MS });

test.describe(`e2e ${E2E_MODEL_ID}`, () => {
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser, baseURL }) => {
    page = await browser.newPage();
    installE2eConsole(page);
    await openE2eSession(page, baseURL, E2E_MODEL_ID);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test(`Model ${E2E_MODEL_ID}: autoload smoke (loaded, capture on)`, async () => {
    await runE2EAutoloadSmoke(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: browse refresh clears loading overlay`, async () => {
    await runE2EBrowseRefreshReady(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: Run task blocked until capture ready`, async () => {
    await runE2ETaskBlockedWithoutCapture(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: re-capture after task still grounds Submit`, async () => {
    await runE2ERecaptureAfterTask(page, E2E_MODEL_ID);
  });

  test(`Production: load → capture → Run task without ?e2e=1`, async ({ browser, baseURL }) => {
    const prodPage = await browser.newPage();
    installE2eConsole(prodPage);
    try {
      await runE2EProductionJourney(prodPage, baseURL, E2E_MODEL_ID);
    } finally {
      await prodPage.close();
    }
  });

  test(`Production: ?model=GUI-G2-3B falls back to ShowUI-2B`, async ({ browser, baseURL }) => {
    const prodPage = await browser.newPage();
    installE2eConsole(prodPage);
    try {
      await runE2EProductionExperimentalFallback(prodPage, baseURL);
    } finally {
      await prodPage.close();
    }
  });

  test(`Model ${E2E_MODEL_ID}: empty prompt disables Run task`, async () => {
    await runE2EPromptEmptyBlocksTask(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: switch to uncached model reverts picker`, async () => {
    test.skip(
      !uncachedPickerTarget,
      'every loadable picker model is cached — skip uncached revert (or set E2E_UNCACHED_MODEL)'
    );
    await runE2ESwitchUncachedReverts(page, E2E_MODEL_ID, uncachedPickerTarget);
  });

  for (let i = 1; i <= 3; i++) {
    test(`${i}/3: Model ${E2E_MODEL_ID}: Submit finds green circle`, async () => {
      await runE2EGreenRound(page, {
        strictGreen: E2E_MODEL_ID === 'ShowUI-2B',
        modelId: E2E_MODEL_ID,
        round: i,
      });
    });
  }

  test(`Model ${E2E_MODEL_ID}: Sign in task is not Submit green band`, async () => {
    await runE2ETaskSignInNotSubmitBand(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: no marker until task after capture`, async () => {
    await runE2ENoMarkerUntilTask(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: UI Cancel task is not green`, async () => {
    await runE2ETaskCancelNotGreen(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: second Submit task on same capture`, async () => {
    await runE2ESecondTaskSubmit(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: fake cursor moves Submit then Cancel on screenshot`, async () => {
    await runE2EFakeCursor(page, undefined, E2E_MODEL_ID, { skipSession: true });
  });

  test(`Model ${E2E_MODEL_ID}: voice click Submit on screenshot`, async () => {
    await runE2EVoiceClickSubmit(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice bare Submit label`, async () => {
    await runE2EVoiceBareSubmit(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice capture page refreshes screenshot`, async () => {
    await runE2EVoiceCapturePage(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: UI Help button opens modal`, async () => {
    await runE2EUiHelpOpensModal(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice press Tab refreshes capture`, async () => {
    await runE2EVoicePressTab(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice Escape closes help modal`, async () => {
    await runE2EVoiceModalEscape(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice toggles Remember me checkbox`, async () => {
    await runE2EVoiceToggleRemember(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice types email on live page`, async () => {
    await runE2EVoiceTypeEmail(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice focus then blur email on live page`, async () => {
    await runE2EVoiceFocusEmail(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice clear email field`, async () => {
    await runE2EVoiceClearEmail(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice scroll down then re-capture`, async () => {
    await runE2EVoiceScrollDown(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice select Canada in Country`, async () => {
    await runE2EVoiceSelectCountry(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice hover Cancel on screenshot`, async () => {
    await runE2EVoiceHoverCancel(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: voice scroll to top resets form scroll`, async () => {
    await runE2EVoiceScrollToTop(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: snapshot toggle shortcut flips viewport`, async () => {
    await runE2ESnapshotToggleShortcut(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: prompt Enter submits goal and runs task`, async () => {
    await runE2EPromptEnterSubmitsTask(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: Run task INPUT types into email field`, async () => {
    await runE2ETaskTypeEmailInput(page, E2E_MODEL_ID);
  });

  test(`Model ${E2E_MODEL_ID}: address-bar navigation then Submit task`, async () => {
    await runE2EAddressBarNavigationTask(page, E2E_MODEL_ID);
  });
});

test.describe('gemma-nano Prompt API page', () => {
  test('maps ShowUI messages to one multimodal user turn', async ({ page, baseURL }) => {
    await runE2EGemmaNanoPromptApiTurnShape(page, baseURL);
  });

  test('boot finishes without stuck Starting', async ({ page, baseURL }) => {
    await runE2EGemmaNanoBootSmoke(page, baseURL);
  });

  test('normalizes pixel position using vision JPEG size', async ({ page, baseURL }) => {
    await runE2EGemmaNanoPixelPositionNorm(page, baseURL);
  });

  test('click Submit task works (Real Prompt API)', async ({ page, baseURL }) => {
    await runE2EGemmaNanoClickSubmit(page, baseURL);
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const modelId = testInfo.title.match(/Model (.+?):/)?.[1] ?? E2E_MODEL_ID;
  const caseName = testInfo.title.replace(/^[^:]+:\s*/, '').trim() || testInfo.title;
  appendE2eResult(modelId, {
    status: 'FAILED',
    case: caseName,
    error: testInfo.error?.message ?? String(testInfo.status),
  });
});

const benchmarkModelIds = resolveBenchmarkModelIds();

(E2E_BENCHMARK ? test.describe : test.describe.skip)(
  'e2e benchmark — compare all cached browser-loadable models',
  () => {
    test.describe.configure({ mode: 'serial', timeout: E2E_BENCHMARK_TEST_TIMEOUT_MS });

    /** @type {import('@playwright/test').Page} */
    let page;

    test.beforeAll(async ({ browser, baseURL }) => {
      page = await browser.newPage();
      installE2eConsole(page);
    });

    test.afterAll(async () => {
      await page?.close();
    });

    test(`Model ${E2E_MODEL_ID}: switch round-trip ↔ ${E2E_SWITCH_MODEL_ID}`, async () => {
      test.skip(
        !manifestCached.has(E2E_SWITCH_MODEL_ID),
        `${E2E_SWITCH_MODEL_ID} not in .model-cache — run npm run cache:model -- --model ${E2E_SWITCH_MODEL_ID}`
      );
      test.setTimeout(180_000);
      await runE2ESwitchRoundTrip(page, E2E_MODEL_ID, E2E_SWITCH_MODEL_ID);
    });

    for (const modelId of benchmarkModelIds) {
      test(`Model ${modelId}: load, capture, Submit task`, async ({ baseURL }) => {
        test.skip(
          !manifestCached.has(modelId),
          `${modelId} not in .model-cache/manifest.json — run: npm run cache:model -- --model ${modelId}`
        );
        await runE2EModelExpensiveSmoke(page, baseURL, modelId);
      });
    }
  }
);
