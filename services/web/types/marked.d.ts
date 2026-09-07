declare module 'marked' {
  export namespace marked {
    interface MarkedOptions {
      breaks?: boolean
      gfm?: boolean
      renderer?: Renderer
    }

    class Renderer {
      code(code: string, infostring?: string, escaped?: boolean): string
    }

    function parse(source: string, options?: MarkedOptions): string
    function setOptions(options: MarkedOptions): void
  }
}
