// Default values
let jupyterHost = '127.0.0.1';
let jupyterPort = '8888';
let jupyterToken = '';

export function setJupyterConfig(host: string, port: string, token: string) {
  jupyterHost = host;
  jupyterPort = port;
  jupyterToken = token;
}

export function getJupyterConfig() {
  return {
    host: jupyterHost,
    port: jupyterPort, 
    token: jupyterToken
  };
}
