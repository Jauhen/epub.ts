import EventEmitter from 'events';
import { extend, defer, windowBounds, isNumber } from '../../utils/core';
import scrollType from '../../utils/scrolltype';
import Mapping from '../../mapping';
import Queue from '../../utils/queue';
import Stage from '../helpers/stage';
import Views from '../helpers/views';
import { EVENTS } from '../../utils/constants';
import Manager from '../manager';

export interface ViewLocation {
  index: number;
  href: string;
  pages: number[];
  totalPages: number;
  mapping: any;
}

export interface ManagerOptions {
  settings?: any;
  view?: any;
  request?: any;
  queue?: any;
  infinite?: boolean;
  overflow?: string;
  [key: string]: any;
}

class DefaultViewManager extends EventEmitter implements Manager {
  public name: string;
  public optsSettings: any;
  public View: any;
  public request: any;
  public renditionQueue: any;
  public q: Queue;
  public settings: any;
  public viewSettings: any;
  public rendered: boolean;
  public stage?: Stage;
  public container?: HTMLElement;
  public views?: Views;
  public layout?: any;
  public mapping?: Mapping;
  public overflow?: string;
  public scrolled?: boolean;
  public ignore?: boolean;
  public location?: ViewLocation[];
  public isPaginated?: boolean;
  public writingMode?: string;
  public _bounds?: any;
  public _stageSize?: any;
  public winBounds?: any;
  public orientationTimeout?: NodeJS.Timeout;

  public resizeTimeout?: any;
  public afterScrolled?: any;
  public scrollTop?: number;
  public scrollLeft?: number;
  public _onScroll?: any;

  constructor(options: ManagerOptions) {
    super();
    this.name = 'default';
    this.optsSettings = options.settings;
    this.View = options.view;
    this.request = options.request;
    this.renditionQueue = options.queue;
    this.q = new Queue<DefaultViewManager>(this);

    this.settings = extend(this.settings || {}) as any;
    Object.assign(this.settings, {
      infinite: true,
      hidden: false,
      width: undefined,
      height: undefined,
      axis: undefined,
      writingMode: undefined,
      flow: 'scrolled',
      ignoreClass: '',
      fullsize: undefined,
      allowScriptedContent: false,
      allowPopups: false,
    });

    Object.assign(this.settings, options.settings || {});

    this.viewSettings = {
      ignoreClass: this.settings.ignoreClass,
      axis: this.settings.axis,
      flow: this.settings.flow,
      layout: this.layout,
      method: this.settings.method, // srcdoc, blobUrl, write
      width: 0,
      height: 0,
      forceEvenPages: true,
      allowScriptedContent: this.settings.allowScriptedContent,
      allowPopups: this.settings.allowPopups,
    };

    this.rendered = false;
  }

  render(element: HTMLElement, size: any): void {
    const tag = element.tagName;

    if (
      typeof this.settings.fullsize === 'undefined' &&
      tag &&
      (tag.toLowerCase() == 'body' || tag.toLowerCase() == 'html')
    ) {
      this.settings.fullsize = true;
    }

    if (this.settings.fullsize) {
      this.settings.overflow = 'visible';
      this.overflow = this.settings.overflow;
    }

    this.settings.size = size;

    this.settings.rtlScrollType = scrollType();

    // Save the stage
    this.stage = new Stage({
      width: size.width,
      height: size.height,
      overflow: this.overflow,
      hidden: this.settings.hidden,
      axis: this.settings.axis,
      fullsize: this.settings.fullsize,
      direction: this.settings.direction,
    });

    this.stage.attachTo(element);

    // Get this stage container div
    this.container = this.stage.getContainer();

    // Views array methods
    this.views = new Views(this.container);

    // Calculate Stage Size
    this._bounds = this.bounds();
    this._stageSize = this.stage.size();

    // Set the dimensions for views
    this.viewSettings.width = this._stageSize.width;
    this.viewSettings.height = this._stageSize.height;

    // Function to handle a resize event.
    // Will only attach if width and height are both fixed.
    this.stage?.onResize(() => this.onResized());

    this.stage?.onOrientationChange(() => this.onOrientationChange()); // Add Event Listeners
    this.addEventListeners();

    // Add Layout method
    // this.applyLayoutMethod();
    if (this.layout) {
      this.updateLayout();
    }

    this.rendered = true;
  }

