import { Annotation } from './annotations';
import Book from './book';
import ePub from './epub';
import { EpubCFIStep } from './epubcfi';
import { NavItem } from './navigation';
import Rendition, { Location } from './rendition';

declare global {
  interface RNReactNativeWebView {
    postMessage(message: any): void;
    injectedObjectJson?(): string;
  }

  interface Window {
    ReactNativeWebView?: RNReactNativeWebView;
    loadBook?: (settings: InitialSettings) => void;
    rendition?: Rendition;
  }
}

export enum SourceType {
  BASE64 = 'base64',
  EPUB = 'epub',
  OPF = 'opf',
  BINARY = 'binary',
}

export type Theme = {
  [key: string]: {
    [key: string]: string;
  };
};

export type Manager = 'default' | 'continuous';

export type Flow =
  | 'auto'
  | 'paginated'
  | 'scrolled'
  | 'scrolled-doc'
  | 'scrolled-continuous';

export type Spread = 'none' | 'always' | 'auto';
/**
 * @example
 * ````
 * epubcfi(/6/6!/4/2,/2/2/1:0,/4[q1]/2/14/2/1:14)
 * ````
 */
export type ePubCfi = string;

export type AnnotationType = 'mark' | 'highlight' | 'underline';

export type AnnotationStyles = {
  /**
   * Change the annotation color.
   * Only for `highlight` and `underline` type.
   *
   * Example: `green` or `#4c12a1`. Default is `yellow`
   */
  color?: string;
  /**
   * Change the annotation opacity.
   * Only for `highlight` and `underline` type.
   *
   * Example: `0.5`. Default is `0.3`
   */
  opacity?: number;
  /**
   * Only for `underline` annotation type. Define underline thickness.
   *
   * Default is: `1px`
   */
  thickness?: number;
};

export const defaultTheme: Theme = {
  body: {
    background: '#fff',
  },
  span: {
    color: '#000 !important',
  },
  p: {
    color: '#000 !important',
  },
  li: {
    color: '#000 !important',
  },
  h1: {
    color: '#000 !important',
  },
  a: {
    color: '#000 !important',
    'pointer-events': 'auto',
    cursor: 'pointer',
  },
  '::selection': {
    background: 'lightskyblue',
  },
};

export type InitialSettings = {
  type: SourceType;
  book: string;
  theme: Theme;
  enableSelection: boolean;
  locations?: ePubCfi[];
  allowScriptedContent?: boolean;
  allowPopups?: boolean;
  manager: Manager;
  flow: Flow;
  snap?: boolean;
  spread?: Spread;
  fullsize?: boolean;
  charactersPerLocation?: number;
};

const reactNativeWebview = !!window.ReactNativeWebView
  ? window.ReactNativeWebView
  : { postMessage: (message: string) => console.log(message) };
//   : window;

window.debugInfo = [];

let book: Book;
let rendition: Rendition;

