import Metro from 'metro';
import express from 'express';

const app = express();
const hostname = 'localhost';

Metro.loadConfig().then(async config => {
  const metroBundlerServer = await Metro.runMetro(config);
  app.use(metroBundlerServer.processRequest.bind(metroBundlerServer));

  app.use('/', express.static('examples'));
  app.use('/', express.static('test'));

  const { server: serverConfig } = config;
  const { port } = serverConfig;
  app.listen(port, hostname, () => {
    setTimeout(() => {
      console.log(`Server running at http://${hostname}:${port}/`);
    }, 100);
  });
});