  addEventListeners() {
    let scroller;

    window.addEventListener('unload', (e: Event) => {
      this.destroy();
    });

    if (!this.settings.fullsize) {
      scroller = this.container;
    } else {
      scroller = window;
    }

    this._onScroll = this.onScroll.bind(this);
    scroller?.addEventListener('scroll', this._onScroll);
  }

  removeEventListeners() {
    let scroller;

    if (!this.settings.fullsize) {
      scroller = this.container;
    } else {
      scroller = window;
    }

    scroller?.removeEventListener('scroll', this._onScroll);
    this._onScroll = undefined;
  }

  destroy() {
    clearTimeout(this.orientationTimeout);
    clearTimeout(this.resizeTimeout);
    clearTimeout(this.afterScrolled);

    this.clear();

    this.removeEventListeners();

    this.stage?.destroy();

    this.rendered = false;

    /*

      clearTimeout(this.trimTimeout);
      if(this.settings.hidden) {
        this.element.removeChild(this.wrapper);
      } else {
        this.element.removeChild(this.container);
      }
    */
  }

  onOrientationChange(e?: Event): void {
    const { orientation } = window;

    if (this.optsSettings?.resizeOnOrientationChange) {
      this.resize();
    }

    // Per ampproject:
    // In IOS 10.3, the measured size of an element is incorrect if the
    // element size depends on window size directly and the measurement
    // happens in window.resize event. Adding a timeout for correct
    // measurement. See https://github.com/ampproject/amphtml/issues/8479
    clearTimeout(this.orientationTimeout);
    this.orientationTimeout = setTimeout(() => {
      this.orientationTimeout = undefined;

      if (this.optsSettings?.resizeOnOrientationChange) {
        this.resize();
      }

      this.emit(EVENTS.MANAGERS.ORIENTATION_CHANGE, orientation);
    }, 500);
  }

  onResized(e?: any): void {
    this.resize();
  }

  resize(width?: number, height?: number, epubcfi?: string): void {
    const stageSize = this.stage?.size(width, height);
    if (!stageSize) {
      return;
    }

    // For Safari, wait for orientation to catch up
    // if the window is a square
    this.winBounds = windowBounds();
    if (
      this.orientationTimeout &&
      this.winBounds.width === this.winBounds.height
    ) {
      // reset the stage size for next resize
      this._stageSize = undefined;
      return;
    }

    if (
      this._stageSize &&
      this._stageSize.width === stageSize.width &&
      this._stageSize.height === stageSize.height
    ) {
      // Size is the same, no need to resize
      return;
    }

    this._stageSize = stageSize;

    this._bounds = this.bounds();

    // Clear current views
    this.clear();

    // Update for new views
    this.viewSettings.width = this._stageSize.width;
    this.viewSettings.height = this._stageSize.height;

    this.updateLayout();

    this.emit(
      EVENTS.MANAGERS.RESIZED,
      {
        width: this._stageSize.width,
        height: this._stageSize.height,
      },
      epubcfi,
    );
  }

  createView(section: any, forceRight?: boolean): any {
    return new this.View(
      section,
      Object.assign({}, this.viewSettings, { forceRight }),
    );
  }

  handleNextPrePaginated(
    forceRight: boolean,
    section: any,
    action: Function,
  ): any {
    let next;

    if (this.layout.name === 'pre-paginated' && this.layout.divisor > 1) {
      if (forceRight || section.index === 0) {
        // First page (cover) should stand alone for pre-paginated books
        return;
      }
      next = section.next();
      if (next && !next.properties.includes('page-spread-left')) {
        return action.call(this, next);
      }
    }
  }

