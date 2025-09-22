import Url from '../src/utils/url';
import Path from '../src/utils/path';
import { expect } from '@esm-bundle/chai';

describe('Core', function () {
  describe('Url', function () {
    it('Url()', function () {
      var url = new Url('http://example.com/fred/chasen/derf.html');

      expect(url.href).to.equal('http://example.com/fred/chasen/derf.html');
      expect(url.directory).to.equal('/fred/chasen/');
      expect(url.extension).to.equal('html');
      expect(url.filename).to.equal('derf.html');
      expect(url.origin).to.equal('http://example.com');
      expect(url.protocol).to.equal('http:');
      expect(url.search).to.equal('');
    });

    describe('#resolve()', function () {
      it('should join subfolders', function () {
        var a = 'http://example.com/fred/chasen/';
        var b = 'ops/derf.html';

        var resolved = new Url(a).resolve(b);
        expect(resolved).to.equal(
          'http://example.com/fred/chasen/ops/derf.html',
        );
      });

      it('should resolve up a level', function () {
        var a = 'http://example.com/fred/chasen/index.html';
        var b = '../derf.html';

        var resolved = new Url(a).resolve(b);
        expect(resolved).to.equal('http://example.com/fred/derf.html');
      });

      it('should resolve absolute', function () {
        var a = 'http://example.com/fred/chasen/index.html';
        var b = '/derf.html';

        var resolved = new Url(a).resolve(b);
        expect(resolved).to.equal('http://example.com/derf.html');
      });

      it('should resolve with search strings', function () {
        var a = 'http://example.com/fred/chasen/index.html?debug=true';
        var b = '/derf.html';

        var resolved = new Url(a).resolve(b);
        expect(resolved).to.equal('http://example.com/derf.html');
      });

      // Doesn't work with path.parse
      xit('should handle directory with a dot', function () {
        var a = 'http://example.com/fred/chasen/index.epub/';

        var url = new Url(a);
        expect(url.directory).to.equal('/fred/chasen/index.epub/');
        expect(url.extension).to.equal('');
      });

      it('should handle file urls', function () {
        var url = new Url(
          'file:///var/mobile/Containers/Data/Application/F47E4434-9B98-4654-93F1-702336B08EE6/Documents/books/moby-dick/derf.html',
        );

        expect(url.href).to.equal(
          'file:///var/mobile/Containers/Data/Application/F47E4434-9B98-4654-93F1-702336B08EE6/Documents/books/moby-dick/derf.html',
        );
        expect(url.directory).to.equal(
          '/var/mobile/Containers/Data/Application/F47E4434-9B98-4654-93F1-702336B08EE6/Documents/books/moby-dick/',
        );
        expect(url.extension).to.equal('html');
        expect(url.filename).to.equal('derf.html');
        expect(url.origin).to.equal('file://'); // origin should be blank
        expect(url.protocol).to.equal('file:');
        expect(url.search).to.equal('');
      });

      it('should resolve with file urls', function () {
        var a = 'file:///var/mobile/Containers/Data/Application/books/';
        var b = 'derf.html';

        var resolved = new Url(a).resolve(b);
        expect(resolved).to.equal(
          'file:///var/mobile/Containers/Data/Application/books/derf.html',
        );
      });
    });
  });

  describe('Path', function () {
    it('Path()', function () {
      var path = new Path('/fred/chasen/derf.html');

      expect(path.path).to.equal('/fred/chasen/derf.html');
      expect(path.directory).to.equal('/fred/chasen/');
      expect(path.extension).to.equal('html');
      expect(path.filename).to.equal('derf.html');
    });

    it('Strip out url', function () {
      var path = new Path('http://example.com/fred/chasen/derf.html');

      expect(path.path).to.equal('/fred/chasen/derf.html');
      expect(path.directory).to.equal('/fred/chasen/');
      expect(path.extension).to.equal('html');
      expect(path.filename).to.equal('derf.html');
    });

    describe('#parse()', function () {
      it('should parse a path', function () {
        var path = Path.prototype.parse('/fred/chasen/derf.html');

        expect(path.dir).to.equal('/fred/chasen');
        expect(path.base).to.equal('derf.html');
        expect(path.ext).to.equal('.html');
      });

      it('should parse a relative path', function () {
        var path = Path.prototype.parse('fred/chasen/derf.html');

        expect(path.dir).to.equal('fred/chasen');
        expect(path.base).to.equal('derf.html');
        expect(path.ext).to.equal('.html');
      });
    });

    describe('#isDirectory()', function () {
      it('should recognize a directory', function () {
        var directory = Path.prototype.isDirectory('/fred/chasen/');
        var notDirectory = Path.prototype.isDirectory('/fred/chasen/derf.html');

        expect(directory).to.equal(true, '/fred/chasen/ is a directory');
        expect(notDirectory).to.equal(
          false,
          '/fred/chasen/derf.html is not directory',
        );
      });
    });

    describe('#resolve()', function () {
      it('should resolve a path', function () {
        var a = '/fred/chasen/index.html';
        var b = 'derf.html';

        var resolved = new Path(a).resolve(b);
        expect(resolved).to.equal('/fred/chasen/derf.html');
      });

      it('should resolve a relative path', function () {
        var a = 'fred/chasen/index.html';
        var b = 'derf.html';

        var resolved = new Path(a).resolve(b);
        expect(resolved).to.equal('/fred/chasen/derf.html');
      });

      it('should resolve a level up', function () {
        var a = '/fred/chasen/index.html';
        var b = '../derf.html';

        var resolved = new Path(a).resolve(b);
        expect(resolved).to.equal('/fred/derf.html');
      });
    });

    describe('#relative()', function () {
      it('should find a relative path at the same level', function () {
        var a = '/fred/chasen/index.html';
        var b = '/fred/chasen/derf.html';

        var relative = new Path(a).relative(b);
        expect(relative).to.equal('derf.html');
      });

      it('should find a relative path down a level', function () {
        var a = '/fred/chasen/index.html';
        var b = '/fred/chasen/ops/derf.html';

        var relative = new Path(a).relative(b);
        expect(relative).to.equal('ops/derf.html');
      });

      it('should resolve a level up', function () {
        var a = '/fred/chasen/index.html';
        var b = '/fred/derf.html';

        var relative = new Path(a).relative(b);
        expect(relative).to.equal('../derf.html');
      });
    });
  });
});
