window.ReactNativeWebView = {
  postMessage: (message: string) => {
    const data = JSON.parse(message);
    console.log('ReactNativeWebView postMessage', data.type);
  },
};