window.loadBook = function (settings: InitialSettings) {
  const type = settings.type ?? 'epub';
  const file = settings.book ?? '/fixtures/alice.epub';
  const theme = settings.theme ?? 'default';
  const initialLocations = settings.locations;
  const enableSelection = settings.enableSelection ?? true;
  const allowPopups = settings.allowPopups ?? true;
  const allowScriptedContent = settings.allowScriptedContent ?? true;

  if (!file) {
    alert('Failed load book');
  }

  if (type === 'epub' || type === 'opf' || type === 'binary') {
    book = ePub(file);
  } else if (type === 'base64') {
    book = ePub(file, { encoding: true });
  } else {
    alert('Missing file type');
  }

  rendition = window.rendition = book!.renderTo(
    document.querySelector('#viewer')!,
    {
      width: '100%',
      height: '100%',
      manager: 'default',
      flow: 'auto',
      snap: undefined,
      spread: undefined,
      // fullsize: undefined,
      allowPopups: allowPopups,
      allowScriptedContent: allowScriptedContent,
    },
  );

  reactNativeWebview.postMessage(JSON.stringify({ type: 'onStarted' }));

  if (!enableSelection) {
    rendition.themes.default({
      body: {
        '-webkit-touch-callout': 'none' /* iOS Safari */,
        '-webkit-user-select': 'none' /* Safari */,
        '-khtml-user-select': 'none' /* Konqueror HTML */,
        '-moz-user-select': 'none' /* Firefox */,
        '-ms-user-select': 'none' /* Internet Explorer/Edge */,
        'user-select': 'none',
      },
    });
  }

  book!
    .ready!.then(function () {
      if (initialLocations) {
        return book.locations!.load(initialLocations);
      }

      book.locations!.generate(1600).then(function () {
        reactNativeWebview.postMessage(
          JSON.stringify({
            type: 'onLocationsReady',
            epubKey: book.key(),
            locations: book.locations!.save(),
            totalLocations: book.locations!.total,
            currentLocation: rendition.currentLocation(),
            progress: book.locations!.percentageFromCfi(
              (rendition!.currentLocation() as Location).start.cfi,
            ),
          }),
        );
      });
    })
    .then(function () {
      var displayed = rendition.display();

      displayed.then(function () {
        var currentLocation = rendition.currentLocation();

        reactNativeWebview.postMessage(
          JSON.stringify({
            type: 'onReady',
            totalLocations: book.locations!.total,
            currentLocation: currentLocation,
            progress: book.locations!.percentageFromCfi(
              (currentLocation as Location).start.cfi,
            ),
          }),
        );
      });

      book
        .coverUrl()!
        .then(async (url) => {
          var reader = new FileReader();
          reader.onload = (res) => {
            reactNativeWebview.postMessage(
              JSON.stringify({
                type: 'meta',
                metadata: {
                  cover: reader.result,
                  author: book.packaging!.metadata.creator,
                  title: book.packaging!.metadata.title,
                  description: book.packaging!.metadata.description,
                  language: book.packaging!.metadata.language,
                  publisher: book.packaging!.metadata.publisher,
                  rights: book.packaging!.metadata.rights,
                },
              }),
            );
          };
          reader.readAsDataURL(await fetch(url!).then((res) => res.blob()));
        })
        .catch(() => {
          reactNativeWebview.postMessage(
            JSON.stringify({
              type: 'meta',
              metadata: {
                cover: undefined,
                author: book.packaging!.metadata.creator,
                title: book.packaging!.metadata.title,
                description: book.packaging!.metadata.description,
                language: book.packaging!.metadata.language,
                publisher: book.packaging!.metadata.publisher,
                rights: book.packaging!.metadata.rights,
              },
            }),
          );
        });

      book.loaded!.navigation.then(function (item) {
        reactNativeWebview.postMessage(
          JSON.stringify({
            type: 'onNavigationLoaded',
            toc: item.toc,
            landmarks: item.landmarks,
          }),
        );
      });
    })
    .catch(function (err) {
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onDisplayError',
          reason: err.message,
        }),
      );
    });

  rendition.on('started', () => {
    rendition.themes.register({ theme: theme });
    rendition.themes.select('theme');
  });

  rendition.on('relocated', function (location) {
    var percent = book.locations!.percentageFromCfi(location.start.cfi);
    var percentage = Math.floor(percent * 100);
    var chapter = getChapter(location);

    reactNativeWebview.postMessage(
      JSON.stringify(
        {
          type: 'onLocationChange',
          totalLocations: book.locations!.total,
          currentLocation: location,
          progress: percentage,
          currentSection: chapter,
        },
        null,
        2,
      ),
    );

    if (location.atStart) {
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onBeginning',
        }),
      );
    }

    if (location.atEnd) {
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onFinish',
        }),
      );
    }
  });

  rendition.on('orientationchange', function (orientation) {
    reactNativeWebview.postMessage(
      JSON.stringify({
        type: 'onOrientationChange',
        orientation: orientation,
      }),
    );
  });

  rendition.on('rendered', function (section) {
    reactNativeWebview.postMessage(
      JSON.stringify({
        type: 'onRendered',
        section: section,
        currentSection: book.navigation!.get(section.href),
      }),
    );
  });

  rendition.on('layout', function (layout) {
    reactNativeWebview.postMessage(
      JSON.stringify({
        type: 'onLayout',
        layout: layout,
      }),
    );
  });

  rendition.on('selected', function (cfiRange, contents) {
    book.getRange(cfiRange).then(function (range) {
      if (range) {
        reactNativeWebview.postMessage(
          JSON.stringify({
            type: 'onSelected',
            cfiRange: cfiRange,
            text: range.toString(),
          }),
        );
      }
    });
  });

  rendition.on('markClicked', function (cfiRange, contents) {
    const annotations = rendition.annotations.each();
    const annotation = annotations.find((item) => item.cfiRange === cfiRange);

    if (annotation) {
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onPressAnnotation',
          annotation: mapObjectToAnnotation(annotation),
        }),
      );
    }
  });

  rendition.on('resized', function (layout) {
    reactNativeWebview.postMessage(
      JSON.stringify({
        type: 'onResized',
        layout: layout,
      }),
    );
  });
};

