import { expect } from 'chai';
import { LlmApp } from './helpers/LlmApp.js';

describe('llm server', function () {
  it('mounts the llm routes and returns 404 on unknown paths', async function () {
    const baseUrl = await LlmApp.baseUrl();
    const response = await fetch(`${baseUrl}/does-not-exist`);
    expect(response.status).to.equal(404);
  });
});
