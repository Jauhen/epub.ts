import { isXml, parse } from './utils/core';
import httpRequest from './utils/request';
import mime from './utils/mime';
import Path from './utils/path';
import EventEmitter from 'events';
import localForage from 'localforage';
import Resources from './resources';

/**
 * Handles saving and requesting files from local storage
 * @class
 * @param {string} name This should be the name of the application for modals
 * @param {function} [requester]
 * @param {function} [resolver]
 */
class Store extends EventEmitter {
  private urlCache: Record<string, string>;
  private storage: LocalForage;
  private name: string;
  public requester: Function;
  private resolver: Function;
  private online: boolean;
  private _status?: (event: Event) => void;

  constructor(name: string, requester?: Function, resolver?: Function) {
    super();
    this.urlCache = {};
    this.storage = undefined as any;
    this.name = name;
    this.requester = requester || httpRequest;
    this.resolver = resolver || ((href: string) => href);
    this.online = true;
    this.checkRequirements();
    this.addListeners();
  }

  /**
   * Checks to see if localForage exists in global namspace,
   * Requires localForage if it isn't there
   * @private
   */
  private checkRequirements(): void {
    try {
      this.storage = localForage.createInstance({
        name: this.name,
      });
    } catch (e) {
      throw new Error('localForage lib not loaded');
    }
  }

  /**
   * Add online and offline event listeners
   * @private
   */
  private addListeners(): void {
    this._status = this.status.bind(this);
    window.addEventListener('online', this._status);
    window.addEventListener('offline', this._status);
  }

  /**
   * Remove online and offline event listeners
   * @private
   */
  private removeListeners(): void {
    if (this._status) {
      window.removeEventListener('online', this._status);
      window.removeEventListener('offline', this._status);
      this._status = undefined;
    }
  }

  /**
   * Update the online / offline status
   * @private
   */
  private status(event: Event): void {
    const online = navigator.onLine;
    this.online = online;
    if (online) {
      (this as any).emit('online', this);
    } else {
      (this as any).emit('offline', this);
    }
  }

  /**
   * Add all of a book resources to the store
   * @param  {Resources} resources  book resources
   * @param  {boolean} [force] force resaving resources
   * @return {Promise<object>} store objects
   */
  add(resources: Resources, force?: boolean): Promise<object[]> {
    const mapped = resources.resources.map((item: any) => {
      const { href } = item;
      const url = this.resolver(href);
      const encodedUrl = window.encodeURIComponent(url);
      return this.storage.getItem(encodedUrl).then((existing: any) => {
        if (!existing || force) {
          return this.requester(url, 'binary').then((data: any) => {
            return this.storage.setItem(encodedUrl, data);
          });
        } else {
          return existing;
        }
      });
    });
    return Promise.all(mapped);
  }

  /**
   * Put binary data from a url to storage
   * @param  {string} url  a url to request from storage
   * @param  {boolean} [withCredentials]
   * @param  {object} [headers]
   * @return {Promise<Blob>}
   */
  put(url: string, withCredentials?: boolean, headers?: object): Promise<Blob> {
    const encodedUrl = window.encodeURIComponent(url);
    return this.storage.getItem(encodedUrl).then((result: any) => {
      if (!result) {
        return this.requester(url, 'binary', withCredentials, headers).then(
          (data: any) => {
            return this.storage.setItem(encodedUrl, data);
          },
        );
      }
      return result;
    });
  }

  /**
   * Request a url
   * @param  {string} url  a url to request from storage
   * @param  {string} [type] specify the type of the returned result
   * @param  {boolean} [withCredentials]
   * @param  {object} [headers]
   * @return {Promise<Blob | string | JSON | Document | XMLDocument>}
   */
  request(
    url: string,
    type?: string,
    withCredentials?: boolean,
    headers?: object,
  ): Promise<Blob | string | JSON | Document | XMLDocument> {
    if (this.online) {
      // From network
      return this.requester(url, type, withCredentials, headers).then(
        (data: any) => {
          // save to store if not present
          this.put(url);
          return data;
        },
      );
    } else {
      // From store
      return this.retrieve(url, type);
    }
  }

