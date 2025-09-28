import { defer } from './utils/core';
import EpubCFI from './epubcfi';
import Hook from './utils/hook';
import { sprint } from './utils/core';
import { replaceBase } from './utils/replacements';
import Request from './utils/request';
import { DOMParser as XMLDOMSerializer } from '@xmldom/xmldom';

import type { HooksObject } from './utils/hook';

export interface GlobalLayout {
  layout: string;
  spread: string;
  orientation: string;
}

export interface LayoutSettings {
  layout: string;
  spread: string;
  orientation: string;
}

export interface SpineItem {
  id?: string;
  idref: string;
  index: number;
  cfiBase?: string;
  href?: string;
  url?: string;
  canonical?: string;
  properties?: string[];
  linear?: string;
  next?: () => SpineItem;
  prev?: () => SpineItem;
}

/**
 * Represents a Section of the Book
 *
 * In most books this is equivalent to a Chapter
 */
export class Section {
  idref: string;
  linear: boolean;
  properties: string[];
  index: number;
  href?: string;
  url?: string;
  canonical?: string;
  next?: () => SpineItem;
  prev?: () => SpineItem;
  cfiBase?: string;
  document: Document | undefined;
  contents: Element | undefined;
  output: string | undefined;
  hooks: HooksObject;

  constructor(item: SpineItem, hooks?: HooksObject) {
    this.idref = (item as any).idref;
    this.linear = item.linear === 'yes';
    this.properties = item.properties || [];
    this.index = item.index;
    this.href = item.href;
    this.url = item.url;
    this.canonical = item.canonical;
    this.next = item.next;
    this.prev = item.prev;
    this.cfiBase = item.cfiBase;

    if (hooks) {
      this.hooks = hooks;
    } else {
      this.hooks = {
        serialize: new Hook(this),
        content: new Hook(this),
      } as HooksObject;
    }

    this.document = undefined;
    this.contents = undefined;
    this.output = undefined;
  }

  /**
   * Load the section from its url
   * @param  {method} [_request] a request method to use for loading
   * @return {document} a promise with the xml document
   */
  load(
    _request?: (url: string) => Promise<Document>,
  ): Promise<Document | undefined> {
    const request = _request || (Request as (url: string) => Promise<Document>);
    const loading = defer<Document | undefined>();
    const loaded = loading.promise;

    if (this.contents) {
      loading.resolve(this.contents.ownerDocument || this.document);
    } else if (this.url) {
      request(this.url)
        .then((xml: Document) => {
          this.document = xml;
          this.contents = xml.documentElement;
          return this.hooks.content.trigger(this.document, this);
        })
        .then(() => {
          loading.resolve(this.contents?.ownerDocument || this.document);
        })
        .catch((error: any) => {
          loading.reject(error);
        });
    } else {
      loading.reject(new Error('No URL provided for section'));
    }

    return loaded;
  }

  /**
   * Adds a base tag for resolving urls in the section
   * @private
   */
  private base(): void {
    if (this.document) {
      replaceBase(this.document, this);
    }
  }

  /**
   * Render the contents of a section
   * @param  {method} [_request] a request method to use for loading
   * @return {string} output a serialized XML Document
   */
  render(
    _request?: (url: string) => Promise<Document>,
  ): Promise<string | undefined> {
    const rendering = defer<string | undefined>();
    const rendered = rendering.promise;
    this.load(_request)
      .then(() => {
        const userAgent =
          (typeof navigator !== 'undefined' && (navigator as any).userAgent) ||
          '';
        const isIE = userAgent.indexOf('Trident') >= 0;
        let Serializer: any;
        if (typeof (window as any).XMLSerializer === 'undefined' || isIE) {
          Serializer = XMLDOMSerializer;
        } else {
          Serializer = (window as any).XMLSerializer;
        }
        const serializer = new Serializer();
        if (this.contents) {
          this.output = serializer.serializeToString(this.contents);
        } else {
          this.output = undefined;
        }
        return this.output;
      })
      .then(() => {
        return this.hooks.serialize.trigger(this.output, this);
      })
      .then(() => {
        rendering.resolve(this.output);
      })
      .catch((error: any) => {
        rendering.reject(error);
      });
    return rendered;
  }

  /**
   * Find a string in a section
   * @param  {string} _query The query string to find
   * @return {object[]} A list of matches, with form {cfi, excerpt}
   */
  find(_query: string): { cfi: string; excerpt: string }[] {
    const section = this;
    const matches: { cfi: string; excerpt: string }[] = [];
    const query = _query.toLowerCase();
    const limit = 150;
    if (!section.document) return matches;
    const find = function (node: Element | Text) {
      if (!node.textContent) return;
      const text = node.textContent.toLowerCase();
      let pos = -1;
      let last = -1;
      while ((pos = text.indexOf(query, last + 1)) !== -1) {
        const range = section.document!.createRange();
        range.setStart(node, pos);
        range.setEnd(node, pos + query.length);
        const cfi = section.cfiFromRange(range);
        let excerpt: string;
        if (node.textContent.length < limit) {
          excerpt = node.textContent;
        } else {
          excerpt = node.textContent.substring(
            Math.max(0, pos - limit / 2),
            pos + limit / 2,
          );
          excerpt = '...' + excerpt + '...';
        }
        matches.push({ cfi, excerpt });
        last = pos;
      }
    };
    sprint(section.document, (node: Element | Text) => {
      find(node);
    });
    return matches;
  }

