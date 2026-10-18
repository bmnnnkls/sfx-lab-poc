import config from '../../vite.config.ts'

// Keep diagnostic reproductions separate from the normal unit/architecture suite.
export default {
  ...config,
  test: {
    environment: 'node',
    include: ['docs/tmp/claims.test.ts'],
    cache: false,
    silent: false,
  },
}
