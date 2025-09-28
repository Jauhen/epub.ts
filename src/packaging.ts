import { qs, qsa, qsp, indexOfElementNode } from './utils/core';
import { type SpineItem } from './section';

export interface PackagingObject {
  metadata: PackagingMetadataObject;
  spine: SpineItem[];
  manifest: PackagingManifestObject;
  navPath: string;
  ncxPath: string;
  coverPath: string;
  spineNodeIndex: number;
  toc?: XMLDocument;
}

export interface PackagingMetadataObject {
  title: string;
  creator: string;
  description: string;
  pubdate: string;
  publisher: string;
  media_active_class: string;
  identifier: string;
  language: string;
  rights: string;
  modified_date: string;
  layout: string;
  orientation: string;
  flow: string;
  viewport: string;
  spread: string;
  direction: string;
}

export interface PackagingManifestItem {
  href: string;
  type: string;
  properties: string[];
  overlay: string;
}

export type PackagingManifestObject = Record<string, PackagingManifestItem>;

/**
 * Open Packaging Format Parser
 * @class
 * @param {document} packageDocument OPF XML
 */
class Packaging {
  manifest: PackagingManifestObject;
  navPath: string;
  ncxPath: string;
  coverPath: string;
  spineNodeIndex: number;
  spine: SpineItem[];
  metadata: PackagingMetadataObject;
  // Optionally store toc if needed by load()
  toc?: XMLDocument;

  constructor(packageDocument?: XMLDocument) {
    this.manifest = {};
    this.navPath = '';
    this.ncxPath = '';
    this.coverPath = '';
    this.spineNodeIndex = 0;
    this.spine = [];
    // Initialize with empty strings for all required fields
    this.metadata = {
      title: '',
      creator: '',
      description: '',
      pubdate: '',
      publisher: '',
      identifier: '',
      language: '',
      rights: '',
      modified_date: '',
      layout: '',
      orientation: '',
      flow: '',
      viewport: '',
      media_active_class: '',
      spread: '',
      direction: '',
    };
    if (packageDocument) {
      this.parse(packageDocument);
    }
  }

  /**
   * Parse OPF XML
   * @param  {document} packageDocument OPF XML
   * @return {object} parsed package parts
   */
  parse(packageDocument: XMLDocument): PackagingObject {
    let metadataNode, manifestNode, spineNode;

    if (!packageDocument) {
      throw new Error('Package File Not Found');
    }

    metadataNode = qs(packageDocument, 'metadata');
    if (!metadataNode) {
      throw new Error('No Metadata Found');
    }

    manifestNode = qs(packageDocument, 'manifest');
    if (!manifestNode) {
      throw new Error('No Manifest Found');
    }

    spineNode = qs(packageDocument, 'spine');
    if (!spineNode) {
      throw new Error('No Spine Found');
    }

    this.manifest = this.parseManifest(manifestNode);
    this.navPath = this.findNavPath(manifestNode) || '';
    this.ncxPath = this.findNcxPath(manifestNode, spineNode) || '';
    this.coverPath = this.findCoverPath(packageDocument) || '';

    this.spineNodeIndex = indexOfElementNode(spineNode);

    this.spine = this.parseSpine(spineNode, this.manifest);

    // Remove this.uniqueIdentifier assignment (not declared in class)
    // this.uniqueIdentifier = this.findUniqueIdentifier(packageDocument);
    this.metadata = this.parseMetadata(metadataNode);

    const dir = spineNode.getAttribute('page-progression-direction');
    if (dir) this.metadata.direction = dir;

    return {
      metadata: this.metadata,
      spine: this.spine,
      manifest: this.manifest,
      navPath: this.navPath,
      ncxPath: this.ncxPath,
      coverPath: this.coverPath,
      spineNodeIndex: this.spineNodeIndex,
    };
  }

