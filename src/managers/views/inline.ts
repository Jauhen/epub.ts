import EventEmitter from 'events';

import Contents from '../../contents';
import EpubCFI from '../../epubcfi';
import Layout from '../../layout';
import Section from '../../section';
import { EVENTS } from '../../utils/constants';
import { borders, bounds, isNumber, parse, qs, uuid } from '../../utils/core';
import type View from '../view';

interface InlineViewSettings {
  ignoreClass?: string;
  axis?: string;
  width?: number;
  height?: number;
  layout?: Layout;
  globalLayoutProperties?: any;
}

class InlineView extends EventEmitter implements View {
  public settings: InlineViewSettings;
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
  public layout: Layout;
  public frame?: HTMLElement;
  public resizing: boolean;
  public _width: number;
  public _height: number;
  public elementBounds: any;
  public prevBounds?: any;
  public lockedWidth?: number;
  public lockedHeight?: number;
  public _expanding?: boolean;
  public _needsReframe?: boolean;
  public document?: Document;
  public window?: Window;
  public contents?: Contents;
  public rendering?: boolean;
  public stopExpanding?: boolean;
  public _textWidth?: number;
  public _textHeight?: number;

  constructor(section: Section, options?: InlineViewSettings) {
    super();
    this.settings = Object.assign(
      {
        ignoreClass: '',
        axis: 'vertical',
        width: 0,
        height: 0,
        layout: undefined,
        globalLayoutProperties: {},
      },
      options || {},
    );

    this.id = 'epubjs-view:' + uuid();
    this.section = section;
    this.index = section.index;

    this.element = this.container(this.settings.axis || 'vertical');

    this.added = false;
    this.displayed = false;
    this.rendered = false;

    this._width = this.settings.width || 0;
    this._height = this.settings.height || 0;

    this.fixedWidth = 0;
    this.fixedHeight = 0;

    // Initialize required properties
    this.resizing = false;
    this.elementBounds = {};

    // Blank Cfi for Parsing
    this.epubcfi = new EpubCFI();

    this.layout = this.settings.layout!; // We'll handle undefined cases in methods
    // Dom events to listen for
    // this.listenedEvents = ["keydown", "keyup", "keypressed", "mouseup", "mousedown", "click", "touchend", "touchstart"];
  }

  container(axis?: string): HTMLElement {
    const element = document.createElement('div');

    element.classList.add('epub-view');

    // if(this.settings.axis === "horizontal") {
    //   element.style.width = "auto";
    //   element.style.height = "0";
    // } else {
    //   element.style.width = "0";
    //   element.style.height = "auto";
    // }

    element.style.overflow = 'hidden';

    if (axis && axis == 'horizontal') {
      element.style.display = 'inline-block';
    } else {
      element.style.display = 'block';
    }

    return element;
  }

  create(): HTMLElement {
    if (this.frame) {
      return this.frame;
    }

    if (!this.element) {
      this.element = this.container();
    }

    this.frame = document.createElement('div');
    this.frame.id = this.id;
    this.frame.style.overflow = 'hidden';
    this.frame.style.wordSpacing = 'initial';
    this.frame.style.lineHeight = 'initial';

    this.resizing = true;

    // this.frame.style.display = "none";
    this.element.style.visibility = 'hidden';
    this.frame.style.visibility = 'hidden';

    if (this.settings.axis === 'horizontal') {
      this.frame.style.width = 'auto';
      this.frame.style.height = '0';
    } else {
      this.frame.style.width = '0';
      this.frame.style.height = 'auto';
    }

    this._width = 0;
    this._height = 0;

    this.element.appendChild(this.frame);
    this.added = true;

    this.elementBounds = bounds(this.element);

    return this.frame;
  }

