import { substitute } from './utils/replacements';
import { createBase64Url, createBlobUrl, blob2base64 } from './utils/core';
import Url from './utils/url';
import mime from './utils/mime';
import Path from './utils/path';
import path from 'path-webpack';
import type { PackagingManifestObject } from './packaging';
import type Archive from './archive';

/**
 * Handle Package Resources
 * @class
 * @param {Manifest} manifest
 * @param {object} [options]
 * @param {string} [options.replacements="base64"]
 * @param {Archive} [options.archive]
 * @param {method} [options.resolver]
 */
interface ResourcesOptions {
  replacements?: string;
  archive?: Archive;
  resolver?: (url: string) => string;
  request?: (url: string, type?: string) => Promise<any>;
}

interface ResourceItem {
  href: string;
  type: string;
  [key: string]: any;
}

class Resources {
  settings: ResourcesOptions;
  manifest!: PackagingManifestObject;
  resources!: ResourceItem[];
  replacementUrls!: string[];
  html!: ResourceItem[];
  assets!: ResourceItem[];
  css!: ResourceItem[];
  urls!: string[];
  cssUrls!: string[];

  constructor(
    manifest: PackagingManifestObject,
    options: ResourcesOptions = {},
  ) {
    this.settings = {
      replacements: options.replacements || 'base64',
      archive: options.archive,
      resolver: options.resolver,
      request: options.request,
    };
    this.process(manifest);
  }

  /**
   * Process resources
   * @param {Manifest} manifest
   */
  process(manifest: PackagingManifestObject): void {
    this.manifest = manifest;
    this.resources = Object.keys(manifest).map((key) => manifest[key]);
    this.replacementUrls = [];
    this.html = [];
    this.assets = [];
    this.css = [];
    this.urls = [];
    this.cssUrls = [];
    this.split();
    this.splitUrls();
  }

  /**
   * Split resources by type
   * @private
   */
  private split(): void {
    // HTML
    this.html = this.resources.filter(
      (item: ResourceItem) =>
        item.type === 'application/xhtml+xml' || item.type === 'text/html',
    );
    // Exclude HTML
    this.assets = this.resources.filter(
      (item: ResourceItem) =>
        item.type !== 'application/xhtml+xml' && item.type !== 'text/html',
    );
    // Only CSS
    this.css = this.resources.filter(
      (item: ResourceItem) => item.type === 'text/css',
    );
  }

  /**
   * Convert split resources into Urls
   * @private
   */
  private splitUrls(): void {
    // All Assets Urls
    this.urls = this.assets.map((item: ResourceItem) => item.href);
    // Css Urls
    this.cssUrls = this.css.map((item: ResourceItem) => item.href);
  }

  /**
   * Create a url to a resource
   * @param {string} url
   * @return {Promise<string>} Promise resolves with url string
   */
  createUrl(url: string): Promise<string> {
    const parsedUrl = new Url(url);
    const mimeType = mime.lookup(parsedUrl.filename || '');
    if (this.settings.archive) {
      return this.settings.archive.createUrl(url, {
        base64: this.settings.replacements === 'base64',
      });
    } else if (this.settings.request) {
      if (this.settings.replacements === 'base64') {
        return this.settings
          .request(url, 'blob')
          .then((blob: Blob) => blob2base64(blob) as Promise<string>)
          .then((blob: string) => createBase64Url(blob, mimeType) as string);
      } else {
        return this.settings
          .request(url, 'blob')
          .then((blob: Blob) => createBlobUrl(blob, mimeType) as string);
      }
    }
    return Promise.reject('No archive or request method provided');
  }

  /**
   * Create blob urls for all the assets
   * @return {Promise}         returns replacement urls
   */
  replacements(): Promise<string[]> {
    if (this.settings.replacements === 'none') {
      return Promise.resolve(this.urls);
    }
    const replacements = this.urls.map((url: string) => {
      const absolute = this.settings.resolver
        ? this.settings.resolver(url)
        : url;
      return this.createUrl(absolute).catch((err) => {
        console.error(err);
        return null;
      });
    });
    return Promise.all(replacements).then(
      (replacementUrls: (string | null)[]) => {
        this.replacementUrls = replacementUrls.filter(
          (url): url is string => typeof url === 'string',
        );
        return replacementUrls as string[];
      },
    );
  }

