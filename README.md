# Epub.ts v0.4

Typescript version of Epub.js with future improvements.

![FuturePress Views](http://fchasen.com/futurepress/fp.png)

Epub.js is a JavaScript library for rendering ePub documents in the browser, across many devices.

Epub.js provides an interface for common ebook functions (such as rendering, persistence and pagination) without the need to develop a dedicated application or plugin. Importantly, it has an incredibly permissive [Free BSD](http://en.wikipedia.org/wiki/BSD_licenses) license.

[Try it while reading Moby Dick](https://futurepress.github.io/epubjs-reader/)

## Why EPUB

![Why EPUB](http://fchasen.com/futurepress/whyepub.png)

The [EPUB standard](http://www.idpf.org/epub/30/spec/epub30-overview.html) is a widely used and easily convertible format. Many books are currently in this format, and it is convertible to many other formats (such as PDF, Mobi and iBooks).

An unzipped EPUB3 is a collection of HTML5 files, CSS, images and other media – just like any other website. However, it enforces a schema of book components, which allows us to render a book and its parts based on a controlled vocabulary.

More specifically, the EPUB schema standardizes the table of contents, provides a manifest that enables the caching of the entire book, and separates the storage of the content from how it’s displayed.

## Getting Started

Get the minified code from the build folder:

```html
<script src="../dist/epub.min.js"></script>
```

Set up a element to render to:

```html
<div id="area"></div>
```

Create the new ePub, and then render it to that element:

```html
<script>
  const book = ePub("url/to/book/package.opf");
  const rendition = book.renderTo("area", {width: 600, height: 400});
  const displayed = rendition.display();
</script>
```

## Render Methods

### Default

```js
book.renderTo("area", { method: "default", width: "100%", height: "100%" });
```

[View example](http://futurepress.github.io/epub.js/examples/spreads.html)

The default manager only displays a single section at a time.

### Continuous

```js
book.renderTo("area", { method: "continuous", width: "100%", height: "100%" });
```
[View example](http://futurepress.github.io/epub.js/examples/continuous-scrolled.html)

The continuous manager will display as many sections as need to fill the screen, and preload the next section offscreen. This enables seamless swiping / scrolling between pages on mobile and desktop, but is less performant than the default method.

## Flow Overrides

### Auto (Default)
`book.renderTo("area", { flow: "auto", width: "900", height: "600" });`

Flow will be based on the settings in the OPF, defaults to `paginated`.

### Paginated

```js
book.renderTo("area", { flow: "paginated", width: "900", height: "600" });
```

[View example](http://futurepress.github.io/epub.js/examples/spreads.html)

Scrolled: `book.renderTo("area", { flow: "scrolled-doc" });`

[View example](http://futurepress.github.io/epub.js/examples/scrolled.html)

## Scripted Content

[Scripted content](https://www.w3.org/TR/epub-33/#sec-scripted-content), JavasScript the ePub HTML content, is disabled by default due to the potential for executing malicious content. 

This is done by sandboxing the iframe the content is rendered into, though it is still recommended to sanitize the ePub content server-side as well.

If a trusted ePub contains interactivity, it can be enabled by passing `allowScriptedContent: true` to the `Rendition` settings.

```html
<script>
  cl st rendition = book.renderTo("area", {
    width: 600,
    height: 400,
    allowScriptedContent: true
  });
</script>
```

This will allow the sandboxed content to run scripts, but currently makes the sandbox insecure.

## Documentation

API documentation is available at [epubjs.org/documentation/0.3/](http://epubjs.org/documentation/0.3/)

A Markdown version is included in the repo at [documentation/API.md](https://github.com/futurepress/epub.js/blob/master/documentation/md/API.md)

## Running Locally

install [node.js](http://nodejs.org/)

Then install the project dependences with npm

```shell
npm install
```

You can run the reader locally with the command

```shell
npm start
```

## Examples

+ [Spreads](http://futurepress.github.io/epub.js/examples/spreads.html)
+ [Scrolled](http://futurepress.github.io/epub.js/examples/scrolled.html)
+ [Swipe](http://futurepress.github.io/epub.js/examples/swipe.html)
+ [Input](http://futurepress.github.io/epub.js/examples/input.html)
+ [Highlights](http://futurepress.github.io/epub.js/examples/highlights.html)

[View All Examples](http://futurepress.github.io/epub.js/examples/)

## Testing

Test can be run by Web Test Runner from NPM

```shell
npm test
```

To update screen diffs run
```shell
npm run test:update
```

To see test coverage run
```shell
npm run test:coverage
```

## Building for Distribution

Builds are concatenated and minified using [metro](https://metrobundler.dev/)

To generate a new build run

```shell
npm run build
```

or to produce minified version

```shell
npm run build:minify
```

## Hooks

Similar to a plugins, Epub.js implements events that can be "hooked" into. Thus you can interact with and manipulate the contents of the book.

Examples of this functionality is loading videos from YouTube links before displaying a chapter's contents or implementing annotation.

Hooks require an event to register to and a can return a promise to block until they are finished.

Example hook:

```javascript
rendition.hooks.content.register(function(contents, view) {
  const elements = 
      contents.document.querySelectorAll('[video]');
  const items = Array.prototype.slice.call(elements);

  items.forEach(function(item){
    // do something with the video item
  });
})
```

The parts of the rendering process that can be hooked into are below.

```js
book.spine.hooks.serialize // Section is being converted to text
book.spine.hooks.content // Section has been loaded and parsed
rendition.hooks.render // Section is rendered to the screen
rendition.hooks.content // Section contents have been loaded
rendition.hooks.unloaded // Section contents are being unloaded
```

## Reader
The reader has moved to its own repo at: https://github.com/futurepress/epubjs-reader/

## Additional Resources

[![Gitter Chat](https://badges.gitter.im/futurepress/epub.js.png)](https://gitter.im/futurepress/epub.js "Gitter Chat")

[Epub.js Developer Mailing List](https://groups.google.com/forum/#!forum/epubjs)

IRC Server: freenode.net Channel: #epub.js

Follow us on twitter: @Epubjs

+ http://twitter.com/#!/Epubjs

## Other

EPUB is a registered trademark of the [IDPF](http://idpf.org/).