  render(
    request?: (url: string) => Promise<Document>,
    show?: boolean,
  ): Promise<void> {
    // view.onLayout = this.layout.format.bind(this.layout);
    this.create();

    // Fit to size of the container, apply padding
    this.size(this._width, this._height);

    // Render Chain
    const contents = this.section.render(request);
    return (
      contents
        .then((resolved) => {
          this.load(resolved);
        })
        // .then(function(doc){
        //   return this.hooks.content.trigger(view, this);
        // }.bind(this))
        .then(() => {
          // this.settings.layout.format(view.contents);
          // return this.hooks.layout.trigger(view, this);
        })
        // .then(function(){
        //   return this.display();
        // }.bind(this))
        // .then(function(){
        //   return this.hooks.render.trigger(view, this);
        // }.bind(this))
        .then(() => {
          // apply the layout function to the contents
          if (this.settings.layout && this.contents) {
            this.settings.layout.format(
              this.contents,
              this.section,
              this.settings.axis,
            );
          }

          // Expand the iframe to the full size of the content
          // this.expand();

          // Listen for events that require an expansion of the iframe
          this.addListeners();

          if (show !== false) {
            //this.q.enqueue(function(view){
            this.show();
            //}, view);
          }
          // this.map = new Map(view, this.layout);
          //this.hooks.show.trigger(view, this);
          (this as any).emit(EVENTS.VIEWS.RENDERED, this.section);
        })
        .catch((e: Error) => {
          (this as any).emit(EVENTS.VIEWS.LOAD_ERROR, e);
        })
    );
  }

  // Determine locks base on settings
  size(_width?: number, _height?: number): void {
    const width = _width || this.settings.width || 0;
    const height = _height || this.settings.height || 0;

    if (this.layout && this.layout.name === 'pre-paginated') {
      // TODO: check if these are different than the size set in chapter
      this.lock('both', width, height);
    } else if (this.settings.axis === 'horizontal') {
      this.lock('height', width, height);
    } else {
      this.lock('width', width, height);
    }
  }

  // Lock an axis to element dimensions, taking borders into account
  lock(what: string, width: number, height: number): void {
    const elBorders = borders(this.element);
    let iframeBorders;

    if (this.frame) {
      iframeBorders = borders(this.frame);
    } else {
      iframeBorders = { width: 0, height: 0 };
    }

    if (what == 'width' && isNumber(width)) {
      this.lockedWidth = width - elBorders.width - iframeBorders.width;
      this.resize(this.lockedWidth, undefined); //  width keeps ratio correct
    }

    if (what == 'height' && isNumber(height)) {
      this.lockedHeight = height - elBorders.height - iframeBorders.height;
      this.resize(undefined, this.lockedHeight);
    }

    if (what === 'both' && isNumber(width) && isNumber(height)) {
      this.lockedWidth = width - elBorders.width - iframeBorders.width;
      this.lockedHeight = height - elBorders.height - iframeBorders.height;

      this.resize(this.lockedWidth, this.lockedHeight);
    }
  }

  // Resize a single axis based on content dimensions
  expand(force?: boolean): void {
    let width = this.lockedWidth;
    let height = this.lockedHeight;

    let textWidth: number | undefined, textHeight: number | undefined;

    if (!this.frame || this._expanding) return;

    this._expanding = true;

    // Expand Horizontally
    if (this.settings.axis === 'horizontal') {
      width = this.contentWidth(textWidth);
    } // Expand Vertically
    else if (this.settings.axis === 'vertical') {
      height = this.contentHeight(textHeight);
    }

    // Only Resize if dimensions have changed or
    // if Frame is still hidden, so needs reframing
    if (this._needsReframe || width != this._width || height != this._height) {
      this.resize(width, height);
    }

    this._expanding = false;
  }

  contentWidth(min?: number): number {
    return this.frame ? this.frame.scrollWidth : 0;
  }

  contentHeight(min?: number): number {
    return this.frame ? this.frame.scrollHeight : 0;
  }

  resize(width?: number, height?: number): void {
    if (!this.frame) return;

    if (isNumber(width)) {
      this.frame.style.width = width + 'px';
      this._width = width ?? 0;
    }

    if (isNumber(height)) {
      this.frame.style.height = height + 'px';
      this._height = height ?? 0;
    }

    this.prevBounds = this.elementBounds;

    this.elementBounds = bounds(this.element);

    const size = {
      width: this.elementBounds.width,
      height: this.elementBounds.height,
      widthDelta: this.elementBounds.width - this.prevBounds.width,
      heightDelta: this.elementBounds.height - this.prevBounds.height,
    };

    this.onResize(this, size);

    (this as any).emit(EVENTS.VIEWS.RESIZED, size);
  }

