import EventEmitter from 'events';
import { Highlight, Pane, Underline } from 'marks-pane';

import Contents from '../../contents';
import EpubCFI from '../../epubcfi';
import { Section } from '../../section';
import { EVENTS } from '../../utils/constants';
import {
  borders,
  Bounds,
  bounds,
  createBlobUrl,
  isNumber,
  revokeBlobUrl,
  uuid,
} from '../../utils/core';
import View from '../view';

interface IframeViewSettings {
  ignoreClass?: string;
  axis?: string;
  direction?: string;
  width?: number;
  height?: number;
  layout?: any;
  globalLayoutProperties?: any;
  method?: string;
  forceRight?: boolean;
  allowScriptedContent?: boolean;
  allowPopups?: boolean;
  flow?: string;
  forceEvenPages?: boolean;
}

class IframeView extends EventEmitter implements View {
  public settings: IframeViewSettings;
  public id: string;
  public section: Section;
  public index: number;
  public element: HTMLElement;
  public added: boolean;
  public displayed: boolean;
  public rendered: boolean;
  public fixedWidth: number;
  public fixedHeight: number;
  public epubcfi: EpubCFI;
  public layout: any;
  public pane?: Pane;
  public highlights: Record<string, any>;
  public underlines: Record<string, any>;
  public marks: Record<string, any>;
  public iframe?: HTMLIFrameElement;
  public resizing?: boolean;
  public _width?: number;
  public _height?: number;
  public elementBounds?: Bounds;
  public prevBounds?: Bounds & { widthDelta?: number; heightDelta?: number };
  public lockedWidth?: number;
  public lockedHeight?: number;
  public _expanding?: boolean;
  public _needsReframe?: boolean;
  public document?: Document;
  public window?: Window;
  public contents?: Contents;
  public rendering?: boolean;
  public stopExpanding?: boolean;
  public _textWidth?: number | null;
  public _textHeight?: number | null;
  public _contentWidth?: number | null;
  public _contentHeight?: number | null;
  public supportsSrcdoc?: boolean;
  public sectionRender?: Promise<any>;
  public blobUrl?: string;
  public writingMode?: string;
  public axis?: string;

  constructor(section: any, options?: IframeViewSettings) {
    super();
    this.settings = {
      ignoreClass: '',
      axis: undefined,
      direction: undefined,
      width: 0,
      height: 0,
      layout: undefined,
      globalLayoutProperties: {},
      method: undefined,
      forceRight: false,
      allowScriptedContent: false,
      allowPopups: false,
    };
    if (options) {
      Object.assign(this.settings, options);
    }

    this.id = 'epubjs-view-' + uuid();
    this.section = section;
    this.index = section.index;

    this.element = this.container(this.settings.axis);

    this.added = false;
    this.displayed = false;
    this.rendered = false;

    this.fixedWidth = 0;
    this.fixedHeight = 0;

    // Blank Cfi for Parsing
    this.epubcfi = new EpubCFI();

    this.layout = this.settings.layout;

    this.pane = undefined;
    this.highlights = {};
    this.underlines = {};
    this.marks = {};
  }

  container(axis?: string): HTMLElement {
    const element = document.createElement('div');

    element.classList.add('epub-view');

    // this.element.style.minHeight = "100px";
    element.style.height = '0px';
    element.style.width = '0px';
    element.style.overflow = 'hidden';
    element.style.position = 'relative';
    element.style.display = 'block';

    if (axis && axis == 'horizontal') {
      element.style.flex = 'none';
    } else {
      element.style.flex = 'initial';
    }

    return element;
  }

