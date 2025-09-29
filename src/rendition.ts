import EventEmitter from 'events';

import Annotations from './annotations';
import type Book from './book';
import EpubCFI from './epubcfi';
import Layout from './layout';
import ContinuousViewManager from './managers/continuous/index';
// Default View Managers
import DefaultViewManager from './managers/default/index';
// Default Views
import IframeView from './managers/views/iframe';
import Themes from './themes';
import { DOM_EVENTS, EVENTS } from './utils/constants';
import { defer, isFloat } from './utils/core';
import Hook from './utils/hook';
import Queue from './utils/queue';

export interface RenditionOptions {
  width?: number | string;
  height?: number | string;
  ignoreClass?: string;
  manager?: string | Function | object;
  view?: string | Function | object;
  flow?: string;
  layout?: string;
  spread?: string;
  minSpreadWidth?: number;
  stylesheet?: string;
  resizeOnOrientationChange?: boolean;
  script?: string;
  infinite?: boolean;
  overflow?: string;
  snap?: boolean | object;
  defaultDirection?: string;
  allowScriptedContent?: boolean;
  allowPopups?: boolean;
}

export interface DisplayedLocation {
  index: number;
  href: string;
  cfi: string;
  location: number;
  percentage: number;
  displayed: {
    page: number;
    total: number;
  };
}

export interface Location {
  start: DisplayedLocation;
  end: DisplayedLocation;
  atStart: boolean;
  atEnd: boolean;
}

/**
 * Displays an Epub as a series of Views for each Section.
 * Requires Manager and View class to handle specifics of rendering
 * the section content.
 * @class
 * @param {Book} book
 * @param {object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {string} [options.ignoreClass] class for the cfi parser to ignore
 * @param {string | function | object} [options.manager='default']
 * @param {string | function} [options.view='iframe']
 * @param {string} [options.layout] layout to force
 * @param {string} [options.spread] force spread value
 * @param {number} [options.minSpreadWidth] overridden by spread: none (never) / both (always)
 * @param {string} [options.stylesheet] url of stylesheet to be injected
 * @param {boolean} [options.resizeOnOrientationChange] false to disable orientation events
 * @param {string} [options.script] url of script to be injected
 * @param {boolean | object} [options.snap=false] use snap scrolling
 * @param {string} [options.defaultDirection='ltr'] default text direction
 * @param {boolean} [options.allowScriptedContent=false] enable running scripts in content
 * @param {boolean} [options.allowPopups=false] enable opening popup in content
 */
class Rendition extends EventEmitter {
  settings: RenditionOptions & { globalLayoutProperties?: any };
  book: Book;
  hooks: {
    display: Hook;
    serialize: Hook;
    content: Hook;
    unloaded: Hook;
    layout: Hook;
    render: Hook;
    show: Hook;
  };
  themes: Themes;
  annotations: Annotations;
  epubcfi: EpubCFI;
  q: Queue;
  location: Location | undefined;
  started: Promise<void>;
  manager: any;
  ViewManager: any;
  View: any;
  displaying: any;
  _layout: any;
  starting: any;

