import {
  uuid,
  isNumber,
  isElement,
  windowBounds,
  extend,
} from '../../utils/core';
import throttle from 'lodash/throttle';

class Stage {
  settings: any;
  id: string;
  container: HTMLElement;
  wrapper?: HTMLElement;
  element?: HTMLElement;
  resizeFunc?: () => void;
  orientationChangeFunc?: () => void;
  containerStyles?: CSSStyleDeclaration;
  containerPadding?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  sheet?: CSSStyleSheet | null;

  constructor(_options?: any) {
    this.settings = _options || {};
    this.id = 'epubjs-container-' + uuid();

    this.container = this.create(this.settings);

    if (this.settings.hidden) {
      this.wrapper = this.wrap(this.container);
    }
  }

  /*
   * Creates an element to render to.
   * Resizes to passed width and height or to the elements size
   */
  create(options: any): HTMLElement {
    let height = options.height; // !== false ? options.height : "100%";
    let width = options.width; // !== false ? options.width : "100%";
    const overflow = options.overflow || false;
    const axis = options.axis || 'vertical';
    const direction = options.direction;

    // Use Object.assign instead of extend to avoid function signature issues
    Object.assign(this.settings, options);

    if (options.height && isNumber(options.height)) {
      height = options.height + 'px';
    }

    if (options.width && isNumber(options.width)) {
      width = options.width + 'px';
    }

    // Create new container element
    const container = document.createElement('div');

    container.id = this.id;
    container.classList.add('epub-container');

    // Style Element
    // container.style.fontSize = "0";
    container.style.wordSpacing = '0';
    container.style.lineHeight = '0';
    container.style.verticalAlign = 'top';
    container.style.position = 'relative';

    if (axis === 'horizontal') {
      // container.style.whiteSpace = "nowrap";
      container.style.display = 'flex';
      container.style.flexDirection = 'row';
      container.style.flexWrap = 'nowrap';
    }

    if (width) {
      container.style.width = width;
    }

    if (height) {
      container.style.height = height;
    }

    if (overflow) {
      if (overflow === 'scroll' && axis === 'vertical') {
        (container.style as any).overflowY = overflow;
        (container.style as any).overflowX = 'hidden';
      } else if (overflow === 'scroll' && axis === 'horizontal') {
        (container.style as any).overflowY = 'hidden';
        (container.style as any).overflowX = overflow;
      } else {
        container.style.overflow = overflow;
      }
    }

    if (direction) {
      container.dir = direction;
      container.style['direction'] = direction;
    }

    if (direction && this.settings.fullsize) {
      document.body.style['direction'] = direction;
    }

    return container;
  }

  wrap(container: HTMLElement): HTMLElement {
    const wrapper = document.createElement('div');

    wrapper.style.visibility = 'hidden';
    wrapper.style.overflow = 'hidden';
    wrapper.style.width = '0';
    wrapper.style.height = '0';

    wrapper.appendChild(container);
    return wrapper;
  }

  getElement(_element: string | HTMLElement): HTMLElement {
    let element: HTMLElement | null = null;

    if (typeof _element === 'object' && isElement(_element)) {
      element = _element as HTMLElement;
    } else if (typeof _element === 'string') {
      element = document.getElementById(_element);
    }

    if (!element) {
      throw new Error('Not an Element');
    }

    return element;
  }

  attachTo(what: string | HTMLElement): HTMLElement | undefined {
    const element = this.getElement(what);
    let base: HTMLElement;

    if (!element) {
      return;
    }

    if (this.settings.hidden) {
      base = this.wrapper!;
    } else {
      base = this.container;
    }

    element.appendChild(base);

    this.element = element;

    return element;
  }

  getContainer() {
    return this.container;
  }

  onResize(func: () => void): void {
    // Only listen to window for resize event if width and height are not fixed.
    // This applies if it is set to a percent or auto.
    if (!isNumber(this.settings.width) || !isNumber(this.settings.height)) {
      this.resizeFunc = throttle(func, 50) as () => void;
      if (this.resizeFunc) {
        window.addEventListener('resize', this.resizeFunc, false);
      }
    }
  }

  onOrientationChange(func: () => void): void {
    this.orientationChangeFunc = func;
    if (this.orientationChangeFunc) {
      window.addEventListener(
        'orientationchange',
        this.orientationChangeFunc,
        false,
      );
    }
  }

