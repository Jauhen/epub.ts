import EventEmitter from 'events';

import EpubCFI from './epubcfi';
import type View from './managers/view';
/**
 * Handles managing adding & removing Annotations
 * @param {Rendition} rendition
 * @class
 */

import type Rendition from './rendition';
import { EVENTS } from './utils/constants';

class Annotations {
  private rendition: Rendition;
  private highlights: Annotation[];
  private underlines: Annotation[];
  private marks: Annotation[];
  private _annotations: Record<string, Annotation>;
  private _annotationsBySectionIndex: Record<number, string[]>;

  constructor(rendition: Rendition) {
    this.rendition = rendition;
    this.highlights = [];
    this.underlines = [];
    this.marks = [];
    this._annotations = {};
    this._annotationsBySectionIndex = {};

    this.rendition.hooks.render.register(this.inject.bind(this));
    this.rendition.hooks.unloaded.register(this.clear.bind(this));
  }

  /**
   * Add an annotation to store
   * @param {string} type Type of annotation to add: "highlight", "underline", "mark"
   * @param {EpubCFI} cfiRange EpubCFI range to attach annotation to
   * @param {object} data Data to assign to annotation
   * @param {function} [cb] Callback after annotation is added
   * @param {string} className CSS class to assign to annotation
   * @param {object} styles CSS styles to assign to annotation
   * @returns {Annotation} annotation
   */
  add(
    type: string,
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): Annotation {
    const hash = encodeURI(cfiRange + type);
    const cfi = new EpubCFI(cfiRange);
    const sectionIndex = cfi.spinePos;
    const annotation = new Annotation({
      type,
      cfiRange,
      data,
      sectionIndex,
      cb,
      className,
      styles,
    });

    this._annotations[hash] = annotation;

    if (sectionIndex in this._annotationsBySectionIndex) {
      this._annotationsBySectionIndex[sectionIndex].push(hash);
    } else {
      this._annotationsBySectionIndex[sectionIndex] = [hash];
    }

    const views = this.rendition.views();

    views.forEach((view: any) => {
      // view.index is not typed, so use type assertion
      const viewIndex = (view as any).index;
      if (annotation.sectionIndex === viewIndex) {
        annotation.attach(view);
      }
    });

    return annotation;
  }

  /**
   * Remove an annotation from store
   * @param {EpubCFI} cfiRange EpubCFI range the annotation is attached to
   * @param {string} type Type of annotation to add: "highlight", "underline", "mark"
   */
  remove(cfiRange: string, type: string): void {
    const hash = encodeURI(cfiRange + type);

    if (hash in this._annotations) {
      const annotation = this._annotations[hash];

      if (type && annotation.type !== type) {
        return;
      }

      const views = this.rendition.views();
      if (typeof annotation.sectionIndex === 'number') {
        views.forEach((view: any) => {
          this._removeFromAnnotationBySectionIndex(
            annotation.sectionIndex as number,
            hash,
          );
          const viewIndex = (view as any).index;
          if (annotation.sectionIndex === viewIndex) {
            annotation.detach(view);
          }
        });
      }

      delete this._annotations[hash];
    }
  }

  /**
   * Remove an annotations by Section Index
   * @private
   */
  private _removeFromAnnotationBySectionIndex(
    sectionIndex: number,
    hash: string,
  ): void {
    this._annotationsBySectionIndex[sectionIndex] = this._annotationsAt(
      sectionIndex,
    ).filter((h: string) => h !== hash);
  }

  /**
   * Get annotations by Section Index
   * @private
   */
  private _annotationsAt(index: number): string[] {
    return this._annotationsBySectionIndex[index];
  }

  /**
   * Add a highlight to the store
   * @param {EpubCFI} cfiRange EpubCFI range to attach annotation to
   * @param {object} data Data to assign to annotation
   * @param {function} cb Callback after annotation is clicked
   * @param {string} className CSS class to assign to annotation
   * @param {object} styles CSS styles to assign to annotation
   */
  highlight(
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): void {
    this.add('highlight', cfiRange, data, cb, className, styles);
  }