  constructor(book: Book, options?: RenditionOptions) {
    super();
    this.settings = Object.assign(
      {},
      {
        width: undefined,
        height: undefined,
        ignoreClass: '',
        manager: 'default',
        view: 'iframe',
        flow: undefined,
        layout: undefined,
        spread: undefined,
        minSpreadWidth: 800,
        stylesheet: undefined,
        resizeOnOrientationChange: true,
        script: undefined,
        snap: false,
        defaultDirection: 'ltr',
        allowScriptedContent: false,
        allowPopups: false,
        globalLayoutProperties: undefined,
      },
    );
    if (options) Object.assign(this.settings, options);

    if (typeof this.settings.manager === 'object') {
      this.manager = this.settings.manager;
    }

    this.book = book;

    /**
     * Adds Hook methods to the Rendition prototype
     * @member {object} hooks
     * @property {Hook} hooks.content
     * @memberof Rendition
     */
    this.hooks = {
      display: new Hook(this),
      serialize: new Hook(this),
      content: new Hook(this),
      unloaded: new Hook(this),
      layout: new Hook(this),
      render: new Hook(this),
      show: new Hook(this),
    };

    this.hooks.content.register(this.handleLinks.bind(this));
    this.hooks.content.register(this.passEvents.bind(this));
    this.hooks.content.register(this.adjustImages.bind(this));

    this.book.spine?.hooks.content.register(this.injectIdentifier.bind(this));

    if (this.settings.stylesheet) {
      this.book.spine?.hooks.content.register(this.injectStylesheet.bind(this));
    }

    if (this.settings.script) {
      this.book.spine?.hooks.content.register(this.injectScript.bind(this));
    }

    /**
     * @member {Themes} themes
     * @memberof Rendition
     */
    this.themes = new Themes(this as any);
    this.annotations = new Annotations(this as any);

    this.epubcfi = new EpubCFI();

    this.q = new Queue<Rendition>(this);

    /**
     * A Rendered Location Range
     * @typedef location
     * @type {Object}
     * @property {object} start
     * @property {string} start.index
     * @property {string} start.href
     * @property {object} start.displayed
     * @property {EpubCFI} start.cfi
     * @property {number} start.location
     * @property {number} start.percentage
     * @property {number} start.displayed.page
     * @property {number} start.displayed.total
     * @property {object} end
     * @property {string} end.index
     * @property {string} end.href
     * @property {object} end.displayed
     * @property {EpubCFI} end.cfi
     * @property {number} end.location
     * @property {number} end.percentage
     * @property {number} end.displayed.page
     * @property {number} end.displayed.total
     * @property {boolean} atStart
     * @property {boolean} atEnd
     * @memberof Rendition
     */
    this.location = undefined;

    // Hold queue until book is opened
    this.q.enqueue(this.book.opened! as any);

    this.starting = defer();
    /**
     * @member {promise} started returns after the rendition has started
     * @memberof Rendition
     */
    this.started = this.starting.promise;

    // Block the queue until rendering is started
    this.q.enqueue(this.start);
  }

  /**
   * Set the manager function
   * @param {function} manager
   */
  setManager(manager: any): void {
    this.manager = manager;
  }

  /**
   * Require the manager from passed string, or as a class function
   * @param  {string|object} manager [description]
   * @return {method}
   */
  requireManager(manager: any): any {
    let viewManager;

    // If manager is a string, try to load from imported managers
    if (typeof manager === 'string' && manager === 'default') {
      viewManager = DefaultViewManager;
    } else if (typeof manager === 'string' && manager === 'continuous') {
      viewManager = ContinuousViewManager;
    } else {
      // otherwise, assume we were passed a class function
      viewManager = manager;
    }

    return viewManager;
  }

  /**
   * Require the view from passed string, or as a class function
   * @param  {string|object} view
   * @return {view}
   */
  requireView(view: any): any {
    let View;

    // If view is a string, try to load from imported views,
    if (typeof view == 'string' && view === 'iframe') {
      View = IframeView;
    } else {
      // otherwise, assume we were passed a class function
      View = view;
    }

    return View;
  }

