import Book from './book';
import ePub from './epub';
import Rendition from './rendition';

declare global {
  interface RNReactNativeWebView {
    postMessage(message: string): void;
    injectedObjectJson?(): string;
  }

  interface Window {
    ReactNativeWebView?: RNReactNativeWebView;
  }
}

interface InitialData {
  type?: string;
  book?: string;
  theme?: string;
  locations?: string;
  enable_selection?: boolean;
  allow_popups?: boolean;
  allow_scripted_content?: boolean;
  annotations?: string[];
}

const initialData: InitialData = JSON.parse(
  window.ReactNativeWebView?.injectedObjectJson?.() ?? '{}',
);

let book: Book;
let rendition: Rendition;

const type = initialData.type ?? 'epub';
const file = initialData.book ?? '/fixtures/alice.epub';
const theme = initialData.theme ?? 'default';
const initialLocations = initialData.locations;
const enableSelection = initialData.enable_selection ?? true;
const allowPopups = initialData.allow_popups ?? true;
const allowScriptedContent = initialData.allow_scripted_content ?? true;

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

rendition = book!.renderTo('viewer', {
  width: '100%',
  height: '100%',
  manager: 'default',
  flow: 'auto',
  snap: undefined,
  spread: undefined,
  fullsize: undefined,
  allowPopups: allowPopups,
  allowScriptedContent: allowScriptedContent,
});
const reactNativeWebview = !!window.ReactNativeWebView
  ? window.ReactNativeWebView
  : { postMessage: (message) => console.log(message) };
//   : window;

reactNativeWebview.postMessage(JSON.stringify({ type: 'onStarted' }, null, 2));

function flatten(chapters) {
  return [].concat.apply(
    [],
    chapters.map((chapter) =>
      [].concat.apply([chapter], flatten(chapter.subitems)),
    ),
  );
}

function getCfiFromHref(book, href) {
  const [_, id] = href.split('#');
  let section =
    book.spine.get(href.split('/')[1]) ||
    book.spine.get(href) ||
    book.spine.get(href.split('/').slice(1).join('/'));

  const el = id ? section.document.getElementById(id) : section.document.body;
  return section.cfiFromElement(el);
}

function getChapter(location) {
  const locationHref = location.start.href;

  let match = flatten(book.navigation.toc)
    .filter((chapter) => {
      return book.canonical(chapter.href).includes(locationHref);
    }, null)
    .reduce((result, chapter) => {
      const locationAfterChapter =
        ePub.CFI.prototype.compare(
          location.start.cfi,
          getCfiFromHref(book, chapter.href),
        ) > 0;
      return locationAfterChapter ? chapter : result;
    }, null);

  return match;
}

const makeRangeCfi = (a, b) => {
  const CFI = new ePub.CFI();
  const start = CFI.parse(a),
    end = CFI.parse(b);
  const cfi = {
    range: true,
    base: start.base,
    path: {
      steps: [],
      terminal: null,
    },
    start: start.path,
    end: end.path,
  };
  const len = cfi.start.steps.length;
  for (let i = 0; i < len; i++) {
    if (CFI.equalStep(cfi.start.steps[i], cfi.end.steps[i])) {
      if (i == len - 1) {
        // Last step is equal, check terminals
        if (cfi.start.terminal === cfi.end.terminal) {
          // CFI's are equal
          cfi.path.steps.push(cfi.start.steps[i]);
          // Not a range
          cfi.range = false;
        }
      } else cfi.path.steps.push(cfi.start.steps[i]);
    } else break;
  }
  cfi.start.steps = cfi.start.steps.slice(cfi.path.steps.length);
  cfi.end.steps = cfi.end.steps.slice(cfi.path.steps.length);

  return (
    'epubcfi(' +
    CFI.segmentString(cfi.base) +
    '!' +
    CFI.segmentString(cfi.path) +
    ',' +
    CFI.segmentString(cfi.start) +
    ',' +
    CFI.segmentString(cfi.end) +
    ')'
  );
};

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

