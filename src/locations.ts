import EventEmitter from 'events';

import EpubCFI from './epubcfi';
import Section from './section';
import Spine from './spine';
import { EVENTS } from './utils/constants';
import { defer, locationOf, qs, sprint } from './utils/core';
import Queue from './utils/queue';
import { ResponseType } from './utils/request';

/**
 * Find Locations for a Book
 * @param {Spine} spine
 * @param {request} request
 * @param {number} [pause=100]
 */

class Locations extends EventEmitter {
  spine: Spine | undefined;
  request: ((path: string) => Promise<ResponseType>) | undefined;
  pause: number | undefined;
  q: any;
  epubcfi: EpubCFI | undefined;
  _locations: string[] | undefined;
  _locationsWords: any[] | undefined;
  total: number | undefined;
  break?: number;
  _current: number | undefined;
  _wordCounter: number | undefined;
  _currentCfi: string | undefined;
  processingTimeout: any;

  constructor(
    spine: Spine,
    request?: (path: string) => Promise<ResponseType>,
    pause?: number,
  ) {
    super();
    this.spine = spine;
    this.request = request;
    this.pause = pause || 100;

    this.q = new Queue();
    this.epubcfi = new EpubCFI();

    this._locations = [];
    this._locationsWords = [];
    this.total = 0;

    this.break = 150;

    this._current = 0;

    this._wordCounter = 0;

    this._currentCfi = '';
    this.processingTimeout = undefined;
  }

  /**
   * Load all of sections in the book to generate locations
   * @param  {int} chars how many chars to split on
   * @return {Promise<Array<string>>} locations
   */
  generate(chars: number): Promise<string[]> {
    if (chars) {
      this.break = chars;
    }
    this.q.pause();
    this.spine!.each((section: Section) => {
      if (section.linear) {
        this.q.enqueue(() => this.process(section), 'Location process section');
      }
    });
    return this.q.run().then(() => {
      this.total = (this._locations?.length || 0) - 1;
      if (this._currentCfi) {
        this.currentLocation = this._currentCfi;
      }
      return this._locations as string[];
    });
  }

  private createRange(): {
    startContainer: Element | undefined;
    startOffset: number | undefined;
    endContainer: Element | undefined;
    endOffset: number | undefined;
  } {
    return {
      startContainer: undefined,
      startOffset: undefined,
      endContainer: undefined,
      endOffset: undefined,
    };
  }

  process(section: Section): Promise<string[]> {
    return section.load(this.request).then((contents: any) => {
      const completed = defer<string[]>();
      const locations = this.parse(contents, section.cfiBase!);
      this._locations = (this._locations || []).concat(locations);
      section.unload();
      this.processingTimeout = setTimeout(
        () => completed.resolve(locations),
        this.pause,
      );
      return completed.promise;
    });
  }

  parse(contents: Node, cfiBase: string, chars?: number): string[] {
    const locations: string[] = [];
    let range: any;
    const doc =
      contents.nodeType === Node.DOCUMENT_NODE
        ? contents
        : (contents as any).ownerDocument;
    const body = qs(doc, 'body');
    let counter = 0;
    let prev: any;
    const _break = chars || this.break;
    const parser = (node: Node) => {
      const len = node.textContent?.length || 0;
      let dist;
      let pos = 0;
      if ((node.textContent || '').trim().length === 0) {
        return false; // continue
      }
      // Start range
      if (counter == 0) {
        range = this.createRange();
        range.startContainer = node;
        range.startOffset = 0;
      }
      dist = _break! - counter;
      // Node is smaller than a break,
      // skip over it
      if (dist > len) {
        counter += len;
        pos = len;
      }
      while (pos < len) {
        dist = _break! - counter;
        if (counter === 0) {
          // Start new range
          pos += 1;
          range = this.createRange();
          range.startContainer = node;
          range.startOffset = pos;
        }
        // Gone over
        if (pos + dist >= len) {
          // Continue counter for next node
          counter += len - pos;
          pos = len;
        } else {
          // Advance pos
          pos += dist;
          // End the previous range
          range.endContainer = node;
          range.endOffset = pos;
          const cfi = new EpubCFI(range, cfiBase).toString();
          locations.push(cfi);
          counter = 0;
        }
      }
      prev = node;
    };
    if (body) {
      sprint(body, parser);
    }
    // Close remaining
    if (range && range.startContainer && prev) {
      range.endContainer = prev;
      range.endOffset = prev.length;
      const cfi = new EpubCFI(range, cfiBase).toString();
      locations.push(cfi);
      counter = 0;
    }
    return locations;
  }

