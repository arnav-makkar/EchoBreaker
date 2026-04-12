import { describe, it, expect, beforeEach } from 'vitest';
import {
  acceptConsent, withdrawConsent, isResearchMode,
  hasConsented, getParticipantId, getCondition,
  getEffectiveCondition, clearResearchIdentity,
} from '../src/shared/research.js';

describe('research mode gating', () => {
  it('defaults to off for fresh installs', async () => {
    expect(await isResearchMode()).toBe(false);
    expect(await hasConsented()).toBe(false);
    expect(await getParticipantId()).toBe(null);
    expect(await getCondition()).toBe(null);
    expect(await getEffectiveCondition()).toBe('full');
  });

  it('accepts consent and assigns a condition', async () => {
    const { participantId, condition } = await acceptConsent();
    expect(participantId).toMatch(/[0-9a-f-]{36}/);
    expect(['control', 'full']).toContain(condition);

    expect(await hasConsented()).toBe(true);
    expect(await isResearchMode()).toBe(true);
    expect(await getParticipantId()).toBe(participantId);
    expect(await getCondition()).toBe(condition);
  });

  it('withdraw stops research mode but keeps identity', async () => {
    const { participantId } = await acceptConsent();
    await withdrawConsent();
    expect(await isResearchMode()).toBe(false);
    expect(await hasConsented()).toBe(true);
    expect(await getParticipantId()).toBe(participantId);
  });

  it('clearResearchIdentity removes everything', async () => {
    await acceptConsent();
    await clearResearchIdentity();
    expect(await hasConsented()).toBe(false);
    expect(await getParticipantId()).toBe(null);
    expect(await getCondition()).toBe(null);
    expect(await isResearchMode()).toBe(false);
  });
});
