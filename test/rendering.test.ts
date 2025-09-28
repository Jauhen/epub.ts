import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
// @ts-expect-error
import { visualDiff } from '@web/test-runner-visual-regression';

import ePub from '../src/epub';

describe('Rendering', () => {
  let div: HTMLDivElement;

  before(async () => {
    await setViewport({ width: 400, height: 600 });
    div = document.createElement('div');
    div.id = 'viewer';
    div.style.width = '400px';
    div.style.height = '600px';
    div.style.position = 'absolute';
    div.style.top = '0px';
    div.style.left = '0px';
    document.body.appendChild(div);
  });

  after(() => {
    document.body.removeChild(div);
  });

  it('should render the view correctly', async () => {
    const book = ePub('/test/fixtures/alice/OPS/package.opf');
    await book.opened;
    const rendition = book.renderTo(div, {
      manager: 'continuous',
      flow: 'paginated',
      width: '100%',
      height: '100%',
    });
    rendition.display('chapter_001.xhtml');
    await book.ready;
    await new Promise<void>((resolve) => {
      rendition.on('rendered', () => {
        resolve();
      });
    });
    expect(div.firstChild).to.exist;
    await visualDiff(div, 'first-page');
    rendition.destroy();
    await book.destroy();
  });
});