  create(): HTMLIFrameElement {
    if (this.iframe) {
      return this.iframe;
    }

    if (!this.element) {
      this.element = this.container(this.settings.axis);
    }

    this.iframe = document.createElement('iframe');
    this.iframe.id = this.id;
    this.iframe.scrolling = 'no'; // Might need to be removed: breaks ios width calculations
    this.iframe.style.overflow = 'hidden';
    // this.iframe.seamless = "seamless"; // Not in TS typings, skip
    // Back up if seamless isn't supported
    this.iframe.style.border = 'none';

    // sandbox
    this.iframe.sandbox = 'allow-same-origin';
    if (this.settings.allowScriptedContent) {
      this.iframe.sandbox += ' allow-scripts';
    }
    if (this.settings.allowPopups) {
      this.iframe.sandbox += ' allow-popups';
    }

    this.iframe.setAttribute('enable-annotation', 'true');

    this.resizing = true;

    // this.iframe.style.display = "none";
    this.element.style.visibility = 'hidden';
    this.iframe.style.visibility = 'hidden';

    this.iframe.style.width = '0';
    this.iframe.style.height = '0';
    this._width = 0;
    this._height = 0;

    this.element.setAttribute('ref', String(this.index));

    this.added = true;

    this.elementBounds = bounds(this.element);

    // if(width || height){
    //   this.resize(width, height);
    // } else if(this.width && this.height){
    //   this.resize(this.width, this.height);
    // } else {
    //   this.iframeBounds = bounds(this.iframe);
    // }

    if ('srcdoc' in this.iframe) {
      this.supportsSrcdoc = true;
    } else {
      this.supportsSrcdoc = false;
    }

    if (!this.settings.method) {
      this.settings.method = this.supportsSrcdoc ? 'srcdoc' : 'write';
    }

    return this.iframe;
  }

  render(request?: any, show?: boolean): Promise<void> {
    // view.onLayout = this.layout.format.bind(this.layout);
    this.create();

    // Fit to size of the container, apply padding
    this.size(this.settings.width, this.settings.height);

    if (!this.sectionRender) {
      this.sectionRender = this.section.render(request);
    }

    // Render Chain
    if (!this.sectionRender) {
      return Promise.reject(new Error('sectionRender is undefined'));
    }
    return this.sectionRender
      .then((contents: any) => {
        return this.load(contents);
      })
      .then(
        () => {
          // find and report the writingMode axis
          const writingMode = this.contents!.writingMode();

          // Set the axis based on the flow and writing mode
          let axis;
          if (this.settings.flow === 'scrolled') {
            axis =
              writingMode.indexOf('vertical') === 0 ? 'horizontal' : 'vertical';
          } else {
            axis =
              writingMode.indexOf('vertical') === 0 ? 'vertical' : 'horizontal';
          }

          if (
            writingMode.indexOf('vertical') === 0 &&
            this.settings.flow === 'paginated'
          ) {
            this.layout.delta = this.layout.height;
          }

          this.setAxis(axis);
          (this as any).emit(EVENTS.VIEWS.AXIS, axis);

          this.setWritingMode(writingMode);
          (this as any).emit(EVENTS.VIEWS.WRITING_MODE, writingMode);

          // apply the layout function to the contents
          this.layout.format(this.contents, this.section, this.axis);

          // Listen for events that require an expansion of the iframe
          this.addListeners();

          return new Promise<void>((resolve) => {
            // Expand the iframe to the full size of the content
            this.expand(false);

            if (this.settings.forceRight) {
              this.element.style.marginLeft = this.width() + 'px';
            }
            resolve();
          });
        },
        (e: any) => {
          (this as any).emit(EVENTS.VIEWS.LOAD_ERROR, e);
          return new Promise<void>((_resolve, reject) => {
            reject(e);
          });
        },
      )
      .then(() => {
        (this as any).emit(EVENTS.VIEWS.RENDERED, this.section);
      });
  }

  reset() {
    if (this.iframe) {
      this.iframe.style.width = '0';
      this.iframe.style.height = '0';
      this._width = 0;
      this._height = 0;
      this._textWidth = undefined;
      this._contentWidth = undefined;
      this._textHeight = undefined;
      this._contentHeight = undefined;
    }
    this._needsReframe = true;
  }

  // Determine locks base on settings
  size(_width?: number, _height?: number): void {
    const width = _width || this.settings.width;
    const height = _height || this.settings.height;

    if (this.layout.name === 'pre-paginated') {
      this.lock('both', width, height);
    } else if (this.settings.axis === 'horizontal') {
      this.lock('height', width, height);
    } else {
      this.lock('width', width, height);
    }

    this.settings.width = width;
    this.settings.height = height;
  }

