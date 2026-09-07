import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { validateModelLimits } from '../../../app/services/model-limits.js';
import { ClientRegistry } from '../../../app/utils/clientRegistry.js';
import { createChatModel } from '../../../app/llm/modelFactory.js';

describe('user model context settings', () => {
  it('rejects non-integers, missing limits and budgets with no safe input space', () => {
    for (const limits of [null, {}, { contextWindow: '128000', maxTokens: 16000 },
      { contextWindow: 16000, maxTokens: 16000 }, { contextWindow: 8192, maxTokens: -1 },
      { contextWindow: 32000.5, maxTokens: 2000 }]) assert.throws(() => validateModelLimits(limits));
    assert.deepEqual(validateModelLimits({ contextWindow: 128000, maxTokens: 16000 }), { contextWindow: 128000, maxTokens: 16000 });
  });
  it('uses current user limits immediately and never reuses a descriptor with obsolete limits', async () => {
    const registry = new ClientRegistry({ createChatModel });
    try {
      const a = await registry.getChatModel('https://test.invalid/v1', 'test-key', 'configured-model', { contextWindow: 128000, maxTokens: 16000 });
      const repeated = await registry.getChatModel('https://test.invalid/v1', 'test-key', 'configured-model', { contextWindow: 128000, maxTokens: 16000 });
      const changed = await registry.getChatModel('https://test.invalid/v1', 'test-key', 'configured-model', { contextWindow: 64000, maxTokens: 8000 });
      assert.equal(a.model, repeated.model);
      assert.notEqual(a.model, changed.model);
      assert.equal(changed.model.contextWindow, 64000);
      assert.equal(changed.model.maxTokens, 8000);
      assert.equal(a.model.contextWindow, 128000);
    } finally { registry.close(); }
  });
});
