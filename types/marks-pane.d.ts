// Type definitions for marks-pane
// Project: marks-pane (custom local typings)

declare module 'marks-pane' {
  export class Pane {
    target: Node;
    element: SVGSVGElement;
    marks: Mark[];
    container: HTMLElement;
    constructor(target: Node, container?: HTMLElement);
    addMark(mark: Mark): Mark;
    removeMark(mark: Mark): void;
    render(): void;
  }

  export class Mark {
    element: HTMLElement | null;
    container: HTMLElement | null;
    range: Range;
    constructor();
    bind(element: HTMLElement, container: HTMLElement): void;
    unbind(): HTMLElement | null;
    render(): void;
    dispatchEvent(e: Event): void;
    getBoundingClientRect(): DOMRect;
    getClientRects(): DOMRect[];
    filteredRanges(): DOMRect[];
  }

  export class Highlight extends Mark {
    className: string;
    data: { [key: string]: string };
    attributes: Record<string, string | number | boolean>;
    constructor(
      range: Range,
      className?: string,
      data?: { [key: string]: string },
      attributes?: Record<string, string | number | boolean>,
    );
    bind(element: HTMLElement, container: HTMLElement): void;
    render(): void;
  }

  export class Underline extends Highlight {
    constructor(
      range: Range,
      className?: string,
      data?: { [key: string]: string },
      attributes?: Record<string, string | number | boolean>,
    );
    render(): void;
  }
}
