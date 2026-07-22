export class ToolRegistry {
  tools: any[];

  constructor(initialTools: any[] = []) {
    this.tools = [...initialTools];
  }

  register(tool: any) {
    this.tools.push(tool);
    return tool;
  }

  list(): readonly any[] {
    return Object.freeze([...this.tools]);
  }

  clear() {
    this.tools = [];
  }
}

export const defaultToolRegistry = new ToolRegistry();