  /**
   * Start the rendering
   * @return {Promise} rendering has started
   */
  start(): void {
    const bookAny = this.book as any;
    if (
      !this.settings.layout &&
      (bookAny.package?.metadata?.layout === 'pre-paginated' ||
        bookAny.displayOptions?.fixedLayout === 'true')
    ) {
      this.settings.layout = 'pre-paginated';
    }
    switch (bookAny.package?.metadata?.spread) {
      case 'none':
        this.settings.spread = 'none';
        break;
      case 'both':
        this.settings.spread = 'both';
        break;
    }

    if (!this.manager) {
      const managerType = this.settings.manager || 'default';
      const viewType = this.settings.view || 'iframe';
      this.ViewManager = this.requireManager(managerType);
      this.View = this.requireView(viewType);
      this.manager = new this.ViewManager({
        view: this.View,
        queue: this.q,
        request: this.book.load.bind(this.book),
        settings: this.settings,
      });
    }

    this.direction(
      bookAny.package?.metadata?.direction || this.settings.defaultDirection,
    );

    // Parse metadata to get layout props
    this.settings.globalLayoutProperties = this.determineLayoutProperties(
      bookAny.package?.metadata || {},
    );
    const globalLayout = this.settings.globalLayoutProperties;
    this.flow(globalLayout.flow);
    this.layout(globalLayout);

    // Listen for displayed views
    this.manager.on(EVENTS.MANAGERS.ADDED, this.afterDisplayed.bind(this));
    this.manager.on(EVENTS.MANAGERS.REMOVED, this.afterRemoved.bind(this));

    // Listen for resizing
    this.manager.on(EVENTS.MANAGERS.RESIZED, this.onResized.bind(this));

    // Listen for rotation
    this.manager.on(
      EVENTS.MANAGERS.ORIENTATION_CHANGE,
      this.onOrientationChange.bind(this),
    );

    // Listen for scroll changes
    this.manager.on(EVENTS.MANAGERS.SCROLLED, this.reportLocation.bind(this));

    /**
     * Emit that rendering has started
     * @event started
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.STARTED);

    // Start processing queue
    this.starting.resolve();
  }

  /**
   * Call to attach the container to an element in the dom
   * Container must be attached before rendering can begin
   * @param  {element} element to attach to
   * @return {Promise}
   */
  attachTo(element: Element): Promise<void> {
    return this.q.enqueue(() => {
      // Start rendering
      this.manager.render(element, {
        width: this.settings.width,
        height: this.settings.height,
      });

      /**
       * Emit that rendering has attached to an element
       * @event attached
       * @memberof Rendition
       */
      this.emit(EVENTS.RENDITION.ATTACHED);
    });
  }

  /**
   * Display a point in the book
   * The request will be added to the rendering Queue,
   * so it will wait until book is opened, rendering started
   * and all other rendering tasks have finished to be called.
   * @param  {string} target Url or EpubCFI
   * @return {Promise}
   */
  display(target?: string): Promise<any> {
    if (this.displaying) {
      this.displaying.resolve();
    }
    return this.q.enqueue(this._display, target!);
  }

  /**
   * Tells the manager what to display immediately
   * @private
   * @param  {string} target Url or EpubCFI
   * @return {Promise}
   */
  _display(target?: string | number): Promise<any> {
    if (!this.book) {
      return Promise.resolve();
    }
    const isCfiString = this.epubcfi.isCfiString(
      typeof target === 'string' ? target : '',
    );
    const displaying = defer();
    const displayed = displaying.promise;
    let section: any;
    let moveTo;

    this.displaying = displaying;

    // Check if this is a book percentage
    if (
      (this.book as any).locations.length() &&
      typeof target === 'string' &&
      isFloat(target)
    ) {
      target = (this.book as any).locations.cfiFromPercentage(
        parseFloat(target),
      );
    }

    section = (this.book as any).spine.get(target);

    if (!section) {
      displaying.reject(new Error('No Section Found'));
      return displayed;
    }

    this.manager.display(section, target).then(
      () => {
        displaying.resolve(section);
        this.displaying = undefined;
        this.emit(EVENTS.RENDITION.DISPLAYED, section);
        this.reportLocation();
      },
      (err: any) => {
        this.emit(EVENTS.RENDITION.DISPLAY_ERROR, err);
      },
    );

    return displayed;
  }

  /*
  render(view, show) {

    // view.onLayout = this.layout.format.bind(this.layout);
    view.create();

    // Fit to size of the container, apply padding
    this.manager.resizeView(view);

    // Render Chain
    return view.section.render(this.book.request)
      .then(function(contents){
        return view.load(contents);
      }.bind(this))
      .then(function(doc){
        return this.hooks.content.trigger(view, this);
      }.bind(this))
      .then(function(){
        this.layout.format(view.contents);
        return this.hooks.layout.trigger(view, this);
      }.bind(this))
      .then(function(){
        return view.display();
      }.bind(this))
      .then(function(){
        return this.hooks.render.trigger(view, this);
      }.bind(this))
      .then(function(){
        if(show !== false) {
          this.q.enqueue(function(view){
            view.show();
          }, view);
        }
        // this.map = new Map(view, this.layout);
        this.hooks.show.trigger(view, this);
        this.trigger("rendered", view.section);

      }.bind(this))
      .catch(function(e){
        this.trigger("loaderror", e);
      }.bind(this));

  }
  */

  /**
   * Report what section has been displayed
   * @private
   * @param  {*} view
   */
  afterDisplayed(view: any): void {
    view.on(EVENTS.VIEWS.MARK_CLICKED, (cfiRange: any, data: any) =>
      this.triggerMarkEvent(cfiRange, data, view.contents),
    );

    this.hooks.render.trigger(view, this).then(() => {
      if (view.contents) {
        this.hooks.content.trigger(view.contents, this).then(() => {
          /**
           * Emit that a section has been rendered
           * @event rendered
           * @param {Section} section
           * @param {View} view
           * @memberof Rendition
           */
          this.emit(EVENTS.RENDITION.RENDERED, view.section, view);
        });
      } else {
        this.emit(EVENTS.RENDITION.RENDERED, view.section, view);
      }
    });
  }

  /**
   * Report what has been removed
   * @private
   * @param  {*} view
   */
  afterRemoved(view: any): void {
    this.hooks.unloaded.trigger(view, this).then(() => {
      /**
       * Emit that a section has been removed
       * @event removed
       * @param {Section} section
       * @param {View} view
       * @memberof Rendition
       */
      this.emit(EVENTS.RENDITION.REMOVED, view.section, view);
    });
  }

  /**
   * Report resize events and display the last seen location
   * @private
   */
  onResized(size: any, epubcfi?: string): void {
    /**
     * Emit that the rendition has been resized
     * @event resized
     * @param {number} width
     * @param {height} height
     * @param {string} epubcfi (optional)
     * @memberof Rendition
     */
    this.emit(
      EVENTS.RENDITION.RESIZED,
      {
        width: size.width,
        height: size.height,
      },
      epubcfi,
    );

    if (this.location && this.location.start) {
      this.display(epubcfi || this.location.start.cfi);
    }
  }

  /**
   * Report orientation events and display the last seen location
   * @private
   */
  onOrientationChange(orientation: string): void {
    /**
     * Emit that the rendition has been rotated
     * @event orientationchange
     * @param {string} orientation
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.ORIENTATION_CHANGE, orientation);
  }

  /**
   * Move the Rendition to a specific offset
   * Usually you would be better off calling display()
   * @param {object} offset
   */
  moveTo(offset: any): void {
    this.manager.moveTo(offset);
  }

  /**
   * Trigger a resize of the views
   * @param {number} [width]
   * @param {number} [height]
   * @param {string} [epubcfi] (optional)
   */
  resize(width: number, height: number, epubcfi?: string): void {
    if (width) {
      this.settings.width = width;
    }
    if (height) {
      this.settings.height = height;
    }
    this.manager.resize(width, height, epubcfi);
  }

  /**
   * Clear all rendered views
   */
  clear() {
    this.manager.clear();
  }

  /**
   * Go to the next "page" in the rendition
   * @return {Promise}
   */
  next() {
    return this.q
      .enqueue(this.manager.next.bind(this.manager))
      .then(this.reportLocation.bind(this));
  }

  /**
   * Go to the previous "page" in the rendition
   * @return {Promise}
   */
  prev() {
    return this.q
      .enqueue(this.manager.prev.bind(this.manager))
      .then(this.reportLocation.bind(this));
  }

  //-- http://www.idpf.org/epub/301/spec/epub-publications.html#meta-properties-rendering
  /**
   * Determine the Layout properties from metadata and settings
   * @private
   * @param  {object} metadata
   * @return {object} properties
   */
  determineLayoutProperties(metadata: any): any {
    let properties;
    const layout = this.settings.layout || metadata.layout || 'reflowable';
    const spread = this.settings.spread || metadata.spread || 'auto';
    const orientation =
      (this.settings as any).orientation || metadata.orientation || 'auto';
    const flow = this.settings.flow || metadata.flow || 'auto';
    const viewport = metadata.viewport || '';
    const minSpreadWidth =
      this.settings.minSpreadWidth || metadata.minSpreadWidth || 800;
    const direction =
      (this.settings as any).direction || metadata.direction || 'ltr';

    if (
      ((typeof this.settings.width === 'number' &&
        (this.settings.width === 0 || this.settings.width > 0)) ||
        (typeof this.settings.width === 'string' &&
          this.settings.width.length > 0)) &&
      ((typeof this.settings.height === 'number' &&
        (this.settings.height === 0 || this.settings.height > 0)) ||
        (typeof this.settings.height === 'string' &&
          this.settings.height.length > 0))
    ) {
      // viewport = "width="+this.settings.width+", height="+this.settings.height+"";
    }

    properties = {
      layout: layout,
      spread: spread,
      orientation: orientation,
      flow: flow,
      viewport: viewport,
      minSpreadWidth: minSpreadWidth,
      direction: direction,
    };

    return properties;
  }

  /**
   * Adjust the flow of the rendition to paginated or scrolled
   * (scrolled-continuous vs scrolled-doc are handled by different view managers)
   * @param  {string} flow
   */
  flow(flow: string): void {
    let _flow = flow;
    if (
      flow === 'scrolled' ||
      flow === 'scrolled-doc' ||
      flow === 'scrolled-continuous'
    ) {
      _flow = 'scrolled';
    }

    if (flow === 'auto' || flow === 'paginated') {
      _flow = 'paginated';
    }

    this.settings.flow = flow;

    if (this._layout) {
      this._layout.flow(_flow);
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout);
    }

    if (this.manager) {
      this.manager.updateFlow(_flow);
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear();
      this.display(this.location.start.cfi);
    }
  }

  /**
   * Adjust the layout of the rendition to reflowable or pre-paginated
   * @param  {object} settings
   */
  layout(settings: any): any {
    if (settings) {
      this._layout = new Layout(settings);
      this._layout.spread(settings.spread, this.settings.minSpreadWidth);

      // this.mapping = new Mapping(this._layout.props);

      this._layout.on(EVENTS.LAYOUT.UPDATED, (props: any, changed: any) => {
        this.emit(EVENTS.RENDITION.LAYOUT, props, changed);
      });
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout);
    }

    return this._layout;
  }

