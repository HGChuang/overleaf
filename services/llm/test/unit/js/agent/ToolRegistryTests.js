import { expect } from 'chai';
import { ToolRegistry, defaultToolRegistry } from '../../../../app/agent/tools/index.js';

describe('ToolRegistry', function () {
  afterEach(function () {
    defaultToolRegistry.clear();
  });

  it('starts empty by default', function () {
    const registry = new ToolRegistry();
    expect(registry.list()).to.deep.equal([]);
  });

  it('registers tools and returns a frozen copy', function () {
    const registry = new ToolRegistry();
    const tool = { name: 'placeholder' };
    registry.register(tool);

    const listed = registry.list();
    expect(listed).to.deep.equal([tool]);
    expect(Object.isFrozen(listed)).to.equal(true);
  });

  it('can clear the default registry', function () {
    defaultToolRegistry.register({ name: 'temp' });
    expect(defaultToolRegistry.list()).to.have.length(1);
    defaultToolRegistry.clear();
    expect(defaultToolRegistry.list()).to.deep.equal([]);
  });
});
