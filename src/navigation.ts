import { qs, qsa, querySelectorByType, filterChildren } from './utils/core';

export interface NavItem {
  id: string;
  href: string;
  label: string;
  subitems?: NavItem[];
  parent?: string;
}

export interface LandmarkItem {
  href?: string;
  label?: string;
  type?: string;
}

/**
 * Navigation Parser
 * @param {document} xml navigation html / xhtml / ncx
 */
class Navigation {
  toc: NavItem[] = [];
  tocByHref: Record<string, number> = {};
  tocById: Record<string, number> = {};
  landmarks: LandmarkItem[] = [];
  landmarksByType: Record<string, number> = {};
  length = 0;

  constructor(xml?: XMLDocument) {
    if (xml) {
      this.parse(xml);
    }
  }

  /**
   * Parse out the navigation items
   * @param {document} xml navigation html / xhtml / ncx
   */
  parse(xml: XMLDocument): void {
    const isXml = xml && typeof xml.nodeType === 'number';
    let html: Element | null = null;
    let ncx: Element | null = null;

    if (isXml) {
      html = qs(xml, 'html');
      ncx = qs(xml, 'ncx');
    }

    if (!isXml) {
      this.toc = this.load(xml);
    } else if (html) {
      this.toc = this.parseNav(xml);
      this.landmarks = this.parseLandmarks(xml);
    } else if (ncx) {
      this.toc = this.parseNcx(xml);
    }

    this.length = 0;
    this.unpack(this.toc);
  }

  /**
   * Unpack navigation items
   * @private
   * @param  {array} toc
   */
  private unpack(toc: NavItem[]): void {
    let item: NavItem;
    for (let i = 0; i < toc.length; i++) {
      item = toc[i];
      if (item.href) {
        this.tocByHref[item.href] = i;
      }
      if (item.id) {
        this.tocById[item.id] = i;
      }
      this.length++;
      if (item.subitems && item.subitems.length) {
        this.unpack(item.subitems);
      }
    }
  }

  /**
   * Get an item from the navigation
   * @param  {string} target
   * @return {object} navItem
   */
  get(target: string): NavItem[] | NavItem | undefined {
    let index: number | undefined;
    if (!target) {
      // TypeScript: toc is NavItem[]
      return this.toc as NavItem[];
    }
    if (target.indexOf('#') === 0) {
      index = this.tocById[target.substring(1)];
    } else if (target in this.tocByHref) {
      index = this.tocByHref[target];
    }
    return this.getByIndex(target, index, this.toc);
  }

  /**
   * Get an item from navigation subitems recursively by index
   * @param  {string} target
   * @param  {number} index
   * @param  {array} navItems
   * @return {object} navItem
   */
  private getByIndex(
    target: string,
    index: number | undefined,
    navItems: NavItem[],
  ): NavItem | undefined {
    if (!navItems || navItems.length === 0 || typeof index !== 'number') {
      return undefined;
    }
    const item = navItems[index];
    if (item && (target === item.id || target === item.href)) {
      return item;
    } else {
      let result: NavItem | undefined;
      for (let i = 0; i < navItems.length; ++i) {
        if (navItems[i].subitems) {
          result = this.getByIndex(target, index, navItems[i].subitems!);
          if (result) {
            break;
          }
        }
      }
      return result;
    }
  }

  /**
   * Get a landmark by type
   * List of types: https://idpf.github.io/epub-vocabs/structure/
   * @param  {string} type
   * @return {object} landmarkItem
   */
  landmark(type: string): LandmarkItem[] | LandmarkItem {
    if (!type) {
      // TypeScript: landmarks is LandmarkItem[]
      return this.landmarks as LandmarkItem[];
    }
    const index = this.landmarksByType[type];
    return this.landmarks[index];
  }

  /**
   * Parse toc from a Epub > 3.0 Nav
   * @private
   * @param  {document} navHtml
   * @return {array} navigation list
   */
  private parseNav(navHtml: XMLDocument): NavItem[] {
    const navElement = querySelectorByType(navHtml, 'nav', 'toc');
    let list: NavItem[] = [];
    if (!navElement) return list;
    const navList = filterChildren(navElement, 'ol', true) as Element | null;
    if (!navList) return list;
    list = this.parseNavList(navList);
    return list;
  }