  /**
   * Adjust if the rendition uses spreads
   * @param  {string} spread none | auto (TODO: implement landscape, portrait, both)
   * @param  {int} [min] min width to use spreads at
   */
  spread(spread: string, min?: number): void {
    this.settings.spread = spread;

    if (min) {
      this.settings.minSpreadWidth = min;
    }

    if (this._layout) {
      this._layout.spread(spread, min);
    }

    if (this.manager && this.manager.isRendered()) {
      this.manager.updateLayout();
    }
  }

  /**
   * Adjust the direction of the rendition
   * @param  {string} dir
   */
  direction(dir: string): void {
    (this.settings as any).direction = dir || 'ltr';

    if (this.manager) {
      this.manager.direction((this.settings as any).direction);
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear();
      this.display(this.location.start.cfi);
    }
  }

  /**
   * Report the current location
   * @fires relocated
   * @fires locationChanged
   */
  reportLocation() {
    return this.q.enqueue(
      function reportedLocation(this: Rendition) {
        requestAnimationFrame(() => {
          const location = this.manager.currentLocation();
          if (
            location &&
            location.then &&
            typeof location.then === 'function'
          ) {
            location.then((result: any) => {
              const located = this.located(result);
              if (!located || !located.start || !located.end) {
                return;
              }
              this.location = located;
              this.emit(EVENTS.RENDITION.LOCATION_CHANGED, {
                index: this.location.start.index,
                href: this.location.start.href,
                start: this.location.start.cfi,
                end: this.location.end.cfi,
                percentage: this.location.start.percentage,
              });
              this.emit(EVENTS.RENDITION.RELOCATED, this.location);
            });
          } else if (location) {
            const located = this.located(location);
            if (!located || !located.start || !located.end) {
              return;
            }
            this.location = located;
            this.emit(EVENTS.RENDITION.LOCATION_CHANGED, {
              index: this.location.start.index,
              href: this.location.start.href,
              start: this.location.start.cfi,
              end: this.location.end.cfi,
              percentage: this.location.start.percentage,
            });
            this.emit(EVENTS.RENDITION.RELOCATED, this.location);
          }
        });
      }.bind(this),
    );
  }

