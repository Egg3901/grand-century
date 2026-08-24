import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/gameData';
import { extractPlayerView, extractShared, diffShared, applySharedDiff, mergeSnapshot } from '../src/net/snapshotCodec';
import { createWorld } from '../src/sim/bootstrap';
import { buildPlayerView, buildSharedSnapshot, buildSnapshot } from '../src/sim/snapshot';
import { advanceDay } from '../src/sim/world';

describe('snapshot contract', () => {
  it('returns one province summary per world province', () => {
    const world = createWorld(GAME_DATA, 1836);
    const snap = buildSnapshot(world, GAME_DATA);
    expect(snap.provinces).toHaveLength(world.provinces.length);
  });

  it('composed shared + player view deep-equals buildSnapshot wire fields over 200 days', () => {
    const world = createWorld(GAME_DATA, 1836);
    const days = 200;
    for (let i = 0; i < days; i++) {
      advanceDay(world, GAME_DATA);
      // Sample every 25 days + final day — full every-day would dominate wall time.
      if (i % 25 !== 24 && i !== days - 1) continue;

      const full = buildSnapshot(world, GAME_DATA);
      const shared = buildSharedSnapshot(world, GAME_DATA);
      const view = buildPlayerView(world, GAME_DATA, world.playerNation);

      // Player wire fields: exact compose identity.
      expect(extractPlayerView(full)).toEqual(view);

      // Shared wire fields: identical except cultureHeartland, which the former
      // single-pass (and buildSnapshot) stamps from world.playerNation onto
      // provinces after the shared build.
      const heartlandStates = new Set<number>();
      for (const movement of world.movements ?? []) {
        if (movement.nation !== world.playerNation) continue;
        for (const stateId of movement.heartlandStateIds) heartlandStates.add(stateId);
      }
      const sharedWithHeartland = {
        ...shared,
        provinces: shared.provinces.map((province) => ({
          ...province,
          cultureHeartland: heartlandStates.has(province.stateId) ? true : false,
        })),
      };
      expect(extractShared(full)).toEqual(sharedWithHeartland);
    }
  });

  it('shared + playerView merge includes crisis, culture, colonial, battle, chronicle, and balance-of-power fields', () => {
    const world = createWorld(GAME_DATA, 1836);
    // Advance enough days for some game state to develop
    for (let i = 0; i < 100; i++) advanceDay(world, GAME_DATA);

    const full = buildSnapshot(world, GAME_DATA);
    const shared = buildSharedSnapshot(world, GAME_DATA);
    const view = buildPlayerView(world, GAME_DATA, world.playerNation);
    const merged = mergeSnapshot(shared, view);

    // World-global fields present in shared and merged
    expect(merged.worldTension).toBe(full.worldTension);
    expect(merged.tensionDecay).toBe(full.tensionDecay);
    expect(merged.tensionNetDelta).toBe(full.tensionNetDelta);
    expect(merged.crisisCooldownUntil).toBe(full.crisisCooldownUntil);
    expect(merged.activeCrisis).toEqual(full.activeCrisis);
    expect(merged.crisisShowdown).toEqual(full.crisisShowdown);
    expect(merged.crisisCandidates).toEqual(full.crisisCandidates);
    expect(merged.congressHistory).toEqual(full.congressHistory);
    expect(merged.chronicle).toEqual(full.chronicle);
    expect(merged.chronicleWarsFought).toBe(full.chronicleWarsFought);

    // Player-specific fields present in view and merged
    expect(merged.playerBalanceOfPower).toEqual(full.playerBalanceOfPower);
    expect(merged.recentBattles).toEqual(full.recentBattles);
    expect(merged.campaignOver).toBe(full.campaignOver);
    expect(merged.playerCulturePolicy).toBe(full.playerCulturePolicy);
    expect(merged.playerCulturePolicyCooldownDays).toBe(full.playerCulturePolicyCooldownDays);
    expect(merged.playerCulturePolicyCost).toBe(full.playerCulturePolicyCost);
    expect(merged.playerCultures).toEqual(full.playerCultures);
    expect(merged.playerMovements).toEqual(full.playerMovements);
    expect(merged.colonialClaims).toEqual(full.colonialClaims);
    expect(merged.playerClaimableColonialStates).toEqual(full.playerClaimableColonialStates);
  });

  it('diff/apply round-trip preserves new shared fields', () => {
    const world = createWorld(GAME_DATA, 1836);
    const snapA = buildSharedSnapshot(world, GAME_DATA);

    // Advance to create state changes
    for (let i = 0; i < 50; i++) advanceDay(world, GAME_DATA);
    const snapB = buildSharedSnapshot(world, GAME_DATA);

    const diff = diffShared(snapA, snapB);
    const rebuilt = applySharedDiff(snapA, diff);

    // Verify the new shared fields survive the round trip
    expect(rebuilt.worldTension).toBe(snapB.worldTension);
    expect(rebuilt.tensionDecay).toBe(snapB.tensionDecay);
    expect(rebuilt.tensionNetDelta).toBe(snapB.tensionNetDelta);
    expect(rebuilt.crisisCooldownUntil).toBe(snapB.crisisCooldownUntil);
    expect(rebuilt.activeCrisis).toEqual(snapB.activeCrisis);
    expect(rebuilt.crisisShowdown).toEqual(snapB.crisisShowdown);
    expect(rebuilt.crisisCandidates).toEqual(snapB.crisisCandidates);
    expect(rebuilt.congressHistory).toEqual(snapB.congressHistory);
    expect(rebuilt.chronicle).toEqual(snapB.chronicle);
    expect(rebuilt.chronicleWarsFought).toBe(snapB.chronicleWarsFought);
  });

  it('direct snapshot for a nation matches shared + that nation playerView reconstruction', () => {
    const world = createWorld(GAME_DATA, 1836);
    // Test with different nations
    const nations = [0, 1, 2, 5];
    for (let i = 0; i < 80; i++) advanceDay(world, GAME_DATA);

    for (const nationId of nations) {
      // Build the direct snapshot as if this nation were the player
      const prevPlayerNation = world.playerNation;
      world.playerNation = nationId;
      const direct = buildSnapshot(world, GAME_DATA);
      world.playerNation = prevPlayerNation;

      // Build via the MP wire path
      const shared = buildSharedSnapshot(world, GAME_DATA);
      const view = buildPlayerView(world, GAME_DATA, nationId);

      const reconstructed = mergeSnapshot(shared, view);

      // Every gameplay field must match
      expect(reconstructed.day).toBe(direct.day);
      expect(reconstructed.playerNation).toBe(direct.playerNation);
      expect(reconstructed.worldTension).toBe(direct.worldTension);
      expect(reconstructed.tensionDecay).toBe(direct.tensionDecay);
      expect(reconstructed.activeCrisis).toEqual(direct.activeCrisis);
      expect(reconstructed.crisisShowdown).toEqual(direct.crisisShowdown);
      expect(reconstructed.crisisCandidates).toEqual(direct.crisisCandidates);
      expect(reconstructed.chronicle).toEqual(direct.chronicle);
      expect(reconstructed.chronicleWarsFought).toBe(direct.chronicleWarsFought);
      expect(reconstructed.campaignOver).toBe(direct.campaignOver);
      expect(reconstructed.recentBattles).toEqual(direct.recentBattles);
      expect(reconstructed.playerBalanceOfPower).toEqual(direct.playerBalanceOfPower);
      expect(reconstructed.playerCulturePolicy).toBe(direct.playerCulturePolicy);
      expect(reconstructed.playerCultures).toEqual(direct.playerCultures);
      expect(reconstructed.playerMovements).toEqual(direct.playerMovements);
      expect(reconstructed.provinces.map((province) => province.cultureHeartland))
        .toEqual(direct.provinces.map((province) => province.cultureHeartland));
      expect(reconstructed.colonialClaims).toEqual(direct.colonialClaims);
      expect(reconstructed.playerClaimableColonialStates).toEqual(direct.playerClaimableColonialStates);
      expect(reconstructed.playerBudget).toEqual(direct.playerBudget);
      expect(reconstructed.nations.length).toBe(direct.nations.length);
      expect(reconstructed.provinces.length).toBe(direct.provinces.length);
    }
  });
});