  display(section: any, target?: any): Promise<void> {
    const displaying = defer<void>();
    const displayed = displaying.promise;

    // Check if moving to target is needed
    if (target === section.href || isNumber(target)) {
      target = undefined;
    }

    // Check to make sure the section we want isn't already shown
    const visible = this.views?.find(section);

    // View is already shown, just move to correct location in view
    if (visible && section && this.layout.name !== 'pre-paginated') {
      const offset = visible.offset();

      if (this.settings.direction === 'ltr') {
        this.scrollTo(offset.left, offset.top, true);
      } else {
        const width = visible.width();
        this.scrollTo(offset.left + width, offset.top, true);
      }

      if (target) {
        const offset = visible.locationOf(target);
        const width = visible.width();
        this.moveTo(offset, width);
      }

      displaying.resolve();
      return displayed;
    }

    // Hide all current views
    this.clear();

    let forceRight = false;
    if (
      this.layout.name === 'pre-paginated' &&
      this.layout.divisor === 2 &&
      section.properties.includes('page-spread-right')
    ) {
      forceRight = true;
    }

    this.add(section, forceRight)
      .then(
        (view: any) => {
          // Move to correct place within the section, if needed
          if (target) {
            const offset = view.locationOf(target);
            const width = view.width();
            this.moveTo(offset, width);
          }
        },
        (err: any) => {
          displaying.reject(err);
        },
      )
      .then(() => {
        return this.handleNextPrePaginated(forceRight, section, this.add);
      })
      .then(() => {
        this.views?.show();
        displaying.resolve();
      });
    // .then(function(){
    //   return this.hooks.display.trigger(view);
    // }.bind(this))
    // .then(function(){
    //   this.views.show();
    // }.bind(this));
    return displayed;
  }

  afterDisplayed(view: any): void {
    this.emit(EVENTS.MANAGERS.ADDED, view);
  }

  afterResized(view: any): void {
    this.emit(EVENTS.MANAGERS.RESIZE, view.section);
  }

  moveTo(offset: any, width?: number): void {
    let distX = 0,
      distY = 0;

    if (!this.isPaginated) {
      distY = offset.top;
    } else {
      distX = Math.floor(offset.left / this.layout.delta) * this.layout.delta;

      if (distX + this.layout.delta > (this.container?.scrollWidth || 0)) {
        distX = (this.container?.scrollWidth || 0) - this.layout.delta;
      }

      distY = Math.floor(offset.top / this.layout.delta) * this.layout.delta;

      if (distY + this.layout.delta > (this.container?.scrollHeight || 0)) {
        distY = (this.container?.scrollHeight || 0) - this.layout.delta;
      }
    }
    if (this.settings.direction === 'rtl') {
      /***
        the `floor` function above (L343) is on positive values, so we should add one `layout.delta`
        to distX or use `Math.ceil` function, or multiply offset.left by -1
        before `Math.floor`
      */
      distX = distX + this.layout.delta;
      distX = distX - (width || 0);
    }
    this.scrollTo(distX, distY, true);
  }

