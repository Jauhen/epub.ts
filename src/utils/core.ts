/**
 * Core Utilities and Helpers
 * @module Core
 */
import { DOMParser as XMLDOMParser } from '@xmldom/xmldom';

/**
 * Vendor prefixed requestAnimationFrame
 * @returns {function} requestAnimationFrame
 * @memberof Core
 */
export const requestAnimationFrame: (callback: () => void) => number =
  typeof window != 'undefined'
    ? window.requestAnimationFrame ||
      (window as any).mozRequestAnimationFrame ||
      (window as any).webkitRequestAnimationFrame ||
      (window as any).msRequestAnimationFrame
    : (callback: () => void) => {
        return setTimeout(callback, 0) as unknown as number;
      };

const _URL =
  typeof URL != 'undefined'
    ? URL
    : typeof window != 'undefined'
      ? window.URL || (window as any).webkitURL || (window as any).mozURL
      : undefined;

/**
 * Generates a UUID
 * based on: http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
 * @returns {string} uuid
 * @memberof Core
 */
export function uuid() {
  let d = new Date().getTime();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    function (c) {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c == 'x' ? r : (r & 0x7) | 0x8).toString(16);
    },
  );
  return uuid;
}

/**
 * Gets the height of a document
 * @returns {number} height
 * @memberof Core
 */
export function documentHeight() {
  return Math.max(
    document.documentElement.clientHeight,
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
  );
}

/**
 * Checks if a node is an element
 * @param {object} obj
 * @returns {boolean}
 * @memberof Core
 */
export function isElement(obj: object): boolean {
  return !!(obj && (obj as any).nodeType == 1);
}

/**
 * @param {any} n
 * @returns {boolean}
 * @memberof Core
 */
