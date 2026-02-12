import { createApp } from '../packages/api/src/app.js';
import type { SharedDeps } from '../packages/core/src/infrastructure/tenant-repositories.js';
import type { Firestore } from '@google-cloud/firestore';

const app = createApp({
  db: {} as Firestore,
  projectId: '',
  sharedDeps: {} as SharedDeps,
});

const doc = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: {
    title: 'Mycel API',
    version: '1.0.0',
    description: 'AI-powered Universal Knowledge Engine API',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  security: [{ Bearer: [] }],
});

doc.components = {
  ...doc.components,
  securitySchemes: {
    Bearer: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
};

process.stdout.write(JSON.stringify(doc, null, 2));
process.stdout.write('\n');
