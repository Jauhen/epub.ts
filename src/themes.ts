import type Contents from './contents';
import type Rendition from './rendition';
import Url from './utils/url';

/**
 * Themes to apply to displayed content
 * @class
 * @param {Rendition} rendition
 */
class Themes {
  private rendition: Rendition;
  private _themes: Record<
    string,
    {
      rules?: object;
      url?: string;
      serialized?: string;
      injected?: boolean;
    }
  >;
  private _overrides: Record<string, { value: string; priority: boolean }>;
  private _current: string;
  private _injected: string[];

  constructor(rendition: Rendition) {
    this.rendition = rendition;
    this._themes = {
      default: {
        rules: {},
        url: '',
        serialized: '',
      },
    };
    this._overrides = {};
    this._current = 'default';
    this._injected = [];
    this.rendition.hooks.content.register(this.inject.bind(this));
    this.rendition.hooks.content.register(this.overrides.bind(this));
  }

  /**
   * Add themes to be used by a rendition
   * @param {object | Array<object> | string}
   * @example themes.register("light", "http://example.com/light.css")
   * @example themes.register("light", { "body": { "color": "purple"}})
   * @example themes.register({ "light" : {...}, "dark" : {...}})
   */
  register(themeOrName: object | string, urlOrRules?: string | object): void {
    if (arguments.length === 0) {
      return;
    }
    if (arguments.length === 1 && typeof themeOrName === 'object') {
      this.registerThemes(themeOrName as object);
      return;
    }
    if (arguments.length === 1 && typeof themeOrName === 'string') {
      this.default(themeOrName as string);
      return;
    }
    if (arguments.length === 2 && typeof urlOrRules === 'string') {
      this.registerUrl(themeOrName as string, urlOrRules as string);
      return;
    }
    if (arguments.length === 2 && typeof urlOrRules === 'object') {
      this.registerRules(themeOrName as string, urlOrRules as object);
      return;
    }
  }

  /**
   * Add a default theme to be used by a rendition
   * @param {object | string} theme
   * @example themes.register("http://example.com/default.css")
   * @example themes.register({ "body": { "color": "purple"}})
   */
  default(theme: object | string): void {
    if (!theme) {
      return;
    }
    if (typeof theme === 'string') {
      this.registerUrl('default', theme);
      return;
    }
    if (typeof theme === 'object') {
      this.registerRules('default', theme);
      return;
    }
  }

  /**
   * Register themes object
   * @param {object} themes
   */
  registerThemes(themes: object): void {
    for (const theme in themes) {
      if (Object.prototype.hasOwnProperty.call(themes, theme)) {
        if (typeof (themes as any)[theme] === 'string') {
          this.registerUrl(theme, (themes as any)[theme]);
        } else {
          this.registerRules(theme, (themes as any)[theme]);
        }
      }
    }
  }

  /**
   * Register a theme by passing its css as string
   * @param {string} name
   * @param {string} css
   */
  registerCss(name: string, css: string): void {
    this._themes[name] = { serialized: css };
    if (this._injected.includes(name) || name === 'default') {
      this.update(name);
    }
  }

  /**
   * Register a url
   * @param {string} name
   * @param {string} input
   */
  registerUrl(name: string, input: string): void {
    const url = new Url(input);
    this._themes[name] = { url: url.toString() };
    if (this._injected.includes(name) || name === 'default') {
      this.update(name);
    }
  }

  /**
   * Register rule
   * @param {string} name
   * @param {object} rules
   */
  registerRules(name: string, rules: object): void {
    this._themes[name] = { rules: rules };
    // TODO: serialize css rules
    if (this._injected.includes(name) || name === 'default') {
      this.update(name);
    }
  }

  /**
   * Select a theme
   * @param {string} name
   */
  select(name: string): void {
    const prev = this._current;
    this._current = name;
    this.update(name);
    // rendition.views() returns array of views, each with .contents
    const views = this.rendition.views();
    views.forEach((view: any) => {
      const content = view.contents;
      if (content) {
        content.removeClass(prev);
        content.addClass(name);
      }
    });
  }

  /**
   * Update a theme
   * @param {string} name
   */
  update(name: string): void {
    const views = this.rendition.views();
    views.forEach((view: any) => {
      const content = view.contents;
      if (content) {
        this.add(name, content);
      }
    });
  }

  /**
   * Inject all themes into contents
   * @param {Contents} contents
   */
  inject(contents: Contents): void {
    const links: string[] = [];
    const themes = this._themes;
    let theme;
    for (const name in themes) {
      if (
        Object.prototype.hasOwnProperty.call(themes, name) &&
        (name === this._current || name === 'default')
      ) {
        theme = themes[name];
        if (
          (theme.rules && Object.keys(theme.rules).length > 0) ||
          (theme.url && links.indexOf(theme.url) === -1)
        ) {
          this.add(name, contents);
        }
        if (!this._injected.includes(name)) {
          this._injected.push(name);
        }
      }
    }
    if (this._current !== 'default') {
      contents.addClass(this._current);
    }
  }

  /**
   * Add Theme to contents
   * @param {string} name
   * @param {Contents} contents
   */
  add(name: string, contents: Contents): void {
    const theme = this._themes[name];
    if (!theme || !contents) {
      return;
    }
    if (theme.url) {
      contents.addStylesheet(theme.url);
    } else if (theme.serialized) {
      contents.addStylesheetCss(theme.serialized, name);
      theme.injected = true;
    } else if (theme.rules) {
      contents.addStylesheetRules(theme.rules, name);
      theme.injected = true;
    }
  }

  /**
   * Add override
   * @param {string} name
   * @param {string} value
   * @param {boolean} priority
   */
  override(name: string, value: string, priority?: boolean): void {
    const views = this.rendition.views();
    this._overrides[name] = {
      value: value,
      priority: priority === true,
    };
    views.forEach((view: any) => {
      const content = view.contents;
      if (content) {
        content.css(
          name,
          this._overrides[name].value,
          this._overrides[name].priority,
        );
      }
    });
  }

  removeOverride(name: string): void {
    const views = this.rendition.views();
    delete this._overrides[name];
    views.forEach((view: any) => {
      const content = view.contents;
      if (content) {
        // To remove override, set value to empty string and priority to false
        content.css(name, '', false);
      }
    });
  }

  /**
   * Add all overrides
   * @param {Content} content
   */
  overrides(contents: Contents): void {
    const overrides = this._overrides;
    for (const rule in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, rule)) {
        contents.css(rule, overrides[rule].value, overrides[rule].priority);
      }
    }
  }

  /**
   * Adjust the font size of a rendition
   * @param {number} size
   */
  fontSize(size: string): void {
    this.override('font-size', size);
  }

  /**
   * Adjust the font-family of a rendition
   * @param {string} f
   */
  font(f: string): void {
    this.override('font-family', f, true);
  }

  destroy(): void {
    // @ts-ignore
    this.rendition = undefined;
    // @ts-ignore
    this._themes = undefined;
    // @ts-ignore
    this._overrides = undefined;
    // @ts-ignore
    this._current = undefined;
    // @ts-ignore
    this._injected = undefined;
  }
}

export default Themes;
