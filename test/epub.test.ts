import { expect } from '@esm-bundle/chai';

import ePub from '../src/epub';

describe('ePub', function () {
  it('should open a epub', async () => {
    const book = ePub('/test/fixtures/alice/OPS/package.opf');

    await book.opened;
    expect(book.isOpen).to.equal(true, 'book is opened');
    expect(book.url!.toString()).to.equal(
      'http://localhost:9876/test/fixtures/alice/OPS/package.opf',
      'book url is passed to new Book',
    );
  });

  it('should open a archived epub', async () => {
    const book = ePub('/test/fixtures/alice.epub');

    // assert(typeof (JSZip) !== "undefined", "JSZip is present" );

    await book.opened;
    expect(book.isOpen).to.equal(true, 'book is opened');
    expect(book.archive, 'book is unarchived').to.not.be.undefined;
  });
});
