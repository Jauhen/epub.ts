import EventEmitter from 'events';

import { EVENTS } from '../../utils/constants';
import { defer } from '../../utils/core';

// easing equations from https://github.com/danro/easing-js/blob/master/easing.js
const PI_D2 = Math.PI / 2;
const EASING_EQUATIONS = {
  easeOutSine: function (pos: number): number {
    return Math.sin(pos * PI_D2);
  },
  easeInOutSine: function (pos: number): number {
    return -0.5 * (Math.cos(Math.PI * pos) - 1);
  },
  easeInOutQuint: function (pos: number): number {
    if ((pos /= 0.5) < 1) {
      return 0.5 * Math.pow(pos, 5);
    }
    return 0.5 * (Math.pow(pos - 2, 5) + 2);
  },
  easeInCubic: function (pos: number): number {
    return Math.pow(pos, 3);
  },
};

class Snap extends EventEmitter {
  settings: any;
  supportsTouchValue: boolean;
  manager: any;
  layout: any;
  fullsize = false;
  element: any;
  scroller: any;
  isVertical = false;
  touchCanceler = false;
  resizeCanceler = false;
  snapping = false;
  scrollLeft = 0;
  scrollTop = 0;
  startTouchX: number | undefined;
  startTouchY: number | undefined;
  startTime: number | undefined;
  endTouchX: number | undefined;
  endTouchY: number | undefined;
  endTime: number | undefined;
  _onResize: ((e: Event) => void) | undefined;
  _onScroll: ((e: Event) => void) | undefined;
  _onTouchStart: ((e: TouchEvent) => void) | undefined;
  _onTouchMove: ((e: TouchEvent) => void) | undefined;
  _onTouchEnd: ((e: TouchEvent) => void) | undefined;
  _afterDisplayed: ((view: any) => void) | undefined;

  constructor(manager: any, options?: any) {
    super();
    this.settings = Object.assign(
      {
        duration: 80,
        minVelocity: 0.2,
        minDistance: 10,
        easing: EASING_EQUATIONS['easeInCubic'],
      },
      options || {},
    );

    this.supportsTouchValue = this.supportsTouch();

    if (this.supportsTouchValue) {
      this.setup(manager);
    }
  }

  setup(manager: any) {
    this.manager = manager;

    this.layout = this.manager.layout;

    this.fullsize = this.manager.settings.fullsize;
    if (this.fullsize) {
      this.element = this.manager.stage.element;
      this.scroller = window;
      this.disableScroll();
    } else {
      this.element = this.manager.stage.container;
      this.scroller = this.element;
      this.element.style['WebkitOverflowScrolling'] = 'touch';
    }

    // this.overflow = this.manager.overflow;

    // set lookahead offset to page width
    this.manager.settings.offset = this.layout.width;
    this.manager.settings.afterScrolledTimeout = this.settings.duration * 2;

    this.isVertical = this.manager.settings.axis === 'vertical';

    // disable snapping if not paginated or axis in not horizontal
    if (!this.manager.isPaginated || this.isVertical) {
      return;
    }

    this.touchCanceler = false;
    this.resizeCanceler = false;
    this.snapping = false;

    this.scrollLeft;
    this.scrollTop;

    this.startTouchX = undefined;
    this.startTouchY = undefined;
    this.startTime = undefined;
    this.endTouchX = undefined;
    this.endTouchY = undefined;
    this.endTime = undefined;

    this.addListeners();
  }

  supportsTouch(): boolean {
    if (
      'ontouchstart' in window ||
      ((window as any).DocumentTouch &&
        document instanceof (window as any).DocumentTouch)
    ) {
      return true;
    }

    return false;
  }

  disableScroll() {
    this.element.style.overflow = 'hidden';
  }

  enableScroll() {
    this.element.style.overflow = '';
  }

  addListeners() {
    this._onResize = this.onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this._onScroll = this.onScroll.bind(this);
    this.scroller.addEventListener('scroll', this._onScroll);

    this._onTouchStart = this.onTouchStart.bind(this);
    this.scroller.addEventListener('touchstart', this._onTouchStart, {
      passive: true,
    });
    this.on('touchstart', this._onTouchStart);

    this._onTouchMove = this.onTouchMove.bind(this);
    this.scroller.addEventListener('touchmove', this._onTouchMove, {
      passive: true,
    });
    this.on('touchmove', this._onTouchMove);

    this._onTouchEnd = this.onTouchEnd.bind(this);
    this.scroller.addEventListener('touchend', this._onTouchEnd, {
      passive: true,
    });
    this.on('touchend', this._onTouchEnd);

    this._afterDisplayed = this.afterDisplayed.bind(this);
    this.manager.on(EVENTS.MANAGERS.ADDED, this._afterDisplayed);
  }

  removeListeners() {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = undefined;
    }

    if (this._onScroll) {
      this.scroller.removeEventListener('scroll', this._onScroll);
      this._onScroll = undefined;
    }

    if (this._onTouchStart) {
      this.scroller.removeEventListener('touchstart', this._onTouchStart, {
        passive: true,
      });
      this.off('touchstart', this._onTouchStart);
      this._onTouchStart = undefined;
    }

    if (this._onTouchMove) {
      this.scroller.removeEventListener('touchmove', this._onTouchMove, {
        passive: true,
      });
      this.off('touchmove', this._onTouchMove);
      this._onTouchMove = undefined;
    }

