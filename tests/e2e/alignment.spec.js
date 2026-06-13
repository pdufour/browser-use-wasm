import { test } from '@playwright/test';
import {
  GEMMA_NANO_MOCK_CLICK_NX,
  GEMMA_NANO_MOCK_CLICK_NY,
  runE2EGemmaNanoMarkerPointerAlignment,
} from './e2e.js';

test.describe('gemma-nano alignment (mocked Prompt API)', () => {
  test('marker on screenshot matches live pointer at grounded point', async ({ page, baseURL }) => {
    await runE2EGemmaNanoMarkerPointerAlignment(page, baseURL, {
      nx: GEMMA_NANO_MOCK_CLICK_NX,
      ny: GEMMA_NANO_MOCK_CLICK_NY,
    });
  });
});
