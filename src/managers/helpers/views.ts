class Views {
  container: HTMLElement | null;
  _views: any[];
  length: number;
  hidden: boolean;

  constructor(container?: HTMLElement | null) {
    this.container = container || null;
    this._views = [];
    this.length = 0;
    this.hidden = false;
  }

  all(): any[] {
    return this._views;
  }

  first(): any {
    return this._views[0];
  }

  last(): any {
    return this._views[this._views.length - 1];
  }

  indexOf(view: any): number {
    return this._views.indexOf(view);
  }

  slice(...args: any[]): any[] {
    return (this._views.slice as any).apply(this._views, args);
  }

  get(i: number): any {
    return this._views[i];
  }

  append(view: any): any {
    this._views.push(view);
    if (this.container) {
      this.container.appendChild(view.element);
    }
    this.length++;
    return view;
  }

  prepend(view: any): any {
    this._views.unshift(view);
    if (this.container) {
      this.container.insertBefore(view.element, this.container.firstChild);
    }
    this.length++;
    return view;
  }

  insert(view: any, index: number): any {
    this._views.splice(index, 0, view);

    if (this.container) {
      if (index < this.container.children.length) {
        this.container.insertBefore(
          view.element,
          this.container.children[index],
        );
      } else {
        this.container.appendChild(view.element);
      }
    }

    this.length++;
    return view;
  }

  remove(view: any): void {
    const index = this._views.indexOf(view);

    if (index > -1) {
      this._views.splice(index, 1);
    }

    this.destroy(view);

    this.length--;
  }

  destroy(view: any): void {
    if (view.displayed) {
      view.destroy();
    }

    if (this.container) {
      this.container.removeChild(view.element);
    }
    // Note: Cannot assign null to parameter in TypeScript, removing assignment
  }

  // Iterators

  forEach(...args: any[]): void {
    return (this._views.forEach as any).apply(this._views, args);
  }

  clear(): void {
    // Remove all views
    let view;
    const len = this.length;

    if (!this.length) return;

    for (let i = 0; i < len; i++) {
      view = this._views[i];
      this.destroy(view);
    }

    this._views = [];
    this.length = 0;
  }

  find(section: any): any {
    let view;
    const len = this.length;

    for (let i = 0; i < len; i++) {
      view = this._views[i];
      if (view.displayed && view.section.index == section.index) {
        return view;
      }
    }
  }

  displayed(): any[] {
    const displayed = [];
    let view;
    const len = this.length;

    for (let i = 0; i < len; i++) {
      view = this._views[i];
      if (view.displayed) {
        displayed.push(view);
      }
    }
    return displayed;
  }

  show(): void {
    let view;
    const len = this.length;

    for (let i = 0; i < len; i++) {
      view = this._views[i];
      if (view.displayed) {
        view.show();
      }
    }
    this.hidden = false;
  }

  hide(): void {
    let view;
    const len = this.length;

    for (let i = 0; i < len; i++) {
      view = this._views[i];
      if (view.displayed) {
        view.hide();
      }
    }
    this.hidden = true;
  }
}

export default Views;
