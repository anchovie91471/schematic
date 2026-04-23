const { app } = require('../../../dist/index.cjs');

module.exports = {
  ...app.section('Test Section'),
  enabled_on: {
    templates: ['index', 'product'],
  },
  settings: [
    app.make('text', {
      id: 'heading',
      label: 'Heading',
      default: 'Test Heading',
    }),
    app.colorSelector,
  ],
  blocks: [
    { type: '@app' },
  ],
};