import EventEmitter from 'events';
import { defer, Defer } from './utils/core';
import Url from './utils/url';
import Path from './utils/path';
import Spine from './spine';
import Locations from './locations';
import Container from './container';
import Packaging, {
  PackagingManifestObject,
  PackagingMetadataObject,
} from './packaging';
import Navigation from './navigation';
import Resources from './resources';
import PageList from './pagelist';
import Rendition, { RenditionOptions } from './rendition';
import Archive from './archive';
import request, { type RequestMethod } from './utils/request';
import EpubCFI from './epubcfi';
import Store from './store';
import DisplayOptions from './displayoptions';
import { EPUBJS_VERSION, EVENTS } from './utils/constants';
import Section from './section';
import JSZip from 'jszip';

const CONTAINER_PATH = 'META-INF/container.xml';
const IBOOKS_DISPLAY_OPTIONS_PATH =
  'META-INF/com.apple.ibooks.display-options.xml';

const INPUT_TYPE = {
  BINARY: 'binary',
  BASE64: 'base64',
  EPUB: 'epub',
  OPF: 'opf',
  MANIFEST: 'json',
  DIRECTORY: 'directory',
} as const;
type InputType = (typeof INPUT_TYPE)[keyof typeof INPUT_TYPE];

export interface BookOptions {
  requestMethod?: RequestMethod;
  requestCredentials?: boolean;
  requestHeaders?: Record<string, string>;
  encoding?: boolean;
  replacements?: string;
  canonical?: (path: string) => string;
  openAs?: string;
  store?: string;
}

/**
 * An Epub representation with methods for the loading, parsing and manipulation
 * of its contents.
 * @class
 * @param {string} [url]
 * @param {object} [options]
 * @param {method} [options.requestMethod] a request function to use instead of the default
 * @param {boolean} [options.requestCredentials=undefined] send the xhr request withCredentials
 * @param {object} [options.requestHeaders=undefined] send the xhr request headers
 * @param {string} [options.encoding=binary] optional to pass 'binary' or base64' for archived Epubs
 * @param {string} [options.replacements=none] use base64, blobUrl, or none for replacing assets in archived Epubs
 * @param {method} [options.canonical] optional function to determine canonical urls for a path
 * @param {string} [options.openAs] optional string to determine the input type
 * @param {string} [options.store=false] cache the contents in local storage, value should be the name of the reader
 * @returns {Book}
 * @example new Book("/path/to/book.epub", {})
 * @example new Book({ replacements: "blobUrl" })
 */
export interface BookOptions {
  requestMethod?: RequestMethod;
  requestCredentials?: boolean;
  requestHeaders?: Record<string, string>;
  encoding?: boolean;
  replacements?: string;
  canonical?: (path: string) => string;
  openAs?: string;
  store?: string;
}

class Book extends EventEmitter {
  settings: BookOptions;
  opening: Defer<Book>;
  opened?: Promise<Book>;
  isOpen: boolean;
  loading?: {
    manifest: Defer<PackagingManifestObject>;
    spine: Defer<Spine>;
    metadata: Defer<PackagingMetadataObject>;
    cover: Defer<string>;
    navigation: Defer<Navigation>;
    pageList: Defer<PageList>;
    resources: Defer<Resources>;
    displayOptions: Defer<DisplayOptions>;
  };
  loaded?: {
    manifest: Promise<PackagingManifestObject>;
    spine: Promise<Spine>;
    metadata: Promise<PackagingMetadataObject>;
    cover: Promise<string>;
    navigation: Promise<Navigation>;
    pageList: Promise<PageList>;
    resources: Promise<Resources>;
    displayOptions: Promise<DisplayOptions>;
  };
  ready?: Promise<
    [
      PackagingManifestObject,
      Spine,
      PackagingMetadataObject,
      string,
      Navigation,
      Resources,
      DisplayOptions,
    ]
  >;
  request: RequestMethod;
  spine?: Spine;
  locations?: Locations;
  navigation?: Navigation;
  pageList?: PageList;
  url?: Url;
  path?: Path;
  archived: boolean;
  archive?: Archive;
  storage?: Store;
  resources?: Resources;
  rendition?: Rendition;
  container?: Container;
  packaging?: Packaging;
  displayOptions?: DisplayOptions;
  isRendered: boolean;
  cover?: string;

