import { assert } from '@esm-bundle/chai';

import Book from '../src/book';

describe('Book', () => {
  it('Unarchived', async () => {
    const book = new Book('/test/fixtures/alice/OPS/package.opf');
    // should open a epub
    await book.opened;
    assert.isTrue(book.isOpen, 'book is opened');
    assert.strictEqual(
      book.url!.toString(),
      'http://localhost:9876/test/fixtures/alice/OPS/package.opf',
      'book url is passed to new Book',
    );
    // should have a local coverUrl
    assert.strictEqual(
      await book.coverUrl(),
      'http://localhost:9876/test/fixtures/alice/OPS/images/cover_th.jpg',
      'cover url is available',
    );
  });

  it('Archived epub', async () => {
    const book = new Book('/test/fixtures/alice.epub');

    // should open a archived epub
    await book.opened;
    assert.isTrue(book.isOpen, 'book is opened');
    assert.exists(book.archive, 'book is unarchived');
    // should have a blob coverUrl
    const coverUrl = await book.coverUrl();
    assert.match(
      coverUrl!,
      /^blob:http:\/\/localhost:9876\/[^/]+$/,
      'cover url is available and a blob: url',
    );
  });

  it('Archived epub in array buffer without options', async () => {
    const response = await fetch('/test/fixtures/alice.epub');
    const buffer = await response.arrayBuffer();
    const book = new Book(buffer);
    //  should open a archived epub
    await book.opened;
    assert.isTrue(book.isOpen, 'book is opened');
    assert.exists(book.archive, 'book is unarchived');

    // should have a blob coverUrl
    const coverUrl = await book.coverUrl();
    assert.match(
      coverUrl!,
      /^blob:http:\/\/localhost:9876\/[^/]+$/,
      'cover url is available and a blob: url',
    );
  });

  it('Archived epub without cover', async () => {
    const book = new Book('/test/fixtures/alice_without_cover.epub');

    // should open a archived epub
    await book.opened;
    assert.isTrue(book.isOpen, 'book is opened');
    assert.exists(book.archive, 'book is unarchived');

    // should have a empty coverUrl
    const coverUrl = await book.coverUrl();
    // "cover url is null"
    assert.isNull(coverUrl, 'cover url is null');
  });
});
