import { findChildren, isNumber, RangeObject, type } from './utils/core';

interface EpubCFISegment {
  steps: EpubCFIStep[];
  terminal: {
    offset: number | null;
    assertion: string;
  };
}

interface EpubCFIStep {
  id?: string;
  tagName?: string;
  type: string;
  index: number;
}

interface EpubCFIComponent {
  steps: EpubCFIStep[];
  terminal: {
    offset: number | null;
    assertion: string;
  };
}

/**
  * Parsing and creation of EpubCFIs: http://www.idpf.org/epub/linking/cfi/epub-cfi.html

  * Implements:
  * - Character Offset: epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)
  * - Simple Ranges : epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)

  * Does Not Implement:
  * - Temporal Offset (~)
  * - Spatial Offset (@)
  * - Temporal-Spatial Offset (~ + @)
  * - Text Location Assertion ([)
  * @class
  @param {string | Range | Node } [cfiFrom]
  @param {string | object} [base]
  @param {string} [ignoreClass] class to ignore when parsing DOM
*/
class EpubCFI {
  public str: string;
  public base: EpubCFIComponent;
  public spinePos: number;
  public range: boolean;
  public path: EpubCFIComponent;
  public start: EpubCFIComponent | null;
  public end: EpubCFIComponent | null;

  constructor(
    cfiFrom?: string | Range | Node | EpubCFI,
    base?: string | EpubCFIComponent,
    ignoreClass?: string,
  ) {
    let type: string | false;

    this.str = '';

    this.base = {
      steps: [],
      terminal: {
        offset: null,
        assertion: '',
      },
    };
    this.spinePos = 0; // For compatibility

    this.range = false; // true || false;

    this.path = {
      steps: [],
      terminal: {
        offset: null,
        assertion: '',
      },
    };
    this.start = null;
    this.end = null;

    // Allow instantiation without the "new" keyword
    if (!(this instanceof EpubCFI)) {
      return new EpubCFI(cfiFrom, base, ignoreClass);
    }

    if (typeof base === 'string') {
      this.base = this.parseComponent(base);
    } else if (typeof base === 'object' && base.steps) {
      this.base = base;
    }

    type = this.checkType(cfiFrom);

    if (type === 'string') {
      this.str = cfiFrom as string;
      return Object.assign(this, this.parse(cfiFrom as string));
    } else if (type === 'range') {
      return Object.assign(
        this,
        this.fromRange(cfiFrom as Range, this.base, ignoreClass || ''),
      );
    } else if (type === 'node') {
      return Object.assign(
        this,
        this.fromNode(cfiFrom as Node, this.base, ignoreClass),
      );
    } else if (type === 'EpubCFI' && (cfiFrom as EpubCFI).path) {
      return cfiFrom as EpubCFI;
    } else if (!cfiFrom) {
      return this;
    } else {
      throw new TypeError('not a valid argument for EpubCFI');
    }
  }

  /**
   * Check the type of constructor input
   * @private
   */
  checkType(cfi?: string | Range | Node | EpubCFI): string | false {
    if (this.isCfiString(cfi)) {
      return 'string';
      // Is a range object
    } else if (
      cfi &&
      typeof cfi === 'object' &&
      (type(cfi) === 'Range' ||
        typeof (cfi as any).startContainer != 'undefined')
    ) {
      return 'range';
    } else if (
      cfi &&
      typeof cfi === 'object' &&
      typeof (cfi as any).nodeType != 'undefined'
    ) {
      // || typeof cfi === "function"
      return 'node';
    } else if (cfi && typeof cfi === 'object' && cfi instanceof EpubCFI) {
      return 'EpubCFI';
    } else {
      return false;
    }
  }

