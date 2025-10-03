import debounce from 'lodash/debounce';

import { EVENTS } from '../../utils/constants';
import { defer, requestAnimationFrame } from '../../utils/core';
import Snap from '../helpers/snap';
import DefaultViewManager from './default';

// Type imports
interface Section {
  index: number;
  href: string;
  prev(): Section | null;
  next(): Section | null;
  properties: string[];
}

interface Layout {
  name: string;
  props: any;
  divisor: number;
  delta: number;
  height: number;
  width: number;
}

interface Contents {
  // Contents interface
}

interface View {
  section: Section;
  expanded?: boolean;
  displayed: boolean;
  display(request: any): Promise<View>;
  show(): void;
  hide(): void;
  destroy(): Promise<void>;
  bounds(): any;
  on(event: string, callback: Function): void;
  onDisplayed?: Function;
  onResize?: Function;
}

interface ManagerOptions {
  settings?: any;
  view?: any;
  request?: any;
  queue?: any;
  infinite?: boolean;
  overflow?: string;
  [key: string]: any;
}

class ContinuousViewManager extends DefaultViewManager {
  public scrollTop = 0;
  public scrollLeft = 0;
  public trimTimeout?: NodeJS.Timeout;
  public snapper?: any;
  public tick?: any;
  public scrollDeltaVert = 0;
  public scrollDeltaHorz = 0;
  public _scrolled?: any;
  public didScroll = false;
  public prevScrollTop = 0;
  public prevScrollLeft = 0;
  public scrollTimeout?: NodeJS.Timeout;

  constructor(options: ManagerOptions) {
    super(options);

    this.name = 'continuous';

    this.settings = Object.assign(this.settings || {}, {
      infinite: true,
      overflow: undefined,
      axis: undefined,
      writingMode: undefined,
      flow: 'scrolled',
      offset: 500,
      offsetDelta: 250,
      width: undefined,
      height: undefined,
      snap: false,
      afterScrolledTimeout: 10,
      allowScriptedContent: false,
      allowPopups: false,
    });

    Object.assign(this.settings, options.settings || {});

    // Gap can be 0, but defaults doesn't handle that
    if (options.settings.gap != 'undefined' && options.settings.gap === 0) {
      this.settings.gap = options.settings.gap;
    }

    this.viewSettings = {
      ignoreClass: this.settings.ignoreClass,
      axis: this.settings.axis,
      flow: this.settings.flow,
      layout: this.layout,
      width: 0,
      height: 0,
      forceEvenPages: false,
      allowScriptedContent: this.settings.allowScriptedContent,
      allowPopups: this.settings.allowPopups,
    };

    this.scrollTop = 0;
    this.scrollLeft = 0;
  }

  display(section: Section, target?: string | number): Promise<void> {
    return DefaultViewManager.prototype.display
      .call(this, section, target)
      .then(
        function (this: ContinuousViewManager) {
          return this.fill();
        }.bind(this),
      );
  }

  fill(_full?: any): Promise<void> {
    const full = _full || defer();

    this.q
      .enqueue(() => {
        return this.check();
      })
      .then((result) => {
        if (result as unknown) {
          this.fill(full);
        } else {
          full.resolve();
        }
      });

    return full.promise;
  }

  moveTo(offset: { top: number; left: number }): void {
    // var bounds = this.stage.bounds();
    // var dist = Math.floor(offset.top / bounds.height) * bounds.height;
    let distX = 0,
      distY = 0;

    let offsetX = 0,
      offsetY = 0;

    if (!this.isPaginated) {
      distY = offset.top;
      offsetY = offset.top + this.settings.offsetDelta;
    } else {
      distX = Math.floor(offset.left / this.layout.delta) * this.layout.delta;
      offsetX = distX + this.settings.offsetDelta;
    }

    if (distX > 0 || distY > 0) {
      this.scrollBy(distX, distY, true);
    }
  }

  afterResized(view: View): void {
    this.emit(EVENTS.MANAGERS.RESIZE, view.section);
  }

  // Remove Previous Listeners if present
  removeShownListeners(view: View): void {
    // view.off("shown", this.afterDisplayed);
    // view.off("shown", this.afterDisplayedAbove);
    view.onDisplayed = function () {};
  }

