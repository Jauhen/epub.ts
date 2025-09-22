import Book from '../src/book';
import { expect } from '@esm-bundle/chai';

describe('Book', () => {
  it('Unarchived', async () => {
    const book = new Book('/test/fixtures/alice/OPS/package.opf');
    // should open a epub
    await book.opened;
    expect(book.isOpen).to.equal(true, 'book is opened');
    expect(book.url!.toString()).to.equal(
      'http://localhost:9876/test/fixtures/alice/OPS/package.opf',
      'book url is passed to new Book',
    );
    // should have a local coverUrl
    expect(await book.coverUrl()).to.equal(
      'http://localhost:9876/test/fixtures/alice/OPS/images/cover_th.jpg',
      'cover url is available',
    );
  });

  it('Archived epub', async () => {
    const book = new Book('/test/fixtures/alice.epub');

    // should open a archived epub
    await book.opened;
    expect(book.isOpen).to.equal(true, 'book is opened');
    expect(book.archive, 'book is unarchived').to.not.be.undefined;
    // should have a blob coverUrl
    const coverUrl = await book.coverUrl();
    expect(
      /^blob:http:\/\/localhost:9876\/[^\/]+$/.test(coverUrl!),
      'cover url is available and a blob: url',
    ).to.be.true;
  });

  it('Archived epub in array buffer without options', async () => {
    let book: Book;

    const response = await fetch('/test/fixtures/alice.epub');
    const buffer = await response.arrayBuffer();
    book = new Book(buffer);
    //  should open a archived epub
    await book.opened;
    expect(book.isOpen).to.equal(true, 'book is opened');
    expect(book.archive, 'book is unarchived').to.not.be.undefined;

    // should have a blob coverUrl
    const coverUrl = await book.coverUrl();
    expect(
      /^blob:http:\/\/localhost:9876\/[^\/]+$/.test(coverUrl!),
      'cover url is available and a blob: url',
    ).to.be.true;
  });

  it('Archived epub without cover', async () => {
    const book = new Book('/test/fixtures/alice_without_cover.epub');

    // should open a archived epub
    await book.opened;
    expect(book.isOpen).to.equal(true, 'book is opened');
    expect(book.archive, 'book is unarchived').to.not.be.undefined;

    // should have a empty coverUrl
    const coverUrl = await book.coverUrl();
    // "cover url is null"
    expect(coverUrl).to.be.null;
  });
});