  /**
   * Parse a cfi string to a CFI object representation
   * @param {string} cfiStr
   * @returns {object} cfi
   */
  parse(cfiStr: string): Partial<EpubCFI> {
    const cfi: Partial<EpubCFI> = {
      spinePos: -1,
      range: false,
      base: {
        steps: [],
        terminal: {
          offset: null,
          assertion: '',
        },
      },
      path: {
        steps: [],
        terminal: {
          offset: null,
          assertion: '',
        },
      },
      start: null,
      end: null,
    };
    let baseComponent, pathComponent, range;

    if (typeof cfiStr !== 'string') {
      return { spinePos: -1 };
    }

    if (cfiStr.indexOf('epubcfi(') === 0 && cfiStr[cfiStr.length - 1] === ')') {
      // Remove initial epubcfi( and ending )
      cfiStr = cfiStr.slice(8, cfiStr.length - 1);
    }

    baseComponent = this.getChapterComponent(cfiStr);

    // Make sure this is a valid cfi or return
    if (!baseComponent) {
      return { spinePos: -1 };
    }

    cfi.base = this.parseComponent(baseComponent);

    pathComponent = this.getPathComponent(cfiStr);
    cfi.path = this.parseComponent(pathComponent);

    range = this.getRange(cfiStr);

    if (range) {
      cfi.range = true;
      cfi.start = this.parseComponent(range[0]);
      cfi.end = this.parseComponent(range[1]);
    }

    // Get spine node position
    // cfi.spineSegment = cfi.base.steps[1];

    // Chapter segment is always the second step
    cfi.spinePos = (cfi.base as EpubCFIComponent).steps[1].index;

    return cfi;
  }

  parseComponent(componentStr?: string): EpubCFIComponent {
    const component: EpubCFIComponent = {
      steps: [],
      terminal: {
        offset: null,
        assertion: '',
      },
    };
    const parts = componentStr?.split(':') || [];
    const steps = parts[0].split('/');
    let terminal;

    if (parts.length > 1) {
      terminal = parts[1];
      component.terminal = this.parseTerminal(terminal);
    }

    if (steps[0] === '') {
      steps.shift(); // Ignore the first slash
    }

    component.steps = steps
      .map((step: string) => this.parseStep(step))
      .filter((step) => step !== undefined) as EpubCFIStep[];

    return component;
  }

  parseStep(stepStr: string): EpubCFIStep | undefined {
    let type: string,
      num: number,
      index: number,
      has_brackets: RegExpMatchArray | null,
      id: string | undefined;

    has_brackets = stepStr.match(/\[(.*)\]/);
    if (has_brackets && has_brackets[1]) {
      id = has_brackets[1];
    }

    //-- Check if step is a text node or element
    num = parseInt(stepStr);

    if (isNaN(num)) {
      return;
    }

    if (num % 2 === 0) {
      // Even = is an element
      type = 'element';
      index = num / 2 - 1;
    } else {
      type = 'text';
      index = (num - 1) / 2;
    }

    return {
      type: type,
      index: index,
      id: id,
    };
  }

  parseTerminal(termialStr: string): {
    offset: number | null;
    assertion: string;
  } {
    let characterOffset: number | null = null;
    let textLocationAssertion = '';
    const assertion: RegExpMatchArray | null = termialStr.match(/\[(.*)\]/);

    if (assertion && assertion[1]) {
      characterOffset = parseInt(termialStr.split('[')[0]);
      textLocationAssertion = assertion[1];
    } else {
      characterOffset = parseInt(termialStr);
    }

    if (!isNumber(characterOffset)) {
      characterOffset = 0;
    }

    return {
      offset: characterOffset,
      assertion: textLocationAssertion || '',
    };
  }

  getChapterComponent(cfiStr: string): string {
    const indirection = cfiStr.split('!');

    return indirection[0];
  }

  getPathComponent(cfiStr: string): string | undefined {
    const indirection: string[] = cfiStr.split('!');

    if (indirection[1]) {
      const ranges: string[] = indirection[1].split(',');
      return ranges[0];
    }
  }