  /**
   * Parse Metadata
   * @private
   * @param  {node} xml
   * @return {object} metadata
   */
  private parseMetadata(xml: Node): PackagingMetadataObject {
    // Fill all required fields with empty string by default
    const metadata: PackagingMetadataObject = {
      title: '',
      creator: '',
      description: '',
      pubdate: '',
      publisher: '',
      identifier: '',
      language: '',
      rights: '',
      modified_date: '',
      layout: '',
      orientation: '',
      flow: '',
      viewport: '',
      media_active_class: '',
      spread: '',
      direction: '',
    };

    metadata.title = this.getElementText(xml, 'title');
    metadata.creator = this.getElementText(xml, 'creator');
    metadata.description = this.getElementText(xml, 'description');
    metadata.pubdate = this.getElementText(xml, 'date');
    metadata.publisher = this.getElementText(xml, 'publisher');
    metadata.identifier = this.getElementText(xml, 'identifier');
    metadata.language = this.getElementText(xml, 'language');
    metadata.rights = this.getElementText(xml, 'rights');
    metadata.modified_date = this.getPropertyText(xml, 'dcterms:modified');
    metadata.layout = this.getPropertyText(xml, 'rendition:layout');
    metadata.orientation = this.getPropertyText(xml, 'rendition:orientation');
    metadata.flow = this.getPropertyText(xml, 'rendition:flow');
    metadata.viewport = this.getPropertyText(xml, 'rendition:viewport');
    metadata.media_active_class = this.getPropertyText(
      xml,
      'media:active-class',
    );
    // media_active_class is not in PackagingMetadataObject, so skip
    metadata.spread = this.getPropertyText(xml, 'rendition:spread');
    // direction is set in parse()
    return metadata;
  }

  /**
   * Parse Manifest
   * @private
   * @param  {node} manifestXml
   * @return {object} manifest
   */
  private parseManifest(manifestXml: Element): PackagingManifestObject {
    const manifest: PackagingManifestObject = {};
    const selected = qsa(manifestXml, 'item');
    const items = Array.prototype.slice.call(selected) as Element[];
    items.forEach((item: Element) => {
      const id = item.getAttribute('id') || '';
      const href = item.getAttribute('href') || '';
      const type = item.getAttribute('media-type') || '';
      const overlay = item.getAttribute('media-overlay') || '';
      const properties = item.getAttribute('properties') || '';
      manifest[id] = {
        href,
        type,
        overlay,
        properties: properties.length ? properties.split(' ') : [],
      };
    });
    return manifest;
  }

  /**
   * Parse Spine
   * @private
   * @param  {node} spineXml
   * @param  {Packaging.manifest} manifest
   * @return {object} spine
   */
  private parseSpine(
    spineXml: Node,
    manifest: PackagingManifestObject,
  ): SpineItem[] {
    const spine: SpineItem[] = [];
    const selected = qsa(spineXml as Element, 'itemref');
    const items = Array.prototype.slice.call(selected) as Element[];
    // var cfiBase = epubcfi.generateChapterComponent(spineNodeIndex, index, Id);
    // var manifestProps = manifest[Id].properties;
    // var manifestPropArray = manifestProps.length ? manifestProps.split(" ") : [];

    items.forEach((item: Element, index: number) => {
      const props = item.getAttribute('properties') || '';
      const propArray = props.length ? props.split(' ') : [];
      spine.push({
        id: item.getAttribute('id') || item.getAttribute('idref') || undefined,
        idref: item.getAttribute('idref') || '',
        linear: item.getAttribute('linear') || 'yes',
        properties: propArray,
        index,
        // "href" : manifest[Id].href,
        // "url" :  manifest[Id].url,
        // "cfiBase" : cfiBase
      });
    });
    return spine;
  }

  /**
   * Find Unique Identifier
   * @private
   * @param  {node} packageXml
   * @return {string} Unique Identifier text
   */
  findUniqueIdentifier(packageXml: XMLDocument): string {
    const uniqueIdentifierId =
      packageXml.documentElement.getAttribute('unique-identifier');
    if (!uniqueIdentifierId) {
      return '';
    }
    const identifier = packageXml.getElementById(uniqueIdentifierId);
    if (!identifier) {
      return '';
    }

    if (
      identifier.localName === 'identifier' &&
      identifier.namespaceURI === 'http://purl.org/dc/elements/1.1/'
    ) {
      if (identifier.childNodes.length > 0) {
        const val = identifier.childNodes[0].nodeValue;
        return val ? val.trim() : '';
      }
      return '';
    }

    return '';
  }

  /**
   * Find TOC NAV
   * @private
   * @param {element} manifestNode
   * @return {string}
   */
  private findNavPath(manifestNode: Element): string | false {
    // Find item with property "nav"
    // Should catch nav regardless of order
    // var node = manifestNode.querySelector("item[properties$='nav'], item[properties^='nav '], item[properties*=' nav ']");
    const node = qsp(manifestNode, 'item', { properties: 'nav' });
    const href = node ? node.getAttribute('href') : null;
    return href !== null ? href : false;
  }

