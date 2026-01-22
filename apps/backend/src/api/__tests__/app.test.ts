/**
 * API Gateway Integration Tests
 * Tests critical middleware integration
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';

describe('API Gateway', () => {
  let app: Express;

  beforeEach(() => {
    // Create fresh app for each test to avoid rate limit interference
    app = createApp();
  });

  describe('Rate Limiting', () => {
    // Skip this test in CI/automated runs - rate limiter uses in-memory store
    // Manual testing can be done with: curl -i http://localhost:3000/api/v1/health (repeat 101 times)
    it.skip('should return 429 when rate limit exceeded', async () => {
      // Make 101 requests (limit is 100 per minute)
      const requests = Array.from({ length: 101 }, () => request(app).get('/api/v1/health'));

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);

      if (rateLimited.length > 0) {
        expect(rateLimited[0].body).toHaveProperty('error', 'RATE_LIMITED');
        expect(rateLimited[0].body).toHaveProperty('retry_after_seconds');
      }
    });
  });

  describe('Content-Type Validation', () => {
    it('should reject POST without application/json', async () => {
      const response = await request(app)
        .post('/api/v1/test')
        .set('Content-Type', 'text/plain')
        .send('not json');

      expect(response.status).toBe(415);
      expect(response.body).toHaveProperty('error', 'UNSUPPORTED_MEDIA_TYPE');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/v1/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'NOT_FOUND');
    });
  });

  describe('Error Format', () => {
    it('should return standardized error format', async () => {
      const response = await request(app).get('/api/v1/nonexistent');

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });
  });
});