  constructor(
    url?: string | ArrayBuffer | Blob | BookOptions,
    options?: BookOptions,
  ) {
    super();
    // Allow passing just options to the Book
    if (
      typeof options === 'undefined' &&
      typeof url !== 'string' &&
      !(url instanceof Blob) &&
      !(url instanceof ArrayBuffer)
    ) {
      options = url as BookOptions;
      url = undefined;
    }

    this.settings = {
      requestMethod: undefined,
      requestCredentials: undefined,
      requestHeaders: undefined,
      encoding: undefined,
      replacements: undefined,
      canonical: undefined,
      openAs: undefined,
      store: undefined,
      ...options,
    };

    // Promises
    this.opening = defer<Book>();
    this.opened = this.opening.promise;
    this.isOpen = false;

    this.loading = {
      manifest: defer<PackagingManifestObject>(),
      spine: defer<Spine>(),
      metadata: defer<PackagingMetadataObject>(),
      cover: defer<string>(),
      navigation: defer<Navigation>(),
      pageList: defer<PageList>(),
      resources: defer<Resources>(),
      displayOptions: defer<DisplayOptions>(),
    };

    this.loaded = {
      manifest: this.loading.manifest.promise,
      spine: this.loading.spine.promise,
      metadata: this.loading.metadata.promise,
      cover: this.loading.cover.promise,
      navigation: this.loading.navigation.promise,
      pageList: this.loading.pageList.promise,
      resources: this.loading.resources.promise,
      displayOptions: this.loading.displayOptions.promise,
    };

    this.ready = Promise.all([
      this.loaded.manifest,
      this.loaded.spine,
      this.loaded.metadata,
      this.loaded.cover,
      this.loaded.navigation,
      this.loaded.resources,
      this.loaded.displayOptions,
    ]);

    this.isRendered = false;
    this.request = this.settings.requestMethod || request;
    this.spine = new Spine();
    this.locations = new Locations(this.spine, this.load.bind(this));
    this.navigation = undefined;
    this.pageList = undefined;
    this.url = undefined;
    this.path = undefined;
    this.archived = false;
    this.archive = undefined;
    this.storage = undefined;
    this.resources = undefined;
    this.rendition = undefined;
    this.container = undefined;
    this.packaging = undefined;
    this.displayOptions = undefined;
    this.cover = undefined;

    if (this.settings.store) {
      this.store(this.settings.store);
    }

    if (url) {
      this.open(url as string | ArrayBuffer, this.settings.openAs).catch(
        (error: Error) => {
          console.error(error);
          const err = new Error('Cannot load book at ' + url);
          this.emit(EVENTS.BOOK.OPEN_FAILED, err);
        },
      );
    }
  }

  /**
   * Open a epub or url
   * @param {string | ArrayBuffer} input Url, Path or ArrayBuffer
   * @param {string} [what="binary", "base64", "epub", "opf", "json", "directory"] force opening as a certain type
   * @returns {Promise} of when the book has been loaded
   * @example book.open("/path/to/book.epub")
   */
  open(input: string | ArrayBuffer, what?: string): Promise<void> {
    const type = what || this.determineType(input as string);

    if (type === INPUT_TYPE.BINARY) {
      this.archived = true;
      this.url = new Url('/', '');
      return this.openEpub(input as ArrayBuffer);
    } else if (type === INPUT_TYPE.BASE64) {
      this.archived = true;
      this.url = new Url('/', '');
      return this.openEpub(input as ArrayBuffer, true);
    } else if (type === INPUT_TYPE.EPUB) {
      this.archived = true;
      this.url = new Url('/', '');
      return this.request(
        input as string,
        'binary',
        this.settings.requestCredentials,
        this.settings.requestHeaders,
      ).then((data) => this.openEpub(data as ArrayBuffer | string));
    } else if (type === INPUT_TYPE.OPF) {
      this.url = new Url(input as string);
      return this.openPackaging(this.url.Path.toString());
    } else if (type === INPUT_TYPE.MANIFEST) {
      this.url = new Url(input as string);
      return this.openManifest(this.url.Path.toString());
    } else {
      this.url = new Url(input as string);
      return this.openContainer(CONTAINER_PATH).then(
        this.openPackaging.bind(this),
      );
    }
  }