  // Lock an axis to element dimensions, taking borders into account
  lock(what: string, width?: number, height?: number): void {
    const elBorders = borders(this.element);
    let iframeBorders;

    if (this.iframe) {
      iframeBorders = borders(this.iframe);
    } else {
      iframeBorders = { width: 0, height: 0 };
    }

    if (what == 'width' && isNumber(width)) {
      const safeWidth = width ?? 0;
      this.lockedWidth = safeWidth - elBorders.width - iframeBorders.width;
      // this.resize(this.lockedWidth, width); //  width keeps ratio correct
    }

    if (what == 'height' && isNumber(height)) {
      const safeHeight = height ?? 0;
      this.lockedHeight = safeHeight - elBorders.height - iframeBorders.height;
      // this.resize(width, this.lockedHeight);
    }

    if (what === 'both' && isNumber(width) && isNumber(height)) {
      const safeWidth = width ?? 0;
      const safeHeight = height ?? 0;
      this.lockedWidth = safeWidth - elBorders.width - iframeBorders.width;
      this.lockedHeight = safeHeight - elBorders.height - iframeBorders.height;
      // this.resize(this.lockedWidth, this.lockedHeight);
    }

    if (this.displayed && this.iframe) {
      // this.contents.layout();
      this.expand(false);
    }
  }

  // Resize a single axis based on content dimensions
  expand(force?: boolean): void {
    let width = this.lockedWidth;
    let height = this.lockedHeight;
    let columns;

    let textWidth, textHeight;

    if (!this.iframe || this._expanding) return;

    this._expanding = true;

    if (this.layout.name === 'pre-paginated') {
      width = this.layout.columnWidth;
      height = this.layout.height;
    }
    // Expand Horizontally
    else if (this.settings.axis === 'horizontal') {
      // Get the width of the text
      if (this.contents) {
        width = this.contents.textWidth();
      }
      if (width && this.layout.pageWidth && width % this.layout.pageWidth > 0) {
        width =
          Math.ceil(width / this.layout.pageWidth) * this.layout.pageWidth;
      }
      if (this.settings.forceEvenPages && width && this.layout.pageWidth) {
        columns = width / this.layout.pageWidth;
        if (
          this.layout.divisor > 1 &&
          this.layout.name === 'reflowable' &&
          columns % 2 > 0
        ) {
          // add a blank page
          width += this.layout.pageWidth;
        }
      }
    } // Expand Vertically
    else if (this.settings.axis === 'vertical') {
      if (this.contents) {
        height = this.contents.textHeight();
      }
      if (
        this.settings.flow === 'paginated' &&
        height &&
        this.layout.height &&
        height % this.layout.height > 0
      ) {
        height = Math.ceil(height / this.layout.height) * this.layout.height;
      }
    }

    // Only Resize if dimensions have changed or
    // if Frame is still hidden, so needs reframing
    if (this._needsReframe || width != this._width || height != this._height) {
      this.reframe(width, height);
    }

    this._expanding = false;
  }

  reframe(width?: number, height?: number): void {
    if (isNumber(width)) {
      this.element.style.width = width + 'px';
      if (this.iframe) this.iframe.style.width = width + 'px';
      this._width = width;
    }

    if (isNumber(height)) {
      this.element.style.height = height + 'px';
      if (this.iframe) this.iframe.style.height = height + 'px';
      this._height = height;
    }

    const safeWidth = width ?? 0;
    const safeHeight = height ?? 0;
    const widthDelta = this.prevBounds
      ? safeWidth - this.prevBounds.width
      : safeWidth;
    const heightDelta = this.prevBounds
      ? safeHeight - this.prevBounds.height
      : safeHeight;

    const size = {
      width: width || 0,
      height: height || 0,
      widthDelta: widthDelta,
      heightDelta: heightDelta,
    };

    this.pane && this.pane.render();

    requestAnimationFrame(() => {
      let mark;
      for (const m in this.marks) {
        if (this.marks.hasOwnProperty(m)) {
          mark = this.marks[m];
          this.placeMark(mark.element, mark.range);
        }
      }
    });

    this.onResize(this, size);

    (this as any).emit(EVENTS.VIEWS.RESIZED, size);

    this.prevBounds = size;

    this.elementBounds = bounds(this.element);
  }

