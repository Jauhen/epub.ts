import Contents from '../contents';
import Layout from '../layout';
import { Section } from '../section';
import { Bounds } from '../utils/core';

export interface ViewSettings {
  ignoreClass?: string;
  axis?: string;
  flow?: string;
  layout?: Layout;
  method?: string;
  width?: number;
  height?: number;
  forceEvenPages?: boolean;
  allowScriptedContent?: boolean;
}

export default interface View {
  section: Section;
  expanded?: boolean;
  displayed: boolean;
  contents?: Contents;

  create(): any;

  render(request?: Function, show?: boolean): Promise<void>;

  reset(): void;

  size(_width?: number, _height?: number): void;

  load(contents: string): Promise<Contents | undefined>;

  setLayout(layout: Layout): void;

  setAxis(axis: string): void;

  display(request?: Function): Promise<View>;

  show(): void;

  hide(): void;

  offset(): { top: number; left: number };

  width(): number;

  height(): number;

  position(): DOMRect;

  locationOf(target: string): { top: number; left: number };

  onDisplayed(view: View): void;

  onResize(
    view: View,
    size: {
      width?: number;
      height?: number;
      widthDelta?: number;
      heightDelta?: number;
    },
  ): void;

  bounds(force?: boolean): Bounds;

  highlight(
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): void;

  underline(
    cfiRange: string,
    data?: object,
    cb?: Function,
    className?: string,
    styles?: object,
  ): void;

  mark(cfiRange: string, data?: object, cb?: Function): void;

  unhighlight(cfiRange: string): void;

  ununderline(cfiRange: string): void;

  unmark(cfiRange: string): void;

  destroy(): void;

  // Event emitters
  emit(type: any, ...args: any[]): void;

  off(type: any, listener: any): any;

  on(type: any, listener: any): any;

  once(type: any, listener: any, ...args: any[]): any;
}
