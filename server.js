import Metro from 'metro';
import express from 'express';
import os from 'os';
import cors from 'cors';

const app = express();
const hostname = 'localhost';

const networkInterfaces = os.networkInterfaces();
let serverIpAddress;

for (const interfaceName in networkInterfaces) {
  const networkInterface = networkInterfaces[interfaceName];
  for (const details of networkInterface) {
    if (details.family === 'IPv4' && !details.internal) {
      serverIpAddress = details.address;
      break;
    }
  }
  if (serverIpAddress) break;
}

Metro.loadConfig().then(async config => {
  const metroBundlerServer = await Metro.runMetro(config);
  app.use(metroBundlerServer.processRequest.bind(metroBundlerServer));

  app.use(cors());
  app.use('/', express.static('examples'));
  app.use('/', express.static('test'));
  app.use('/dist', express.static('dist'));

  const { server: serverConfig } = config;
  const { port } = serverConfig;
  const server = app.listen(port, () => {
    setTimeout(() => {
      console.log(`Server running at http://${hostname}:${port}/`);
      console.log(`Server running at http://${serverIpAddress}:${port}/`);
    }, 100);
  });
});
