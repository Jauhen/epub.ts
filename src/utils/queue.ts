import { Defer, defer, requestAnimationFrame } from './core';

export interface QueuedTask {
  task?: Task;
  args: string[];
  deferred?: Defer<void>;
  promise: Promise<void>;
}

/**
 * Queue for handling tasks one at a time
 * @class
 * @param {scope} context what this will resolve to in the tasks
 */
class Queue<T = object> {
  private _q: QueuedTask[];
  private context: T;
  private tick: (callback: () => void) => number;
  private running: boolean | Promise<void> | undefined;
  private paused: boolean;
  private deferred: Defer<void> | undefined;

  constructor(context: T) {
    this._q = [];
    this.context = context;
    this.tick = requestAnimationFrame;
    this.running = false;
    this.paused = false;
  }

  /**
   * Add an item to the queue
   * @return {Promise}
   */
  enqueue(
    task: () => void | Promise<unknown>,
    ...args: string[]
  ): Promise<void> {
    // Handle single args without context
    // if(args && !Array.isArray(args)) {
    //   args = [args];
    // }
    if (!task) {
      throw new Error('No Task Provided');
    }

    let queued: QueuedTask;
    if (typeof task === 'function') {
      const deferred = defer<void>();
      const promise = deferred.promise;
      queued = {
        task: task,
        args: Array.from(args),
        //context  : context,
        deferred: deferred,
        promise: promise,
      };
    } else {
      // Task is a promise
      queued = {
        args: [],
        promise: task,
      };
    }

    this._q.push(queued);

    // Wait to start queue flush
    if (this.paused == false && !this.running) {
      // setTimeout(this.flush.bind(this), 0);
      // this.tick.call(window, this.run.bind(this));
      this.run();
    }

    return queued.promise;
  }

  /**
   * Run one item
   * @return {Promise}
   */
  dequeue(): Promise<QueuedTask | void> {
    if (this._q.length && !this.paused) {
      const inwait = this._q.shift();
      if (inwait) {
        const task = inwait.task;
        if (task) {
          // console.log(task)

          const result = task.apply(this.context, inwait.args);

          if (result && typeof result['then'] === 'function') {
            // Task is a function that returns a promise
            return result.then(
              (value: any) => {
                inwait!.deferred?.resolve.apply(this.context, [value]);
              },
              (error: any) => {
                inwait!.deferred?.reject.apply(this.context, [error]);
              },
            );
          } else {
            // Task resolves immediately
            inwait.deferred?.resolve.apply(this.context, [result]);
            return inwait.promise;
          }
        } else if (inwait.promise) {
          // Task is a promise
          return inwait.promise;
        }
      }
    } else {
      const deferredResult = defer<void>();
      deferredResult.resolve();
      return deferredResult.promise;
    }

    // Return a resolved promise if no task was found
    return Promise.resolve({} as QueuedTask);
  }

  // Run All Immediately
  dump() {
    while (this._q.length) {
      this.dequeue();
    }
  }

  /**
   * Run all tasks sequentially, at convince
   * @return {Promise}
   */
  run(): Promise<void> {
    if (!this.running) {
      this.running = true;
      this.deferred = defer();
    }

    this.tick.call(window, () => {
      if (this._q.length) {
        this.dequeue().then(() => {
          this.run();
        });
      } else {
        this.deferred?.resolve();
        this.running = undefined;
      }
    });

    // Unpause
    if (this.paused == true) {
      this.paused = false;
    }

    return this.deferred?.promise ?? Promise.resolve();
  }

  /**
   * Flush all, as quickly as possible
   * @return {Promise}
   */
  flush(): Promise<void> {
    if (this.running) {
      return this.running as Promise<void>;
    }

    if (this._q.length) {
      this.running = this.dequeue().then(() => {
        this.running = undefined;
        return this.flush();
      });

      return this.running as Promise<void>;
    }

    return Promise.resolve();
  }

  /**
   * Clear all items in wait
   */
  clear(): void {
    this._q = [];
  }

  /**
   * Get the number of tasks in the queue
   * @return {number} tasks
   */
  length(): number {
    return this._q.length;
  }

  /**
   * Pause a running queue
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * End the queue
   */
  stop(): void {
    this._q = [];
    this.running = false;
    this.paused = true;
  }
}

/**
 * Create a new task from a callback
 * @class
 * @private
 * @param {function} task
 * @param {array} args
 * @param {scope} context
 * @return {function} task
 */
class Task<T = object> extends Function {
  constructor(
    task: (...args: (string | ((value: any, err?: any) => void))[]) => void,
    context: T,
  ) {
    super();
    return function (
      ...toApply: (string | ((value: any, err?: any) => void))[]
    ) {
      return new Promise((resolve, reject) => {
        const callback = function (value: any, err?: any) {
          if (!value && err) {
            reject(err);
          } else {
            resolve(value);
          }
        };
        // Add the callback to the arguments list
        toApply.push(callback);

        // Apply all arguments to the functions
        task.apply(context, toApply);
      });
    } as () => Promise<void>;
  }
}

export default Queue;
export { Task };
