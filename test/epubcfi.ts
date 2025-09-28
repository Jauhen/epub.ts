import EpubCFI from '../src/epubcfi';
import { expect } from '@esm-bundle/chai';

if (typeof DOMParser === 'undefined') {
  global.DOMParser = require('xmldom').DOMParser;
}

describe('EpubCFI', function () {
  it('parse a cfi on init', function () {
    const cfi = new EpubCFI('epubcfi(/6/2[cover]!/6)');

    expect(cfi.spinePos).to.equal(0, 'spinePos is parsed as the first item');
  });

  it('parse a cfi and ignore the base if present', function () {
    const cfi = new EpubCFI('epubcfi(/6/2[cover]!/6)', '/6/6[end]');

    expect(cfi.spinePos).to.equal(
      0,
      'base is ignored and spinePos is parsed as the first item',
    );
  });

  describe('#parse()', function () {
    const cfi = new EpubCFI();

    it('parse a cfi on init', function () {
      const parsed = cfi.parse('epubcfi(/6/2[cover]!/6)');

      expect(parsed.spinePos).to.equal(
        0,
        'spinePos is parsed as the first item',
      );
    });

    it('parse a cfi and ignore the base if present', function () {
      const parsed = cfi.parse('epubcfi(/6/2[cover]!/6)');

      expect(parsed.spinePos).to.equal(
        0,
        'base is ignored and spinePos is parsed as the first item',
      );
    });

    it('parse a cfi with a character offset', function () {
      const parsed = cfi.parse(
        'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)',
      );

      expect(parsed.path?.terminal.offset).to.equal(
        3,
        'Path has a terminal offset of 3',
      );
    });

    it('parse a cfi with a range', function () {
      const parsed = cfi.parse(
        'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)',
      );

      expect(parsed.range).to.equal(true, 'Range is true');
      expect(parsed.start?.steps.length).to.equal(2, 'Start steps are present');
      expect(parsed.end?.steps.length).to.equal(1, 'End steps are present');
      expect(parsed.start?.terminal.offset).to.equal(
        1,
        'Start has a terminal offset of 1',
      );
      expect(parsed.end?.terminal.offset).to.equal(
        4,
        'End has a terminal offset of 4',
      );
    });
  });

  describe('#toString()', function () {
    it('parse a cfi and write it back', function () {
      expect(new EpubCFI('epubcfi(/6/2[cover]!/6)').toString()).to.equal(
        'epubcfi(/6/2[cover]!/6)',
        'output cfi string is same as input',
      );
      expect(
        new EpubCFI(
          'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)',
        ).toString(),
      ).to.equal(
        'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)',
        'output cfi string is same as input',
      );
      expect(
        new EpubCFI(
          'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)',
        ).toString(),
      ).to.equal(
        'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)',
        'output cfi string is same as input',
      );
    });
  });

  describe('#checkType()', function () {
    it('determine the type of a cfi string', function () {
      const cfi = new EpubCFI();

      expect(cfi.checkType('epubcfi(/6/2[cover]!/6)')).to.equal('string');
      expect(cfi.checkType('/6/2[cover]!/6')).to.equal(false);
    });

    it('determine the type of a cfi', function () {
      const ogcfi = new EpubCFI(
        'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)',
      );
      const cfi = new EpubCFI();

      expect(cfi.checkType(ogcfi)).to.equal('EpubCFI');
    });

    it('determine the type of a node', function () {
      const cfi = new EpubCFI();
      const el = document.createElement('div');

      expect(cfi.checkType(el)).to.equal('node');
    });

    it('determine the type of a range', function () {
      const cfi = new EpubCFI();
      const range = document.createRange();

      expect(cfi.checkType(range)).to.equal('range');
    });
  });

  describe('#compare()', function () {
    it('compare CFIs', function () {
      const epubcfi = new EpubCFI();

      // Spines
      expect(
        epubcfi.compare('epubcfi(/6/4[cover]!/4)', 'epubcfi(/6/2[cover]!/4)'),
      ).to.equal(1, 'First spine is greater');
      expect(
        epubcfi.compare('epubcfi(/6/4[cover]!/4)', 'epubcfi(/6/6[cover]!/4)'),
      ).to.equal(-1, 'Second spine is greater');

      // First is deeper
      expect(
        epubcfi.compare('epubcfi(/6/2[cover]!/8/2)', 'epubcfi(/6/2[cover]!/6)'),
      ).to.equal(1, 'First Element is after Second');
      expect(
        epubcfi.compare('epubcfi(/6/2[cover]!/4/2)', 'epubcfi(/6/2[cover]!/6)'),
      ).to.equal(-1, 'First Element is before Second');

      // Second is deeper
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/8/2)',
          'epubcfi(/6/2[cover]!/6/4/2/2)',
        ),
      ).to.equal(1, 'First Element is after Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/4)',
          'epubcfi(/6/2[cover]!/6/4/2/2)',
        ),
      ).to.equal(-1, 'First Element is before Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/6)',
          'epubcfi(/6/2[cover]!/4/6/8/1:0)',
        ),
      ).to.equal(-1, 'First is less specific, so is before Second');

      // Same Depth
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/6/8)',
          'epubcfi(/6/2[cover]!/6/2)',
        ),
      ).to.equal(1, 'First Element is after Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/20)',
          'epubcfi(/6/2[cover]!/6/10)',
        ),
      ).to.equal(-1, 'First Element is before Second');

      // Text nodes
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/5)',
          'epubcfi(/6/2[cover]!/4/3)',
        ),
      ).to.equal(1, 'First TextNode is after Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/7)',
          'epubcfi(/6/2[cover]!/4/13)',
        ),
      ).to.equal(-1, 'First TextNode is before Second');

      // Char offset
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/5:1)',
          'epubcfi(/6/2[cover]!/4/5:0)',
        ),
      ).to.equal(1, 'First Char Offset after Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/5:2)',
          'epubcfi(/6/2[cover]!/4/5:30)',
        ),
      ).to.equal(-1, 'Second Char Offset before Second');

      // Normal example
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/8/5:1)',
          'epubcfi(/6/2[cover]!/4/6/15:2)',
        ),
      ).to.equal(1, 'First Element after Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/2[cover]!/4/8/1:0)',
          'epubcfi(/6/2[cover]!/4/8/1:0)',
        ),
      ).to.equal(0, 'All Equal');

      // Different Lengths
      expect(
        epubcfi.compare(
          'epubcfi(/6/16[id42]!/4[5N3C0-8c483216e03a4ff49927fc1a97dc7b2c]/10/1:317)',
          'epubcfi(/6/16[id42]!/4[5N3C0-8c483216e03a4ff49927fc1a97dc7b2c]/10/2[page18]/1:0)',
        ),
      ).to.equal(-1, 'First CFI is before Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/16[id42]!/4[5N3C0-8c483216e03a4ff49927fc1a97dc7b2c]/12/1:0)',
          'epubcfi(/6/16[id42]!/4[5N3C0-8c483216e03a4ff49927fc1a97dc7b2c]/12/2/1:9)',
        ),
      ).to.equal(-1, 'First CFI is before Second');
      expect(
        epubcfi.compare(
          'epubcfi(/6/16!/4/12/1:0)',
          'epubcfi(/6/16!/4/12/2/1:9)',
        ),
      ).to.equal(-1, 'First CFI is before Second');
    });
  });

  describe('#fromNode()', async () => {
    let doc: Document;
    let base: string;

    this.beforeAll(async () => {
      base = '/6/4[chap01ref]';
      // var contents = fs.readFileSync(__dirname + '/fixtures/chapter1-highlights.xhtml', 'utf8');
      const contents = await (
        await fetch('./test/fixtures/chapter1-highlights.xhtml')
      ).text();

      // var serializer = new XMLSerializer();
      // var doc = serializer.serializeToString(contents);
      doc = new DOMParser().parseFromString(contents, 'application/xhtml+xml');
    });

    it('get a cfi from a p node', function () {
      const span = doc.getElementById('c001p0004')!;
      const cfi = new EpubCFI(span, base);

      expect(span.nodeType).to.equal(
        Node.ELEMENT_NODE,
        'provided a element node',
      );
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/10/2[c001p0004])',
      );
    });

    it('get a cfi from a text node', function () {
      const t = doc.getElementById('c001p0004')!.childNodes[0];
      const cfi = new EpubCFI(t, base);

      expect(t.nodeType).to.equal(Node.TEXT_NODE, 'provided a text node');
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/10/2[c001p0004]/1)',
      );
    });

    it('get a cfi from a text node inside a highlight', function () {
      const t = doc.getElementById('highlight-1')!.childNodes[0];
      const cfi = new EpubCFI(t, base, 'annotator-hl');

      expect(t.nodeType).to.equal(Node.TEXT_NODE, 'provided a text node');
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/32/2[c001p0017]/1)',
      );
    });

    it('get a cfi from a highlight node', function () {
      const t = doc.getElementById('highlight-1')!;
      const cfi = new EpubCFI(t, base, 'annotator-hl');

      expect(t.nodeType).to.equal(
        Node.ELEMENT_NODE,
        'provided a highlight node',
      );
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/32/2[c001p0017])',
      );
    });
  });

  describe('#fromRange()', async function () {
    let doc: Document;
    let base: string;
    let docHighlights: Document;
    let docHighlightsAlice: Document;

    this.beforeAll(async () => {
      base = '/6/4[chap01ref]';

      // var contentsClean = fs.readFileSync(__dirname + '/fixtures/chapter1.xhtml', 'utf8');
      const contentsClean = await (
        await fetch('./test/fixtures/chapter1.xhtml')
      ).text();

      doc = new DOMParser().parseFromString(
        contentsClean,
        'application/xhtml+xml',
      );

      // var contentsHighlights = fs.readFileSync(__dirname + '/fixtures/chapter1-highlights.xhtml', 'utf8');
      const contentsHighlights = await (
        await fetch('./test/fixtures/chapter1-highlights.xhtml')
      ).text();
      docHighlights = new DOMParser().parseFromString(
        contentsHighlights,
        'application/xhtml+xml',
      );

      // var highlightContents = fs.readFileSync(__dirname + '/fixtures/highlight.xhtml', 'utf8');
      const highlightContents = await (
        await fetch('./test/fixtures/highlight.xhtml')
      ).text();
      docHighlightsAlice = new DOMParser().parseFromString(
        highlightContents,
        'application/xhtml+xml',
      );
    });

    it('get a cfi from a collapsed range', function () {
      const t1 = doc.getElementById('c001p0004')!.childNodes[0];
      const t2 = doc.getElementById('c001p0007')!.childNodes[0];
      const range = doc.createRange();
      let cfi;

      range.setStart(t1, 6);

      cfi = new EpubCFI(range, base);

      expect(cfi.range).to.equal(false);
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/10/2[c001p0004]/1:6)',
      );
    });

    it('get a cfi from a range', function () {
      const t1 = doc.getElementById('c001p0004')!.childNodes[0];
      const t2 = doc.getElementById('c001p0007')!.childNodes[0];
      const range = doc.createRange();
      let cfi;

      range.setStart(t1, 6);
      range.setEnd(t2, 27);

      cfi = new EpubCFI(range, base);

      expect(cfi.range).to.equal(true);
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2,/10/2[c001p0004]/1:6,/16/2[c001p0007]/1:27)',
      );
    });

    it('get a cfi from a range with offset 0', function () {
      const t1 = doc.getElementById('c001p0004')!.childNodes[0];
      const range = doc.createRange();
      let cfi;

      range.setStart(t1, 0);
      range.setEnd(t1, 1);

      cfi = new EpubCFI(range, base);

      expect(cfi.range).to.equal(true);
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/10/2[c001p0004],/1:0,/1:1)',
      );
    });

    it('get a cfi from a range inside a highlight', function () {
      const t1 = docHighlights.getElementById('highlight-1')!.childNodes[0];
      const range = docHighlights.createRange();
      let cfi;

      range.setStart(t1, 6);

      cfi = new EpubCFI(range, base, 'annotator-hl');

      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/32/2[c001p0017]/1:43)',
      );
    });
    // TODO: might need to have double ranges in front
    it('get a cfi from a range past a highlight', function () {
      const t1 = docHighlights.getElementById('c001s0001')!.childNodes[1];
      const range = docHighlights.createRange();
      let cfi;

      range.setStart(t1, 25);

      cfi = new EpubCFI(range, base, 'annotator-hl');

      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/4/2[c001s0001]/1:41)',
      );
    });

    it('get a cfi from a range in between two highlights', function () {
      const t1 = docHighlightsAlice.getElementById('p2')!.childNodes[1];
      const range = docHighlightsAlice.createRange();
      let cfi;

      range.setStart(t1, 4);

      cfi = new EpubCFI(range, base, 'annotator-hl');

      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/4[p2]/1:123)',
      );
    });

    it('correctly count text nodes, independent of any elements present inbetween', function () {
      const t1 = docHighlightsAlice.getElementById('p3')!.childNodes[2];
      const range = docHighlightsAlice.createRange();
      let cfi;

      range.setStart(t1, 4);

      cfi = new EpubCFI(range, base);

      expect(cfi.toString()).to.equal('epubcfi(/6/4[chap01ref]!/4/6[p3]/3:4)');
    });
  });

  describe('#toRange()', async function () {
    let doc: Document;
    let base: string;

    this.beforeAll(async () => {
      base = '/6/4[chap01ref]';
      // var contents = fs.readFileSync(__dirname + '/fixtures/chapter1-highlights.xhtml', 'utf8');
      const contents = await (
        await fetch('./test/fixtures/chapter1-highlights.xhtml')
      ).text();

      doc = new DOMParser().parseFromString(contents, 'application/xhtml+xml');
    });

    // var serializer = new XMLSerializer();
    // console.log(serializer.serializeToString(doc));

    it('get a range from a cfi', function () {
      const t1 = doc.getElementById('c001p0004')!.childNodes[0];
      const t2 = doc.getElementById('c001p0007')!.childNodes[0];
      const ogRange = doc.createRange();
      let cfi;
      let newRange;

      ogRange.setStart(t1, 6);

      cfi = new EpubCFI(ogRange, base);

      // Check it was parse correctly
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/10/2[c001p0004]/1:6)',
      );

      // Check the range
      newRange = cfi.toRange(doc)!;

      expect(newRange.startContainer).to.equal(t1);
      expect(newRange.startOffset).to.equal(6);
      expect(newRange.collapsed).to.equal(true);
    });

    it('get a range from a cfi with a range', function () {
      const t1 = doc.getElementById('c001p0004')!.childNodes[0];
      const t2 = doc.getElementById('c001p0007')!.childNodes[0];
      const ogRange = doc.createRange();
      let cfi;
      let newRange;

      ogRange.setStart(t1, 6);
      ogRange.setEnd(t2, 27);

      cfi = new EpubCFI(ogRange, base);

      // Check it was parse correctly
      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2,/10/2[c001p0004]/1:6,/16/2[c001p0007]/1:27)',
      );

      // Check the range
      newRange = cfi.toRange(doc)!;

      expect(newRange.startContainer).to.equal(t1);
      expect(newRange.startOffset).to.equal(6);

      expect(newRange.endContainer).to.equal(t2);
      expect(newRange.endOffset).to.equal(27);

      expect(newRange.collapsed).to.equal(false);
    });

    it('get a cfi from a range inside a highlight', function () {
      const t1 = doc.getElementById('highlight-1')!.childNodes[0];
      const ogRange = doc.createRange();
      let cfi;
      let newRange;

      ogRange.setStart(t1, 6);

      cfi = new EpubCFI(ogRange, base, 'annotator-hl');

      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/32/2[c001p0017]/1:43)',
      );

      // Check the range
      newRange = cfi.toRange(doc, 'annotator-hl')!;

      expect(newRange.startContainer).to.exist;

      expect(newRange.startContainer).to.equal(t1);
      expect(newRange.startOffset).to.equal(6);
    });

    it('get a cfi from a range inside a highlight range', function () {
      const t1 = doc.getElementById('highlight-2')!.childNodes[0];
      const t2 = doc.getElementById('c001s0001')!.childNodes[1];
      const ogRange = doc.createRange();
      let cfi;
      let newRange;

      ogRange.setStart(t1, 5);
      ogRange.setEnd(t2, 25);

      cfi = new EpubCFI(ogRange, base, 'annotator-hl');

      expect(cfi.toString()).to.equal(
        'epubcfi(/6/4[chap01ref]!/4/2/4/2[c001s0001],/1:5,/1:41)',
      );

      // Check the range
      newRange = cfi.toRange(doc, 'annotator-hl')!;

      expect(newRange.startContainer.textContent).to.equal(t1.textContent);
      // assert.strictEqual( newRange.startContainer, t1);
      // assert.equal( newRange.startOffset, 5);
    });
  });
});