  load(contents: string): Promise<Contents | undefined> {
    // Use a simple Promise instead of defer for TS safety
    return new Promise((resolve, reject) => {
      if (!this.iframe) {
        reject(new Error('No Iframe Available'));
        return;
      }

      this.iframe.onload = (event: Event) => {
        this.onLoad(event, { resolve, reject });
      };

      if (this.settings.method === 'blobUrl') {
        this.blobUrl = createBlobUrl(contents, 'application/xhtml+xml');
        this.iframe.src = this.blobUrl;
        this.element.appendChild(this.iframe);
      } else if (this.settings.method === 'srcdoc') {
        this.iframe.srcdoc = contents;
        this.element.appendChild(this.iframe);
      } else {
        this.element.appendChild(this.iframe);
        this.document = this.iframe.contentDocument || undefined;
        if (!this.document) {
          reject(new Error('No Document Available'));
          return;
        }
        if (this.iframe.contentDocument) {
          this.iframe.contentDocument.open();
          // For Cordova windows platform
          const win = window as any;
          if (win.MSApp && win.MSApp.execUnsafeLocalFunction) {
            const outerThis = this;
            win.MSApp.execUnsafeLocalFunction(function () {
              if (outerThis.iframe && outerThis.iframe.contentDocument) {
                outerThis.iframe.contentDocument.write(contents);
              }
            });
          } else {
            this.iframe.contentDocument.write(contents);
          }
          this.iframe.contentDocument.close();
        }
      }
    });
  }

  onLoad(
    event: Event,
    promise: {
      resolve: (value: Contents | undefined) => void;
      reject: (reason?: any) => void;
    },
  ): void {
    if (!this.iframe) {
      promise.reject(new Error('No iframe available in onLoad'));
      return;
    }
    this.window = this.iframe.contentWindow || undefined;
    this.document = this.iframe.contentDocument || undefined;
    if (
      this.document &&
      this.document.body &&
      this.section &&
      this.section.cfiBase !== undefined &&
      this.section.index !== undefined
    ) {
      this.contents = new Contents(
        this.document,
        this.document.body,
        this.section.cfiBase,
        this.section.index,
      );
    } else {
      this.contents = undefined;
    }
    this.rendering = false;
    if (this.document) {
      let link = this.document.querySelector("link[rel='canonical']");
      if (link) {
        link.setAttribute('href', this.section.canonical!);
      } else {
        link = this.document.createElement('link');
        link.setAttribute('rel', 'canonical');
        link.setAttribute('href', this.section.canonical!);
        const head = this.document.querySelector('head');
        if (head) head.appendChild(link);
      }
    }
    if (this.contents) {
      this.contents.on(EVENTS.CONTENTS.EXPAND, () => {
        if (this.displayed && this.iframe) {
          this.expand(false);
          if (this.contents) {
            this.layout.format(this.contents);
          }
        }
      });
      this.contents.on(EVENTS.CONTENTS.RESIZE, (_e: any) => {
        if (this.displayed && this.iframe) {
          this.expand(false);
          if (this.contents) {
            this.layout.format(this.contents);
          }
        }
      });
    }
    promise.resolve(this.contents);
  }

  setLayout(layout: any): void {
    this.layout = layout;
    if (this.contents) {
      this.layout.format(this.contents);
      this.expand(false);
    }
  }

  setAxis(axis: string): void {
    this.settings.axis = axis;
    if (axis == 'horizontal') {
      this.element.style.flex = 'none';
    } else {
      this.element.style.flex = 'initial';
    }
    this.size(this.settings.width, this.settings.height);
  }

  setWritingMode(mode: string): void {
    // this.element.style.writingMode = writingMode;
    this.writingMode = mode;
  }

  addListeners(): void {
    //TODO: Add content listeners for expanding
  }

  removeListeners(layoutFunc: any): void {
    //TODO: remove content listeners for expanding
  }

  display(request?: any): Promise<this> {
    return new Promise((resolve, reject) => {
      if (!this.displayed) {
        this.render(request).then(
          () => {
            (this as any).emit(EVENTS.VIEWS.DISPLAYED, this);
            this.onDisplayed(this);
            this.displayed = true;
            resolve(this);
          },
          (err: any) => {
            reject(err);
          },
        );
      } else {
        resolve(this);
      }
    });
  }

  show(): void {
    this.element.style.visibility = 'visible';
    if (this.iframe) {
      this.iframe.style.visibility = 'visible';
      // Remind Safari to redraw the iframe
      this.iframe.style.transform = 'translateZ(0)';
      this.iframe.offsetWidth;
      this.iframe.style.transform = '';
    }
    (this as any).emit(EVENTS.VIEWS.SHOWN, this);
  }