  /**
   * Request a url from storage
   * @param  {string} url  a url to request from storage
   * @param  {string} [type] specify the type of the returned result
   * @return {Promise<Blob | string | JSON | Document | XMLDocument>}
   */
  retrieve(
    url: string,
    type?: string,
  ): Promise<Blob | string | JSON | Document | XMLDocument> {
    const path = new Path(url);
    let t = type;
    if (!t) {
      t = path.extension;
    }
    let response: Promise<any>;
    if (t === 'blob') {
      response = this.getBlob(url);
    } else {
      response = this.getText(url);
    }
    return response.then((r: any) => {
      return new Promise((resolve, reject) => {
        if (r) {
          const result = this.handleResponse(r, t);
          resolve(result);
        } else {
          reject({
            message: 'File not found in storage: ' + url,
            stack: new Error().stack,
          });
        }
      });
    });
  }

  /**
   * Handle the response from request
   * @private
   * @param  {any} response
   * @param  {string} [type]
   * @return {any} the parsed result
   */
  private handleResponse(
    response: any,
    type?: string,
  ): Blob | string | JSON | Document | XMLDocument {
    let r: any;
    if (type === 'json') {
      r = JSON.parse(response);
    } else if (type && isXml(type)) {
      r = parse(response, 'text/xml', false);
    } else if (type === 'xhtml') {
      r = parse(response, 'application/xhtml+xml', false);
    } else if (type === 'html' || type === 'htm') {
      r = parse(response, 'text/html', false);
    } else {
      r = response;
    }
    return r;
  }

  /**
   * Get a Blob from Storage by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {Blob}
   */
  getBlob(url: string, mimeType?: string): Promise<Blob> {
    const encodedUrl = window.encodeURIComponent(url);
    return this.storage.getItem(encodedUrl).then((uint8array: any) => {
      if (!uint8array) return undefined as any;
      const mt = mimeType || mime.lookup(url);
      return new Blob([uint8array], { type: mt });
    });
  }

  /**
   * Get Text from Storage by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {string}
   */
  getText(url: string): Promise<string> {
    const encodedUrl = window.encodeURIComponent(url);
    const mimeType = mime.lookup(url);
    return this.storage.getItem(encodedUrl).then((uint8array: any) => {
      if (!uint8array) return undefined as any;
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        const blob = new Blob([uint8array], { type: mimeType });
        reader.addEventListener('loadend', () => {
          resolve(reader.result as string);
        });
        reader.readAsText(blob, mimeType);
      });
    });
  }

  /**
   * Get a base64 encoded result from Storage by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {string} base64 encoded
   */
  getBase64(url: string, mimeType?: string): Promise<string> {
    const encodedUrl = window.encodeURIComponent(url);
    const mt = mimeType || mime.lookup(url);
    return this.storage.getItem(encodedUrl).then((uint8array: any) => {
      if (!uint8array) return undefined as any;
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        const blob = new Blob([uint8array], { type: mt });
        reader.addEventListener('loadend', () => {
          resolve(reader.result as string);
        });
        reader.readAsDataURL(blob);
      });
    });
  }

  /**
   * Create a Url from a stored item
   * @param  {string} url
   * @param  {object} [options.base64] use base64 encoding or blob url
   * @return {Promise} url promise with Url string
   */
  createUrl(url: string, options: { base64: boolean }): Promise<string> {
    const useBase64 = options && options.base64;
    if (url in this.urlCache) {
      return Promise.resolve(this.urlCache[url]);
    }
    if (useBase64) {
      return this.getBase64(url).then((tempUrl: string) => {
        this.urlCache[url] = tempUrl;
        return tempUrl;
      });
    } else {
      return this.getBlob(url).then((blob: Blob) => {
        if (!blob) {
          return Promise.reject({
            message: 'File not found in storage: ' + url,
            stack: new Error().stack,
          });
        }
        const _URL =
          window.URL || (window as any).webkitURL || (window as any).mozURL;
        const tempUrl = _URL.createObjectURL(blob);
        this.urlCache[url] = tempUrl;
        return tempUrl;
      });
    }
  }

  /**
   * Revoke Temp Url for a archive item
   * @param  {string} url url of the item in the store
   */
  revokeUrl(url: string): void {
    const _URL =
      window.URL || (window as any).webkitURL || (window as any).mozURL;
    const fromCache = this.urlCache[url];
    if (fromCache) _URL.revokeObjectURL(fromCache);
  }

  destroy(): void {
    const _URL =
      window.URL || (window as any).webkitURL || (window as any).mozURL;
    for (const fromCache in this.urlCache) {
      _URL.revokeObjectURL(this.urlCache[fromCache]);
    }
    this.urlCache = {};
    this.removeListeners();
  }
}

export default Store;
