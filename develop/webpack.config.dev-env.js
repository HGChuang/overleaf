const { merge } = require('webpack-merge')

const base = require('./webpack.config.dev')

module.exports = merge(base, {
  devServer: {
    allowedHosts: 'auto',
    devMiddleware: {
      index: false,
    },
    // Drop the benign "ResizeObserver loop" runtime error from the dev overlay
    // so it stops popping when the editor reflows on a lint/format change. The
    // error is spurious (browsers self-correct by skipping the frame) and is
    // already in error-reporter.ts's Sentry ignoreErrors. Compile
    // errors/warnings stay on (webpack-dev-server defaults them to `true` for a
    // partially-specified overlay object); every other runtime error still
    // surfaces. The DISABLE_WEBPACK_OVERLAY toggle is preserved.
    client: {
      overlay:
        process.env.DISABLE_WEBPACK_OVERLAY !== 'true' && {
          runtimeErrors: error =>
            !/ResizeObserver loop/.test(
              (typeof error === 'string' ? error : error?.message) || ''
            ),
        },
    },
    proxy: [
      {
        context: '/socket.io/**',
        target: 'http://real-time:3026',
        ws: true,
      },
      {
        context: ['!**/*.js', '!**/*.css', '!**/*.json'],
        target: 'http://web:3000',
      },
    ],
  },
})