function flatten(chapters: NavItem[]): NavItem[] {
  return ([] as NavItem[]).concat.apply(
    [],
    chapters.map((chapter: NavItem) =>
      ([] as NavItem[]).concat.apply(
        [chapter],
        flatten(chapter.subitems || []),
      ),
    ),
  );
}

function getCfiFromHref(book: Book, href: string) {
  const [_, id] = href.split('#');
  let section =
    book.spine!.get(href.split('/')[1]) ||
    book.spine!.get(href) ||
    book.spine!.get(href.split('/').slice(1).join('/'));

  const el = id
    ? section!.document!.getElementById(id)
    : section!.document!.body;
  return section!.cfiFromElement(el!);
}

function getChapter(location: Location) {
  const locationHref = location.start.href;

  let match = flatten(book.navigation!.toc)
    .filter((chapter: NavItem) => {
      return book.canonical(chapter.href).includes(locationHref);
    }, null)
    .reduce((result: NavItem | null, chapter: NavItem) => {
      const locationAfterChapter =
        ePub.CFI.compare(
          location.start.cfi,
          getCfiFromHref(book, chapter.href),
        ) > 0;
      return locationAfterChapter ? chapter : result;
    }, null);

  return match;
}

const makeRangeCfi = (a: string, b: string) => {
  const CFI = new ePub.CFI();
  const start = CFI.parse(a),
    end = CFI.parse(b);
  const cfi = {
    range: true,
    base: start.base,
    path: {
      steps: [] as EpubCFIStep[],
      terminal: null,
    },
    start: start.path,
    end: end.path,
  };
  const len = cfi.start!.steps.length;
  for (let i = 0; i < len; i++) {
    if (CFI.equalStep(cfi.start!.steps[i], cfi.end!.steps[i])) {
      if (i == len - 1) {
        // Last step is equal, check terminals
        if (cfi.start!.terminal === cfi.end!.terminal) {
          // CFI's are equal
          cfi.path.steps.push(cfi.start!.steps[i]);
          // Not a range
          cfi.range = false;
        }
      } else cfi.path.steps.push(cfi.start!.steps[i]);
    } else break;
  }
  cfi.start!.steps = cfi.start!.steps.slice(cfi.path.steps.length);
  cfi.end!.steps = cfi.end!.steps.slice(cfi.path.steps.length);

  return CFI.toString();
};

function mapObjectToAnnotation(annotation: Annotation) {
  return {
    type: annotation.type,
    data: annotation.data,
    cfiRange: annotation.cfiRange,
    sectionIndex: annotation.sectionIndex,
    cfiRangeText: annotation?.cfiRange
      ? annotation.cfiRange
      : annotation.mark?.range?.toString(),
    iconClass: annotation.data?.iconClass,
    styles:
      annotation.type !== 'mark'
        ? {
            color:
              annotation.styles?.fill ||
              annotation.mark?.attributes?.fill ||
              annotation.mark?.attributes?.stroke ||
              annotation.styles?.color,
            opacity: Number(
              annotation.styles?.['fill-opacity'] ||
                annotation.mark?.attributes?.['fill-opacity'] ||
                annotation.mark?.attributes?.['stroke-opacity'] ||
                annotation.styles?.opacity,
            ),
            thickness: Number(
              annotation.styles?.['stroke-width'] ||
                annotation.mark?.attributes?.['stroke-width'] ||
                annotation.styles?.thickness,
            ),
          }
        : undefined,
  };
}

function mapArrayObjectsToAnnotations(array: Annotation[]) {
  return array.map((annotation) => {
    return mapObjectToAnnotation(annotation);
  });
}