export function isNumber(n: any): boolean {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * @param {any} n
 * @returns {boolean}
 * @memberof Core
 */
export function isFloat(n: any): boolean {
  const f = parseFloat(n);

  if (isNumber(n) === false) {
    return false;
  }

  if (typeof n === 'string' && n.indexOf('.') > -1) {
    return true;
  }

  return Math.floor(f) !== f;
}

/**
 * Get a prefixed css property
 * @param {string} unprefixed
 * @returns {string}
 * @memberof Core
 */
export function prefixed(unprefixed: string): string {
  const vendors = ['Webkit', 'webkit', 'Moz', 'O', 'ms'];
  const prefixes = ['-webkit-', '-webkit-', '-moz-', '-o-', '-ms-'];
  const lower = unprefixed.toLowerCase();
  const length = vendors.length;

  if (
    typeof document === 'undefined' ||
    typeof (document.body.style as any)[lower] != 'undefined'
  ) {
    return unprefixed;
  }

  for (let i = 0; i < length; i++) {
    if (
      typeof (document.body.style as any)[prefixes[i] + lower] != 'undefined'
    ) {
      return prefixes[i] + lower;
    }
  }

  return unprefixed;
}

/**
 * Apply defaults to an object
 * @param {object} obj
 * @returns {object}
 * @memberof Core
 */
export function defaults(obj: object): object {
  for (let i = 1, length = arguments.length; i < length; i++) {
    const source = arguments[i];
    for (const prop in source) {
      if ((obj as any)[prop] === void 0) (obj as any)[prop] = source[prop];
    }
  }
  return obj;
}

/**
 * Fast quicksort insert for sorted array -- based on:
 *  http://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
 * @param {any} item
 * @param {array} array
 * @param {function} [compareFunction]
 * @returns {number} location (in array)
 * @memberof Core
 */
export function insert(
  item: any,
  array: any[],
  compareFunction: Function,
): number {
  const location = locationOf(
    item,
    array,
    compareFunction,
    0 as any,
    array.length as any,
  );
  array.splice(location, 0, item);

  return location;
}

/**
 * Finds where something would fit into a sorted array
 * @param {any} item
 * @param {array} array
 * @param {function} [compareFunction]
 * @param {function} [_start]
 * @param {function} [_end]
 * @returns {number} location (in array)
 * @memberof Core
 */
export function locationOf(
  item: any,
  array: any[],
  compareFunction: Function,
  _start?: number,
  _end?: number,
): number {
  const start = _start || 0;
  const end = _end || array.length;
  const pivot = parseInt(String(start + (end - start) / 2));
  let compared;
  if (!compareFunction) {
    compareFunction = function (a: any, b: any) {
      if (a > b) return 1;
      if (a < b) return -1;
      if (a == b) return 0;
    };
  }
  if (end - start <= 0) {
    return pivot;
  }

  compared = (compareFunction as any)(array[pivot], item);
  if (end - start === 1) {
    return compared >= 0 ? pivot : pivot + 1;
  }
  if (compared === 0) {
    return pivot;
  }
  if (compared === -1) {
    return locationOf(item, array, compareFunction, pivot as any, end as any);
  } else {
    return locationOf(item, array, compareFunction, start as any, pivot as any);
  }
}

/**
 * Finds index of something in a sorted array
 * Returns -1 if not found
 * @param {any} item
 * @param {array} array
 * @param {function} [compareFunction]
 * @param {function} [_start]
 * @param {function} [_end]
 * @returns {number} index (in array) or -1
 * @memberof Core
 */
export function indexOfSorted(
  item: any,
  array: any[],
  compareFunction: Function,
  _start?: number,
  _end?: number,
): number {
  const start = _start || 0;
  const end = _end || array.length;
  const pivot = parseInt(String(start + (end - start) / 2));
  let compared;
  if (!compareFunction) {
    compareFunction = function (a: any, b: any) {
      if (a > b) return 1;
      if (a < b) return -1;
      if (a == b) return 0;
    };
  }
  if (end - start <= 0) {
    return -1; // Not found
  }

  compared = (compareFunction as any)(array[pivot], item);
  if (end - start === 1) {
    return compared === 0 ? pivot : -1;
  }
  if (compared === 0) {
    return pivot; // Found
  }
  if (compared === -1) {
    return indexOfSorted(
      item,
      array,
      compareFunction,
      pivot as any,
      end as any,
    );
  } else {
    return indexOfSorted(
      item,
      array,
      compareFunction,
      start as any,
      pivot as any,
    );
  }
}
/**
 * Find the bounds of an element
 * taking padding and margin into account
 * @param {element} el
 * @returns {{ width: Number, height: Number}}
 * @memberof Core
 */
export function bounds(el: Element): { width: number; height: number } {
  const style = window.getComputedStyle(el);
  const widthProps = [
    'width',
    'paddingRight',
    'paddingLeft',
    'marginRight',
    'marginLeft',
    'borderRightWidth',
    'borderLeftWidth',
  ];
  const heightProps = [
    'height',
    'paddingTop',
    'paddingBottom',
    'marginTop',
    'marginBottom',
    'borderTopWidth',
    'borderBottomWidth',
  ];

  let width = 0;
  let height = 0;

  widthProps.forEach(function (prop) {
    width += parseFloat((style as any)[prop]) || 0;
  });

  heightProps.forEach(function (prop) {
    height += parseFloat((style as any)[prop]) || 0;
  });

  return {
    height: height,
    width: width,
  };
}

/**
 * Find the bounds of an element
 * taking padding, margin and borders into account
 * @param {element} el
 * @returns {{ width: Number, height: Number}}
 * @memberof Core
 */
export function borders(el: Element): { width: number; height: number } {
  const style = window.getComputedStyle(el);
  const widthProps = [
    'paddingRight',
    'paddingLeft',
    'marginRight',
    'marginLeft',
    'borderRightWidth',
    'borderLeftWidth',
  ];
  const heightProps = [
    'paddingTop',
    'paddingBottom',
    'marginTop',
    'marginBottom',
    'borderTopWidth',
    'borderBottomWidth',
  ];

  let width = 0;
  let height = 0;

  widthProps.forEach(function (prop) {
    width += parseFloat((style as any)[prop]) || 0;
  });

  heightProps.forEach(function (prop) {
    height += parseFloat((style as any)[prop]) || 0;
  });

  return {
    height: height,
    width: width,
  };
}

/**
 * Find the bounds of any node
 * allows for getting bounds of text nodes by wrapping them in a range
 * @param {node} node
 * @returns {BoundingClientRect}
 * @memberof Core
 */
export function nodeBounds(node: Node): DOMRect {
  let elPos;
  const doc = node.ownerDocument;
  if (node.nodeType == Node.TEXT_NODE) {
    const elRange = doc!.createRange();
    elRange.selectNodeContents(node);
    elPos = elRange.getBoundingClientRect();
  } else {
    elPos = (node as Element).getBoundingClientRect();
  }
  return elPos;
}

/**
 * Find the equivalent of getBoundingClientRect of a browser window
 * @returns {{ width: Number, height: Number, top: Number, left: Number, right: Number, bottom: Number }}
 * @memberof Core
 */
export function windowBounds(): {
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
} {
  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width: width,
    height: height,
  };
}

/**
 * Gets the index of a node in its parent
 * @param {Node} node
 * @param {string} typeId
 * @return {number} index
 * @memberof Core
 */
