import { expect } from '@esm-bundle/chai';

import Locations from '../src/locations';
import * as core from '../src/utils/core';

describe('Locations', async () => {
  describe('#parse', async () => {
    it('parse locations from a document', async () => {
      const chapter = await (
        await fetch('./test/fixtures/locations.xhtml')
      ).text();
      const doc = core.parse(chapter, 'application/xhtml+xml', true);
      const contents = doc.documentElement;
      const locations = new Locations({});
      const result = locations.parse(contents, '/6/4[chap01ref]', 100);
      expect(result.length).to.equal(15);
    });

    it('parse locations from xmldom', async () => {
      const chapter = await (
        await fetch('./test/fixtures/locations.xhtml')
      ).text();
      const doc = core.parse(chapter, 'application/xhtml+xml', true);
      const contents = doc.documentElement;

      const locations = new Locations({});
      const result = locations.parse(contents, '/6/4[chap01ref]', 100);
      expect(result.length).to.equal(15);
    });
  });
});