  add(section: any, forceRight?: boolean): Promise<any> {
    const view = this.createView(section, forceRight);

    this.views?.append(view);

    // view.on(EVENTS.VIEWS.SHOWN, this.afterDisplayed.bind(this));
    view.onDisplayed = this.afterDisplayed.bind(this);
    view.onResize = this.afterResized.bind(this);

    view.on(EVENTS.VIEWS.AXIS, (axis: any) => {
      this.updateAxis(axis, true);
    });

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: any) => {
      this.updateWritingMode(mode);
    });

    return view.display(this.request);
  }

  append(section: any, forceRight?: boolean): Promise<any> {
    const view = this.createView(section, forceRight);
    this.views?.append(view);

    view.onDisplayed = this.afterDisplayed.bind(this);
    view.onResize = this.afterResized.bind(this);

    view.on(EVENTS.VIEWS.AXIS, (axis: any) => {
      this.updateAxis(axis, true);
    });

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: any) => {
      this.updateWritingMode(mode);
    });

    return view.display(this.request);
  }

  prepend(section: any, forceRight?: boolean): Promise<any> {
    const view = this.createView(section, forceRight);

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      this.counter(bounds);
    });

    this.views?.prepend(view);

    view.onDisplayed = this.afterDisplayed.bind(this);
    view.onResize = this.afterResized.bind(this);

    view.on(EVENTS.VIEWS.AXIS, (axis: any) => {
      this.updateAxis(axis, true);
    });

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: any) => {
      this.updateWritingMode(mode);
    });

    return view.display(this.request);
  }

  counter(bounds: any): any {
    if (this.settings.axis === 'vertical') {
      this.scrollBy(0, bounds.heightDelta, true);
    } else {
      this.scrollBy(bounds.widthDelta, 0, true);
    }
  }

  // resizeView(view) {
  //
  //   if(this.settings.globalLayoutProperties.layout === "pre-paginated") {
  //     view.lock("both", this.bounds.width, this.bounds.height);
  //   } else {
  //     view.lock("width", this.bounds.width, this.bounds.height);
  //   }
  //
  // };

  next(): Promise<void> | undefined {
    let next: any;
    let left: number;

    const dir = this.settings.direction;

    if (!this.views?.length) return;

    if (
      this.isPaginated &&
      this.settings.axis === 'horizontal' &&
      (!dir || dir === 'ltr')
    ) {
      this.scrollLeft = this.container?.scrollLeft || 0;

      left =
        (this.container?.scrollLeft || 0) +
        (this.container?.offsetWidth || 0) +
        this.layout.delta;

      if (left <= (this.container?.scrollWidth || 0)) {
        this.scrollBy(this.layout.delta, 0, true);
      } else {
        next = this.views?.last()?.section?.next();
      }
    } else if (
      this.isPaginated &&
      this.settings.axis === 'horizontal' &&
      dir === 'rtl'
    ) {
      this.scrollLeft = this.container?.scrollLeft || 0;

      if (this.settings.rtlScrollType === 'default') {
        left = this.container?.scrollLeft || 0;

        if (left > 0) {
          this.scrollBy(this.layout.delta, 0, true);
        } else {
          next = this.views?.last()?.section?.next();
        }
      } else {
        left = (this.container?.scrollLeft || 0) + this.layout.delta * -1;

        if (left > (this.container?.scrollWidth || 0) * -1) {
          this.scrollBy(this.layout.delta, 0, true);
        } else {
          next = this.views?.last()?.section?.next();
        }
      }
    } else if (this.isPaginated && this.settings.axis === 'vertical') {
      this.scrollTop = this.container?.scrollTop || 0;

      const top =
        (this.container?.scrollTop || 0) + (this.container?.offsetHeight || 0);

      if (top < (this.container?.scrollHeight || 0)) {
        this.scrollBy(0, this.layout.height, true);
      } else {
        next = this.views?.last()?.section?.next();
      }
    } else {
      next = this.views?.last()?.section?.next();
    }

    if (next) {
      this.clear();
      // The new section may have a different writing-mode from the old section. Thus, we need to update layout.
      this.updateLayout();

      let forceRight = false;
      if (
        this.layout.name === 'pre-paginated' &&
        this.layout.divisor === 2 &&
        next.properties.includes('page-spread-right')
      ) {
        forceRight = true;
      }

      return this.append(next, forceRight)
        .then(
          () => {
            return this.handleNextPrePaginated(forceRight, next, this.append);
          },
          (err: any) => {
            return err;
          },
        )
        .then(() => {
          // Reset position to start for scrolled-doc vertical-rl in default mode
          if (
            !this.isPaginated &&
            this.settings.axis === 'horizontal' &&
            this.settings.direction === 'rtl' &&
            this.settings.rtlScrollType === 'default'
          ) {
            this.scrollTo(this.container?.scrollWidth || 0, 0, true);
          }
          this.views?.show();
        });
    }
  }

  prev(): Promise<any> | undefined {
    let prev: any;
    let left: number;
    const dir = this.settings.direction;

    if (!this.views?.length) return;

    if (
      this.isPaginated &&
      this.settings.axis === 'horizontal' &&
      (!dir || dir === 'ltr')
    ) {
      this.scrollLeft = this.container?.scrollLeft || 0;

      left = this.container?.scrollLeft || 0;

      if (left > 0) {
        this.scrollBy(-this.layout.delta, 0, true);
      } else {
        prev = this.views?.first()?.section?.prev();
      }
    } else if (
      this.isPaginated &&
      this.settings.axis === 'horizontal' &&
      dir === 'rtl'
    ) {
      this.scrollLeft = this.container?.scrollLeft || 0;

      if (this.settings.rtlScrollType === 'default') {
        left =
          (this.container?.scrollLeft || 0) +
          (this.container?.offsetWidth || 0);

        if (left < (this.container?.scrollWidth || 0)) {
          this.scrollBy(-this.layout.delta, 0, true);
        } else {
          prev = this.views?.first()?.section?.prev();
        }
      } else {
        left = this.container?.scrollLeft || 0;

        if (left < 0) {
          this.scrollBy(-this.layout.delta, 0, true);
        } else {
          prev = this.views?.first()?.section?.prev();
        }
      }
    } else if (this.isPaginated && this.settings.axis === 'vertical') {
      this.scrollTop = this.container?.scrollTop || 0;

      const top = this.container?.scrollTop || 0;

      if (top > 0) {
        this.scrollBy(0, -this.layout.height, true);
      } else {
        prev = this.views?.first()?.section?.prev();
      }
    } else {
      prev = this.views?.first()?.section?.prev();
    }

    if (prev) {
      this.clear();
      // The new section may have a different writing-mode from the old section. Thus, we need to update layout.
      this.updateLayout();

      let forceRight = false;
      if (
        this.layout.name === 'pre-paginated' &&
        this.layout.divisor === 2 &&
        typeof prev.prev() !== 'object'
      ) {
        forceRight = true;
      }

      return this.prepend(prev, forceRight)
        .then(
          () => {
            let left: any;
            if (
              this.layout.name === 'pre-paginated' &&
              this.layout.divisor > 1
            ) {
              left = prev.prev();
              if (left) {
                return this.prepend(left);
              }
            }
          },
          (err: any) => {
            return err;
          },
        )
        .then(() => {
          if (this.isPaginated && this.settings.axis === 'horizontal') {
            if (this.settings.direction === 'rtl') {
              if (this.settings.rtlScrollType === 'default') {
                this.scrollTo(0, 0, true);
              } else {
                this.scrollTo(
                  (this.container?.scrollWidth || 0) * -1 + this.layout.delta,
                  0,
                  true,
                );
              }
            } else {
              this.scrollTo(
                (this.container?.scrollWidth || 0) - this.layout.delta,
                0,
                true,
              );
            }
          }
          this.views?.show();
        });
    }
  }

  current() {
    const visible = this.visible();
    if (visible.length) {
      // Current is the last visible view
      return visible[visible.length - 1];
    }
    return null;
  }

  clear() {
    // this.q.clear();

    if (this.views) {
      this.views.hide();
      this.scrollTo(0, 0, true);
      this.views.clear();
    }
  }

  currentLocation(): ViewLocation[] | undefined {
    this.updateLayout();
    if (this.isPaginated && this.settings.axis === 'horizontal') {
      this.location = this.paginatedLocation();
    } else {
      this.location = this.scrolledLocation();
    }
    return this.location;
  }

  scrolledLocation() {
    const visible = this.visible();
    const container = this.container?.getBoundingClientRect();
    if (!container) return;
    const pageHeight =
      container.height < window.innerHeight
        ? container.height
        : window.innerHeight;
    const pageWidth =
      container.width < window.innerWidth ? container.width : window.innerWidth;
    const vertical = this.settings.axis === 'vertical';
    const rtl = this.settings.direction === 'rtl';

    let offset = 0;
    const used = 0;

    if (this.settings.fullsize) {
      offset = vertical ? window.scrollY : window.scrollX;
    }

    const sections = visible.map((view) => {
      const { index, href } = view.section;
      const position = view.position();
      const width = view.width();
      const height = view.height();

      let startPos;
      let endPos;
      let stopPos;
      let totalPages;

      if (vertical) {
        startPos = offset + container.top - position.top + used;
        endPos = startPos + pageHeight - used;
        totalPages = this.layout.count(height, pageHeight).pages;
        stopPos = pageHeight;
      } else {
        startPos = offset + container.left - position.left + used;
        endPos = startPos + pageWidth - used;
        totalPages = this.layout.count(width, pageWidth).pages;
        stopPos = pageWidth;
      }

      let currPage = Math.ceil(startPos / stopPos);
      let pages = [];
      let endPage = Math.ceil(endPos / stopPos);

      // Reverse page counts for horizontal rtl
      if (this.settings.direction === 'rtl' && !vertical) {
        const tempStartPage = currPage;
        currPage = totalPages - endPage;
        endPage = totalPages - tempStartPage;
      }

      pages = [];
      for (let i = currPage; i <= endPage; i++) {
        const pg = i + 1;
        pages.push(pg);
      }

      const mapping = this.mapping?.page(
        view.contents,
        view.section.cfiBase,
        startPos,
        endPos,
      );

      return {
        index,
        href,
        pages,
        totalPages,
        mapping,
      };
    });

    return sections;
  }

  paginatedLocation() {
    const visible = this.visible();
    const container = this.container?.getBoundingClientRect();
    if (!container) return;

    let left = 0;
    let used = 0;

    if (this.settings.fullsize) {
      left = window.scrollX;
    }

    const sections = visible.map((view) => {
      const { index, href } = view.section;
      let offset;
      const position = view.position();
      const width = view.width();

      // Find mapping
      let start;
      let end;
      let pageWidth;

      if (this.settings.direction === 'rtl') {
        offset = container.right - left;
        pageWidth =
          Math.min(Math.abs(offset - position.left), this.layout.width) - used;
        end = position.width - (position.right - offset) - used;
        start = end - pageWidth;
      } else {
        offset = container.left + left;
        pageWidth = Math.min(position.right - offset, this.layout.width) - used;
        start = offset - position.left + used;
        end = start + pageWidth;
      }

      used += pageWidth;

      const mapping = this.mapping?.page(
        view.contents,
        view.section.cfiBase,
        start,
        end,
      );

      const totalPages = this.layout.count(width).pages;
      let startPage = Math.floor(start / this.layout.pageWidth);
      const pages = [];
      let endPage = Math.floor(end / this.layout.pageWidth);

      // start page should not be negative
      if (startPage < 0) {
        startPage = 0;
        endPage = endPage + 1;
      }

      // Reverse page counts for rtl
      if (this.settings.direction === 'rtl') {
        const tempStartPage = startPage;
        startPage = totalPages - endPage;
        endPage = totalPages - tempStartPage;
      }

      for (let i = startPage + 1; i <= endPage; i++) {
        const pg = i;
        pages.push(pg);
      }

      return {
        index,
        href,
        pages,
        totalPages,
        mapping,
      };
    });

    return sections;
  }

  isVisible(
    view: any,
    offsetPrev: any,
    offsetNext: any,
    _container: any,
  ): boolean {
    const position = view.position();
    const container = _container || this.bounds();

    if (
      this.settings.axis === 'horizontal' &&
      position.right > container.left - offsetPrev &&
      position.left < container.right + offsetNext
    ) {
      return true;
    } else if (
      this.settings.axis === 'vertical' &&
      position.bottom > container.top - offsetPrev &&
      position.top < container.bottom + offsetNext
    ) {
      return true;
    }

    return false;
  }

  visible() {
    const container = this.bounds();
    const views = this.views?.displayed();
    if (!views) return [];
    const viewsLength = views.length;
    const visible = [];
    let isVisible;
    let view;

    for (let i = 0; i < viewsLength; i++) {
      view = views[i];
      isVisible = this.isVisible(view, 0, 0, container);

      if (isVisible === true) {
        visible.push(view);
      }
    }
    return visible;
  }

  scrollBy(x: number, y: number, silent?: boolean): void {
    const dir = this.settings.direction === 'rtl' ? -1 : 1;

    if (silent) {
      this.ignore = true;
    }

    if (!this.settings.fullsize) {
      if (x && this.container) this.container.scrollLeft += x * dir;
      if (y && this.container) this.container.scrollTop += y;
    } else {
      window.scrollBy(x * dir, y * dir);
    }
    this.scrolled = true;
  }

  scrollTo(x: number, y: number, silent?: boolean): void {
    if (silent) {
      this.ignore = true;
    }

    if (!this.settings.fullsize) {
      if (this.container) {
        this.container.scrollLeft = x;
        this.container.scrollTop = y;
      }
    } else {
      window.scrollTo(x, y);
    }
    this.scrolled = true;
  }

  onScroll() {
    let scrollTop;
    let scrollLeft;

    if (!this.settings.fullsize) {
      scrollTop = this.container?.scrollTop || 0;
      scrollLeft = this.container?.scrollLeft || 0;
    } else {
      scrollTop = window.scrollY;
      scrollLeft = window.scrollX;
    }

    this.scrollTop = scrollTop;
    this.scrollLeft = scrollLeft;

    if (!this.ignore) {
      this.emit(EVENTS.MANAGERS.SCROLL, {
        top: scrollTop,
        left: scrollLeft,
      });

      clearTimeout(this.afterScrolled);
      this.afterScrolled = setTimeout(() => {
        this.emit(EVENTS.MANAGERS.SCROLLED, {
          top: this.scrollTop,
          left: this.scrollLeft,
        });
      }, 20);
    } else {
      this.ignore = false;
    }
  }

  bounds(): object | undefined {
    let bounds;

    bounds = this.stage?.bounds();

    return bounds;
  }

  applyLayout(layout: any): void {
    this.layout = layout;
    this.updateLayout();
    if (
      this.views &&
      this.views.length > 0 &&
      this.layout.name === 'pre-paginated'
    ) {
      this.display(this.views.first().section);
    }
    // this.manager.layout(this.layout.format);
  }

  updateLayout() {
    if (!this.stage) {
      return;
    }

    this._stageSize = this.stage.size();

    if (!this.isPaginated) {
      this.layout.calculate(this._stageSize.width, this._stageSize.height);
    } else {
      this.layout.calculate(
        this._stageSize.width,
        this._stageSize.height,
        this.settings.gap,
      );

      // Set the look ahead offset for what is visible
      this.settings.offset = this.layout.delta / this.layout.divisor;

      // this.stage.addStyleRules("iframe", [{"margin-right" : this.layout.gap + "px"}]);
    }

    // Set the dimensions for views
    this.viewSettings.width = this.layout.width;
    this.viewSettings.height = this.layout.height;

    this.setLayout(this.layout);
  }

  setLayout(layout: any): void {
    this.viewSettings.layout = layout;

    this.mapping = new Mapping(
      layout.props,
      this.settings.direction,
      this.settings.axis,
    );

    if (this.views) {
      this.views.forEach((view: any) => {
        if (view) {
          view.setLayout(layout);
        }
      });
    }
  }

  updateWritingMode(mode: any): void {
    this.writingMode = mode;
  }

  updateAxis(axis: any, forceUpdate?: boolean): void {
    if (!forceUpdate && axis === this.settings.axis) {
      return;
    }

    this.settings.axis = axis;

    this.stage && this.stage.axis(axis);

    this.viewSettings.axis = axis;

    if (this.mapping) {
      this.mapping = new Mapping(
        this.layout.props,
        this.settings.direction,
        this.settings.axis,
      );
    }

    if (this.layout) {
      if (axis === 'vertical') {
        this.layout.spread('none');
      } else {
        this.layout.spread(this.layout.settings.spread);
      }
    }
  }

  updateFlow(flow: any, defaultScrolledOverflow = 'auto'): void {
    const isPaginated = flow === 'paginated' || flow === 'auto';

    this.isPaginated = isPaginated;

    if (
      flow === 'scrolled-doc' ||
      flow === 'scrolled-continuous' ||
      flow === 'scrolled'
    ) {
      this.updateAxis('vertical', true);
    } else {
      this.updateAxis('horizontal', true);
    }

    this.viewSettings.flow = flow;

    if (!this.settings.overflow) {
      this.overflow = isPaginated ? 'hidden' : defaultScrolledOverflow;
    } else {
      this.overflow = this.settings.overflow;
    }

    this.stage?.overflow(this.overflow || 'auto');

    this.updateLayout();
  }

  getContents(): any[] {
    const contents: any[] = [];
    if (!this.views) {
      return contents;
    }
    this.views.forEach((view: any) => {
      const viewContents = view && view.contents;
      if (viewContents) {
        contents.push(viewContents);
      }
    });
    return contents;
  }

  direction(dir = 'ltr') {
    this.settings.direction = dir;

    this.stage && this.stage.direction(dir);

    this.viewSettings.direction = dir;

    this.updateLayout();
  }

  isRendered() {
    return this.rendered;
  }
}

export default DefaultViewManager;