  /**
   * Add a underline to the store
   * @param {EpubCFI} cfiRange EpubCFI range to attach annotation to
   * @param {object} data Data to assign to annotation
   * @param {function} cb Callback after annotation is clicked
   * @param {string} className CSS class to assign to annotation
   * @param {object} styles CSS styles to assign to annotation
   */
  underline(
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): void {
    this.add('underline', cfiRange, data, cb, className, styles);
  }

  /**
   * Add a mark to the store
   * @param {EpubCFI} cfiRange EpubCFI range to attach annotation to
   * @param {object} data Data to assign to annotation
   * @param {function} cb Callback after annotation is clicked
   */
  mark(cfiRange: string, data?: object, cb?: Function): void {
    this.add('mark', cfiRange, data, cb);
  }

  /**
   * iterate over annotations in the store
   */
  each(): Annotation[] {
    return Object.values(this._annotations);
  }

  /**
   * Hook for injecting annotation into a view
   * @param {View} view
   * @private
   */
  private inject(view: View): void {
    const sectionIndex = (view as any).index;
    if (sectionIndex in this._annotationsBySectionIndex) {
      const annotations = this._annotationsBySectionIndex[sectionIndex];
      annotations.forEach((hash: string) => {
        const annotation = this._annotations[hash];
        annotation.attach(view);
      });
    }
  }

  /**
   * Hook for removing annotation from a view
   * @param {View} view
   * @private
   */
  private clear(view: View): void {
    const sectionIndex = (view as any).index;
    if (sectionIndex in this._annotationsBySectionIndex) {
      const annotations = this._annotationsBySectionIndex[sectionIndex];
      annotations.forEach((hash: string) => {
        const annotation = this._annotations[hash];
        annotation.detach(view);
      });
    }
  }

  /**
   * [Not Implemented] Show annotations
   * @TODO: needs implementation in View
   */
  show() {}

  /**
   * [Not Implemented] Hide annotations
   * @TODO: needs implementation in View
   */
  hide() {}
}

/**
 * Annotation object
 * @class
 * @param {object} options
 * @param {string} options.type Type of annotation to add: "highlight", "underline", "mark"
 * @param {EpubCFI} options.cfiRange EpubCFI range to attach annotation to
 * @param {object} options.data Data to assign to annotation
 * @param {int} options.sectionIndex Index in the Spine of the Section annotation belongs to
 * @param {function} [options.cb] Callback after annotation is clicked
 * @param {string} className CSS class to assign to annotation
 * @param {object} styles CSS styles to assign to annotation
 * @returns {Annotation} annotation
 */
class Annotation extends EventEmitter {
  public type: string;
  public cfiRange: string;
  public data?: object;
  public sectionIndex?: number;
  public cb?: Function;
  public className?: string;
  public styles?: object;
  public mark: any;

  constructor(options: {
    type: string;
    cfiRange: string;
    data?: object;
    sectionIndex?: number;
    cb?: Function;
    className?: string;
    styles?: object;
  }) {
    super();
    this.type = options.type;
    this.cfiRange = options.cfiRange;
    this.data = options.data;
    this.sectionIndex = options.sectionIndex;
    this.mark = undefined;
    this.cb = options.cb;
    this.className = options.className;
    this.styles = options.styles;
  }

  update(data: object): void {
    this.data = data;
  }

  attach(view: View): any {
    const { cfiRange, data, type, cb, className, styles } = this;
    let result;

    if (type === 'highlight') {
      result = view.highlight(cfiRange, data, cb, className, styles);
    } else if (type === 'underline') {
      result = view.underline(cfiRange, data, cb, className, styles);
    } else if (type === 'mark') {
      result = view.mark(cfiRange, data, cb);
    }

    this.mark = result;
    this.emit(EVENTS.ANNOTATION.ATTACH, result);
    return result;
  }

  detach(view: View): any {
    const { cfiRange, type } = this;
    let result;

    if (view) {
      if (type === 'highlight') {
        result = view.unhighlight(cfiRange);
      } else if (type === 'underline') {
        result = view.ununderline(cfiRange);
      } else if (type === 'mark') {
        result = view.unmark(cfiRange);
      }
    }

    this.mark = undefined;
    this.emit(EVENTS.ANNOTATION.DETACH, result);
    return result;
  }

  text(): void {
    // Not implemented
  }
}

export default Annotations;