  hide(): void {
    // this.iframe.style.display = "none";
    this.element.style.visibility = 'hidden';
    if (this.iframe) {
      this.iframe.style.visibility = 'hidden';
    }
    this.stopExpanding = true;
    (this as any).emit(EVENTS.VIEWS.HIDDEN, this);
  }

  offset(): { top: number; left: number } {
    return {
      top: this.element.offsetTop,
      left: this.element.offsetLeft,
    };
  }

  width(): number {
    return this._width ?? 0;
  }

  height(): number {
    return this._height ?? 0;
  }

  position(): DOMRect {
    return this.element.getBoundingClientRect();
  }

  locationOf(target: any): { left: number; top: number } {
    if (!this.iframe || !this.contents) return { left: 0, top: 0 };
    const parentPos = this.iframe.getBoundingClientRect();
    const targetPos = this.contents.locationOf(
      target,
      this.settings.ignoreClass,
    );
    return {
      left: targetPos.left,
      top: targetPos.top,
    };
  }

  onDisplayed(view: View): void {
    // Stub, override with a custom functions
  }

  onResize(
    view: View,
    size: {
      width?: number;
      height?: number;
      widthDelta?: number;
      heightDelta?: number;
    },
  ): void {
    // Stub, override with a custom functions
  }

  bounds(force?: boolean): Bounds {
    if (force || !this.elementBounds) {
      this.elementBounds = bounds(this.element);
    }
    return this.elementBounds;
  }

  highlight(
    cfiRange: string,
    data: Record<string, any> = {},
    cb?: EventListener,
    className = 'epubjs-hl',
    styles: Record<string, string | number | boolean> = {},
  ): Highlight | undefined {
    if (!this.contents) {
      return;
    }
    const attributes = {
      fill: 'yellow',
      'fill-opacity': '0.3',
      'mix-blend-mode': 'multiply',
      ...styles,
    };
    const range = this.contents.range(cfiRange);
    const emitter = () => {
      (this as any).emit(EVENTS.VIEWS.MARK_CLICKED, cfiRange, data);
    };
    data['epubcfi'] = cfiRange;
    if (!this.pane) {
      this.pane = new Pane(this.iframe!, this.element);
    }
    const m = new Highlight(range!, className, data, attributes);
    const h = this.pane.addMark(m) as Highlight;
    this.highlights[cfiRange] = {
      mark: h,
      element: h.element,
      listeners: [emitter, cb],
    };
    if (h.element) {
      h.element.setAttribute('ref', className);
      h.element.addEventListener('click', emitter);
      h.element.addEventListener('touchstart', emitter);
      if (cb) {
        h.element.addEventListener('click', cb);
        h.element.addEventListener('touchstart', cb);
      }
    }
    return h;
  }

  underline(
    cfiRange: string,
    data: Record<string, any> = {},
    cb?: EventListener,
    className = 'epubjs-ul',
    styles: Record<string, string | number | boolean> = {},
  ): Underline | undefined {
    if (!this.contents) {
      return;
    }
    const attributes = {
      stroke: 'black',
      'stroke-opacity': '0.3',
      'mix-blend-mode': 'multiply',
      ...styles,
    };
    const range = this.contents.range(cfiRange);
    const emitter = () => {
      (this as any).emit(EVENTS.VIEWS.MARK_CLICKED, cfiRange, data);
    };
    data['epubcfi'] = cfiRange;
    if (!this.pane) {
      this.pane = new Pane(this.iframe!, this.element);
    }
    const m = new Underline(range!, className, data, attributes);
    const h = this.pane.addMark(m) as Underline;
    this.underlines[cfiRange] = {
      mark: h,
      element: h.element,
      listeners: [emitter, cb],
    };
    if (h.element) {
      h.element.setAttribute('ref', className);
      h.element.addEventListener('click', emitter);
      h.element.addEventListener('touchstart', emitter);
      if (cb) {
        h.element.addEventListener('click', cb);
        h.element.addEventListener('touchstart', cb);
      }
    }
    return h;
  }