function mapAnnotationStylesToEpubStyles(
  type: AnnotationType,
  styles?: AnnotationStyles,
) {
  let epubStyles: { [key: string]: unknown } = {};

  if (type === 'highlight') {
    epubStyles = {
      fill: styles?.color || 'yellow',
      'fill-opacity': styles?.opacity || 0.3,
    };
  }

  if (type === 'underline') {
    epubStyles = {
      stroke: styles?.color || 'yellow',
      'stroke-opacity': styles?.opacity || 0.3,
      'stroke-width': styles?.thickness || 1,
    };
  }

  return epubStyles;
}

async function getCfiByTagId(tagId: string) {
  const results = await Promise.all(
    book.spine!.spineItems.map((item) => {
      return item.load(book.load.bind(book)).then(() => {
        const element = item.document!.getElementById(tagId);

        if (!element) return null;

        const range = item.document!.createRange();
        range.selectNodeContents(element);

        let textOffset = element.textContent.length;
        if (element.childNodes.length > 1) {
          const lastChildNode =
            element.childNodes[element.childNodes.length - 1];
          textOffset = lastChildNode.textContent!.length;
        }

        const cfi = item
          .cfiFromElement(element)
          .split(')')[0]
          .concat(',/1:0,/')
          .concat(range.endOffset)
          .concat(':')
          .concat(textOffset)
          .concat(')');

        item.unload();
        return Promise.resolve(cfi);
      });
    }),
  );

  if (results.length === 0) return null;
  return results.filter((result) => result)[0];
}

function addAnnotation(
  type: AnnotationType,
  cfiRange: ePubCfi,
  data?: object,
  iconClass?: string,
  styles?: AnnotationStyles,
  cfiRangeText?: string,
  noEmit = false,
) {
  const epubStyles = mapAnnotationStylesToEpubStyles(type, styles);

  if (type === 'mark') {
    // eslint-disable-next-line no-param-reassign
    iconClass = iconClass || 'epubjs-mk-balloon';
  }

  const annotation = rendition.annotations.add(
    type,
    cfiRange,
    data ?? {},
    () => {},
    iconClass,
    epubStyles,
    // cfiRangeText,
  );

  if (!noEmit) {
    reactNativeWebview.postMessage(
      JSON.stringify({
        type: 'onAddAnnotation',
        annotation: mapObjectToAnnotation(annotation),
      }),
    );
  }
}

function notifyUpdateAnnotations() {
  reactNativeWebview.postMessage(
    JSON.stringify({
      type: 'onChangeAnnotations',
      annotation: mapArrayObjectsToAnnotations(rendition.annotations.each()),
    }),
  );
}

