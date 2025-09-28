// Type definitions for path-webpack (custom local typings)
// Project: path-webpack (custom local typings)

/** POSIX path API, similar to Node.js 'path' module, but for browser/webpack environments. */
declare module 'path-webpack' {
  export interface PathObject {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
  }

  export interface PosixPath {
    resolve(...paths: string[]): string;
    normalize(path: string): string;
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
    dirname(path: string): string;
    basename(path: string, ext?: string): string;
    extname(path: string): string;
    format(pathObject: PathObject): string;
    parse(path: string): PathObject;
    sep: string;
    delimiter: string;
  }

  const posix: PosixPath;
  export default posix;
}