  /**
   * Open an archived epub
   * @private
   * @param  {binary} data
   * @param  {string} [encoding]
   * @return {Promise}
   */
  openEpub(data: ArrayBuffer | string, encoding?: boolean): Promise<void> {
    return this.unarchive(data, encoding || this.settings.encoding || false)
      .then(() => {
        return this.openContainer(CONTAINER_PATH);
      })
      .then((packagePath: string) => {
        return this.openPackaging(packagePath);
      });
  }

  /**
   * Open the epub container
   * @private
   * @param  {string} url
   * @return {string} packagePath
   */
  openContainer(url: string): Promise<string> {
    return this.load(url).then((xml) => {
      this.container = new Container(xml as Document);
      return this.resolve(this.container.packagePath!);
    });
  }

  /**
   * Open the Open Packaging Format Xml
   * @private
   * @param  {string} url
   * @return {Promise}
   */
  openPackaging(url: string): Promise<void> {
    this.path = new Path(url);
    return this.load(url).then((xml) => {
      this.packaging = new Packaging(xml as Document);
      return this.unpack();
    });
  }

  /**
   * Open the manifest JSON
   * @private
   * @param  {string} url
   * @return {Promise}
   */
  openManifest(url: string): Promise<void> {
    this.path = new Path(url);
    return this.load(url).then((json) => {
      this.packaging = new Packaging();
      this.packaging.load(json);
      return this.unpack();
    });
  }

  /**
   * Load a resource from the Book
   * @param  {string} path path to the resource to load
   * @return {Promise}     returns a promise with the requested resource
   */
  load(path: string): Promise<string | Blob | JSON | Document | XMLDocument> {
    const resolved = this.resolve(path);
    if (this.archived && this.archive) {
      return this.archive.request(resolved);
    } else {
      return this.request(
        resolved,
        undefined,
        this.settings.requestCredentials,
        this.settings.requestHeaders,
      );
    }
  }

  /**
   * Resolve a path to it's absolute position in the Book
   * @param  {string} path
   * @param  {boolean} [absolute] force resolving the full URL
   * @return {string}          the resolved path string
   */
  resolve(path: string, absolute?: boolean): string {
    if (!path) {
      return '';
    }
    let resolved = path;
    const isAbsolute = path.indexOf('://') > -1;
    if (isAbsolute) {
      return path;
    }
    if (this.path) {
      resolved = this.path.resolve(path);
    }
    if (absolute !== false && this.url) {
      resolved = this.url.resolve(resolved);
    }
    return resolved;
  }

  /**
   * Get a canonical link to a path
   * @param  {string} path
   * @return {string} the canonical path string
   */
  canonical(path: string): string {
    let url = path;
    if (!path) {
      return '';
    }
    if (this.settings.canonical) {
      url = this.settings.canonical(path);
    } else {
      url = this.resolve(path, true);
    }
    return url;
  }

  /**
   * Determine the type of they input passed to open
   * @private
   * @param  {string} input
   * @return {string}  binary | directory | epub | opf
   */
  determineType(input: string): InputType {
    if (this.settings.encoding) {
      return INPUT_TYPE.BASE64;
    }
    if (typeof input !== 'string') {
      return INPUT_TYPE.BINARY;
    }
    const url = new Url(input);
    const path = url.path();
    let extension = path.extension;
    if (extension) {
      extension = extension.replace(/\?.*$/, '');
    }
    if (!extension) {
      return INPUT_TYPE.DIRECTORY;
    }
    if (extension === 'epub') {
      return INPUT_TYPE.EPUB;
    }
    if (extension === 'opf') {
      return INPUT_TYPE.OPF;
    }
    if (extension === 'json') {
      return INPUT_TYPE.MANIFEST;
    }
    // fallback
    return INPUT_TYPE.DIRECTORY;
  }

