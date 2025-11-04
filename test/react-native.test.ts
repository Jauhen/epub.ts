import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
// @ts-expect-error
import { visualDiff } from '@web/test-runner-visual-regression';

// sort-imports-ignore
import './react-native-polyfill';
// sort-imports-ignore
import '../src/react-native';

import { defaultTheme, SourceType } from '../src/react-native';

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
    window.loadBook!({
      type: SourceType.OPF,
      book: '/test/fixtures/alice/OPS/package.opf',
      theme: defaultTheme,
      enableSelection: true,
      allowPopups: true,
      allowScriptedContent: true,
      manager: 'default',
      flow: 'paginated',
      locations: [''],
    });

    await visualDiff(div, 'first-page');
  });
});
