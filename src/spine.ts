import EpubCFI from './epubcfi';
import Hook, { HooksObject } from './utils/hook';
import Section from './section';
import {
  replaceBase,
  replaceCanonical,
  replaceMeta,
} from './utils/replacements';

/**
 * A collection of Spine Items
 */
import type Packaging from './packaging';
import type { PackagingManifestObject } from './packaging';

class Spine {
  spineItems: Section[] = [];
  spineByHref: { [key: string]: number } = {};
  spineById: { [key: string]: number } = {};
  hooks: HooksObject;
  epubcfi: EpubCFI;
  loaded: boolean = false;
  items: any[] = [];
  manifest: PackagingManifestObject | undefined;
  spineNodeIndex: number | undefined;
  baseUrl: string | undefined;
  length: number | undefined;

  constructor() {
    this.spineItems = [];
    this.spineByHref = {};
    this.spineById = {};

    this.hooks = {} as HooksObject;
    this.hooks.serialize = new Hook(this);
    this.hooks.content = new Hook(this);

    // Register replacements
    this.hooks.content.register(replaceBase);
    this.hooks.content.register(replaceCanonical);
    this.hooks.content.register(replaceMeta);

    this.epubcfi = new EpubCFI();

    this.loaded = false;

    this.items = [];
    this.manifest = undefined;
    this.spineNodeIndex = undefined;
    this.baseUrl = undefined;
    this.length = undefined;
  }

  /**
   * Unpack items from a opf into spine items
   * @param  {Packaging} _package
   * @param  {method} resolver URL resolver
   * @param  {method} canonical Resolve canonical url
   */
  unpack(
    _package: Packaging,
    resolver: (href: string, abs?: boolean) => string,
    canonical: (href: string) => string,
  ): void {
    // @ts-ignore
    this.items = _package.spine;
    // @ts-ignore
    this.manifest = _package.manifest;
    // @ts-ignore
    this.spineNodeIndex = _package.spineNodeIndex;
    // @ts-ignore
    this.baseUrl =
      (_package as any).baseUrl || (_package as any).basePath || '';
    this.length = this.items.length;

    this.items.forEach((item: any, index: number) => {
      const manifestItem = this.manifest
        ? this.manifest[item.idref]
        : undefined;
      let spineItem;

      item.index = index;
      item.cfiBase = this.epubcfi.generateChapterComponent(
        this.spineNodeIndex ?? 0,
        item.index,
        item.id,
      );

      if (item.href) {
        item.url = resolver(item.href, true);
        item.canonical = canonical(item.href);
      }

      if (manifestItem) {
        item.href = manifestItem.href;
        item.url = resolver(item.href, true);
        item.canonical = canonical(item.href);
        if (manifestItem.properties && manifestItem.properties.length) {
          if (!item.properties) item.properties = [];
          item.properties.push.apply(item.properties, manifestItem.properties);
        }
      }

      if (item.linear === 'yes') {
        item.prev = () => {
          let prevIndex = item.index;
          while (prevIndex > 0) {
            const prev = this.get(prevIndex - 1);
            if (prev && prev.linear) {
              return prev;
            }
            prevIndex -= 1;
          }
          return undefined;
        };
        item.next = () => {
          let nextIndex = item.index;
          while (nextIndex < this.spineItems.length - 1) {
            const next = this.get(nextIndex + 1);
            if (next && next.linear) {
              return next;
            }
            nextIndex += 1;
          }
          return undefined;
        };
      } else {
        item.prev = () => undefined;
        item.next = () => undefined;
      }

      spineItem = new Section(item, this.hooks);
      this.append(spineItem);
    });
    this.loaded = true;
  }

  /**
   * Get an item from the spine
   * @param  {string|number} [target]
   * @return {Section} section
   * @example spine.get();
   * @example spine.get(1);
   * @example spine.get("chap1.html");
   * @example spine.get("#id1234");
   */
  get(target?: string | number): Section | null {
    let index = 0;
    if (typeof target === 'undefined') {
      while (index < this.spineItems.length) {
        const next = this.spineItems[index];
        if (next && next.linear) {
          break;
        }
        index += 1;
      }
    } else if (typeof target === 'string' && this.epubcfi.isCfiString(target)) {
      const cfi = new EpubCFI(target);
      index = cfi.spinePos;
    } else if (typeof target === 'number') {
      index = target;
    } else if (typeof target === 'string' && target.indexOf('#') === 0) {
      index = this.spineById[target.substring(1)];
    } else if (typeof target === 'string') {
      // Remove fragments
      target = target.split('#')[0];
      index = this.spineByHref[target] || this.spineByHref[encodeURI(target)];
    }
    return this.spineItems[index] || null;
  }

  /**
   * Append a Section to the Spine
   * @private
   * @param  {Section} section
   */
  private append(section: Section): number {
    const index = this.spineItems.length;
    section.index = index;
    this.spineItems.push(section);
    // Encode and Decode href lookups
    if (section.href) {
      this.spineByHref[decodeURI(section.href)] = index;
      this.spineByHref[encodeURI(section.href)] = index;
      this.spineByHref[section.href] = index;
    }
    this.spineById[section.idref] = index;
    return index;
  }

  /**
   * Prepend a Section to the Spine
   * @private
   * @param  {Section} section
   */
  private prepend(section: Section): number {
    // var index = this.spineItems.unshift(section);
    if (section.href) {
      this.spineByHref[section.href] = 0;
    }
    this.spineById[section.idref] = 0;
    // Re-index
    this.spineItems.forEach((item, index) => {
      item.index = index;
    });
    return 0;
  }

  // insert(section, index) {
  //
  // };

  /**
   * Remove a Section from the Spine
   * @private
   * @param  {Section} section
   */
  private remove(section: Section): number {
    const index = this.spineItems.indexOf(section);
    if (index > -1) {
      if (section.href) {
        delete this.spineByHref[section.href];
      }
      delete this.spineById[section.idref];
      this.spineItems.splice(index, 1);
      return index;
    }
    return -1;
  }

  /**
   * Loop over the Sections in the Spine
   * @return {method} forEach
   */
  each(...args: any[]): any {
    // @ts-ignore
    return this.spineItems.forEach.apply(this.spineItems, args);
  }

  /**
   * Find the first Section in the Spine
   * @return {Section} first section
   */
  first(): Section | undefined {
    let index = 0;
    do {
      const next = this.get(index);
      if (next && next.linear) {
        return next;
      }
      index += 1;
    } while (index < this.spineItems.length);
    return undefined;
  }

  /**
   * Find the last Section in the Spine
   * @return {Section} last section
   */
  last(): Section | undefined {
    let index = this.spineItems.length - 1;
    do {
      const prev = this.get(index);
      if (prev && prev.linear) {
        return prev;
      }
      index -= 1;
    } while (index >= 0);
    return undefined;
  }

  destroy(): void {
    this.each((section: Section) => section.destroy());
    // @ts-ignore
    this.spineItems = undefined;
    // @ts-ignore
    this.spineByHref = undefined;
    // @ts-ignore
    this.spineById = undefined;
    this.hooks.serialize.clear();
    this.hooks.content.clear();
    // @ts-ignore
    this.hooks = undefined;
    // @ts-ignore
    this.epubcfi = undefined;
    this.loaded = false;
    // @ts-ignore
    this.items = undefined;
    // @ts-ignore
    this.manifest = undefined;
    // @ts-ignore
    this.spineNodeIndex = undefined;
    // @ts-ignore
    this.baseUrl = undefined;
    // @ts-ignore
    this.length = undefined;
  }
}

export default Spine;