  load(contents?: string): Promise<Contents> {
    return new Promise((resolve) => {
      // parse expects 3 arguments: input, mimeType, baseUrl
      const doc = parse(contents || '', 'text/html', false);
      const body = qs(doc, 'body');
      if (this.frame && body) {
        this.frame.innerHTML = body.innerHTML;
        this.document = this.frame.ownerDocument;
        // defaultView can be null, but we want undefined for our type
        this.window = this.document.defaultView || undefined;
        // Contents expects 4 arguments: document, frame, section, cfiBase
        this.contents = new Contents(this.document, this.frame, '', 0);
        this.rendering = false;
        resolve(this.contents);
      }
    });
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
  }

  resizeListenters(): void {
    // Test size again
    // clearTimeout(this.expanding);
    // this.expanding = setTimeout(this.expand.bind(this), 350);
  }

  addListeners(): void {
    //TODO: Add content listeners for expanding
  }

  removeListeners(layoutFunc: any): void {
    //TODO: remove content listeners for expanding
  }

  display(request?: (url: string) => Promise<Document>): Promise<this> {
    return new Promise((resolve) => {
      if (!this.displayed) {
        this.render(request).then(() => {
          this.emit(EVENTS.VIEWS.DISPLAYED, this);
          this.onDisplayed(this);
          this.displayed = true;
          resolve(this);
        });
      } else {
        resolve(this);
      }
    });
  }

  show(): void {
    this.element.style.visibility = 'visible';
    if (this.frame) {
      this.frame.style.visibility = 'visible';
    }
    (this as any).emit(EVENTS.VIEWS.SHOWN, this);
  }

  hide(): void {
    // this.frame.style.display = "none";
    this.element.style.visibility = 'hidden';
    if (this.frame) {
      this.frame.style.visibility = 'hidden';
    }
    this.stopExpanding = true;
    (this as any).emit(EVENTS.VIEWS.HIDDEN, this);
  }

  position(): DOMRect {
    return this.element.getBoundingClientRect();
  }

  locationOf(target: any): { left: number; top: number } {
    if (!this.frame || !this.contents) return { left: 0, top: 0 };
    const parentPos = this.frame.getBoundingClientRect();
    const targetPos = this.contents.locationOf(
      target,
      this.settings.ignoreClass,
    );
    return {
      left: window.scrollX + parentPos.left + targetPos.left,
      top: window.scrollY + parentPos.top + targetPos.top,
    };
  }

  onDisplayed(view: View): void {
    // Stub, override with a custom functions
  }

  onResize(view: View, e: any): void {
    // Stub, override with a custom functions
  }

  width(): number {
    return this._width;
  }

  height(): number {
    return this._height;
  }

  reset(): void {}

  setAxis(axis: any): void {}

  offset(): { top: number; left: number } {
    return { top: 0, left: 0 };
  }

  highlight(
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): void {}
  unhighlight(cfiRange: string): void {}

  underline(
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): void {}
  ununderline(cfiRange: string): void {}

  mark(cfiRange: string, data?: object, cb?: Function): void {}
  unmark(cfiRange: string): void {}

  bounds(): any {
    if (!this.elementBounds) {
      this.elementBounds = bounds(this.element);
    }
    return this.elementBounds;
  }

  destroy(): void {
    if (this.displayed) {
      this.displayed = false;
      this.removeListeners(undefined);
      this.stopExpanding = true;
      if (this.frame) {
        this.element.removeChild(this.frame);
      }
      this.displayed = false;
      this.frame = undefined;
      this._textWidth = undefined;
      this._textHeight = undefined;
      this._width = 0;
      this._height = 0;
    }
    // this.element.style.height = "0px";
    // this.element.style.width = "0px";
  }
}

export default InlineView;
