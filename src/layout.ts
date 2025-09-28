import EventEmitter from 'events';

import type Contents from './contents';
import { EVENTS } from './utils/constants';

/**
 * Figures out the CSS values to apply for a layout
 * @class
 * @param {object} settings
 * @param {string} [settings.layout='reflowable']
 * @param {string} [settings.spread]
 * @param {number} [settings.minSpreadWidth=800]
 * @param {boolean} [settings.evenSpreads=false]
 */
class Layout extends EventEmitter {
  public settings: {
    layout: string;
    spread: string;
    minSpreadWidth: number;
    evenSpreads: boolean;
    [key: string]: any;
  };
  public name: string;
  private _spread: boolean;
  private _minSpreadWidth: number;
  private _evenSpreads: boolean;
  private _flow: string;
  public width: number;
  public height: number;
  public spreadWidth: number;
  public pageWidth?: number;
  public delta: number;
  public columnWidth: number;
  public gap: number;
  public divisor: number;
  public props: {
    name: string;
    spread: boolean;
    flow: string;
    width: number;
    height: number;
    spreadWidth: number;
    delta: number;
    columnWidth: number;
    gap: number;
    divisor: number;
    [key: string]: any;
  };

  constructor(settings: {
    layout: string;
    spread: string;
    minSpreadWidth: number;
    evenSpreads: boolean;
    [key: string]: any;
  }) {
    super();
    this.settings = settings;
    this.name = settings.layout || 'reflowable';
    this._spread = settings.spread === 'none' ? false : true;
    this._minSpreadWidth = settings.minSpreadWidth || 800;
    this._evenSpreads = settings.evenSpreads || false;

    if (
      settings.flow === 'scrolled' ||
      settings.flow === 'scrolled-continuous' ||
      settings.flow === 'scrolled-doc'
    ) {
      this._flow = 'scrolled';
    } else {
      this._flow = 'paginated';
    }

    this.width = 0;
    this.height = 0;
    this.spreadWidth = 0;
    this.delta = 0;

    this.columnWidth = 0;
    this.gap = 0;
    this.divisor = 1;

    this.props = {
      name: this.name,
      spread: this._spread,
      flow: this._flow,
      width: 0,
      height: 0,
      spreadWidth: 0,
      delta: 0,
      columnWidth: 0,
      gap: 0,
      divisor: 1,
    };
  }

  /**
   * Switch the flow between paginated and scrolled
   * @param  {string} flow paginated | scrolled
   * @return {string} simplified flow
   */
  flow(flow: string): string {
    if (typeof flow !== 'undefined') {
      if (
        flow === 'scrolled' ||
        flow === 'scrolled-continuous' ||
        flow === 'scrolled-doc'
      ) {
        this._flow = 'scrolled';
      } else {
        this._flow = 'paginated';
      }
      this.update({ flow: this._flow });
    }
    return this._flow;
  }

  /**
   * Switch between using spreads or not, and set the
   * width at which they switch to single.
   * @param  {string} spread "none" | "always" | "auto"
   * @param  {number} min integer in pixels
   * @return {boolean} spread true | false
   */
  spread(spread: string, min: number): boolean {
    if (spread) {
      this._spread = spread === 'none' ? false : true;
      this.update({ spread: this._spread });
    }

    if (typeof min === 'number' && min >= 0) {
      this._minSpreadWidth = min;
    }

    return this._spread;
  }

  /**
   * Calculate the dimensions of the pagination
   * @param  {number} _width  width of the rendering
   * @param  {number} _height height of the rendering
   * @param  {number} _gap    width of the gap between columns
   */
  calculate(_width: number, _height: number, _gap?: number): void {
    let divisor = 1;
    let gap = _gap || 0;
    let width = _width;
    const height = _height;
    const section = Math.floor(width / 12);
    let columnWidth: number;
    let spreadWidth: number;
    let pageWidth: number;
    let delta: number;

    if (this._spread && width >= this._minSpreadWidth) {
      divisor = 2;
    } else {
      divisor = 1;
    }

    if (
      this.name === 'reflowable' &&
      this._flow === 'paginated' &&
      !(_gap && _gap >= 0)
    ) {
      gap = section % 2 === 0 ? section : section - 1;
    }

    if (this.name === 'pre-paginated') {
      gap = 0;
    }

    if (divisor > 1) {
      columnWidth = width / divisor - gap;
      pageWidth = columnWidth + gap;
    } else {
      columnWidth = width;
      pageWidth = width;
    }

    if (this.name === 'pre-paginated' && divisor > 1) {
      width = columnWidth;
    }

    spreadWidth = columnWidth * divisor + gap;
    delta = width;

    this.width = width;
    this.height = height;
    this.spreadWidth = spreadWidth;
    this.pageWidth = pageWidth;
    this.delta = delta;

    this.columnWidth = columnWidth;
    this.gap = gap;
    this.divisor = divisor;

    this.update({
      width,
      height,
      spreadWidth,
      pageWidth,
      delta,
      columnWidth,
      gap,
      divisor,
    });
  }

  /**
   * Apply Css to a Document
   * @param  {Contents} contents
   * @return {Promise}
   */
  format(
    contents: Contents,
    section?: any,
    axis?: string,
  ): void | Promise<void> {
    let formating;
    if (this.name === 'pre-paginated') {
      // fit expects only width and height
      formating = contents.fit(this.columnWidth, this.height);
    } else if (this._flow === 'paginated') {
      formating = contents.columns(
        this.width,
        this.height,
        this.columnWidth,
        this.gap,
        this.settings.direction,
      );
    } else if (axis && axis === 'horizontal') {
      formating = contents.size(this.width, this.height);
    } else {
      formating = contents.size(this.width, this.height);
    }
    return formating;
  }

  /**
   * Count number of pages
   * @param  {number} totalLength
   * @param  {number} pageLength
   * @return {{spreads: Number, pages: Number}}
   */
  count(
    totalLength: number,
    pageLength: number,
  ): { spreads: number; pages: number } {
    let spreads: number, pages: number;
    if (this.name === 'pre-paginated') {
      spreads = 1;
      pages = 1;
    } else if (this._flow === 'paginated') {
      pageLength = pageLength || this.delta;
      spreads = Math.ceil(totalLength / pageLength);
      pages = spreads * this.divisor;
    } else {
      // scrolled
      pageLength = pageLength || this.height;
      spreads = Math.ceil(totalLength / pageLength);
      pages = spreads;
    }
    return {
      spreads,
      pages,
    };
  }

  /**
   * Update props that have changed
   * @private
   * @param  {object} props
   */
  private update(props: object): void {
    Object.keys(props).forEach((propName) => {
      if ((this.props as any)[propName] === (props as any)[propName]) {
        delete (props as any)[propName];
      }
    });
    if (Object.keys(props).length > 0) {
      // extend(target) returns a shallow copy, so merge manually
      Object.assign(this.props, props);
      this.emit(EVENTS.LAYOUT.UPDATED, this.props, props);
    }
  }
}

export default Layout;
