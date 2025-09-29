import { defer, isXml, parse } from './core';
import Path from './path';

export type ResponseType = Blob | ArrayBuffer | string | Document | XMLDocument;
export type RequestTypeFormat =
  | 'blob'
  | 'binary'
  | 'json'
  | 'html'
  | 'htm'
  | 'xml'
  | 'xhtml'
  | 'text';

export type RequestMethod = (
  url: string,
  type?: RequestTypeFormat,
  withCredentials?: boolean,
  headers?: Record<string, string>,
) => Promise<ResponseType>;

function request(
  url: string,
  type?: RequestTypeFormat,
  withCredentials?: boolean,
  headers?: Record<string, string>,
): Promise<ResponseType> {
  const supportsURL = typeof window != 'undefined' ? window.URL : false; // TODO: fallback for url if window isn't defined
  const BLOB_RESPONSE: XMLHttpRequestResponseType = supportsURL
    ? 'blob'
    : 'arraybuffer';

  const deferred = defer<ResponseType>();

  const xhr = new XMLHttpRequest();

  //-- Check from PDF.js:
  //   https://github.com/mozilla/pdf.js/blob/master/web/compatibility.js
  const xhrPrototype = XMLHttpRequest.prototype;

  let header;

  if (!('overrideMimeType' in xhrPrototype)) {
    // IE10 might have response, but not overrideMimeType
    Object.defineProperty(xhrPrototype, 'overrideMimeType', {
      value: function xmlHttpRequestOverrideMimeType() {},
    });
  }

  if (withCredentials) {
    xhr.withCredentials = true;
  }

  xhr.onreadystatechange = handler;
  xhr.onerror = err;

  xhr.open('GET', url, true);

  if (headers) {
    for (header in headers) {
      xhr.setRequestHeader(header, headers[header]);
    }
  }

  if (type == 'json') {
    xhr.setRequestHeader('Accept', 'application/json');
  }

  // If type isn't set, determine it from the file extension
  if (!type) {
    type = new Path(url).extension as RequestTypeFormat;
  }

  if (type == 'blob') {
    xhr.responseType = BLOB_RESPONSE;
  }

  if (type && isXml(type)) {
    // xhr.responseType = "document";
    xhr.overrideMimeType('text/xml'); // for OPF parsing
  }

  if (type == 'xhtml') {
    // xhr.responseType = "document";
  }

  if (type == 'html' || type == 'htm') {
    // xhr.responseType = "document";
  }

  if (type == 'binary') {
    xhr.responseType = 'arraybuffer';
  }

  xhr.send();

  function err(this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) {
    deferred.reject(ev);
  }

  function handler(this: XMLHttpRequest) {
    if (this.readyState === XMLHttpRequest.DONE) {
      let responseXML: Document | null = null;

      if (this.responseType === '' || this.responseType === 'document') {
        responseXML = this.responseXML;
      }

      if (this.status === 200 || this.status === 0 || responseXML) {
        //-- Firefox is reporting 0 for blob urls
        let r: Document | Blob;

        if (!this.response && !responseXML) {
          deferred.reject({
            status: this.status,
            message: 'Empty Response',
            stack: new Error().stack,
          });
          return deferred.promise;
        }

        if (this.status === 403) {
          deferred.reject({
            status: this.status,
            response: this.response,
            message: 'Forbidden',
            stack: new Error().stack,
          });
          return deferred.promise;
        }
        if (responseXML) {
          r = responseXML;
        } else if (type && isXml(type)) {
          // xhr.overrideMimeType("text/xml"); // for OPF parsing
          // If this.responseXML wasn't set, try to parse using a DOMParser from text
          r = parse(this.response, 'text/xml', false);
        } else if (type == 'xhtml') {
          r = parse(this.response, 'application/xhtml+xml', false);
        } else if (type == 'html' || type == 'htm') {
          r = parse(this.response, 'text/html', false);
        } else if (type == 'json') {
          r = JSON.parse(this.response);
        } else if (type == 'blob') {
          if (supportsURL) {
            r = this.response;
          } else {
            //-- Safari doesn't support responseType blob, so create a blob from arraybuffer
            r = new Blob([this.response]);
          }
        } else {
          r = this.response;
        }

        deferred.resolve(r);
      } else {
        deferred.reject({
          status: this.status,
          message: this.response,
          stack: new Error().stack,
        });
      }
    }
  }

  return deferred.promise;
}

export default request;