  size(
    width?: number | string | null,
    height?: number | string | null,
  ): { width: number; height: number } {
    let bounds: DOMRect | undefined;
    const _width = width || this.settings.width;
    const _height = height || this.settings.height;

    // If width or height are set to false, inherit them from containing element
    if (width === null) {
      if (this.element) {
        bounds = this.element.getBoundingClientRect();

        if (bounds.width) {
          width = Math.floor(bounds.width);
          this.container.style.width = width + 'px';
        }
      }
    } else {
      if (isNumber(width)) {
        this.container.style.width = width + 'px';
      } else if (typeof width === 'string') {
        this.container.style.width = width;
      }
    }

    if (height === null) {
      if (this.element) {
        bounds = bounds || this.element.getBoundingClientRect();

        if (bounds.height) {
          height = bounds.height;
          this.container.style.height = height + 'px';
        }
      }
    } else {
      if (isNumber(height)) {
        this.container.style.height = height + 'px';
      } else if (typeof height === 'string') {
        this.container.style.height = height;
      }
    }

    if (!isNumber(width)) {
      width = this.container.clientWidth;
    }

    if (!isNumber(height)) {
      height = this.container.clientHeight;
    }

    this.containerStyles = window.getComputedStyle(this.container);

    this.containerPadding = {
      left: parseFloat((this.containerStyles as any).paddingLeft) || 0,
      right: parseFloat((this.containerStyles as any).paddingRight) || 0,
      top: parseFloat((this.containerStyles as any).paddingTop) || 0,
      bottom: parseFloat((this.containerStyles as any).paddingBottom) || 0,
    };

    // Bounds not set, get them from window
    const _windowBounds = windowBounds();
    const bodyStyles = window.getComputedStyle(document.body);
    const bodyPadding = {
      left: parseFloat((bodyStyles as any).paddingLeft) || 0,
      right: parseFloat((bodyStyles as any).paddingRight) || 0,
      top: parseFloat((bodyStyles as any).paddingTop) || 0,
      bottom: parseFloat((bodyStyles as any).paddingBottom) || 0,
    };

    if (!_width) {
      width = _windowBounds.width - bodyPadding.left - bodyPadding.right;
    }

    if ((this.settings.fullsize && !_height) || !_height) {
      height = _windowBounds.height - bodyPadding.top - bodyPadding.bottom;
    }

    // Ensure width and height are numbers at this point
    const finalWidth = typeof width === 'number' ? width : 0;
    const finalHeight = typeof height === 'number' ? height : 0;

    return {
      width:
        finalWidth - this.containerPadding.left - this.containerPadding.right,
      height:
        finalHeight - this.containerPadding.top - this.containerPadding.bottom,
    };
  }

  bounds() {
    let box;
    if (this.container.style.overflow !== 'visible') {
      box = this.container && this.container.getBoundingClientRect();
    }

    if (!box || !box.width || !box.height) {
      return windowBounds();
    } else {
      return box;
    }
  }

  getSheet() {
    const style = document.createElement('style');

    // WebKit hack --> https://davidwalsh.name/add-rules-stylesheets
    style.appendChild(document.createTextNode(''));

    document.head.appendChild(style);

    return style.sheet;
  }

  addStyleRules(
    selector: string,
    rulesArray: Array<{ [key: string]: string }>,
  ): void {
    const scope = '#' + this.id + ' ';
    let rules = '';

    if (!this.sheet) {
      this.sheet = this.getSheet();
    }

    rulesArray.forEach(function (set: { [key: string]: string }) {
      for (const prop in set) {
        if (set.hasOwnProperty(prop)) {
          rules += prop + ':' + set[prop] + ';';
        }
      }
    });

    if (this.sheet) {
      this.sheet.insertRule(scope + selector + ' {' + rules + '}', 0);
    }
  }

  axis(axis: string): void {
    if (axis === 'horizontal') {
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'row';
      this.container.style.flexWrap = 'nowrap';
    } else {
      this.container.style.display = 'block';
    }
    this.settings.axis = axis;
  }

  // orientation(orientation) {
  //   if (orientation === "landscape") {
  //
  //   } else {
  //
  //   }
  //
  //   this.orientation = orientation;
  // }

  direction(dir: string): void {
    if (this.container) {
      this.container.dir = dir;
      (this.container.style as any).direction = dir;
    }

    if (this.settings.fullsize) {
      (document.body.style as any).direction = dir;
    }
    this.settings.dir = dir;
  }

  overflow(overflow: string): void {
    if (this.container) {
      if (overflow === 'scroll' && this.settings.axis === 'vertical') {
        (this.container.style as any).overflowY = overflow;
        (this.container.style as any).overflowX = 'hidden';
      } else if (overflow === 'scroll' && this.settings.axis === 'horizontal') {
        (this.container.style as any).overflowY = 'hidden';
        (this.container.style as any).overflowX = overflow;
      } else {
        this.container.style.overflow = overflow;
      }
    }
    this.settings.overflow = overflow;
  }

  destroy(): void {
    let base: HTMLElement;

    if (this.element) {
      if (this.settings.hidden) {
        base = this.wrapper!;
      } else {
        base = this.container;
      }

      if (this.element.contains(this.container)) {
        this.element.removeChild(this.container);
      }

      if (this.resizeFunc) {
        window.removeEventListener('resize', this.resizeFunc);
      }
      if (this.orientationChangeFunc) {
        window.removeEventListener(
          'orientationchange',
          this.orientationChangeFunc,
        );
      }
    }
  }
}

export default Stage;
