/**
 * Health Check Integration Tests
 */

import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../app';

describe('Health Check Endpoint', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('should return health status on GET /api/v1/health', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('services');
    expect(response.body.services).toHaveProperty('database');
    expect(response.body.services).toHaveProperty('redis');
  });

  it('should not require authentication', async () => {
    const response = await request(app).get('/api/v1/health');

    // Should not return 401
    expect(response.status).not.toBe(401);
  });
});