  /**
   * Find TOC NCX
   * media-type="application/x-dtbncx+xml" href="toc.ncx"
   * @private
   * @param {element} manifestNode
   * @param {element} spineNode
   * @return {string}
   */
  private findNcxPath(
    manifestNode: Element,
    spineNode: Element,
  ): string | false {
    // var node = manifestNode.querySelector("item[media-type='application/x-dtbncx+xml']");
    let node = qsp(manifestNode, 'item', {
      'media-type': 'application/x-dtbncx+xml',
    });
    let tocId;
    if (!node) {
      tocId = spineNode.getAttribute('toc');
      if (tocId) {
        node = manifestNode.querySelector(`#${tocId}`);
      }
    }
    const href = node ? node.getAttribute('href') : null;
    return href !== null ? href : false;
  }

  /**
   * Find the Cover Path
   * <item properties="cover-image" id="ci" href="cover.svg" media-type="image/svg+xml" />
   * Fallback for Epub 2.0
   * @private
   * @param  {node} packageXml
   * @return {string} href
   */
  private findCoverPath(packageXml: XMLDocument): string | false {
    const pkg = qs(packageXml, 'package');
    const epubVersion = pkg ? pkg.getAttribute('version') : null;
    const node = qsp(packageXml, 'item', { properties: 'cover-image' });
    const href = node ? node.getAttribute('href') : null;
    if (href !== null) return href;
    // Fallback to epub 2.
    const metaCover = qsp(packageXml, 'meta', { name: 'cover' });
    if (metaCover) {
      const coverId = metaCover.getAttribute('content');
      if (coverId) {
        const cover = packageXml.getElementById(coverId);
        const coverHref = cover ? cover.getAttribute('href') : null;
        return coverHref !== null ? coverHref : '';
      }
      return '';
    }
    return false;
  }

  /**
   * Get text of a namespaced element
   * @private
   * @param  {node} xml
   * @param  {string} tag
   * @return {string} text
   */
  private getElementText(xml: Node, tag: string): string {
    // @ts-ignore: getElementsByTagNameNS is not on Node, but on Element/Document
    const found = (xml as Element).getElementsByTagNameNS(
      'http://purl.org/dc/elements/1.1/',
      tag,
    );
    if (!found || found.length === 0) return '';
    const el = found[0];
    if (el.childNodes.length && el.childNodes[0].nodeValue) {
      return el.childNodes[0].nodeValue;
    }
    return '';
  }

  /**
   * Get text by property
   * @private
   * @param  {node} xml
   * @param  {string} property
   * @return {string} text
   */
  private getPropertyText(xml: Node, property: string): string {
    const el = qsp(xml as Element, 'meta', { property: property });
    if (el && el.childNodes.length && el.childNodes[0].nodeValue) {
      return el.childNodes[0].nodeValue;
    }
    return '';
  }

  /**
   * Load JSON Manifest
   * @param  {document} packageDocument OPF XML
   * @return {object} parsed package parts
   */
  load(json: any): PackagingObject {
    this.metadata = json.metadata;
    const spine = json.readingOrder || json.spine || [];
    this.spine = spine.map((item: any, index: number) => {
      item.index = index;
      item.linear = item.linear || 'yes'; // not in PackagingSpineItem
      return {
        idref: item.idref || '',
        properties: item.properties || [],
        linear: item.linear,
        index,
      };
    });
    if (json.resources) {
      json.resources.forEach((item: any, index: number) => {
        this.manifest[index] = item;
        if (item.rel && item.rel[0] === 'cover') {
          this.coverPath = item.href;
        }
      });
    }
    this.spineNodeIndex = 0;
    if (json.toc) {
      this.toc = json.toc.map((item: any) => {
        item.label = item.title;
        return item;
      });
    }
    return {
      metadata: this.metadata,
      spine: this.spine,
      manifest: this.manifest,
      navPath: this.navPath,
      ncxPath: this.ncxPath,
      coverPath: this.coverPath,
      spineNodeIndex: this.spineNodeIndex,
      toc: this.toc,
    };
  }

  destroy(): void {
    this.manifest = {};
    this.navPath = '';
    this.ncxPath = '';
    this.coverPath = '';
    this.spineNodeIndex = 0;
    this.spine = [];
    this.metadata = {
      title: '',
      creator: '',
      description: '',
      pubdate: '',
      publisher: '',
      identifier: '',
      language: '',
      rights: '',
      modified_date: '',
      layout: '',
      orientation: '',
      flow: '',
      viewport: '',
      media_active_class: '',
      spread: '',
      direction: '',
    };
    this.toc = undefined;
  }
}

export default Packaging;
