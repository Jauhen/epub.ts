import EpubCFI from './epubcfi';
import {
  qs,
  qsa,
  querySelectorByType,
  indexOfSorted,
  locationOf,
} from './utils/core';

export interface PageListItem {
  href: string;
  page: string;
  cfi?: string;
  packageUrl?: string;
}

/**
 * Page List Parser
 * @param {document} [xml]
 */
class Pagelist {
  pages: number[] = [];
  locations: string[] = [];
  epubcfi: EpubCFI;
  firstPage: number = 0;
  lastPage: number = 0;
  totalPages: number = 0;
  toc?: any;
  ncx?: any;
  pageList?: PageListItem[];

  constructor(xml?: XMLDocument) {
    this.epubcfi = new EpubCFI();
    if (xml) {
      this.pageList = this.parse(xml);
    }
    if (this.pageList && this.pageList.length) {
      this.process(this.pageList);
    }
  }

  /**
   * Parse PageList Xml
   * @param  {document} xml
   */
  parse(xml: XMLDocument): PageListItem[] {
    const html = qs(xml, 'html');
    const ncx = qs(xml, 'ncx');
    if (html) {
      return this.parseNav(xml);
    } else if (ncx) {
      return this.parseNcx(xml);
    }
    return [];
  }

  /**
   * Parse a Nav PageList
   * @private
   * @param  {node} navHtml
   * @return {PageList.item[]} list
   */
  private parseNav(navHtml: XMLDocument): PageListItem[] {
    const navElement = querySelectorByType(navHtml, 'nav', 'page-list');
    const navItems = navElement ? qsa(navElement, 'li') : [];
    const length = navItems.length;
    const list: PageListItem[] = [];
    if (!navItems || length === 0) return list;
    for (let i = 0; i < length; ++i) {
      const item = this.item(navItems[i]);
      list.push(item);
    }
    return list;
  }

  private parseNcx(navXml: XMLDocument): PageListItem[] {
    const list: PageListItem[] = [];
    const pageList = qs(navXml, 'pageList');
    if (!pageList) return list;
    const pageTargets = qsa(pageList, 'pageTarget');
    const length = pageTargets.length;
    if (!pageTargets || length === 0) {
      return list;
    }
    for (let i = 0; i < length; ++i) {
      const item = this.ncxItem(pageTargets[i]);
      list.push(item);
    }
    return list;
  }

  private ncxItem(item: Element): PageListItem {
    const navLabel = qs(item, 'navLabel');
    const navLabelText = navLabel && qs(navLabel, 'text');
    const pageText = navLabelText ? navLabelText.textContent : '';
    const content = qs(item, 'content');
    const href = content ? content.getAttribute('src') || '' : '';
    const page = pageText ? pageText : '';
    return {
      href: href,
      page: page,
    };
  }

  /**
   * Page List Item
   * @private
   * @param  {node} item
   * @return {object} pageListItem
   */
  private item(item: Element): PageListItem {
    const content = qs(item, 'a');
    const href = content ? content.getAttribute('href') || '' : '';
    const text = content ? content.textContent || '' : '';
    const page = text;
    const isCfi = href.indexOf('epubcfi');
    let split: string[] = [];
    let packageUrl: string | undefined;
    let cfi: string | undefined;
    if (isCfi !== -1) {
      split = href.split('#');
      packageUrl = split[0];
      cfi = split.length > 1 ? split[1] : undefined;
      return {
        cfi: cfi,
        href: href,
        packageUrl: packageUrl,
        page: page,
      };
    } else {
      return {
        href: href,
        page: page,
      };
    }
  }

  /**
   * Process pageList items
   * @private
   * @param  {array} pageList
   */
  private process(pageList: PageListItem[]): void {
    pageList.forEach((item) => {
      this.pages.push(parseInt(item.page, 10));
      if (item.cfi) {
        this.locations.push(item.cfi);
      }
    });
    this.firstPage = this.pages.length > 0 ? this.pages[0] : 0;
    this.lastPage =
      this.pages.length > 0 ? this.pages[this.pages.length - 1] : 0;
    this.totalPages = this.lastPage - this.firstPage;
  }

  /**
   * Get a PageList result from a EpubCFI
   * @param  {string} cfi EpubCFI String
   * @return {number} page
   */
  pageFromCfi(cfi: string): number {
    let pg = -1;
    if (this.locations.length === 0) {
      return -1;
    }
    const index = indexOfSorted(cfi, this.locations, this.epubcfi.compare);
    if (index !== -1) {
      pg = this.pages[index];
    } else {
      const loc = locationOf(cfi, this.locations, this.epubcfi.compare);
      pg = loc - 1 >= 0 ? this.pages[loc - 1] : this.pages[0];
      if (pg === undefined) {
        pg = -1;
      }
    }
    return pg;
  }

  /**
   * Get an EpubCFI from a Page List Item
   * @param  {string | number} pg
   * @return {string} cfi
   */
  cfiFromPage(pg: string | number): string {
    const pageNum: number = typeof pg === 'number' ? pg : parseInt(pg, 10);
    let cfi = '';
    const index = this.pages.indexOf(pageNum);
    if (index !== -1) {
      cfi = this.locations[index];
    }
    return cfi;
  }

  /**
   * Get a Page from Book percentage
   * @param  {number} percent
   * @return {number} page
   */
  pageFromPercentage(percent: number): number {
    const pg = Math.round(this.totalPages * percent);
    return pg;
  }

  /**
   * Returns a value between 0 - 1 corresponding to the location of a page
   * @param  {number} pg the page
   * @return {number} percentage
   */
  percentageFromPage(pg: number): number {
    const percentage = (pg - this.firstPage) / this.totalPages;
    return Math.round(percentage * 1000) / 1000;
  }

  /**
   * Returns a value between 0 - 1 corresponding to the location of a cfi
   * @param  {string} cfi EpubCFI String
   * @return {number} percentage
   */
  percentageFromCfi(cfi: string): number {
    const pg = this.pageFromCfi(cfi);
    const percentage = this.percentageFromPage(pg);
    return percentage;
  }

  /**
   * Destroy
   */
  destroy(): void {
    // @ts-ignore
    this.pages = undefined;
    // @ts-ignore
    this.locations = undefined;
    // @ts-ignore
    this.epubcfi = undefined;
    // @ts-ignore
    this.pageList = undefined;
    // @ts-ignore
    this.toc = undefined;
    // @ts-ignore
    this.ncx = undefined;
  }
}

export default Pagelist;