  getRange(cfiStr: string): string[] | false {
    const ranges: string[] = cfiStr.split(',');

    if (ranges.length === 3) {
      return [ranges[1], ranges[2]];
    }

    return false;
  }

  getCharecterOffsetComponent(cfiStr: string): string {
    const splitStr: string[] = cfiStr.split(':');
    return splitStr[1] || '';
  }

  joinSteps(steps: EpubCFIStep[]): string {
    if (!steps) {
      return '';
    }

    return steps
      .map(function (part: EpubCFIStep): string {
        let segment = '';

        if (part.type === 'element') {
          segment += (part.index + 1) * 2;
        }

        if (part.type === 'text') {
          segment += 1 + 2 * part.index; // TODO: double check that this is odd
        }

        if (part.id) {
          segment += '[' + part.id + ']';
        }

        return segment;
      })
      .join('/');
  }

  segmentString(segment: EpubCFIComponent): string {
    let segmentString = '/';

    segmentString += this.joinSteps(segment.steps);

    if (segment.terminal && segment.terminal.offset != null) {
      segmentString += ':' + segment.terminal.offset;
    }

    if (
      segment.terminal &&
      segment.terminal.assertion != null &&
      segment.terminal.assertion !== ''
    ) {
      segmentString += '[' + segment.terminal.assertion + ']';
    }

    return segmentString;
  }

  /**
   * Convert CFI to a epubcfi(...) string
   * @returns {string} epubcfi
   */
  toString() {
    let cfiString = 'epubcfi(';

    cfiString += this.segmentString(this.base as EpubCFIComponent);

    cfiString += '!';
    cfiString += this.segmentString(this.path as EpubCFIComponent);

    // Add Range, if present
    if (this.range && this.start) {
      cfiString += ',';
      cfiString += this.segmentString(this.start);
    }

    if (this.range && this.end) {
      cfiString += ',';
      cfiString += this.segmentString(this.end);
    }

    cfiString += ')';

    return cfiString;
  }

  /**
   * Compare which of two CFIs is earlier in the text
   * @returns {number} First is earlier = -1, Second is earlier = 1, They are equal = 0
   */
  compare(cfiOne: string | EpubCFI, cfiTwo: string | EpubCFI): number {
    let stepsA, stepsB;
    let terminalA, terminalB;

    let rangeAStartSteps, rangeAEndSteps;
    var rangeBEndSteps, rangeBEndSteps;
    let rangeAStartTerminal, rangeAEndTerminal;
    let rangeBStartTerminal, rangeBEndTerminal;

    if (typeof cfiOne === 'string') {
      cfiOne = new EpubCFI(cfiOne);
    }
    if (typeof cfiTwo === 'string') {
      cfiTwo = new EpubCFI(cfiTwo);
    }
    // Compare Spine Positions
    if (cfiOne.spinePos > cfiTwo.spinePos) {
      return 1;
    }
    if (cfiOne.spinePos < cfiTwo.spinePos) {
      return -1;
    }

    if (cfiOne.range) {
      stepsA = cfiOne.path.steps.concat(cfiOne.start?.steps || []);
      terminalA = cfiOne.start?.terminal || { offset: null, assertion: '' };
    } else {
      stepsA = cfiOne.path.steps;
      terminalA = cfiOne.path.terminal;
    }

    if (cfiTwo.range) {
      stepsB = cfiTwo.path.steps.concat(cfiTwo.start?.steps || []);
      terminalB = cfiTwo.start?.terminal || { offset: null, assertion: '' };
    } else {
      stepsB = cfiTwo.path.steps;
      terminalB = cfiTwo.path.terminal;
    }

    // Compare Each Step in the First item
    for (let i = 0; i < stepsA.length; i++) {
      if (!stepsA[i]) {
        return -1;
      }
      if (!stepsB[i]) {
        return 1;
      }
      if (stepsA[i].index > stepsB[i].index) {
        return 1;
      }
      if (stepsA[i].index < stepsB[i].index) {
        return -1;
      }
      // Otherwise continue checking
    }

    // All steps in First equal to Second and First is Less Specific
    if (stepsA.length < stepsB.length) {
      return -1;
    }

    // Compare the character offset of the text node
    if ((terminalA.offset ?? 0) > (terminalB.offset ?? 0)) {
      return 1;
    }
    if ((terminalA.offset ?? 0) < (terminalB.offset ?? 0)) {
      return -1;
    }

    // CFI's are equal
    return 0;
  }

