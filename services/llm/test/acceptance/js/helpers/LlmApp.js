let ensureRunningPromise;

export const LlmApp = {
  async ensureRunning() {
    if (!ensureRunningPromise) {
      ensureRunningPromise = import('../../../../app/server.js').then(async ({ createApp }) => {
        const app = await createApp();
        const server = app.listen(0, '127.0.0.1');
        await new Promise((resolve, reject) => {
          server.once('listening', resolve);
          server.once('error', reject);
        });
        return { app, server };
      });
    }
    return ensureRunningPromise;
  },

  async baseUrl() {
    const { server } = await this.ensureRunning();
    const address = server.address();
    return `http://127.0.0.1:${address.port}`;
  },
};
