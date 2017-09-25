'use strict'

const Datastore = require('@google-cloud/datastore');
// Your Google Cloud Platform project ID
const projectId = 'river-dash';

// Instantiates a client
const datastore = Datastore({
  projectId: projectId
});

module.exports = datastore;