export function indexOfNode(node: Node, typeId: number): number {
  const parent = node.parentNode;
  const children = parent!.childNodes;
  let sib;
  let index = -1;
  for (let i = 0; i < children.length; i++) {
    sib = children[i];
    if (sib.nodeType === typeId) {
      index++;
    }
    if (sib == node) break;
  }

  return index;
}

/**
 * Gets the index of a text node in its parent
 * @param {node} textNode
 * @returns {number} index
 * @memberof Core
 */
export function indexOfTextNode(textNode: Node): number {
  return indexOfNode(textNode, Node.TEXT_NODE);
}

/**
 * Gets the index of an element node in its parent
 * @param {element} elementNode
 * @returns {number} index
 * @memberof Core
 */
export function indexOfElementNode(elementNode: Element): number {
  return indexOfNode(elementNode, Node.ELEMENT_NODE);
}

/**
 * Check if extension is xml
 * @param {string} ext
 * @returns {boolean}
 * @memberof Core
 */
export function isXml(ext: string): boolean {
  return ['xml', 'opf', 'ncx'].indexOf(ext) > -1;
}

/**
 * Create a new blob
 * @param {any} content
 * @param {string} mime
 * @returns {Blob}
 * @memberof Core
 */
export function createBlob(content: any, mime: string): Blob {
  return new Blob([content], { type: mime });
}

/**
 * Create a new blob url
 * @param {any} content
 * @param {string} mime
 * @returns {string} url
 * @memberof Core
 */
export function createBlobUrl(content: any, mime: string): string {
  let tempUrl;
  const blob = createBlob(content, mime);

  tempUrl = _URL!.createObjectURL(blob);

  return tempUrl;
}

/**
 * Remove a blob url
 * @param {string} url
 * @memberof Core
 */
export function revokeBlobUrl(url: string): void {
  return _URL!.revokeObjectURL(url);
}

/**
 * Create a new base64 encoded url
 * @param {any} content
 * @param {string} mime
 * @returns {string} url
 * @memberof Core
 */
export function createBase64Url(content: any, mime: string): string | void {
  let data;
  let datauri;

  if (typeof content !== 'string') {
    // Only handles strings
    return;
  }

  data = btoa(content);

  datauri = 'data:' + mime + ';base64,' + data;

  return datauri;
}

/**
 * Get type of an object
 * @param {object} obj
 * @returns {string} type
 * @memberof Core
 */