  /**
   * Search a string in multiple sequential Element of the section. If the document.createTreeWalker api is missed(eg: IE8), use `find` as a fallback.
   * @param  {string} _query The query string to search
   * @param  {int} maxSeqEle The maximum number of Element that are combined for search, default value is 5.
   * @return {object[]} A list of matches, with form {cfi, excerpt}
   */
  search(
    _query: string,
    maxSeqEle = 5,
  ): { cfi: string; excerpt: string }[] {
    if (typeof document.createTreeWalker === 'undefined' || !this.document) {
      return this.find(_query);
    }
    const matches: { cfi: string; excerpt: string }[] = [];
    const excerptLimit = 150;
    const section = this;
    const query = _query.toLowerCase();
    const search = function (nodeList: Text[]) {
      const textWithCase = nodeList.reduce(
        (acc, current) => acc + (current.textContent || ''),
        '',
      );
      const text = textWithCase.toLowerCase();
      const pos = text.indexOf(query);
      if (pos !== -1) {
        const startNodeIndex = 0,
          endPos = pos + query.length;
        let endNodeIndex = 0,
          l = 0;
        if (pos < (nodeList[startNodeIndex].textContent?.length || 0)) {
          while (endNodeIndex < nodeList.length - 1) {
            l += nodeList[endNodeIndex].textContent?.length || 0;
            if (endPos <= l) {
              break;
            }
            endNodeIndex += 1;
          }
          const startNode = nodeList[startNodeIndex],
            endNode = nodeList[endNodeIndex];
          const range = section.document!.createRange();
          range.setStart(startNode, pos);
          const beforeEndLengthCount = nodeList
            .slice(0, endNodeIndex)
            .reduce(
              (acc, current) => acc + (current.textContent?.length || 0),
              0,
            );
          range.setEnd(
            endNode,
            beforeEndLengthCount > endPos
              ? endPos
              : endPos - beforeEndLengthCount,
          );
          const cfi = section.cfiFromRange(range);
          let excerpt = nodeList
            .slice(0, endNodeIndex + 1)
            .reduce((acc, current) => acc + (current.textContent || ''), '');
          if (excerpt.length > excerptLimit) {
            excerpt = excerpt.substring(
              Math.max(0, pos - excerptLimit / 2),
              pos + excerptLimit / 2,
            );
            excerpt = '...' + excerpt + '...';
          }
          matches.push({ cfi, excerpt });
        }
      }
    };
    const treeWalker = (this.document as any).createTreeWalker(
      this.document,
      NodeFilter.SHOW_TEXT,
    );
    let node: Text | null;
    let nodeList: Text[] = [];
    while ((node = treeWalker.nextNode() as Text | null)) {
      nodeList.push(node);
      if (nodeList.length === maxSeqEle) {
        search(nodeList.slice(0, maxSeqEle));
        nodeList = nodeList.slice(1, maxSeqEle);
      }
    }
    if (nodeList.length > 0) {
      search(nodeList);
    }
    return matches;
  }

  /**
   * Reconciles the current chapters layout properties with
   * the global layout properties.
   * @param {object} globalLayout  The global layout settings object, chapter properties string
   * @return {object} layoutProperties Object with layout properties
   */
  reconcileLayoutSettings(globalLayout: GlobalLayout): LayoutSettings {
    // Get the global defaults
    const settings: LayoutSettings = {
      layout: globalLayout.layout,
      spread: globalLayout.spread,
      orientation: globalLayout.orientation,
    };
    // Get the chapter's display type
    this.properties.forEach(function (prop) {
      const rendition = prop.replace('rendition:', '');
      const split = rendition.indexOf('-');
      let property: string, value: string;
      if (split !== -1) {
        property = rendition.slice(0, split);
        value = rendition.slice(split + 1);
        (settings as any)[property] = value;
      }
    });
    return settings;
  }

  /**
   * Get a CFI from a Range in the Section
   * @param  {range} _range
   * @return {string} cfi an EpubCFI string
   */
  cfiFromRange(_range: Range): string {
    return new EpubCFI(_range, this.cfiBase).toString();
  }

  /**
   * Get a CFI from an Element in the Section
   * @param  {element} el
   * @return {string} cfi an EpubCFI string
   */
  cfiFromElement(el: Element): string {
    return new EpubCFI(el, this.cfiBase).toString();
  }

  /**
   * Unload the section document
   */
  unload(): void {
    this.document = undefined;
    this.contents = undefined;
    this.output = undefined;
  }

  destroy(): void {
    this.unload();
    this.hooks.serialize.clear();
    this.hooks.content.clear();
    // @ts-ignore
    this.hooks = undefined;
    // @ts-ignore
    this.idref = undefined;
    // @ts-ignore
    this.linear = undefined;
    // @ts-ignore
    this.properties = undefined;
    // @ts-ignore
    this.index = undefined;
    // @ts-ignore
    this.href = undefined;
    // @ts-ignore
    this.url = undefined;
    // @ts-ignore
    this.next = undefined;
    // @ts-ignore
    this.prev = undefined;
    // @ts-ignore
    this.cfiBase = undefined;
  }
}

export default Section;