  step(node: Element): EpubCFIStep {
    const nodeType: string =
      node.nodeType === Node.TEXT_NODE ? 'text' : 'element';

    return {
      id: node.id,
      tagName: node.tagName,
      type: nodeType,
      index: this.position(node),
    };
  }

  filteredStep(node: Element, ignoreClass: string): EpubCFIStep | undefined {
    const filteredNode: Element | false = this.filter(node, ignoreClass);
    let nodeType: string;

    // Node filtered, so ignore
    if (!filteredNode) {
      return;
    }

    // Otherwise add the filter node in
    nodeType = filteredNode.nodeType === Node.TEXT_NODE ? 'text' : 'element';

    return {
      id: filteredNode.id,
      tagName: filteredNode.tagName,
      type: nodeType,
      index: this.filteredPosition(filteredNode, ignoreClass),
    };
  }

  pathTo(
    node: Element,
    offset?: number | null,
    ignoreClass?: string,
  ): EpubCFISegment {
    const segment: EpubCFISegment = {
      steps: [],
      terminal: {
        offset: null,
        assertion: '',
      },
    };
    let currentNode: Element | null = node;
    let step: EpubCFIStep | undefined;

    while (
      currentNode &&
      currentNode.parentNode &&
      currentNode.parentNode.nodeType != Node.DOCUMENT_NODE
    ) {
      if (ignoreClass) {
        step = this.filteredStep(currentNode, ignoreClass);
      } else {
        step = this.step(currentNode);
      }

      if (step) {
        segment.steps.unshift(step);
      }

      currentNode = currentNode.parentNode as Element;
    }

    if (offset != null && offset >= 0) {
      segment.terminal.offset = offset;

      // Make sure we are getting to a textNode if there is an offset
      if (segment.steps[segment.steps.length - 1].type != 'text') {
        segment.steps.push({
          type: 'text',
          index: 0,
        });
      }
    }

    return segment;
  }

  equalStep(stepA: EpubCFIStep, stepB: EpubCFIStep): boolean {
    if (!stepA || !stepB) {
      return false;
    }

    if (
      stepA.index === stepB.index &&
      stepA.id === stepB.id &&
      stepA.type === stepB.type
    ) {
      return true;
    }

    return false;
  }

