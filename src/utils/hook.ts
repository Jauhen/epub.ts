export interface HooksObject {
  [key: string]: Hook;
}

/**
 * Hooks allow for injecting functions that must all complete in order before finishing
 * They will execute in parallel but all must finish before continuing
 * Functions may return a promise if they are async.
 * @param {any} context scope of this
 * @example this.content = new EPUBJS.Hook(this);
 */
class Hook {
  context: object;
  hooks: Function[];

  constructor(context?: object) {
    this.context = context || this;
    this.hooks = [];
  }

  /**
   * Adds a function to be run before a hook completes
   * @example this.content.register(function(){...});
   */
  register(funcOrArr: Function | Array<Function>): void {
    if (typeof funcOrArr === 'function') {
      this.hooks.push(funcOrArr);
    } else {
      // unpack array
      const funcArray = funcOrArr;
      for (let j = 0; j < funcArray.length; ++j) {
        this.hooks.push(funcArray[j]);
      }
    }
  }

  /**
   * Removes a function
   * @example this.content.deregister(function(){...});
   */
  deregister(func: Function): void {
    let hook;
    for (let i = 0; i < this.hooks.length; i++) {
      hook = this.hooks[i];
      if (hook === func) {
        this.hooks.splice(i, 1);
        break;
      }
    }
  }

  /**
   * Triggers a hook to run all functions
   * @example this.content.trigger(args).then(function(){...});
   */
  trigger(...args: any[]): Promise<any> {
    const context = this.context;
    const promises: Promise<any>[] = [];

    this.hooks.forEach(function (task: Function) {
      try {
        var executing = task.apply(context, args);
      } catch (err) {
        console.log(err);
      }

      if (executing && typeof executing['then'] === 'function') {
        // Task is a function that returns a promise
        promises.push(executing);
      }
      // Otherwise Task resolves immediately, continue
    });

    return Promise.all(promises) as Promise<any>;
  }

  // Adds a function to be run before a hook completes
  list(): Array<any> {
    return this.hooks as Array<any>;
  }

  clear(): void {
    this.hooks = [];
  }
}
export default Hook;