  /**
   * unpack the contents of the Books packaging
   * @private
   * @param {Packaging} packaging object
   */
  unpack(): void {
    // this.package = packaging; // deprecated
    if (this.packaging && this.packaging.metadata.layout === '') {
      // rendition:layout not set - check display options if book is pre-paginated
      this.load(this.url!.resolve(IBOOKS_DISPLAY_OPTIONS_PATH))
        .then((xml) => {
          this.displayOptions = new DisplayOptions(xml as XMLDocument);
          this.loading?.displayOptions.resolve(this.displayOptions);
        })
        .catch((err: Error) => {
          this.displayOptions = new DisplayOptions();
          this.loading?.displayOptions.resolve(this.displayOptions);
        });
    } else {
      this.displayOptions = new DisplayOptions();
      this.loading?.displayOptions.resolve(this.displayOptions);
    }
    this.spine?.unpack(
      this.packaging!,
      this.resolve.bind(this),
      this.canonical.bind(this),
    );
    this.resources = new Resources(this.packaging!.manifest, {
      archive: this.archive,
      resolver: this.resolve.bind(this),
      request: this.request.bind(this),
      replacements:
        this.settings.replacements || (this.archived ? 'blobUrl' : 'base64'),
    });
    this.loadNavigation(this.packaging!).then(() => {
      this.loading?.navigation.resolve(this.navigation!);
    });
    if (this.packaging!.coverPath) {
      this.cover = this.resolve(this.packaging!.coverPath);
    }
    this.loading?.manifest.resolve(this.packaging!.manifest);
    this.loading?.metadata.resolve(this.packaging!.metadata);
    this.loading?.spine.resolve(this.spine!);
    this.loading?.cover.resolve(this.cover!);
    this.loading?.resources.resolve(this.resources!);
    this.loading?.pageList.resolve(this.pageList!);
    this.isOpen = true;
    if (
      this.archived ||
      (this.settings.replacements && this.settings.replacements !== 'none')
    ) {
      this.replacements()
        .then(() => {
          this.loaded?.displayOptions.then(() => {
            this.opening.resolve(this);
          });
        })
        .catch((err: Error) => {
          console.error(err);
        });
    } else {
      this.loaded?.displayOptions.then(() => {
        this.opening.resolve(this);
      });
    }
  }

  /**
   * Load Navigation and PageList from package
   * @private
   * @param {Packaging} packaging
   */
  loadNavigation(packaging: Packaging): Promise<Navigation> {
    const navPath = packaging.navPath || packaging.ncxPath;
    const toc = packaging.toc;
    if (toc) {
      return new Promise((resolve) => {
        this.navigation = new Navigation(toc);
        // TODO(jauhen): Load pageList from toc if available
        // if ((packaging as any).pageList) {
        //   this.pageList = new PageList((packaging as any).pageList);
        // }
        resolve(this.navigation);
      });
    }
    if (!navPath) {
      return new Promise((resolve) => {
        this.navigation = new Navigation();
        this.pageList = new PageList();
        resolve(this.navigation);
      });
    }
    return this.load(navPath).then((xml) => {
      this.navigation = new Navigation(xml as XMLDocument);
      this.pageList = new PageList(xml as XMLDocument);
      return this.navigation;
    });
  }

  /**
   * Gets a Section of the Book from the Spine
   * Alias for `book.spine.get`
   * @param {string} target
   * @return {Section}
   */
  section(target: string | number): Section | undefined | null {
    return this.spine?.get(target);
  }

  /**
   * Sugar to render a book to an element
   * @param  {element | string} element element or string to add a rendition to
   * @param  {object} [options]
   * @return {Rendition}
   */
  renderTo(element: Element, options?: RenditionOptions): Rendition {
    this.rendition = new Rendition(this, options);
    this.rendition.attachTo(element);
    return this.rendition;
  }

  /**
   * Set if request should use withCredentials
   * @param {boolean} credentials
   */
  setRequestCredentials(credentials: boolean): void {
    this.settings.requestCredentials = credentials;
  }

  /**
   * Set headers request should use
   * @param {object} headers
   */
  setRequestHeaders(headers: Record<string, string>): void {
    this.settings.requestHeaders = headers;
  }

  /**
   * Unarchive a zipped epub
   * @private
   * @param  {binary} input epub data
   * @param  {string} [encoding]
   * @return {Archive}
   */
  unarchive(input: ArrayBuffer | string, encoding: boolean): Promise<JSZip> {
    this.archive = new Archive();
    return this.archive.open(input, encoding);
  }