  /**
   * Get the Current Location object
   * @return {displayedLocation | promise} location (may be a promise)
   */
  currentLocation(): Location | Promise<Location> | undefined {
    const location = this.manager.currentLocation();
    if (location && location.then && typeof location.then === 'function') {
      return location.then((result: any) => {
        return this.located(result);
      });
    } else if (location) {
      return this.located(location);
    }
    return undefined;
  }

  /**
   * Creates a Rendition#locationRange from location
   * passed by the Manager
   * @returns {displayedLocation}
   * @private
   */
  located(location: any): Location {
    if (!location.length) {
      return {} as Location;
    }
    const start = location[0];
    const end = location[location.length - 1];

    const located: Location = {
      start: {
        index: start.index,
        href: start.href,
        cfi: start.mapping.start,
        location: undefined as any,
        percentage: undefined as any,
        displayed: {
          page: start.pages[0] || 1,
          total: start.totalPages,
        },
      },
      end: {
        index: end.index,
        href: end.href,
        cfi: end.mapping.end,
        location: undefined as any,
        percentage: undefined as any,
        displayed: {
          page: end.pages[end.pages.length - 1] || 1,
          total: end.totalPages,
        },
      },
      atStart: false,
      atEnd: false,
    };

    const locationStart = this.book.locations?.locationFromCfi(
      start.mapping.start,
    );
    const locationEnd = this.book.locations?.locationFromCfi(end.mapping.end);

    if (typeof locationStart === 'number') {
      located.start.location = locationStart;
      located.start.percentage =
        this.book.locations?.percentageFromLocation(locationStart) ?? 0;
    }
    if (typeof locationEnd === 'number') {
      located.end.location = locationEnd;
      located.end.percentage =
        this.book.locations?.percentageFromLocation(locationEnd) ?? 0;
    }

    const pageStart = this.book.pageList?.pageFromCfi(start.mapping.start);
    const pageEnd = this.book.pageList?.pageFromCfi(end.mapping.end);

    if (pageStart && pageStart != -1) {
      located.start.displayed.page = pageStart;
    }
    if (pageEnd && pageEnd != -1) {
      located.end.displayed.page = pageEnd;
    }

    if (
      end.index === this.book.spine?.last()?.index &&
      located.end.displayed.page >= located.end.displayed.total
    ) {
      located.atEnd = true;
    }

    if (
      start.index === this.book.spine?.first()?.index &&
      located.start.displayed.page === 1
    ) {
      located.atStart = true;
    }

    return located;
  }