  add(section: Section): Promise<View> {
    const view = this.createView(section);

    this.views?.append(view);

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      view.expanded = true;
    });

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis);
    });

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode);
    });

    // view.on(EVENTS.VIEWS.SHOWN, this.afterDisplayed.bind(this));
    view.onDisplayed = this.afterDisplayed.bind(this);
    view.onResize = this.afterResized.bind(this);

    return view.display(this.request);
  }

  append(section: Section): Promise<View> {
    const view = this.createView(section);

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      view.expanded = true;
    });

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis);
    });

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode);
    });

    this.views?.append(view);

    view.onDisplayed = this.afterDisplayed.bind(this);

    return Promise.resolve(view);
  }

  prepend(section: Section): Promise<View> {
    const view = this.createView(section);

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      this.counter(bounds);
      view.expanded = true;
    });

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis);
    });

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode);
    });

    this.views?.prepend(view);

    view.onDisplayed = this.afterDisplayed.bind(this);

    return Promise.resolve(view);
  }

  counter(bounds: any): void {
    if (this.settings.axis === 'vertical') {
      this.scrollBy(0, bounds.heightDelta, true);
    } else {
      this.scrollBy(bounds.widthDelta, 0, true);
    }
  }

  update(_offset?: number): Promise<void> {
    const container = this.bounds();
    const views = this.views?.all();
    if (!views) return Promise.resolve();
    const viewsLength = views.length;
    const visible: View[] = [];
    const offset =
      typeof _offset != 'undefined' ? _offset : this.settings.offset || 0;
    let isVisible: boolean;
    let view: View;

    const updating = defer<void>();
    const promises: Promise<any>[] = [];
    for (let i = 0; i < viewsLength; i++) {
      view = views[i];

      isVisible = this.isVisible(view, offset, offset, container);

      if (isVisible === true) {
        // console.log("visible " + view.index, view.displayed);

        if (!view.displayed) {
          const displayed = view.display(this.request).then(
            function (view: View) {
              view.show();
            },
            (err: any) => {
              view.hide();
            },
          );
          promises.push(displayed);
        } else {
          view.show();
        }
        visible.push(view);
      } else {
        this.q.enqueue(view.destroy.bind(view));
        // console.log("hidden " + view.index, view.displayed);

        clearTimeout(this.trimTimeout);
        this.trimTimeout = setTimeout(() => {
          this.q.enqueue(this.trim.bind(this));
        }, 250);
      }
    }

    if (promises.length) {
      return Promise.all(promises)
        .then(() => {})
        .catch((err) => {
          updating.reject(err);
        });
    } else {
      updating.resolve();
      return updating.promise;
    }
  }

  check(_offsetLeft?: number, _offsetTop?: number): Promise<boolean> {
    const checking = defer<boolean>();
    const newViews: Promise<View>[] = [];

    const horizontal = this.settings.axis === 'horizontal';
    let delta = this.settings.offset || 0;

    if (_offsetLeft && horizontal) {
      delta = _offsetLeft;
    }

    if (_offsetTop && !horizontal) {
      delta = _offsetTop;
    }

    const bounds = this._bounds; // bounds saved this until resize

    let offset = horizontal ? this.scrollLeft : this.scrollTop;
    const visibleLength = horizontal ? Math.floor(bounds.width) : bounds.height;
    const contentLength = horizontal
      ? this.container?.scrollWidth || 0
      : this.container?.scrollHeight || 0;
    const writingMode =
      this.writingMode && this.writingMode.indexOf('vertical') === 0
        ? 'vertical'
        : 'horizontal';
    const rtlScrollType = this.settings.rtlScrollType;
    const rtl = this.settings.direction === 'rtl';

    if (!this.settings.fullsize) {
      // Scroll offset starts at width of element
      if (rtl && rtlScrollType === 'default' && writingMode === 'horizontal') {
        offset = contentLength - visibleLength - offset;
      }
      // Scroll offset starts at 0 and goes negative
      if (rtl && rtlScrollType === 'negative' && writingMode === 'horizontal') {
        offset = offset * -1;
      }
    } else {
      // Scroll offset starts at 0 and goes negative
      if (
        (horizontal && rtl && rtlScrollType === 'negative') ||
        (!horizontal && rtl && rtlScrollType === 'default')
      ) {
        offset = offset * -1;
      }
    }

    const prepend = () => {
      const first = this.views?.first();
      const prev = first && first.section.prev();

      if (prev) {
        newViews.push(this.prepend(prev));
      }
    };

    const append = () => {
      const last = this.views?.last();
      const next = last && last.section.next();

      if (next) {
        newViews.push(this.append(next));
      }
    };

    const end = offset + visibleLength + delta;
    const start = offset - delta;

    if (end >= contentLength) {
      append();
    }

    if (start < 0) {
      prepend();
    }

    const promises = newViews.map((view) => {
      return view;
    });

    if (newViews.length) {
      return Promise.all(promises)
        .then((): Promise<boolean> => {
          return this.check();
        })
        .then(
          () => {
            // Check to see if anything new is on screen after rendering
            return this.update(delta);
          },
          (err: any) => {
            return err;
          },
        );
    } else {
      this.q.enqueue(() => {
        this.update();
      });
      checking.resolve(false);
      return checking.promise;
    }
  }

  trim(): Promise<void> {
    const task = defer<void>();
    const displayed = this.views?.displayed();
    if (!displayed) {
      task.resolve();
      return task.promise;
    }
    const first = displayed[0];
    const last = displayed[displayed.length - 1];
    const firstIndex = this.views?.indexOf(first) || 0;
    const lastIndex = this.views?.indexOf(last) || 0;
    const above = this.views?.slice(0, firstIndex) || [];
    const below = this.views?.slice(lastIndex + 1) || [];

    // Erase all but last above
    for (let i = 0; i < above.length - 1; i++) {
      this.erase(above[i], above);
    }

    // Erase all except first below
    for (let j = 1; j < below.length; j++) {
      this.erase(below[j], undefined);
    }

    task.resolve();
    return task.promise;
  }

  erase(view: View, above?: View[]): void {
    //Trim

    let prevTop: number;
    let prevLeft: number;

    if (!this.settings.fullsize) {
      prevTop = this.container?.scrollTop || 0;
      prevLeft = this.container?.scrollLeft || 0;
    } else {
      prevTop = window.scrollY;
      prevLeft = window.scrollX;
    }

    const bounds = view.bounds();

    this.views?.remove(view);

    if (above) {
      if (this.settings.axis === 'vertical') {
        this.scrollTo(0, prevTop - bounds.height, true);
      } else {
        if (this.settings.direction === 'rtl') {
          if (!this.settings.fullsize) {
            this.scrollTo(prevLeft, 0, true);
          } else {
            this.scrollTo(prevLeft + Math.floor(bounds.width), 0, true);
          }
        } else {
          this.scrollTo(prevLeft - Math.floor(bounds.width), 0, true);
        }
      }
    }
  }

  addEventListeners(stage?: any): void {
    window.addEventListener('unload', (e: Event) => {
      this.ignore = true;
      // this.scrollTo(0,0);
      this.destroy();
    });

    this.addScrollListeners();

    if (this.isPaginated && this.settings.snap) {
      this.snapper = new Snap(
        this,
        this.settings.snap &&
          typeof this.settings.snap === 'object' &&
          this.settings.snap,
      );
    }
  }

  addScrollListeners(): void {
    let scroller: Window | HTMLElement | undefined;

    this.tick = requestAnimationFrame;

    const dir =
      this.settings.direction === 'rtl' &&
      this.settings.rtlScrollType === 'default'
        ? -1
        : 1;

    this.scrollDeltaVert = 0;
    this.scrollDeltaHorz = 0;

    if (!this.settings.fullsize) {
      scroller = this.container;
      this.scrollTop = this.container?.scrollTop || 0;
      this.scrollLeft = this.container?.scrollLeft || 0;
    } else {
      scroller = window;
      this.scrollTop = window.scrollY * dir;
      this.scrollLeft = window.scrollX * dir;
    }

    this._onScroll = this.onScroll.bind(this);
    scroller?.addEventListener('scroll', this._onScroll);
    this._scrolled = debounce(this.scrolledHandler.bind(this), 30);
    // this.tick.call(window, this.onScroll.bind(this));

    this.didScroll = false;
  }

  removeEventListeners(): void {
    let scroller: Window | HTMLElement | undefined;

    if (!this.settings.fullsize) {
      scroller = this.container;
    } else {
      scroller = window;
    }

    scroller?.removeEventListener('scroll', this._onScroll);
    this._onScroll = undefined;
  }

  onScroll(): void {
    let scrollTop: number;
    let scrollLeft: number;
    const dir =
      this.settings.direction === 'rtl' &&
      this.settings.rtlScrollType === 'default'
        ? -1
        : 1;

    if (!this.settings.fullsize) {
      scrollTop = this.container?.scrollTop || 0;
      scrollLeft = this.container?.scrollLeft || 0;
    } else {
      scrollTop = window.scrollY * dir;
      scrollLeft = window.scrollX * dir;
    }

    this.scrollTop = scrollTop;
    this.scrollLeft = scrollLeft;

    if (!this.ignore) {
      this._scrolled();
    } else {
      this.ignore = false;
    }

    this.scrollDeltaVert += Math.abs(scrollTop - this.prevScrollTop);
    this.scrollDeltaHorz += Math.abs(scrollLeft - this.prevScrollLeft);

    this.prevScrollTop = scrollTop;
    this.prevScrollLeft = scrollLeft;

    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.scrollDeltaVert = 0;
      this.scrollDeltaHorz = 0;
    }, 150);

    clearTimeout(this.afterScrolled);

    this.didScroll = false;
  }

  scrolledHandler(): void {
    this.q.enqueue(() => {
      return this.check();
    });

    this.emit(EVENTS.MANAGERS.SCROLL, {
      top: this.scrollTop,
      left: this.scrollLeft,
    });

    clearTimeout(this.afterScrolled);
    this.afterScrolled = setTimeout(() => {
      // Don't report scroll if we are about the snap
      if (
        this.snapper &&
        this.snapper.supportsTouch &&
        this.snapper.needsSnap()
      ) {
        return;
      }

      this.emit(EVENTS.MANAGERS.SCROLLED, {
        top: this.scrollTop,
        left: this.scrollLeft,
      });
    }, this.settings.afterScrolledTimeout);
  }

  next(): Promise<void> {
    const delta =
      this.layout.props.name === 'pre-paginated' && this.layout.props.spread
        ? this.layout.props.delta * 2
        : this.layout.props.delta;

    if (!this.views?.length) return Promise.resolve();

    if (this.isPaginated && this.settings.axis === 'horizontal') {
      this.scrollBy(delta, 0, true);
    } else {
      this.scrollBy(0, this.layout.height, true);
    }

    this.q.enqueue(() => {
      return this.check();
    });

    return Promise.resolve();
  }

  prev(): Promise<void> {
    const delta =
      this.layout.props.name === 'pre-paginated' && this.layout.props.spread
        ? this.layout.props.delta * 2
        : this.layout.props.delta;

    if (!this.views?.length) return Promise.resolve();

    if (this.isPaginated && this.settings.axis === 'horizontal') {
      this.scrollBy(-delta, 0, true);
    } else {
      this.scrollBy(0, -this.layout.height, true);
    }

    this.q.enqueue(() => {
      return this.check();
    });

    return Promise.resolve();
  }

  updateFlow(flow: string, defaultScrolledOverflow = 'scroll'): void {
    if (this.rendered && this.snapper) {
      this.snapper.destroy();
      this.snapper = undefined;
    }

    super.updateFlow(flow, 'scroll');

    if (this.rendered && this.isPaginated && this.settings.snap) {
      this.snapper = new Snap(
        this,
        this.settings.snap &&
          typeof this.settings.snap === 'object' &&
          this.settings.snap,
      );
    }
  }

  destroy(): void {
    super.destroy();

    if (this.snapper) {
      this.snapper.destroy();
    }
  }
}

export default ContinuousViewManager;
