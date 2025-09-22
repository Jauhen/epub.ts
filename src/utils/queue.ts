import {defer, requestAnimationFrame} from "./core";

export interface QueuedTask {
  task: any | Task,
  args: any[],
  deferred: any, // should be defer, but not working
  promise: Promise<any>
}

/**
 * Queue for handling tasks one at a time
 * @class
 * @param {scope} context what this will resolve to in the tasks
 */
class Queue {
	private _q: QueuedTask[];
	private context: any;
	private tick: any;
	private running: boolean | Promise<any> | undefined;
	private paused: boolean;
	private defered: any;

	constructor(context: any){
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
	enqueue(...args: any[]): Promise<any> {
		var deferred: any, promise: Promise<any>;
		var queued: QueuedTask;
		var task = args.shift();
		var taskArgs = Array.from(args);

		// Handle single args without context
		// if(args && !Array.isArray(args)) {
		//   args = [args];
		// }
		if(!task) {
			throw new Error("No Task Provided");
		}

		if(typeof task === "function"){

			deferred = defer();
			promise = deferred.promise;

			queued = {
				"task" : task,
				"args"     : taskArgs,
				//"context"  : context,
				"deferred" : deferred,
				"promise" : promise
			};

		} else {
			// Task is a promise
			queued = {
				"task": null,
				"args": [],
				"deferred": null,
				"promise" : task
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
		var inwait: QueuedTask | undefined, task: any, result: any;

		if(this._q.length && !this.paused) {
			inwait = this._q.shift();
			if(inwait) {
				task = inwait.task;
				if(task){
					// console.log(task)

					result = task.apply(this.context, inwait.args);

					if(result && typeof result["then"] === "function") {
						// Task is a function that returns a promise
						return result.then((value: any) => {
							inwait!.deferred.resolve.apply(this.context, [value]);
						}, (error: any) => {
							inwait!.deferred.reject.apply(this.context, [error]);
						});
					} else {
						// Task resolves immediately
						inwait.deferred.resolve.apply(this.context, [result]);
						return inwait.promise;
					}

				} else if(inwait.promise) {
					// Task is a promise
					return inwait.promise;
				}
			}

		} else {
			let deferredResult = defer<void>();
			deferredResult.resolve();
			return deferredResult.promise;
		}

		// Return a resolved promise if no task was found
		return Promise.resolve({} as QueuedTask);
	}

	// Run All Immediately
	dump(){
		while(this._q.length) {
			this.dequeue();
		}
	}

	/**
	 * Run all tasks sequentially, at convince
	 * @return {Promise}
	 */
	run(): Promise<void> {

		if(!this.running){
			this.running = true;
			this.defered = defer();
		}

		this.tick.call(window, () => {

			if(this._q.length) {

				this.dequeue()
					.then(() => {
						this.run();
					});

			} else {
				this.defered.resolve();
				this.running = undefined;
			}

		});

		// Unpause
		if(this.paused == true) {
			this.paused = false;
		}

		return this.defered.promise;
	}

	/**
	 * Flush all, as quickly as possible
	 * @return {Promise}
	 */
	flush(): Promise<void> {

		if(this.running){
			return this.running as Promise<void>;
		}

		if(this._q.length) {
			this.running = this.dequeue()
				.then(() => {
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
class Task {
	constructor(task: any, args: any[], context: any){

		return function(...toApply: any[]){

			return new Promise( (resolve, reject) => {
				var callback = function(value: any, err?: any){
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

		} as any;

	}
}


export default Queue;
export { Task };