  /**
   * Create a CFI object from a Range
   * @param {Range} range
   * @param {string | object} base
   * @param {string} [ignoreClass]
   * @returns {object} cfi
   */
  fromRange(range: Range, base: string | object, ignoreClass: string): any {
    const cfi: Partial<EpubCFI> = {
      range: false,
      base: {
        steps: [],
        terminal: {
          offset: null,
          assertion: '',
        },
      },
      path: {
        steps: [],
        terminal: {
          offset: null,
          assertion: '',
        },
      },
      start: null,
      end: null,
    };

    const start: Node = range.startContainer;
    const end: Node = range.endContainer;

    let startOffset: number = range.startOffset;
    let endOffset: number = range.endOffset;

    let needsIgnoring = false;

    if (ignoreClass) {
      // Tell pathTo if / what to ignore
      needsIgnoring =
        start.ownerDocument?.querySelector('.' + ignoreClass) != null;
    }

    if (typeof base === 'string') {
      cfi.base = this.parseComponent(base);
      cfi.spinePos = cfi.base.steps[1].index;
    } else if (typeof base === 'object') {
      cfi.base = base as EpubCFIComponent;
      cfi.spinePos = cfi.base.steps[1].index;
    }

    if (range.collapsed) {
      if (needsIgnoring) {
        startOffset = this.patchOffset(start, startOffset, ignoreClass);
      }
      cfi.path = this.pathTo(start as Element, startOffset, ignoreClass);
    } else {
      cfi.range = true;

      if (needsIgnoring) {
        startOffset = this.patchOffset(start, startOffset, ignoreClass);
      }

      cfi.start = this.pathTo(start as Element, startOffset, ignoreClass);
      if (needsIgnoring) {
        endOffset = this.patchOffset(end, endOffset, ignoreClass);
      }

      cfi.end = this.pathTo(end as Element, endOffset, ignoreClass);

      // Create a new empty path
      cfi.path = {
        steps: [],
        terminal: { offset: null, assertion: '' },
      };

      // Push steps that are shared between start and end to the common path
      const len = cfi.start.steps.length;
      let i;

      for (i = 0; i < len; i++) {
        if (this.equalStep(cfi.start.steps[i], cfi.end.steps[i])) {
          if (i === len - 1) {
            // Last step is equal, check terminals
            if (cfi.start.terminal === cfi.end.terminal) {
              // CFI's are equal
              cfi.path.steps.push(cfi.start.steps[i]);
              // Not a range
              cfi.range = false;
            }
          } else {
            cfi.path.steps.push(cfi.start.steps[i]);
          }
        } else {
          break;
        }
      }

      cfi.start.steps = cfi.start.steps.slice(cfi.path.steps.length);
      cfi.end.steps = cfi.end.steps.slice(cfi.path.steps.length);

      // TODO: Add Sanity check to make sure that the end if greater than the start
    }

    return cfi;
  }

  /**
   * Create a CFI object from a Node
   * @param {Node} anchor
   * @param {string | object} base
   * @param {string} [ignoreClass]
   * @returns {object} cfi
   */
  fromNode(anchor: Node, base?: string | object, ignoreClass?: string): any {
    const cfi: Partial<EpubCFI> = {
      range: false,
      base: {
        steps: [],
        terminal: {
          offset: null,
          assertion: '',
        },
      },
      path: {
        steps: [],
        terminal: {
          offset: null,
          assertion: '',
        },
      },
      start: null,
      end: null,
    };

    if (typeof base === 'string') {
      cfi.base = this.parseComponent(base);
      cfi.spinePos = cfi.base.steps[1].index;
    } else if (typeof base === 'object') {
      cfi.base = base as EpubCFIComponent;
    }

    cfi.path = this.pathTo(anchor as Element, null, ignoreClass);

    return cfi;
  }