  /**
   * Store the epubs contents
   * @private
   * @param  {binary} input epub data
   * @param  {string} [encoding]
   * @return {Store}
   */
  store(name: string): Store {
    // Use "blobUrl" or "base64" for replacements
    const replacementsSetting =
      this.settings.replacements && this.settings.replacements !== 'none';
    // Save original url
    const originalUrl = this.url;
    // Save original request method
    const requester = this.settings.requestMethod || request.bind(this);
    // Create new Store
    this.storage = new Store(name, requester, this.resolve.bind(this));
    // Replace request method to go through store
    this.request = this.storage.request.bind(this.storage);

    this.opened?.then(() => {
      if (this.archived && this.archive && this.storage) {
        this.storage.requester = this.archive.request.bind(this.archive);
      }
      // Substitute hook
      const substituteResources = (output: string, section: Section) => {
        section.output = this.resources!.substitute(output, section.url);
      };
      // Set to use replacements
      if (this.resources) {
        this.resources.settings.replacements =
          replacementsSetting?.toString() || 'blobUrl';
        this.resources.replacements().then(() => {
          return this.resources!.replaceCss();
        });
      }
      if (this.storage) {
        this.storage.on('offline', () => {
          this.url = new Url('/', '');
          this.spine?.hooks.serialize.register(substituteResources);
        });
        this.storage.on('online', () => {
          this.url = originalUrl;
          this.spine?.hooks.serialize.deregister(substituteResources);
        });
      }
    });
    return this.storage;
  }

  /**
   * Get the cover url
   * @return {Promise<?string>} coverUrl
   */
  coverUrl(): Promise<string | null> | undefined {
    return this.loaded?.cover.then(() => {
      if (!this.cover) {
        return null;
      }
      if (this.archived && this.archive) {
        return this.archive.createUrl(this.cover);
      } else {
        return this.cover;
      }
    });
  }

  /**
   * Load replacement urls
   * @private
   * @return {Promise} completed loading urls
   */
  replacements(): Promise<string[]> {
    this.spine?.hooks.serialize.register((output: string, section: Section) => {
      section.output = this.resources!.substitute(output, section.url);
    });
    return this.resources!.replacements().then(() => {
      return this.resources!.replaceCss();
    });
  }

  /**
   * Find a DOM Range for a given CFI Range
   * @param  {EpubCFI} cfiRange a epub cfi range
   * @return {Promise}
   */
  getRange(cfiRange: string): Promise<Range | null> {
    const cfi = new EpubCFI(cfiRange);
    const item = this.spine?.get(cfi.spinePos);
    const request = (url: string) => {
      return this.load(url) as Promise<Document>;
    };
    if (!item) {
      return Promise.reject('CFI could not be found');
    }
    return item.load(request).then(() => {
      const range = cfi.toRange(item.document);
      return range;
    });
  }

  /**
   * Generates the Book Key using the identifier in the manifest or other string provided
   * @param  {string} [identifier] to use instead of metadata identifier
   * @return {string} key
   */
  key(identifier?: string): string {
    const ident =
      identifier ||
      (this.packaging && this.packaging.metadata.identifier) ||
      (this.url && this.url.filename);
    return `epubjs:${EPUBJS_VERSION}:${ident}`;
  }

  /**
   * Destroy the Book and all associated objects
   */
  destroy(): void {
    this.opened = undefined;
    this.loading = undefined;
    this.loaded = undefined;
    this.ready = undefined;
    this.isOpen = false;
    this.isRendered = false;
    if (this.spine) {
      this.spine.destroy();
    }
    this.spine = undefined;
    if (this.locations) {
      this.locations.destroy();
    }
    this.locations = undefined;
    if (this.pageList) {
      this.pageList.destroy();
    }
    this.pageList = undefined;
    if (this.archive) {
      this.archive.destroy();
    }
    this.archive = undefined;
    if (this.resources) {
      this.resources.destroy();
    }
    this.resources = undefined;
    if (this.container) {
      this.container.destroy();
    }
    this.container = undefined;
    if (this.packaging) {
      this.packaging.destroy();
    }
    this.packaging = undefined;
    if (this.rendition) {
      this.rendition.destroy();
    }
    this.rendition = undefined;
    if (this.displayOptions) {
      this.displayOptions.destroy();
    }
    this.displayOptions = undefined;
    this.navigation = undefined;
    this.url = undefined;
    this.path = undefined;
    this.archived = false;
  }
}

export default Book;