    if (this._onTouchEnd) {
      this.scroller.removeEventListener('touchend', this._onTouchEnd, {
        passive: true,
      });
      this.off('touchend', this._onTouchEnd);
      this._onTouchEnd = undefined;
    }

    if (this._afterDisplayed) {
      this.manager.off(EVENTS.MANAGERS.ADDED, this._afterDisplayed);
      this._afterDisplayed = undefined;
    }
  }

  afterDisplayed(view: any) {
    const contents = view.contents;
    ['touchstart', 'touchmove', 'touchend'].forEach((e) => {
      contents.on(e, (ev: any) => this.triggerViewEvent(ev, contents));
    });
  }

  triggerViewEvent(e: any, contents: any) {
    this.emit(e.type, e, contents);
  }

  onScroll(e: Event) {
    this.scrollLeft = this.fullsize ? window.scrollX : this.scroller.scrollLeft;
    this.scrollTop = this.fullsize ? window.scrollY : this.scroller.scrollTop;
  }

  onResize(e: Event) {
    this.resizeCanceler = true;
  }

  onTouchStart(e: TouchEvent) {
    const { screenX, screenY } = e.touches[0];

    if (this.fullsize) {
      this.enableScroll();
    }

    this.touchCanceler = true;

    if (!this.startTouchX) {
      this.startTouchX = screenX;
      this.startTouchY = screenY;
      this.startTime = this.now();
    }

    this.endTouchX = screenX;
    this.endTouchY = screenY;
    this.endTime = this.now();
  }

  onTouchMove(e: TouchEvent) {
    const { screenX, screenY } = e.touches[0];
    const deltaY =
      this.endTouchY !== undefined ? Math.abs(screenY - this.endTouchY) : 0;

    this.touchCanceler = true;

    if (!this.fullsize && deltaY < 10 && this.endTouchX !== undefined) {
      this.element.scrollLeft -= screenX - this.endTouchX;
    }

    this.endTouchX = screenX;
    this.endTouchY = screenY;
    this.endTime = this.now();
  }

  onTouchEnd(e: TouchEvent) {
    if (this.fullsize) {
      this.disableScroll();
    }

    this.touchCanceler = false;

    const swipped = this.wasSwiped();

    if (swipped !== 0) {
      this.snap(swipped);
    } else {
      this.snap();
    }

    this.startTouchX = undefined;
    this.startTouchY = undefined;
    this.startTime = undefined;
    this.endTouchX = undefined;
    this.endTouchY = undefined;
    this.endTime = undefined;
  }

  wasSwiped(): number {
    const snapWidth = this.layout.pageWidth * this.layout.divisor;

    if (
      this.endTouchX === undefined ||
      this.startTouchX === undefined ||
      this.endTime === undefined ||
      this.startTime === undefined
    ) {
      return 0;
    }

    const distance = this.endTouchX - this.startTouchX;
    const absolute = Math.abs(distance);
    const time = this.endTime - this.startTime;
    const velocity = distance / time;
    const minVelocity = this.settings.minVelocity;

    if (absolute <= this.settings.minDistance || absolute >= snapWidth) {
      return 0;
    }

    if (velocity > minVelocity) {
      // previous
      return -1;
    } else if (velocity < -minVelocity) {
      // next
      return 1;
    }

    return 0;
  }

  needsSnap() {
    const left = this.scrollLeft;
    const snapWidth = this.layout.pageWidth * this.layout.divisor;
    return left % snapWidth !== 0;
  }

  snap(howMany = 0) {
    const left = this.scrollLeft;
    const snapWidth = this.layout.pageWidth * this.layout.divisor;
    let snapTo = Math.round(left / snapWidth) * snapWidth;

    if (howMany) {
      snapTo += howMany * snapWidth;
    }

    return this.smoothScrollTo(snapTo);
  }

  smoothScrollTo(destination: number): Promise<void> {
    const deferred = defer<void>();
    const start = this.scrollLeft;
    const startTime = this.now();

    const duration = this.settings.duration;
    const easing = this.settings.easing;

    this.snapping = true;

    // add animation loop
    const tick = () => {
      const now = this.now();
      const time = Math.min(1, (now - startTime) / duration);
      const timeFunction = easing(time);

      if (this.touchCanceler || this.resizeCanceler) {
        this.resizeCanceler = false;
        this.snapping = false;
        deferred.resolve();
        return;
      }

      if (time < 1) {
        window.requestAnimationFrame(tick);
        this.scrollTo(start + (destination - start) * time, 0);
      } else {
        this.scrollTo(destination, 0);
        this.snapping = false;
        deferred.resolve();
      }
    };

    tick();

    return deferred.promise;
  }

  scrollTo(left = 0, top = 0) {
    if (this.fullsize) {
      window.scroll(left, top);
    } else {
      this.scroller.scrollLeft = left;
      this.scroller.scrollTop = top;
    }
  }

  now() {
    return 'now' in window.performance
      ? performance.now()
      : new Date().getTime();
  }

  destroy() {
    if (!this.scroller) {
      return;
    }

    if (this.fullsize) {
      this.enableScroll();
    }

    this.removeListeners();

    this.scroller = undefined;
  }
}

export default Snap;