  /**
   * Replace URLs in CSS resources
   * @private
   * @param  {Archive} [archive]
   * @param  {method} [resolver]
   * @return {Promise}
   */
  replaceCss(
    archive?: Archive,
    resolver?: (url: string) => string,
  ): Promise<string[]> {
    const replaced: Promise<any>[] = [];
    archive = archive || this.settings.archive;
    resolver = resolver || this.settings.resolver;
    this.cssUrls.forEach((href: string) => {
      const replacement = this.createCssFile(href).then((replacementUrl) => {
        const indexInUrls = this.urls.indexOf(href);
        if (indexInUrls > -1 && replacementUrl) {
          this.replacementUrls[indexInUrls] = replacementUrl;
        }
      });
      replaced.push(replacement);
    });
    return Promise.all(replaced).then(() => this.replacementUrls);
  }

  /**
   * Create a new CSS file with the replaced URLs
   * @private
   * @param  {string} href the original css file
   * @return {Promise}  returns a BlobUrl to the new CSS file or a data url
   */
  private createCssFile(href: string): Promise<string> {
    let newUrl = '';
    if (path.isAbsolute(href)) {
      return Promise.resolve('');
    }
    const absolute = this.settings.resolver
      ? this.settings.resolver(href)
      : href;
    // Get the text of the css file from the archive
    let textResponse: Promise<string>;
    if (this.settings.archive) {
      textResponse =
        this.settings.archive.getText(absolute) || Promise.resolve('');
    } else if (this.settings.request) {
      textResponse = this.settings.request(absolute, 'text');
    } else {
      return Promise.resolve('');
    }
    // Get asset links relative to css file
    const relUrls = this.urls.map((assetHref: string) => {
      const resolved = this.settings.resolver
        ? this.settings.resolver(assetHref)
        : assetHref;
      const relative = new Path(absolute).relative(resolved);
      return relative;
    });
    if (!textResponse) {
      // file not found, don't replace
      return Promise.resolve('');
    }
    return textResponse.then(
      (text: string) => {
        // Replacements in the css text
        text = substitute(text, relUrls, this.replacementUrls);
        // Get the new url
        if (this.settings.replacements === 'base64') {
          newUrl = createBase64Url(text, 'text/css') as string;
        } else {
          newUrl = createBlobUrl(text, 'text/css') as string;
        }
        return newUrl;
      },
      () => {
        // handle response errors
        return '';
      },
    );
  }

  /**
   * Resolve all resources URLs relative to an absolute URL
   * @param  {string} absolute to be resolved to
   * @param  {resolver} [resolver]
   * @return {string[]} array with relative Urls
   */
  relativeTo(absolute: string, resolver?: (url: string) => string): string[] {
    resolver = resolver || this.settings.resolver;
    // Get Urls relative to current sections
    return this.urls.map((href: string) => {
      const resolved = resolver ? resolver(href) : href;
      const relative = new Path(absolute).relative(resolved);
      return relative;
    });
  }

  /**
   * Get a URL for a resource
   * @param  {string} path
   * @return {string} url
   */
  get(path: string): Promise<string> {
    const indexInUrls = this.urls.indexOf(path);
    if (indexInUrls === -1) {
      return Promise.resolve('');
    }
    if (this.replacementUrls.length) {
      return Promise.resolve(this.replacementUrls[indexInUrls]);
    } else {
      return this.createUrl(path);
    }
  }

  /**
   * Substitute urls in content, with replacements,
   * relative to a url if provided
   * @param  {string} content
   * @param  {string} [url]   url to resolve to
   * @return {string}         content with urls substituted
   */
  substitute(content: string, url?: string): string {
    let relUrls: string[];
    if (url) {
      relUrls = this.relativeTo(url);
    } else {
      relUrls = this.urls;
    }
    return substitute(content, relUrls, this.replacementUrls);
  }

  destroy(): void {
    // @ts-ignore
    this.settings = undefined;
    // @ts-ignore
    this.manifest = undefined;
    // @ts-ignore
    this.resources = undefined;
    // @ts-ignore
    this.replacementUrls = undefined;
    // @ts-ignore
    this.html = undefined;
    // @ts-ignore
    this.assets = undefined;
    // @ts-ignore
    this.css = undefined;
    // @ts-ignore
    this.urls = undefined;
    // @ts-ignore
    this.cssUrls = undefined;
  }
}

export default Resources;