  /**
   * Remove and Clean Up the Rendition
   */
  destroy() {
    // Clear the queue
    // this.q.clear();
    // this.q = undefined;

    this.manager && this.manager.destroy();

    // this.book = undefined;

    // this.views = null;

    // this.hooks.display.clear();
    // this.hooks.serialize.clear();
    // this.hooks.content.clear();
    // this.hooks.layout.clear();
    // this.hooks.render.clear();
    // this.hooks.show.clear();
    // this.hooks = {};

    // this.themes.destroy();
    // this.themes = undefined;

    // this.epubcfi = undefined;

    // this.starting = undefined;
    // this.started = undefined;
  }

  /**
   * Pass the events from a view's Contents
   * @private
   * @param  {Contents} view contents
   */
  passEvents(contents: any): void {
    DOM_EVENTS.forEach((e: any) => {
      contents.on(e, (ev: any) => this.triggerViewEvent(ev, contents));
    });
    contents.on(EVENTS.CONTENTS.SELECTED, (e: any) =>
      this.triggerSelectedEvent(e, contents),
    );
  }

  /**
   * Emit events passed by a view
   * @private
   * @param  {event} e
   */
  triggerViewEvent(e: any, contents: any): void {
    this.emit(e.type, e, contents);
  }

  /**
   * Emit a selection event's CFI Range passed from a a view
   * @private
   * @param  {string} cfirange
   */
  triggerSelectedEvent(cfirange: any, contents: any): void {
    /**
     * Emit that a text selection has occurred
     * @event selected
     * @param {string} cfirange
     * @param {Contents} contents
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.SELECTED, cfirange, contents);
  }

  /**
   * Emit a markClicked event with the cfiRange and data from a mark
   * @private
   * @param  {EpubCFI} cfirange
   */
  triggerMarkEvent(cfiRange: any, data: any, contents: any): void {
    /**
     * Emit that a mark was clicked
     * @event markClicked
     * @param {EpubCFI} cfirange
     * @param {object} data
     * @param {Contents} contents
     * @memberof Rendition
     */
    this.emit(EVENTS.RENDITION.MARK_CLICKED, cfiRange, data, contents);
  }

  /**
   * Get a Range from a Visible CFI
   * @param  {string} cfi EpubCfi String
   * @param  {string} ignoreClass
   * @return {range}
   */
  getRange(cfi: string, ignoreClass?: string): Range | undefined {
    const _cfi = new EpubCFI(cfi);
    const found = this.manager.visible().filter(function (view: any) {
      if (_cfi.spinePos === view.index) return true;
    });

    // Should only every return 1 item
    if (found.length) {
      return found[0].contents.range(_cfi, ignoreClass);
    }
  }

  /**
   * Hook to adjust images to fit in columns
   * @param  {Contents} contents
   * @private
   */
  adjustImages(contents: any): Promise<void> {
    if (this._layout.name === 'pre-paginated') {
      return new Promise<void>(function (resolve) {
        resolve();
      });
    }

    const computed = contents.window.getComputedStyle(contents.content, null);
    const height =
      (contents.content.offsetHeight -
        (parseFloat(computed.paddingTop) +
          parseFloat(computed.paddingBottom))) *
      0.95;
    const horizontalPadding =
      parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight);

    contents.addStylesheetRules({
      img: {
        'max-width':
          (this._layout.columnWidth
            ? this._layout.columnWidth - horizontalPadding + 'px'
            : '100%') + '!important',
        'max-height': height + 'px' + '!important',
        'object-fit': 'contain',
        'page-break-inside': 'avoid',
        'break-inside': 'avoid',
        'box-sizing': 'border-box',
      },
      svg: {
        'max-width':
          (this._layout.columnWidth
            ? this._layout.columnWidth - horizontalPadding + 'px'
            : '100%') + '!important',
        'max-height': height + 'px' + '!important',
        'page-break-inside': 'avoid',
        'break-inside': 'avoid',
      },
    });

    return new Promise<void>(function (resolve, reject) {
      // Wait to apply
      setTimeout(function () {
        resolve();
      }, 1);
    });
  }

