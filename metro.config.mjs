import { getDefaultConfig } from 'metro-config';

export default (async () => {
  const config = await getDefaultConfig(__dirname);
  
  return {
    ...config,
    server: {
      port: 8000,
    },
    
    // Resolver configuration
    resolver: {
      ...config.resolver,
      sourceExts: ['js', 'json', 'ts', 'tsx'],
    },
  };
})();

// const { getDefaultConfig } = require('metro-config');
// const path = require('path');

// const PROD = (process.env.NODE_ENV === "production");
// const LEGACY = (process.env.LEGACY);
// const MINIMIZE = (process.env.MINIMIZE === "true");

// module.exports = (async () => {
//   const config = await getDefaultConfig(__dirname);
  
//   return {
//     ...config,
    
//     // Transformer configuration
//     transformer: {
//       ...config.transformer,
//       minifierConfig: {
//         mangle: MINIMIZE,
//         output: {
//           ascii_only: true,
//           quote_style: 3,
//           wrap_iife: true,
//         },
//         sourceMap: !MINIMIZE,
//         toplevel: false,
//         warnings: false,
//       },
//     },
    
//     // Resolver configuration
//     resolver: {
//       ...config.resolver,
//       alias: {
//         'path': 'path-webpack',
//       },
//       sourceExts: ['js', 'json', 'ts', 'tsx'],
//     },
    
//     // Serializer configuration for browser builds
//     serializer: {
//       ...config.serializer,
//       createModuleIdFactory: () => {
//         let nextId = 0;
//         const moduleIdMap = new Map();
        
//         return (path) => {
//           if (!moduleIdMap.has(path)) {
//             moduleIdMap.set(path, nextId++);
//           }
//           return moduleIdMap.get(path);
//         };
//       },
//       getModulesRunBeforeMainModule: () => [],
//       processModuleFilter: (module) => {
//         // Include all modules
//         return true;
//       },
//     },
    
//     // Watch folders
//     watchFolders: [
//       path.resolve(__dirname, 'src'),
//       path.resolve(__dirname, 'lib'),
//     ],
    
//     // Project root
//     projectRoot: __dirname,
//   };
// })();