  filter(anchor: Node, ignoreClass: string): Element | false {
    let needsIgnoring: boolean;
    let sibling: Node | null = null; // to join with
    let parent: Node | null = null,
      previousSibling: Node | null,
      nextSibling: Node | null;
    let isText = false;

    if (anchor.nodeType === Node.TEXT_NODE) {
      isText = true;
      parent = anchor.parentNode!;
      needsIgnoring = (anchor.parentNode as Element).classList.contains(
        ignoreClass,
      );
    } else {
      isText = false;
      needsIgnoring = (anchor as Element).classList.contains(ignoreClass);
    }

    if (needsIgnoring && isText) {
      previousSibling = parent?.previousSibling || null;
      nextSibling = parent?.nextSibling || null;

      // If the sibling is a text node, join the nodes
      if (previousSibling && previousSibling.nodeType === Node.TEXT_NODE) {
        sibling = previousSibling;
      } else if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
        sibling = nextSibling;
      }

      if (sibling) {
        return sibling as Element;
      } else {
        // Parent will be ignored on next step
        return anchor as Element;
      }
    } else if (needsIgnoring && !isText) {
      // Otherwise just skip the element node
      return false;
    } else {
      // No need to filter
      return anchor as Element;
    }
  }

  patchOffset(
    anchor: Node,
    offset: number | null,
    ignoreClass: string,
  ): number {
    if (anchor.nodeType != Node.TEXT_NODE) {
      throw new Error('Anchor must be a text node');
    }

    let curr: Node = anchor;
    let totalOffset: number = offset || 0;

    // If the parent is a ignored node, get offset from it's start
    if (
      anchor.parentNode &&
      (anchor.parentNode as Element).classList.contains(ignoreClass)
    ) {
      curr = anchor.parentNode;
    }

    while (curr.previousSibling) {
      if (curr.previousSibling.nodeType === Node.ELEMENT_NODE) {
        const prevSibling = curr.previousSibling as Element;
        // Originally a text node, so join
        if (prevSibling.classList.contains(ignoreClass)) {
          totalOffset += prevSibling.textContent.length;
        } else {
          break; // Normal node, dont join
        }
      } else {
        // If the previous sibling is a text node, join the nodes
        totalOffset += curr.previousSibling.textContent?.length || 0;
      }

      curr = curr.previousSibling;
    }

    return totalOffset;
  }

  normalizedMap(
    children: NodeList | HTMLCollection,
    nodeType: number,
    ignoreClass: string,
  ): Record<number, number> {
    const output: Record<number, number> = {};
    let prevIndex = -1;
    let i: number,
      len: number = children.length;
    let currNodeType: number;
    let prevNodeType = -1;

    for (i = 0; i < len; i++) {
      currNodeType = children[i].nodeType;

      // Check if needs ignoring
      if (
        currNodeType === Node.ELEMENT_NODE &&
        (children[i] as Element).classList.contains(ignoreClass)
      ) {
        currNodeType = Node.TEXT_NODE;
      }

      if (
        i > 0 &&
        currNodeType === Node.TEXT_NODE &&
        prevNodeType === Node.TEXT_NODE
      ) {
        // join text nodes
        output[i] = prevIndex;
      } else if (nodeType === currNodeType) {
        prevIndex = prevIndex + 1;
        output[i] = prevIndex;
      }

      prevNodeType = currNodeType;
    }

    return output;
  }

  position(anchor: Node): number {
    let children: Node[], index: number;
    if (anchor.nodeType === Node.ELEMENT_NODE) {
      children = Array.from(anchor.parentNode?.children || []);
      if (!children) {
        children = findChildren(anchor.parentNode as Element);
      }
      index = Array.prototype.indexOf.call(children, anchor);
    } else {
      children = this.textNodes(anchor.parentNode!, '');
      index = children.indexOf(anchor);
    }

    return index;
  }

  filteredPosition(anchor: Node, ignoreClass: string): number {
    let children: NodeList | HTMLCollection,
      index: number,
      map: Record<number, number>;

    if (anchor.nodeType === Node.ELEMENT_NODE) {
      children = anchor.parentNode!.children;
      map = this.normalizedMap(children, Node.ELEMENT_NODE, ignoreClass);
    } else {
      children = anchor.parentNode!.childNodes;
      // Inside an ignored node
      if ((anchor.parentNode! as Element).classList.contains(ignoreClass)) {
        anchor = anchor.parentNode!;
        children = anchor.parentNode!.childNodes;
      }
      map = this.normalizedMap(children, Node.TEXT_NODE, ignoreClass);
    }

    index = Array.prototype.indexOf.call(children, anchor);

    return map[index];
  }

  stepsToXpath(steps: EpubCFIStep[]): string {
    const xpath: string[] = ['.', '*'];

    steps.forEach(function (step: EpubCFIStep): void {
      const position: number = step.index + 1;

      if (step.id) {
        xpath.push('*[position()=' + position + " and @id='" + step.id + "']");
      } else if (step.type === 'text') {
        xpath.push('text()[' + position + ']');
      } else {
        xpath.push('*[' + position + ']');
      }
    });

    return xpath.join('/');
  }

  /*

  To get the last step if needed:

  // Get the terminal step
  lastStep = steps[steps.length-1];
  // Get the query string
  query = this.stepsToQuery(steps);
  // Find the containing element
  startContainerParent = doc.querySelector(query);
  // Find the text node within that element
  if(startContainerParent && lastStep.type == "text") {
    container = startContainerParent.childNodes[lastStep.index];
  }
  */
  stepsToQuerySelector(steps: EpubCFIStep[]): string {
    const query: string[] = ['html'];

    steps.forEach(function (step: EpubCFIStep): void {
      const position: number = step.index + 1;

      if (step.id) {
        query.push('#' + step.id);
      } else if (step.type === 'text') {
        // unsupported in querySelector
        // query.push("text()[" + position + "]");
      } else {
        query.push('*:nth-child(' + position + ')');
      }
    });

    return query.join('>');
  }

  textNodes(container: Node, ignoreClass: string): Node[] {
    return Array.prototype.slice.call(container.childNodes).filter(function (
      node: Node,
    ): boolean {
      if (node.nodeType === Node.TEXT_NODE) {
        return true;
      } else if (
        ignoreClass &&
        (node as Element).classList.contains(ignoreClass)
      ) {
        return true;
      }
      return false;
    });
  }

  walkToNode(
    steps: EpubCFIStep[],
    _doc?: Document,
    ignoreClass = '',
  ): Node | null {
    const doc: Document = _doc || document;
    let container: Element | null = doc.documentElement;
    let children: Node[] | HTMLCollection;
    let step: EpubCFIStep;
    const len: number = steps.length;
    let i: number;

    for (i = 0; i < len; i++) {
      step = steps[i];

      if (step.type === 'element') {
        //better to get a container using id as some times step.index may not be correct
        //For ex.https://github.com/futurepress/epub.js/issues/561
        if (step.id) {
          container = doc.getElementById(step.id);
        } else {
          children = container.children || findChildren(container);
          container = children[step.index] as Element;
        }
      } else if (step.type === 'text') {
        container = this.textNodes(container, ignoreClass)[
          step.index
        ] as Element;
      }
      if (!container) {
        //Break the for loop as due to incorrect index we can get error if
        //container is undefined so that other functionailties works fine
        //like navigation
        break;
      }
    }

    return container;
  }

  findNode(
    steps: EpubCFIStep[],
    _doc?: Document,
    ignoreClass?: string,
  ): Node | null {
    const doc: Document = _doc || document;
    let container: Node | null;
    let xpath: string;

    if (!ignoreClass && typeof doc.evaluate != 'undefined') {
      xpath = this.stepsToXpath(steps);
      container = doc.evaluate(
        xpath,
        doc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
    } else if (ignoreClass) {
      container = this.walkToNode(steps, doc, ignoreClass);
    } else {
      container = this.walkToNode(steps, doc);
    }

    return container;
  }

  fixMiss(
    steps: EpubCFIStep[],
    offset: number | null,
    _doc?: Document,
    ignoreClass = '',
  ): any {
    let container: Node | null = this.findNode(
      steps.slice(0, -1),
      _doc,
      ignoreClass,
    );
    const children: NodeList = container!.childNodes;
    const map: Record<number, number> = this.normalizedMap(
      children,
      Node.TEXT_NODE,
      ignoreClass,
    );
    let child: Node;
    let len: number;
    const lastStepIndex: number = steps[steps.length - 1].index;

    for (const childIndex in map) {
      if (!map.hasOwnProperty(childIndex)) return;

      if (map[childIndex] === lastStepIndex) {
        child = children[childIndex];
        len = child.textContent!.length;
        if (offset && offset > len) {
          offset = offset - len;
        } else {
          if (child.nodeType === Node.ELEMENT_NODE) {
            container = child.childNodes[0];
          } else {
            container = child;
          }
          break;
        }
      }
    }

    return {
      container: container,
      offset: offset,
    };
  }

  /**
   * Creates a DOM range representing a CFI
   * @param {document} _doc document referenced in the base
   * @param {string} [ignoreClass]
   * @return {Range}
   */
  toRange(_doc?: Document, ignoreClass?: string): Range | null {
    const doc: Document = _doc || document;
    let range: Partial<Range> = new RangeObject();
    let start: EpubCFIComponent | null,
      end: EpubCFIComponent | null,
      startContainer: Node | null,
      endContainer: Node | null = null;
    const cfi: EpubCFI = this;
    let startSteps: EpubCFIStep[], endSteps: EpubCFIStep[];
    const needsIgnoring: boolean = ignoreClass
      ? doc.querySelector('.' + ignoreClass) != null
      : false;
    let missed: any;

    if (typeof doc.createRange !== 'undefined') {
      range = doc.createRange();
    }

    if (cfi.range) {
      start = cfi.start;
      startSteps = cfi.path.steps.concat(start!.steps);
      startContainer = this.findNode(
        startSteps,
        doc,
        needsIgnoring ? ignoreClass : '',
      );
      end = cfi.end;
      endSteps = cfi.path.steps.concat(end!.steps);
      endContainer = this.findNode(
        endSteps,
        doc,
        needsIgnoring ? ignoreClass : '',
      );
    } else {
      start = cfi.path;
      startSteps = cfi.path.steps;
      startContainer = this.findNode(
        cfi.path.steps,
        doc,
        needsIgnoring ? ignoreClass : '',
      );
    }

    if (startContainer) {
      try {
        if (start!.terminal.offset != 0) {
          range.setStart!(startContainer, start!.terminal.offset || 0);
        } else {
          range.setStart!(startContainer, 0);
        }
      } catch (e) {
        missed = this.fixMiss(
          startSteps,
          start!.terminal.offset,
          doc,
          needsIgnoring ? ignoreClass : '',
        );
        range.setStart!(missed.container, missed.offset);
      }
    } else {
      console.log('No startContainer found for', this.toString());
      // No start found
      return null;
    }

    if (endContainer) {
      try {
        if (end!.terminal.offset != null) {
          range.setEnd!(endContainer, end!.terminal.offset);
        } else {
          range.setEnd!(endContainer, 0);
        }
      } catch (e) {
        missed = this.fixMiss(
          endSteps!,
          cfi.end!.terminal.offset,
          doc,
          needsIgnoring ? ignoreClass : '',
        );
        range.setEnd!(missed.container, missed.offset);
      }
    }

    // doc.defaultView.getSelection().addRange(range);
    return range as Range;
  }

  /**
   * Check if a string is wrapped with "epubcfi()"
   * @param {string} str
   * @returns {boolean}
   */
  isCfiString(str?: string | Range | Node | EpubCFI): boolean {
    if (
      typeof str === 'string' &&
      str.indexOf('epubcfi(') === 0 &&
      str[str.length - 1] === ')'
    ) {
      return true;
    }

    return false;
  }

  generateChapterComponent(
    _spineNodeIndex: number,
    _pos: number,
    id?: string,
  ): string {
    let pos: number = _pos,
      spineNodeIndex: number = (_spineNodeIndex + 1) * 2,
      cfi: string = '/' + spineNodeIndex + '/';

    cfi += (pos + 1) * 2;

    if (id) {
      cfi += '[' + id + ']';
    }

    return cfi;
  }

  /**
   * Collapse a CFI Range to a single CFI Position
   * @param {boolean} [toStart=false]
   */
  collapse(toStart?: boolean): void {
    if (!this.range) {
      return;
    }

    this.range = false;

    if (toStart) {
      this.path.steps = this.path.steps.concat(this.start!.steps);
      this.path.terminal = this.start!.terminal;
    } else {
      this.path.steps = this.path.steps.concat(this.end!.steps);
      this.path.terminal = this.end!.terminal;
    }
  }
}

export default EpubCFI;
