import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { TEST_PASSWORD } from './db.js';

export const app = createApp();
export const api = supertest(app);

export const BASE = '/api/v1';

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  schoolId: string | null;
}

export async function login(identifier: string, password = TEST_PASSWORD): Promise<Session> {
  const response = await api.post(`${BASE}/auth/login`).send({ identifier, password });

  if (response.status !== 200) {
    throw new Error(
      `Login failed for ${identifier}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    userId: response.body.user.id,
    schoolId: response.body.user.schoolId,
  };
}

export function auth(session: Session) {
  return { Authorization: `Bearer ${session.accessToken}` };
}