  /**
   * Load all of sections in the book to generate locations
   * @param  {string} startCfi start position
   * @param  {int} wordCount how many words to split on
   * @param  {int} count result count
   * @return {object} locations
   */
  generateFromWords(
    startCfi: string,
    wordCount: number,
    count: number,
  ): Promise<any[]> {
    const start = startCfi ? new EpubCFI(startCfi) : undefined;
    this.q.pause();
    this._locationsWords = [];
    this._wordCounter = 0;

    this.spine!.each((section: Section) => {
      if (section.linear) {
        if (start) {
          if (section.index >= start.spinePos) {
            this.q.enqueue(
              () => this.processWords(section, wordCount, start, count),
              'Location process words',
            );
          }
        } else {
          this.q.enqueue(
            () => this.processWords(section, wordCount, start, count),
            'Location process words',
          );
        }
      }
    });

    return this.q.run().then(() => {
      if (this._currentCfi) {
        this.currentLocation = this._currentCfi;
      }
      return this._locationsWords as any[];
    });
  }

  processWords(
    section: any,
    wordCount: number,
    startCfi: any,
    count: number,
  ): Promise<any> {
    if (count && (this._locationsWords?.length || 0) >= count) {
      return Promise.resolve();
    }
    return section.load(this.request).then((contents: any) => {
      const completed = defer();
      const locations = this.parseWords(contents, section, wordCount, startCfi);
      const remainingCount = count - (this._locationsWords?.length || 0);
      this._locationsWords = (this._locationsWords || []).concat(
        locations.length >= count
          ? locations.slice(0, remainingCount)
          : locations,
      );
      section.unload();
      this.processingTimeout = setTimeout(
        () => completed.resolve(locations),
        this.pause,
      );
      return completed.promise;
    });
  }

  //http://stackoverflow.com/questions/18679576/counting-words-in-string
  countWords(s: string): number {
    s = s.replace(/(^\s*)|(\s*$)/gi, ''); //exclude  start and end white-space
    s = s.replace(/[ ]{2,}/gi, ' '); //2 or more space to 1
    s = s.replace(/\n /, '\n'); // exclude newline with a start spacing
    return s.split(' ').length;
  }

  parseWords(
    contents: any,
    section: any,
    wordCount: number,
    startCfi: any,
  ): { cfi: string; wordCount: number }[] {
    const cfiBase = section.cfiBase;
    const locations: { cfi: string; wordCount: number }[] = [];
    const doc = contents.ownerDocument;
    const body = qs(doc, 'body');
    let prev: any;
    const _break = wordCount;
    let foundStartNode = startCfi ? startCfi.spinePos !== section.index : true;
    let startNode: any;
    if (startCfi && section.index === startCfi.spinePos) {
      startNode = startCfi.findNode(
        startCfi.range
          ? startCfi.path.steps.concat(startCfi.start.steps)
          : startCfi.path.steps,
        contents.ownerDocument,
      );
    }
    const parser = (node: any) => {
      if (!foundStartNode) {
        if (node === startNode) {
          foundStartNode = true;
        } else {
          return false;
        }
      }
      if (node.textContent.length < 10) {
        if (node.textContent.trim().length === 0) {
          return false;
        }
      }
      const len = this.countWords(node.textContent);
      let dist;
      let pos = 0;
      if (len === 0) {
        return false; // continue
      }
      dist = _break - this._wordCounter!;
      // Node is smaller than a break,
      // skip over it
      if (dist > len) {
        this._wordCounter! += len;
        pos = len;
      }
      while (pos < len) {
        dist = _break - this._wordCounter!;
        // Gone over
        if (pos + dist >= len) {
          // Continue counter for next node
          this._wordCounter! += len - pos;
          pos = len;
        } else {
          pos += dist;
          const cfi = new EpubCFI(node, cfiBase);
          locations.push({
            cfi: cfi.toString(),
            wordCount: this._wordCounter!,
          });
          this._wordCounter = 0;
        }
      }
      prev = node;
    };
    if (body) {
      sprint(body as Node, parser.bind(this));
    }
    return locations;
  }

