export class ToolRegistry {
  constructor(initialTools = []) {
    this.tools = [...initialTools];
  }

  register(tool) {
    this.tools.push(tool);
    return tool;
  }

  list() {
    return Object.freeze([...this.tools]);
  }

  clear() {
    this.tools = [];
  }
}

export const defaultToolRegistry = new ToolRegistry();