  mark(
    cfiRange: string,
    data: Record<string, any> = {},
    cb?: EventListener,
  ): any {
    if (!this.contents) {
      return;
    }
    if (cfiRange in this.marks) {
      const item = this.marks[cfiRange];
      return item;
    }
    let range = this.contents.range(cfiRange);
    if (!range) {
      return;
    }
    const container = range.commonAncestorContainer;
    const parent = container.nodeType === 1 ? container : container.parentNode;
    const emitter = (_e: Event) => {
      (this as any).emit(EVENTS.VIEWS.MARK_CLICKED, cfiRange, data);
    };
    if (range.collapsed && container.nodeType === 1) {
      range = new Range();
      range.selectNodeContents(container as Node);
    } else if (range.collapsed) {
      // Webkit doesn't like collapsed ranges
      range = new Range();
      range.selectNodeContents(parent as Node);
    }
    if (!this.document) return;
    const mark = this.document.createElement('a');
    mark.setAttribute('ref', 'epubjs-mk');
    mark.style.position = 'absolute';
    (mark.dataset as any)['epubcfi'] = cfiRange;
    if (data) {
      Object.keys(data).forEach((key) => {
        (mark.dataset as any)[key] = data[key];
      });
    }
    if (cb) {
      mark.addEventListener('click', cb);
      mark.addEventListener('touchstart', cb);
    }
    mark.addEventListener('click', emitter);
    mark.addEventListener('touchstart', emitter);
    this.placeMark(mark, range);
    this.element.appendChild(mark);
    this.marks[cfiRange] = {
      element: mark,
      range: range,
      listeners: [emitter, cb],
    };
    return parent;
  }

  placeMark(element: HTMLElement, range: Range): void {
    let top: number | undefined,
      right: number | undefined,
      left: number | undefined;
    if (
      this.layout.name === 'pre-paginated' ||
      this.settings.axis !== 'horizontal'
    ) {
      const pos = range.getBoundingClientRect();
      top = pos.top;
      right = pos.right;
    } else {
      // Element might break columns, so find the left most element
      const rects = range.getClientRects();
      let rect;
      for (let i = 0; i != rects.length; i++) {
        rect = rects[i];
        if (left === undefined || rect.left < left) {
          left = rect.left;
          // right = rect.right;
          right =
            Math.ceil(left / this.layout.props.pageWidth) *
              this.layout.props.pageWidth -
            this.layout.gap / 2;
          top = rect.top;
        }
      }
    }
    if (top !== undefined) element.style.top = `${top}px`;
    if (right !== undefined) element.style.left = `${right}px`;
  }

  unhighlight(cfiRange: string): void {
    let item: any;
    if (cfiRange in this.highlights) {
      item = this.highlights[cfiRange];
      if (this.pane) this.pane.removeMark(item.mark);
      item.listeners.forEach((l: any) => {
        if (l) {
          item.element.removeEventListener('click', l);
          item.element.removeEventListener('touchstart', l);
        }
      });
      delete this.highlights[cfiRange];
    }
  }

  ununderline(cfiRange: string): void {
    let item: any;
    if (cfiRange in this.underlines) {
      item = this.underlines[cfiRange];
      if (this.pane) this.pane.removeMark(item.mark);
      item.listeners.forEach((l: any) => {
        if (l) {
          item.element.removeEventListener('click', l);
          item.element.removeEventListener('touchstart', l);
        }
      });
      delete this.underlines[cfiRange];
    }
  }

  unmark(cfiRange: string): void {
    let item: any;
    if (cfiRange in this.marks) {
      item = this.marks[cfiRange];
      this.element.removeChild(item.element);
      item.listeners.forEach((l: any) => {
        if (l) {
          item.element.removeEventListener('click', l);
          item.element.removeEventListener('touchstart', l);
        }
      });
      delete this.marks[cfiRange];
    }
  }

  destroy(): void {
    for (const cfiRange in this.highlights) {
      this.unhighlight(cfiRange);
    }
    for (const cfiRange in this.underlines) {
      this.ununderline(cfiRange);
    }
    for (const cfiRange in this.marks) {
      this.unmark(cfiRange);
    }
    if (this.blobUrl) {
      revokeBlobUrl(this.blobUrl);
    }
    if (this.displayed) {
      this.displayed = false;
      this.removeListeners(undefined);
      if (this.contents) this.contents.destroy();
      this.stopExpanding = true;
      if (this.iframe) this.element.removeChild(this.iframe);
      if (this.pane) {
        this.pane.element.remove();
        this.pane = undefined;
      }
      this.iframe = undefined;
      this.contents = undefined;
      this._textWidth = null;
      this._textHeight = null;
      this._width = 0;
      this._height = 0;
    }
    // this.element.style.height = "0px";
    // this.element.style.width = "0px";
  }
}

export default IframeView;