export function type(obj: any): string {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

/**
 * Parse xml (or html) markup
 * @param {string} markup
 * @param {string} mime
 * @param {boolean} forceXMLDom force using xmlDom to parse instead of native parser
 * @returns {document} document
 * @memberof Core
 */
export function parse(
  markup: string,
  mime: string,
  forceXMLDom: boolean,
): Document {
  let doc;
  let Parser;

  if (typeof DOMParser === 'undefined' || forceXMLDom) {
    Parser = XMLDOMParser;
  } else {
    Parser = DOMParser;
  }

  // Remove byte order mark before parsing
  // https://www.w3.org/International/questions/qa-byte-order-mark
  if (markup.charCodeAt(0) === 0xfeff) {
    markup = markup.slice(1);
  }

  doc = new Parser().parseFromString(markup, mime);

  return doc;
}

/**
 * querySelector polyfill
 * @param {element} el
 * @param {string} sel selector string
 * @returns {element} element
 * @memberof Core
 */
export function qs(el: Element | Document, sel: string): Element | null {
  let elements;
  if (!el) {
    throw new Error('No Element Provided');
  }

  if (typeof (el as any).querySelector != 'undefined') {
    return el.querySelector(sel);
  } else {
    elements = (el as any).getElementsByTagName(sel);
    if (elements.length) {
      return elements[0];
    }
  }
  return null;
}

/**
 * querySelectorAll polyfill
 * @param {element} el
 * @param {string} sel selector string
 * @returns {element[]} elements
 * @memberof Core
 */
export function qsa(
  el: Element | Document,
  sel: string,
): NodeListOf<Element> | HTMLCollectionOf<Element> {
  if (typeof (el as any).querySelector != 'undefined') {
    return el.querySelectorAll(sel);
  } else {
    return (el as any).getElementsByTagName(sel);
  }
}

/**
 * querySelector by property
 * @param {element} el
 * @param {string} sel selector string
 * @param {object[]} props
 * @returns {element[]} elements
 * @memberof Core
 */
export function qsp(
  el: Element | Document,
  sel: string,
  props: any,
): Element | null {
  let q, filtered;
  if (typeof (el as any).querySelector != 'undefined') {
    sel += '[';
    for (const prop in props) {
      sel += prop + "~='" + props[prop] + "'";
    }
    sel += ']';
    return el.querySelector(sel);
  } else {
    q = (el as any).getElementsByTagName(sel);
    filtered = Array.prototype.slice.call(q, 0).filter(function (el: Element) {
      for (const prop in props) {
        if (el.getAttribute(prop) === props[prop]) {
          return true;
        }
      }
      return false;
    });

    if (filtered) {
      return filtered[0];
    }
  }
  return null;
}

/**
 * Sprint through all text nodes in a document
 * @memberof Core
 * @param  {element} root element to start with
 * @param  {function} func function to run on each element
 */
export function sprint(root: Node, func: Function): void {
  const doc = root.ownerDocument || root;
  if (typeof (doc as any).createTreeWalker !== 'undefined') {
    treeWalker(root, func, NodeFilter.SHOW_TEXT);
  } else {
    walk(root, function (node: Node) {
      if (node && node.nodeType === 3) {
        // Node.TEXT_NODE
        func(node);
      }
    });
  }
}

/**
 * Create a treeWalker
 * @memberof Core
 * @param  {element} root element to start with
 * @param  {function} func function to run on each element
 * @param  {function | object} filter function or object to filter with
 */
export function treeWalker(root: Node, func: Function, filter: number): void {
  const treeWalker = document.createTreeWalker(root, filter);
  let node;
  while ((node = treeWalker.nextNode())) {
    func(node);
  }
}

/**
 * @memberof Core
 * @param {node} node
 * @param {callback} return false for continue,true for break inside callback
 */
export function walk(node: Node, callback: Function): boolean | void {
  if (callback(node)) {
    return true;
  }
  node = node.firstChild!;
  if (node) {
    do {
      const walked = walk(node, callback);
      if (walked) {
        return true;
      }
      node = node.nextSibling!;
    } while (node);
  }
}

/**
 * Convert a blob to a base64 encoded string
 * @param {Blog} blob
 * @returns {string}
 * @memberof Core
 */
export function blob2base64(blob: Blob): Promise<string | ArrayBuffer | null> {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = function () {
      resolve(reader.result);
    };
  });
}

export interface Defer<T = any> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/**
 * Creates a new pending promise and provides methods to resolve or reject it.
 * From: https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Deferred#backwards_forwards_compatible
 * @memberof Core
 */
export function defer<T>(): Defer<T> {
  const deferred: any = {};

  /* A method to resolve the associated Promise with the value passed.
   * If the promise is already settled it does nothing.
   *
   * @param {anything} value : This value is used to resolve the promise
   * If the value is a Promise then the associated promise assumes the state
   * of Promise passed as value.
   */
  deferred.resolve = null;

  /* A method to reject the associated Promise with the value passed.
   * If the promise is already settled it does nothing.
   *
   * @param {anything} reason: The reason for the rejection of the Promise.
   * Generally its an Error object. If however a Promise is passed, then the Promise
   * itself will be the reason for rejection no matter the state of the Promise.
   */
  deferred.reject = null;

  deferred.id = uuid();

  /**
   * A newly created Promise object.
   * Initially in pending state.
   */
  deferred.promise = new Promise((resolve: any, reject: any) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  Object.freeze(deferred);

  return deferred;
}

/**
 * querySelector with filter by epub type
 * @param {element} html
 * @param {string} element element type to find
 * @param {string} type epub type to find
 * @returns {element[]} elements
 * @memberof Core
 */
export function querySelectorByType(
  html: Element | Document,
  element: string,
  type: string,
): Element | null {
  let query;
  if (typeof (html as any).querySelector != 'undefined') {
    query = html.querySelector(`${element}[*|type="${type}"]`);
  }
  // Handle IE not supporting namespaced epub:type in querySelector
  if (!query || (query as any).length === 0) {
    const queryAll = qsa(html, element);
    for (let i = 0; i < queryAll.length; i++) {
      if (
        (queryAll[i] as Element).getAttributeNS(
          'http://www.idpf.org/2007/ops',
          'type',
        ) === type ||
        (queryAll[i] as Element).getAttribute('epub:type') === type
      ) {
        return queryAll[i] as Element;
      }
    }
  } else {
    return query;
  }
  return null;
}

/**
 * Find direct descendents of an element
 * @param {element} el
 * @returns {element[]} children
 * @memberof Core
 */
export function findChildren(el: Node): Node[] {
  const result: Node[] = [];
  const childNodes = el.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === 1) {
      result.push(node);
    }
  }
  return result;
}

