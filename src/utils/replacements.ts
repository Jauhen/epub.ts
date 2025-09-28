import type Section from '../section';
import { qs } from './core';
import Url from './url';

export function replaceBase(doc: Document, section?: Section): void {
  if (!doc) {
    return;
  }

  let url = section?.url || '';
  const absolute = url.indexOf('://') > -1;
  const head = qs(doc, 'head');
  let base = qs(head!, 'base');

  if (!base) {
    base = doc.createElement('base');
    head!.insertBefore(base, head!.firstChild);
  }

  // Fix for Safari crashing if the url doesn't have an origin
  if (!absolute && window && window.location) {
    url = window.location.origin + url;
  }

  base.setAttribute('href', url);
}

export function replaceCanonical(doc: Document, section: Section): void {
  const url = section.canonical || '';

  if (!doc) {
    return;
  }

  const head = qs(doc, 'head');
  let link = qs(head!, "link[rel='canonical']");

  if (link) {
    link.setAttribute('href', url);
  } else {
    link = doc.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', url);
    head!.appendChild(link);
  }
}

export function replaceMeta(doc: Document, section: Section): void {
  const id = section.idref;
  if (!doc) {
    return;
  }

  const head = qs(doc, 'head');
  let meta = qs(head!, "link[property='dc.identifier']");

  if (meta) {
    meta.setAttribute('content', id);
  } else {
    meta = doc.createElement('meta');
    meta.setAttribute('name', 'dc.identifier');
    meta.setAttribute('content', id);
    head!.appendChild(meta);
  }
}

// TODO: move me to Contents
export function replaceLinks(
  contents: HTMLElement,
  fn: (href: string) => void,
): void {
  const links = contents.querySelectorAll('a[href]');

  if (!links.length) {
    return;
  }

  const base = qs(contents.ownerDocument, 'base');
  const location = base ? base.getAttribute('href') : undefined;
  const replaceLink = function (link: Element) {
    const href = link.getAttribute('href');

    if (href && href.indexOf('mailto:') === 0) {
      return;
    }

    const absolute = href && href.indexOf('://') > -1;

    if (absolute) {
      link.setAttribute('target', '_blank');
    } else {
      let linkUrl: Url | undefined;
      try {
        if (href && typeof href === 'string' && location) {
          const hrefStr: string = href;
          const locationStr: string = location;
          linkUrl = new Url(hrefStr, locationStr);
        }
      } catch (error: unknown) {
        console.warn(error);
      }

      (link as HTMLElement).onclick = function () {
        if (linkUrl && linkUrl.hash) {
          fn(linkUrl.Path.path + linkUrl.hash);
        } else if (linkUrl) {
          fn(linkUrl.Path.path);
        } else {
          fn(href!);
        }

        return false;
      };
    }
  };

  for (let i = 0; i < links.length; i++) {
    replaceLink(links[i]);
  }
}

export function substitute(
  content: string,
  urls: string[],
  replacements: string[],
): string {
  urls.forEach(function (url: string, i: number) {
    if (url && replacements[i]) {
      // Account for special characters in the file name.
      // See https://stackoverflow.com/a/6318729.
      url = url.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      content = content.replace(new RegExp(url, 'g'), replacements[i]);
    }
  });
  return content;
}