  /**
   * Parses lists in the toc
   * @param  {document} navListHtml
   * @param  {string} parent id
   * @return {array} navigation list
   */
  private parseNavList(navListHtml: Element, parent?: string): NavItem[] {
    const result: NavItem[] = [];
    if (!navListHtml) return result;
    if (!navListHtml.children) return result;
    for (let i = 0; i < navListHtml.children.length; i++) {
      const item = this.navItem(navListHtml.children[i], parent);
      if (item) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Create a navItem
   * @private
   * @param  {element} item
   * @return {object} navItem
   */
  private navItem(item: Element, parent?: string): NavItem | undefined {
    let id = item.getAttribute('id') || undefined;
    const content =
      (filterChildren(item, 'a', true) as Element | null) ||
      (filterChildren(item, 'span', true) as Element | null);
    if (!content) {
      return undefined;
    }
    const src = content.getAttribute('href') || '';
    if (!id) {
      id = src;
    }
    const text = content.textContent || '';
    let subitems: NavItem[] = [];
    const nested = filterChildren(item, 'ol', true) as Element | null;
    if (nested) {
      subitems = this.parseNavList(nested, id);
    }
    return {
      id: id!,
      href: src,
      label: text,
      subitems: subitems,
      parent: parent,
    };
  }

  /**
   * Parse landmarks from a Epub > 3.0 Nav
   * @private
   * @param  {document} navHtml
   * @return {array} landmarks list
   */
  private parseLandmarks(navHtml: XMLDocument): LandmarkItem[] {
    const navElement = querySelectorByType(navHtml, 'nav', 'landmarks');
    const navItems = navElement ? qsa(navElement, 'li') : [];
    const length = navItems.length;
    const list: LandmarkItem[] = [];
    if (!navItems || length === 0) return list;
    for (let i = 0; i < length; ++i) {
      const item = this.landmarkItem(navItems[i]);
      if (item) {
        list.push(item);
        if (item.type) {
          this.landmarksByType[item.type] = i;
        }
      }
    }
    return list;
  }

  /**
   * Create a landmarkItem
   * @private
   * @param  {element} item
   * @return {object} landmarkItem
   */
  private landmarkItem(item: Element): LandmarkItem | undefined {
    const content = filterChildren(item, 'a', true) as Element | null;
    if (!content) {
      return undefined;
    }
    const type =
      content.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ||
      undefined;
    const href = content.getAttribute('href') || '';
    const text = content.textContent || '';
    return {
      href: href,
      label: text,
      type: type,
    };
  }

  /**
   * Parse from a Epub > 3.0 NC
   * @private
   * @param  {document} navHtml
   * @return {array} navigation list
   */
  private parseNcx(tocXml: XMLDocument): NavItem[] {
    const navPoints = qsa(tocXml, 'navPoint');
    const length = navPoints.length;
    const toc: Record<string, NavItem> = {};
    const list: NavItem[] = [];
    if (!navPoints || length === 0) return list;
    for (let i = 0; i < length; ++i) {
      const item = this.ncxItem(navPoints[i]);
      toc[item.id] = item;
      if (!item.parent) {
        list.push(item);
      } else {
        const parent = toc[item.parent];
        if (parent && parent.subitems) {
          parent.subitems.push(item);
        }
      }
    }
    return list;
  }

  /**
   * Create a ncxItem
   * @private
   * @param  {element} item
   * @return {object} ncxItem
   */
  private ncxItem(item: Element): NavItem {
    const id = item.getAttribute('id') || '';
    const content = qs(item, 'content') as Element;
    const src = content ? content.getAttribute('src') || '' : '';
    const navLabel = qs(item, 'navLabel') as Element;
    const text = navLabel && navLabel.textContent ? navLabel.textContent : '';
    const subitems: NavItem[] = [];
    const parentNode = item.parentNode as Element | null;
    let parent: string | undefined = undefined;
    if (
      parentNode &&
      (parentNode.nodeName === 'navPoint' ||
        parentNode.nodeName.split(':').slice(-1)[0] === 'navPoint')
    ) {
      parent = parentNode.getAttribute('id') || undefined;
    }
    return {
      id: id,
      href: src,
      label: text,
      subitems: subitems,
      parent: parent,
    };
  }

  /**
   * Load Spine Items
   * @param  {object} json the items to be loaded
   * @return {Array} navItems
   */
  load(json: any): NavItem[] {
    return json.map((item: any) => {
      item.label = item.title;
      item.subitems = item.children ? this.load(item.children) : [];
      return item as NavItem;
    });
  }

  /**
   * forEach pass through
   * @param  {Function} fn function to run on each item
   * @return {method} forEach loop
   */
  forEach(fn: (item: NavItem) => void): void {
    this.toc.forEach(fn);
  }
}

export default Navigation;