/**
 * Find all parents (ancestors) of an element
 * @param {element} node
 * @returns {element[]} parents
 * @memberof Core
 */
export function parents(node: Node): Node[] {
  const nodes = [node];
  for (; node; node = node.parentNode!) {
    nodes.unshift(node);
  }
  return nodes;
}

/**
 * Find all direct descendents of a specific type
 * @param {element} el
 * @param {string} nodeName
 * @param {boolean} [single]
 * @returns {element[]} children
 * @memberof Core
 */
export function filterChildren(
  el: Element,
  nodeName: string,
  single: boolean,
): Element[] | Element | void {
  const result: Element[] = [];
  const childNodes = el.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === 1 && node.nodeName.toLowerCase() === nodeName) {
      if (single) {
        return node as Element;
      } else {
        result.push(node as Element);
      }
    }
  }
  if (!single) {
    return result;
  }
}

/**
 * Filter all parents (ancestors) with tag name
 * @param {element} node
 * @param {string} tagname
 * @returns {element[]} parents
 * @memberof Core
 */
export function getParentByTagName(
  node: Node,
  tagname: string,
): Element | void {
  let parent;
  if (node === null || tagname === '') return;
  parent = node.parentNode;
  while (parent && parent.nodeType === 1) {
    if ((parent as Element).tagName.toLowerCase() === tagname) {
      return parent as Element;
    }
    parent = parent.parentNode;
  }
}

/**
 * Lightweight Polyfill for DOM Range
 * @class
 * @memberof Core
 */
export class RangeObject implements Partial<Range> {
  collapsed: boolean;
  commonAncestorContainer: Node | undefined;
  endContainer: Node | undefined;
  endOffset: number | undefined;
  startContainer: Node | undefined;
  startOffset: number | undefined;

  constructor() {
    this.collapsed = false;
    this.commonAncestorContainer = undefined;
    this.endContainer = undefined;
    this.endOffset = undefined;
    this.startContainer = undefined;
    this.startOffset = undefined;
  }

  setStart(startNode: Node, startOffset: number): void {
    this.startContainer = startNode;
    this.startOffset = startOffset;

    if (!this.endContainer) {
      this.collapse(true);
    } else {
      this.commonAncestorContainer = this._commonAncestorContainer();
    }

    this._checkCollapsed();
  }

  setEnd(endNode: Node, endOffset: number): void {
    this.endContainer = endNode;
    this.endOffset = endOffset;

    if (!this.startContainer) {
      this.collapse(false);
    } else {
      this.collapsed = false;
      this.commonAncestorContainer = this._commonAncestorContainer();
    }

    this._checkCollapsed();
  }

  collapse(toStart: boolean): void {
    this.collapsed = true;
    if (toStart) {
      this.endContainer = this.startContainer;
      this.endOffset = this.startOffset;
      this.commonAncestorContainer =
        this.startContainer!.parentNode || undefined;
    } else {
      this.startContainer = this.endContainer;
      this.startOffset = this.endOffset;
      this.commonAncestorContainer = this.endContainer!.parentNode || undefined;
    }
  }

  selectNode(referenceNode: Node): void {
    const parent = referenceNode.parentNode!;
    const index = Array.prototype.indexOf.call(
      parent.childNodes,
      referenceNode,
    );
    this.setStart(parent, index);
    this.setEnd(parent, index + 1);
  }

  selectNodeContents(referenceNode: Node): void {
    const end = referenceNode.childNodes[referenceNode.childNodes.length - 1];
    const endIndex =
      referenceNode.nodeType === 3
        ? (referenceNode as Text).textContent!.length
        : referenceNode.childNodes.length;
    this.setStart(referenceNode, 0);
    this.setEnd(referenceNode, endIndex);
  }

  _commonAncestorContainer(
    startContainer?: Node,
    endContainer?: Node,
  ): Node | undefined {
    const startParents = parents(startContainer || this.startContainer!);
    const endParents = parents(endContainer || this.endContainer!);

    if (startParents[0] != endParents[0]) return undefined;

    for (let i = 0; i < startParents.length; i++) {
      if (startParents[i] != endParents[i]) {
        return startParents[i - 1];
      }
    }
    return undefined;
  }

  _checkCollapsed(): void {
    if (
      this.startContainer === this.endContainer &&
      this.startOffset === this.endOffset
    ) {
      this.collapsed = true;
    } else {
      this.collapsed = false;
    }
  }

  toString(): string {
    // TODO: implement walking between start and end to find text
    return '';
  }
}
