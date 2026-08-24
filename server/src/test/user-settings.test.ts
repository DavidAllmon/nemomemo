import { describe, expect, it } from 'vitest';
import type { UserGeneralSetting } from '@nemomemo/shared';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

type SettingsResponse = { general: UserGeneralSetting; memoViews: unknown[] };

async function getSettings(
  app: Parameters<typeof jsonRequest>[0],
  cookie: string,
): Promise<SettingsResponse> {
  const response = await jsonRequest(app, 'GET', '/api/v1/users/-/settings', undefined, cookie);
  expect(response.status).toBe(200);
  return (await response.json()) as SettingsResponse;
}

describe('user settings — pinned tags', () => {
  it('defaults to an empty list', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    expect((await getSettings(app, cookie)).general.pinnedTags).toEqual([]);
  });

  it('round-trips through PATCH', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const patch = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/settings',
      { general: { pinnedTags: ['reef', 'reef/coral'] } },
      cookie,
    );
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as SettingsResponse).general.pinnedTags).toEqual([
      'reef',
      'reef/coral',
    ]);
    expect((await getSettings(app, cookie)).general.pinnedTags).toEqual(['reef', 'reef/coral']);
  });

  it('leaves the other general settings alone', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/settings',
      { general: { defaultVisibility: 'PUBLIC' } },
      cookie,
    );
    await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/settings',
      { general: { pinnedTags: ['reef'] } },
      cookie,
    );
    const { general } = await getSettings(app, cookie);
    expect(general.defaultVisibility).toBe('PUBLIC');
    expect(general.pinnedTags).toEqual(['reef']);
  });

  it('rejects more than 20 pinned tags', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'marlin');
    const response = await jsonRequest(
      app,
      'PATCH',
      '/api/v1/users/-/settings',
      { general: { pinnedTags: Array.from({ length: 21 }, (_, i) => `tag${i}`) } },
      cookie,
    );
    expect(response.status).toBe(400);
  });

  it('is private to each member', async () => {
    const { app } = makeTestApp();
    const marlin = await signup(app, 'marlin');
    const dory = await signup(app, 'dory');
    await jsonRequest(app, 'PATCH', '/api/v1/users/-/settings', { general: { pinnedTags: ['reef'] } }, marlin);
    expect((await getSettings(app, dory)).general.pinnedTags).toEqual([]);
  });
});
