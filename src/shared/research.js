// Research-mode plumbing: participant ID, condition assignment, consent
// flag, session ID. Off by default. Production users never touch this.
//
// The condition is assigned deterministically from the participant ID's
// SHA-256 hash so the assignment is reproducible if you ever need to
// audit it (e.g., the study runs into a question about whether the
// randomization was actually random).

const K = {
  consented:    'research_consented',
  participant:  'research_participant_id',
  condition:    'research_condition',
  sessionId:    'research_session_id',
  researchMode: 'research_mode',
};

export async function isResearchMode() {
  const { [K.researchMode]: v = false } = await chrome.storage.local.get(K.researchMode);
  return !!v;
}

export async function getParticipantId() {
  const { [K.participant]: id = null } = await chrome.storage.local.get(K.participant);
  return id;
}

export async function getCondition() {
  const { [K.condition]: c = null } = await chrome.storage.local.get(K.condition);
  return c; // 'control' | 'full' | null
}

/**
 * Non-research users get 'full' as the effective condition so the
 * product behaves normally. Research users get their assigned condition.
 */
export async function getEffectiveCondition() {
  const c = await getCondition();
  return c || 'full';
}

export async function getSessionId() {
  const { [K.sessionId]: id } = await chrome.storage.local.get(K.sessionId);
  if (id) return id;
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ [K.sessionId]: fresh });
  return fresh;
}

export async function hasConsented() {
  const { [K.consented]: v = false } = await chrome.storage.local.get(K.consented);
  return !!v;
}

/**
 * User accepts the consent form. Generate a participant ID, hash it,
 * deterministically assign a condition, and flip research mode on.
 * Returns the full enrollment record.
 */
export async function acceptConsent() {
  const id = crypto.randomUUID();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  const condition = ((new Uint8Array(buf))[0] % 2 === 0) ? 'control' : 'full';

  await chrome.storage.local.set({
    [K.consented]:    true,
    [K.participant]:  id,
    [K.condition]:    condition,
    [K.researchMode]: true,
  });
  return { participantId: id, condition };
}

/**
 * Withdraw from research. Stops all new event logging immediately but
 * leaves existing data in place. Per IRB: withdrawal means "stop
 * collecting," not "erase history." A separate "delete all research
 * data" action handles erasure.
 */
export async function withdrawConsent() {
  await chrome.storage.local.set({ [K.researchMode]: false });
}

export async function clearResearchIdentity() {
  await chrome.storage.local.remove([
    K.consented, K.participant, K.condition, K.sessionId, K.researchMode,
  ]);
}
