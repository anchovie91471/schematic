const { app } = require('../../../../dist/index.cjs');

module.exports = {
  name: 'Test Block',
  settings: [
    app.make('text', {
      id: 'message',
      label: 'Message',
      default: 'Test message',
    }),
  ],
};