book.ready
  .then(function () {
    if (initialLocations) {
      return book.locations.load(initialLocations);
    }

    book.locations.generate(1600).then(function () {
      reactNativeWebview.postMessage(
        JSON.stringify(
          {
            type: 'onLocationsReady',
            epubKey: book.key(),
            locations: book.locations.save(),
            totalLocations: book.locations.total,
            currentLocation: rendition.currentLocation(),
            progress: book.locations.percentageFromCfi(
              rendition.currentLocation().start.cfi,
            ),
          },
          null,
          2,
        ),
      );
    });
  })
  .then(function () {
    var displayed = rendition.display();

    displayed.then(function () {
      var currentLocation = rendition.currentLocation();

      reactNativeWebview.postMessage(
        JSON.stringify(
          {
            type: 'onReady',
            totalLocations: book.locations.total,
            currentLocation: currentLocation,
            progress: book.locations.percentageFromCfi(
              currentLocation.start.cfi,
            ),
          },
          null,
          2,
        ),
      );
    });

    book
      .coverUrl()
      .then(async (url) => {
        var reader = new FileReader();
        reader.onload = (res) => {
          reactNativeWebview.postMessage(
            JSON.stringify(
              {
                type: 'meta',
                metadata: {
                  cover: reader.result,
                  author: book.packaging.metadata.creator,
                  title: book.packaging.metadata.title,
                  description: book.packaging.metadata.description,
                  language: book.packaging.metadata.language,
                  publisher: book.packaging.metadata.publisher,
                  rights: book.packaging.metadata.rights,
                },
              },
              null,
              2,
            ),
          );
        };
        reader.readAsDataURL(await fetch(url).then((res) => res.blob()));
      })
      .catch(() => {
        reactNativeWebview.postMessage(
          JSON.stringify(
            {
              type: 'meta',
              metadata: {
                cover: undefined,
                author: book.packaging.metadata.creator,
                title: book.packaging.metadata.title,
                description: book.packaging.metadata.description,
                language: book.packaging.metadata.language,
                publisher: book.packaging.metadata.publisher,
                rights: book.packaging.metadata.rights,
              },
            },
            null,
            2,
          ),
        );
      });

    book.loaded.navigation.then(function (item) {
      reactNativeWebview.postMessage(
        JSON.stringify(
          {
            type: 'onNavigationLoaded',
            toc: item.toc,
            landmarks: item.landmarks,
          },
          null,
          2,
        ),
      );
    });
  })
  .catch(function (err) {
    reactNativeWebview.postMessage(
      JSON.stringify(
        {
          type: 'onDisplayError',
          reason: reason,
        },
        null,
        2,
      ),
    );
  });

rendition.on('started', () => {
  rendition.themes.register({ theme: theme });
  rendition.themes.select('theme');
});

rendition.on('relocated', function (location) {
  var percent = book.locations.percentageFromCfi(location.start.cfi);
  var percentage = Math.floor(percent * 100);
  var chapter = getChapter(location);

  reactNativeWebview.postMessage(
    JSON.stringify(
      {
        type: 'onLocationChange',
        totalLocations: book.locations.total,
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
      JSON.stringify(
        {
          type: 'onBeginning',
        },
        null,
        2,
      ),
    );
  }

  if (location.atEnd) {
    reactNativeWebview.postMessage(
      JSON.stringify(
        {
          type: 'onFinish',
        },
        null,
        2,
      ),
    );
  }
});

rendition.on('orientationchange', function (orientation) {
  reactNativeWebview.postMessage(
    JSON.stringify(
      {
        type: 'onOrientationChange',
        orientation: orientation,
      },
      null,
      2,
    ),
  );
});

rendition.on('rendered', function (section) {
  reactNativeWebview.postMessage(
    JSON.stringify(
      {
        type: 'onRendered',
        section: section,
        currentSection: book.navigation.get(section.href),
      },
      null,
      2,
    ),
  );
});

rendition.on('layout', function (layout) {
  reactNativeWebview.postMessage(
    JSON.stringify(
      {
        type: 'onLayout',
        layout: layout,
      },
      null,
      2,
    ),
  );
});

rendition.on('selected', function (cfiRange, contents) {
  book.getRange(cfiRange).then(function (range) {
    if (range) {
      reactNativeWebview.postMessage(
        JSON.stringify(
          {
            type: 'onSelected',
            cfiRange: cfiRange,
            text: range.toString(),
          },
          null,
          2,
        ),
      );
    }
  });
});

rendition.on('markClicked', function (cfiRange, contents) {
  const annotations = Object.values(rendition.annotations._annotations);
  const annotation = annotations.find((item) => item.cfiRange === cfiRange);

  if (annotation) {
    reactNativeWebview.postMessage(
      JSON.stringify(
        {
          type: 'onPressAnnotation',
          annotation: '', //${webViewJavaScriptFunctions.mapObjectToAnnotation('annotation')}
        },
        null,
        2,
      ),
    );
  }
});

rendition.on('resized', function (layout) {
  reactNativeWebview.postMessage(
    JSON.stringify(
      {
        type: 'onResized',
        layout: layout,
      },
      null,
      2,
    ),
  );
});