window.addEventListener('message', (e: MessageEvent) => {
  if (!e.data || e.data.source === 'react-devtools-content-script') return;
  const data: { type: string; message: any } =
    typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  console.log('message event', data.type, data.message);

  switch (data.type) {
    case 'addAnnotation': {
      const annotation = rendition.annotations.add(
        data.message.type,
        data.message.cfiRange,
        data.message.data ?? {},
        () => {},
        data.message.iconClass,
        data.message.epubStyles,
      );
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onAddAnnotation',
          annotation: mapObjectToAnnotation(annotation),
        }),
      );
      notifyUpdateAnnotations();
      break;
    }
    case 'addAnnotationByTagId': {
      async function addAnnotationByTagId(tagId: string) {
        return Promise.all(
          book.spine!.spineItems.map((item) => {
            return item.load(book.load.bind(book)).then(() => {
              const element = item.document!.getElementById(tagId);

              if (!element) return null;

              const range = item.document!.createRange();
              range.selectNodeContents(element);

              let textOffset = element.textContent.length;
              if (element.childNodes.length > 1) {
                const lastChildNode =
                  element.childNodes[element.childNodes.length - 1];
                textOffset = lastChildNode.textContent!.length;
              }

              const cfi = item
                .cfiFromElement(element)
                .split(')')[0]
                .concat(',/1:0,/')
                .concat(range.endOffset.toString())
                .concat(':')
                .concat(textOffset.toString())
                .concat(')');
              const annotationData = data.message.data || { epubcfi: cfi };
              const cfiRangeText =
                data.message.cfiRangeText || range.toString();
              const annotation = rendition.annotations.add(
                data.message.type,
                cfi,
                annotationData,
                () => {},
                data.message.iconClass,
                data.message.epubStyles,
                // cfiRangeText,
              );

              const noEmit = data.message.noEmit || false;

              if (!noEmit) {
                reactNativeWebview.postMessage(
                  JSON.stringify({
                    type: 'onAddAnnotation',
                    annotation: mapObjectToAnnotation(annotation),
                  }),
                );
              }

              item.unload();
              return Promise.resolve();
            });
          }),
        );
      }

      addAnnotationByTagId(data.message.tagId)
        .then(() => {
          notifyUpdateAnnotations();
        })
        .catch((error) => alert(JSON.stringify(error?.message)));
      break;
    }
    case 'changeTheme': {
      rendition.themes.register({ theme: data.message });
      rendition.themes.select('theme');
      rendition
        .views()
        .forEach((view) => (view.pane ? view.pane.render() : null));
      break;
    }
    case 'changeFontFamily': {
      rendition.themes.font(data.message);
      rendition
        .views()
        .forEach((view) => (view.pane ? view.pane.render() : null));
      break;
    }
    case 'changeFontSize': {
      rendition.themes.fontSize(data.message);
      rendition
        .views()
        .forEach((view) => (view.pane ? view.pane.render() : null));
      break;
    }
    case 'goToLocation': {
      rendition.display(data.message);
      break;
    }
    case 'goPrevious': {
      if (data.message) {
        rendition.once('relocated', () => rendition.moveTo(0));
      }
      rendition.prev();
      break;
    }
    case 'goNext': {
      if (data.message) {
        rendition.once('relocated', () => rendition.moveTo(0));
      }
      rendition.next();
      break;
    }
    case 'search': {
      const page = data.message.page || 1;
      const limit = data.message.limit || 20;
      const term = data.message.term;
      const chapterId = data.message.options?.sectionId;
      if (!term) {
        reactNativeWebview.postMessage(
          JSON.stringify({ type: 'onSearch', results: [] }),
        );
      } else {
        Promise.all(
          book.spine!.spineItems.map((item) => {
            return item.load(book.load.bind(book)).then(() => {
              let results = item.find(term.trim());
              const locationHref = item.href;

              let [match] = flatten(book.navigation!.toc).filter(
                (chapter, index) => {
                  return book.canonical(chapter.href).includes(locationHref!);
                },
                null,
              );

              if (results.length > 0) {
                results = results.map((result) => ({
                  ...result,
                  section: {
                    ...match,
                    index: book.navigation!.toc.findIndex(
                      (elem) => elem.id === match?.id,
                    ),
                  },
                }));

                if (chapterId) {
                  results = results.filter(
                    (result: any) => result.section!.id === chapterId,
                  );
                }
              }

              item.unload();
              return Promise.resolve(results);
            });
          }),
        )
          .then((results) => {
            const items = ([] as any).concat.apply([], results);

            reactNativeWebview.postMessage(
              JSON.stringify({
                type: 'onSearch',
                results: items.slice((page - 1) * limit, page * limit),
                totalResults: items.length,
              }),
            );
          })
          .catch((err) => {
            alert(err?.message);

            reactNativeWebview.postMessage(
              JSON.stringify({
                type: 'onSearch',
                results: [],
                totalResults: 0,
              }),
            );
          });
      }
      break;
    }
    case 'updateAnnotation': {
      const epubStyles = mapAnnotationStylesToEpubStyles(
        data.message.annotation.type,
        data.message.styles,
      );

      let annotations = rendition.annotations.each();

      annotations = annotations.filter(
        (item) => item.cfiRange === data.message.annotation.cfiRange,
      );

      annotations.forEach((annotation) => {
        annotation.update(data.message.data, epubStyles);
      });

      rendition
        .views()
        .forEach((view) => (view.pane ? view.pane.render() : null));

      notifyUpdateAnnotations();
      break;
    }
    case 'updateAnnotationByTagId': {
      getCfiByTagId(data.message.tagId)
        .then((cfi) => {
          let annotations = rendition.annotations.each();

          annotations = annotations.filter((item) => item.cfiRange === cfi);

          annotations.forEach((annotation) => {
            let epubStyles = {};
            const styles = data.message.styles;

            if (annotation.type === 'highlight') {
              epubStyles = {
                fill: styles?.color || 'yellow',
                'fill-opacity': styles?.opacity || 0.3,
              };
            }

            if (annotation.type === 'underline') {
              epubStyles = {
                stroke: styles?.color || 'yellow',
                'stroke-opacity': styles?.opacity || 0.3,
                'stroke-width': styles?.thickness || 1,
              };
            }

            annotation.update(data.message.data, epubStyles);
          });

          rendition
            .views()
            .forEach((view) => (view.pane ? view.pane.render() : null));

          notifyUpdateAnnotations();
        })
        .catch((error) => alert(JSON.stringify(error?.message)));

      break;
    }
    case 'removeAnnotation': {
      rendition.annotations.remove(
        data.message.annotation.cfiRange,
        data.message.annotation.type,
      );

      notifyUpdateAnnotations();
    }
    case 'removeAnnotationByTagId': {
      getCfiByTagId(data.message.tagId)
        .then((cfi) => {
          let annotations = rendition.annotations.each();

          annotations = annotations.filter((item) => item.cfiRange === cfi);

          annotations.forEach((annotation) => {
            rendition.annotations.remove(annotation.cfiRange, annotation.type);
          });

          rendition
            .views()
            .forEach((view) => (view.pane ? view.pane.render() : null));

          notifyUpdateAnnotations();
        })
        .catch((error) => alert(error?.message));
      break;
    }
    case 'removeAnnotationByCfi': {
      ['highlight', 'underline', 'mark'].forEach((type) => {
        rendition.annotations.remove(data.message.cfiRange, type);
      });

      notifyUpdateAnnotations();
      break;
    }
    case 'removeAnnotations': {
      let annotations = rendition.annotations.each();

      if (typeof data.message.type === 'string') {
        annotations = annotations.filter(
          (annotation) => annotation.type === data.message.type,
        );
      }

      annotations.forEach((annotation) => {
        rendition.annotations.remove(annotation.cfiRange, annotation.type);
      });

      notifyUpdateAnnotations();
      break;
    }
    case 'setInitialAnnotations': {
      data.message.annotations.forEach((annotationData: any) => {
        addAnnotation(
          annotationData.type,
          annotationData.cfiRange,
          annotationData.data,
          annotationData.iconClass,
          annotationData.styles,
          annotationData.cfiRangeText,
          true,
        );
      });

      const transform = JSON.stringify(data.message.annotations);
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onSetInitialAnnotations',
          annotations: data.message.annotations.map((initialAnnotation: any) =>
            mapArrayObjectsToAnnotations(initialAnnotation),
          ),
        }),
      );
      break;
    }
    case 'removeSelection': {
      const getSelections = () =>
        rendition
          .getContents()
          .map((contents) => contents.window!.getSelection());
      const clearSelection = () =>
        getSelections().forEach((s) => s!.removeAllRanges());
      clearSelection();
      break;
    }
    case 'addBookmark': {
      const location = data.message.location;
      const chapter = getChapter(location);
      const cfi = makeRangeCfi(location.start.cfi, location.end.cfi);
      const bookmarkData = data.message.data;

      book
        .getRange(cfi)
        .then((range) => {
          reactNativeWebview.postMessage(
            JSON.stringify({
              type: 'onAddBookmark',
              bookmark: {
                id: Date.now(),
                chapter,
                location,
                text: range!.toString(),
                bookmarkData,
              },
            }),
          );
        })
        .catch((error) => alert(error?.message));
      break;
    }
    case 'removeBookmark': {
      const bookmark = data.message.bookmark;
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onRemoveBookmark',
          bookmark,
        }),
      );
      break;
    }
    case 'removeBookmarks': {
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onRemoveBookmarks',
        }),
      );
      break;
    }
    case 'updateBookmark': {
      reactNativeWebview.postMessage(
        JSON.stringify({
          type: 'onUpdateBookmark',
          bookmark: data.message.bookmark,
        }),
      );
      break;
    }
    case 'changeFlow': {
      rendition.flow(data.message.flow);
      break;
    }
  }
});