  /**
   * Get a location from an EpubCFI
   * @param {EpubCFI} cfi
   * @return {number}
   */
  locationFromCfi(cfi: string | EpubCFI): number {
    let loc;
    if ((EpubCFI.prototype as any).isCfiString(cfi)) {
      cfi = new EpubCFI(cfi as string);
    }
    if (!this._locations || this._locations.length === 0) {
      return -1;
    }
    // locationOf expects 5 arguments: needle, haystack, compare, start, end
    loc = locationOf(
      cfi,
      this._locations,
      (this.epubcfi as any).compare,
      0,
      this._locations.length - 1,
    );
    if (loc > (this.total as number)) {
      return this.total as number;
    }
    return loc;
  }

  /**
   * Get a percentage position in locations from an EpubCFI
   * @param {EpubCFI} cfi
   * @return {number}
   */
  percentageFromCfi(cfi: string | EpubCFI): number {
    if (!this._locations || this._locations.length === 0) {
      return 0;
    }
    const loc = this.locationFromCfi(cfi);
    return this.percentageFromLocation(loc);
  }

  /**
   * Get a percentage position from a location index
   * @param {number} location
   * @return {number}
   */
  percentageFromLocation(loc: number): number {
    if (!loc || !this.total) {
      return 0;
    }
    return loc / this.total;
  }

  /**
   * Get an EpubCFI from location index
   * @param {number} loc
   * @return {EpubCFI} cfi
   */
  cfiFromLocation(loc: number): string {
    let cfi = '';
    if (typeof loc !== 'number') {
      loc = parseInt(loc as any);
    }
    if (this._locations && loc >= 0 && loc < this._locations.length) {
      cfi = this._locations[loc];
    }
    return cfi;
  }

  /**
   * Get an EpubCFI from location percentage
   * @param {number} percentage
   * @return {EpubCFI} cfi
   */
  cfiFromPercentage(percentage: number): string {
    let loc;
    if (percentage > 1) {
      console.warn('Normalize cfiFromPercentage value to between 0 - 1');
    }
    if (percentage >= 1) {
      const cfi = new EpubCFI(
        this._locations ? this._locations[this.total as number] : '',
      );
      cfi.collapse();
      return cfi.toString();
    }
    loc = Math.ceil((this.total as number) * percentage);
    return this.cfiFromLocation(loc);
  }

  /**
   * Load locations from JSON
   * @param {json} locations
   */
  load(locations: string | string[]): string[] {
    if (typeof locations === 'string') {
      this._locations = JSON.parse(locations);
    } else {
      this._locations = locations;
    }
    this.total = (this._locations?.length || 0) - 1;
    return this._locations as string[];
  }

  /**
   * Save locations to JSON
   * @return {json}
   */
  save(): string {
    return JSON.stringify(this._locations);
  }

  getCurrent(): number | undefined {
    return this._current;
  }

  setCurrent(curr: string | number): void {
    let loc;
    if (typeof curr == 'string') {
      this._currentCfi = curr;
    } else if (typeof curr == 'number') {
      this._current = curr;
    } else {
      return;
    }
    if (!this._locations || this._locations.length === 0) {
      return;
    }
    if (typeof curr == 'string') {
      loc = this.locationFromCfi(curr);
      this._current = loc;
    } else {
      loc = curr;
    }
    (this as any).emit(EVENTS.LOCATIONS.CHANGED, {
      percentage: this.percentageFromLocation(loc),
    });
  }

  /**
   * Get the current location
   */
  get currentLocation(): number | undefined {
    return this._current;
  }

  /**
   * Set the current location
   */
  set currentLocation(curr: string | number | undefined) {
    if (curr !== undefined) {
      this.setCurrent(curr);
    }
  }

  /**
   * Locations length
   */
  length(): number {
    return this._locations ? this._locations.length : 0;
  }

  destroy(): void {
    this.spine = undefined;
    this.request = undefined;
    this.pause = undefined;
    if (this.q) this.q.stop();
    this.q = undefined;
    this.epubcfi = undefined;
    this._locations = undefined;
    this.total = undefined;
    this.break = undefined;
    this._current = undefined;
    this._currentCfi = undefined;
    clearTimeout(this.processingTimeout);
  }
}

export default Locations;
