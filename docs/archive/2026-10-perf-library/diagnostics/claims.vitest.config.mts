import config from '../../../../vite.config.ts'

// Keep diagnostic reproductions separate from the normal unit/architecture suite.
export default {
  ...config,
  test: {
    environment: 'node',
    include: ['docs/archive/2026-10-perf-library/diagnostics/claims.test.ts'],
    cache: false,
    silent: false,
  },
}
