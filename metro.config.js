export const server = {
  port: 8000,
};

// Resolver configuration
export const resolver = {
  sourceExts: ['js', 'json', 'ts', 'tsx'],
};

export const transformer = {
  minifierConfig: {
    compress: {
      drop_console: false,
    },
  },
};