  /**
   * Get the Contents object of each rendered view
   * @returns {Contents[]}
   */
  getContents() {
    return this.manager ? this.manager.getContents() : [];
  }

  /**
   * Get the views member from the manager
   * @returns {Views}
   */
  views() {
    const views = this.manager ? this.manager.views : undefined;
    return views || [];
  }

  /**
   * Hook to handle link clicks in rendered content
   * @param  {Contents} contents
   * @private
   */
  handleLinks(contents: any): void {
    if (contents) {
      contents.on(EVENTS.CONTENTS.LINK_CLICKED, (href: string) => {
        const relative = this.book.path?.relative(href);
        this.display(relative);
      });
    }
  }

  /**
   * Hook to handle injecting stylesheet before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */
  injectStylesheet(doc: Document, section: any): void {
    const style = doc.createElement('link');
    style.setAttribute('type', 'text/css');
    style.setAttribute('rel', 'stylesheet');
    style.setAttribute(
      'href',
      this.settings.stylesheet ? String(this.settings.stylesheet) : '',
    );
    doc.getElementsByTagName('head')[0].appendChild(style);
  }

  /**
   * Hook to handle injecting scripts before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */
  injectScript(doc: Document, section: any): void {
    const script = doc.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute(
      'src',
      this.settings.script ? String(this.settings.script) : '',
    );
    script.textContent = ' '; // Needed to prevent self closing tag
    doc.getElementsByTagName('head')[0].appendChild(script);
  }

  /**
   * Hook to handle the document identifier before
   * a Section is serialized
   * @param  {document} doc
   * @param  {Section} section
   * @private
   */
  injectIdentifier(doc: Document, section: any): void {
    const ident = this.book.packaging?.metadata.identifier;
    const meta = doc.createElement('meta');
    meta.setAttribute('name', 'dc.relation.ispartof');
    if (ident) {
      meta.setAttribute('content', ident);
    }
    doc.getElementsByTagName('head')[0].appendChild(meta);
  }
}

export default Rendition;
