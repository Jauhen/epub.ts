import Contents from '../contents';
import Layout from '../layout';
import { EpubCFIPair } from '../mapping';
import Section from '../section';
import View, { ViewSettings } from './view';

export interface ViewLocation {
  index: number;
  href: string;
  pages: number[];
  totalPages: number;
  mapping: EpubCFIPair;
}

export interface ManagerOptions extends ViewSettings {
  settings?: any;
  view?: any;
  request?: any;
  queue?: any;
  infinite?: boolean;
  overflow?: string;
  [key: string]: any;
}

export default interface Manager {
  render(element: Element, size?: { width: number; height: number }): void;

  resize(width?: number, height?: number, epubcfi?: string): void;

  onOrientationChange(e: Event): void;

  display(section: Section, target: string | number): Promise<void>;

  next(): Promise<void> | undefined;

  prev(): Promise<void> | undefined;

  current(): View;

  clear(): void;

  currentLocation(): ViewLocation[] | undefined;

  visible(): View[];

  bounds(): object | undefined;

  applyLayout(layout: Layout): void;

  updateLayout(): void;

  setLayout(layout: Layout): void;

  updateAxis(axis: string, forceUpdate: boolean): void;

  updateFlow(flow: string): void;

  getContents(): Contents[];

  direction(dir: string): void;

  isRendered(): boolean;

  destroy(): void;

  // Event emitters
  emit(type: any, ...args: any[]): void;

  off(type: any, listener: any): any;

  on(type: any, listener: any): any;

  once(type: any, listener: any, ...args: any[]): any;
}
