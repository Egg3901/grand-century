import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { gameDataForScenario } from "../../../src/data/gameData";
import { DEFAULT_SCENARIO_ID } from "../../../src/data/generated";
import type {
  Command,
  NationDetail,
  ProvinceDetail,
  War,
  WarGoalType,
  WorldSnapshot,
} from "../../../src/shared/types";
import { campaignRoster } from "./campaign";
import type { CampaignTransport } from "./NativeSimTransport";
import {
  Button,
  Card,
  Copy,
  Fact,
  Heading,
  Picker,
  money,
  number,
  percent,
  words,
  panelStyles as s,
} from "./PanelControls";

export const gameplayPages = [
  ["population", "Population"],
  ["cultures", "Cultures"],
  ["market", "World market"],
  ["politics", "Politics and reforms"],
  ["production", "Industry"],
  ["great_powers", "Great powers"],
  ["colonization", "Colonization"],
  ["formables", "National ambitions"],
  ["decisions", "Decisions"],
  ["events", "Events"],
  ["crisis", "Concert of Europe"],
  ["recap", "Campaign chronicle"],
  ["province", "Province ledger"],
] as const;
export type GameplayPage =
  | (typeof gameplayPages)[number][0]
  | "economy"
  | "military"
  | "diplomacy"
  | "research";
export type GameplayProps = {
  page: GameplayPage;
  snapshot: WorldSnapshot;
  transport: CampaignTransport;
  send: (cmd: Command) => void;
  selectedProvince: number | null;
};
function useDetails({
  page,
  snapshot,
  transport,
  selectedProvince,
}: GameplayProps) {
  const [nation, setNation] = useState<NationDetail | null>(null);
  const [province, setProvince] = useState<ProvinceDetail | null>(null);
  useEffect(
    () =>
      transport.subscribe((message) => {
        if (
          message.t === "nationDetail" &&
          message.detail.id === snapshot.playerNation
        )
          setNation(message.detail);
        if (
          message.t === "provinceDetail" &&
          message.detail.id === selectedProvince
        )
          setProvince(message.detail);
      }),
    [transport, snapshot.playerNation, selectedProvince],
  );
  useEffect(() => {
    if (page === "politics" || page === "military")
      transport.send({ t: "requestNation", id: snapshot.playerNation });
    if (page === "province" && selectedProvince != null)
      transport.send({ t: "requestProvince", id: selectedProvince });
  }, [transport, snapshot, page, selectedProvince]);
  return { nation, province };
}
export function GameplayPanels(props: GameplayProps) {
  const { page, snapshot: snap, send, selectedProvince } = props;
  const { nation: detail, province: provinceDetail } = useDetails(props);
  const data = useMemo(
    () => gameDataForScenario(snap.scenarioId ?? DEFAULT_SCENARIO_ID),
    [snap.scenarioId],
  );
  const seed = useMemo(
    () =>
      campaignRoster(
        snap.seed ?? 1830,
        snap.mapMode ?? "historical",
        snap.scenarioId,
      ),
    [snap.seed, snap.mapMode, snap.scenarioId],
  );
  const player = snap.nations[snap.playerNation];
  const nationName = (id: number) => snap.nations[id]?.name ?? "Unclaimed";
  const stateName = (id: number) =>
    seed.states.find((state) => state.id === id)?.name ?? `State ${id}`;
  const provinceName = (id: number) =>
    seed.provinces[id]?.name ?? `Province ${id}`;
  const goodName = (id: number) => data.goods[id]?.name ?? `Good ${id}`;
  const [target, setTarget] = useState<number | null>(null);
  const [state, setState] = useState<number | null>(null);
  const [destination, setDestination] = useState<number | null>(
    selectedProvince,
  );
  const [goal, setGoal] = useState<WarGoalType>("humiliate");
  const [confirmWar, setConfirmWar] = useState(false);
  const [army, setArmy] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [amount, setAmount] = useState(10);
  const [composition, setComposition] = useState<Record<string, number>>({
    infantry: 1,
  });
  const owned = seed.provinces.filter(
    (p) => snap.provinces[p.id]?.owner === snap.playerNation,
  );
  const ownArmies = snap.armies.filter((a) => a.owner === snap.playerNation);
  const ownFleets = snap.fleets.filter((f) => f.owner === snap.playerNation);
  const destinationPicker = (
    <Picker
      label="destination provinces"
      items={seed.provinces}
      name={(p) => p.name}
      id={(p) => p.id}
      selected={destination}
      onSelect={(p) => setDestination(p.id)}
    />
  );
  if (!player) return <Copy>Preparing your nation...</Copy>;

  if (page === "economy")
    return (
      <>
        <Fact label="Treasury" value={money(player.treasury)} />
        {player.isBankrupt && (
          <Copy>
            Bankrupt for {player.bankruptcyMonths} months. Construction is
            blocked.
          </Copy>
        )}
        <Heading>Weekly budget</Heading>
        {(
          [
            ["taxIncome", "Tax income"],
            ["tariffIncome", "Tariff income"],
            ["productionIncome", "Production"],
            ["armyUpkeep", "Army and navy upkeep"],
            ["subsidySpend", "Factory subsidies"],
            ["constructionSpend", "Construction"],
            ["adminSpend", "Administration"],
            ["reformUpkeep", "Reform upkeep"],
            ["net", "Weekly net"],
          ] as const
        ).map(([key, label]) => (
          <Fact
            key={key}
            label={label}
            value={money(snap.playerBudget[key])}
            trace={snap.playerBudget.trace[key]}
          />
        ))}
        <Heading>Tax policy</Heading>
        {(["poor", "middle", "rich"] as const).map((bracket) => {
          const rate =
            bracket === "poor"
              ? player.taxRatePoor
              : bracket === "middle"
                ? player.taxRateMiddle
                : player.taxRateRich;
          return (
            <Card key={bracket}>
              <Fact label={`${bracket[0].toUpperCase()}${bracket.slice(1)} tax`} value={percent(rate)} />
              <View style={s.actions}>
                <Button
                  label={`Lower ${bracket} tax`}
                  disabled={rate <= 0}
                  onPress={() =>
                    send({
                      t: "setTax",
                      bracket,
                      rate: Math.max(0, rate - 0.05),
                    })
                  }
                />
                <Button
                  label={`Raise ${bracket} tax`}
                  disabled={rate >= 1}
                  onPress={() =>
                    send({
                      t: "setTax",
                      bracket,
                      rate: Math.min(1, rate + 0.05),
                    })
                  }
                />
              </View>
            </Card>
          );
        })}
        <Fact label="Tariffs" value={percent(player.tariffRate)} />
        <Copy>
          Trade policy allows {percent(player.tariffMin)} to{" "}
          {percent(player.tariffMax)}.
        </Copy>
        <View style={s.actions}>
          <Button
            label="Lower tariffs"
            disabled={player.tariffRate <= player.tariffMin}
            onPress={() =>
              send({
                t: "setTariff",
                rate: Math.max(player.tariffMin, player.tariffRate - 0.05),
              })
            }
          />
          <Button
            label="Raise tariffs"
            disabled={player.tariffRate >= player.tariffMax}
            onPress={() =>
              send({
                t: "setTariff",
                rate: Math.min(player.tariffMax, player.tariffRate + 0.05),
              })
            }
          />
        </View>
      </>
    );
  if (page === "population")
    return (
      <>
        {snap.playerPopulation.map((p) => (
          <Card key={p.type}>
            <Heading>{words(p.type)}</Heading>
            <Fact label="People" value={number(p.size, 0)} />
            <Fact label="Needs met" value={percent(p.avgNeedsMet)} />
            <Copy>
              Life {percent(p.avgLifeNeeds ?? 0)} · Everyday{" "}
              {percent(p.avgEverydayNeeds ?? 0)} · Luxury{" "}
              {percent(p.avgLuxuryNeeds ?? 0)}
            </Copy>
            <Fact label="Militancy" value={number(p.avgMilitancy)} />
            <Fact
              label="Consciousness"
              value={number(p.avgConsciousness)}
              trace={p.consciousnessDrivers}
            />
            <Fact
              label="Growth"
              value={number(p.growth)}
              trace={p.growthDrivers}
            />
            <Copy>
              Dominant ideology: {p.dominantIdeology}. Reform demands:{" "}
              {p.agitatingFor.map(words).join(", ") || "None"}.
            </Copy>
            {p.scarceGoods?.map((g) => (
              <Fact key={g.key} label={g.name} value={percent(g.fill)} />
            ))}
          </Card>
        ))}
        <Heading>Migration and class changes</Heading>
        <Copy>
          {number(snap.playerPopMobility?.migrated ?? 0, 0)} people migrated
          last month.
        </Copy>
        {snap.playerPopMobility?.conversions.map((flow, i) => (
          <Fact
            key={i}
            label={`${flow.from} to ${flow.to}`}
            value={number(flow.amount, 0)}
          />
        ))}
      </>
    );
  if (page === "cultures")
    return (
      <>
        <Heading>National policy</Heading>
        <Copy>
          {words(snap.playerCulturePolicy ?? "assimilationist")}. Changing
          policy costs {number(snap.playerCulturePolicyCost ?? 0)} prestige.
          Cooldown: {snap.playerCulturePolicyCooldownDays ?? 0} days.
        </Copy>
        {(["exclusionary", "assimilationist", "pluralist"] as const).map(
          (policy) => (
            <Button
              key={policy}
              label={`Adopt ${policy} policy`}
              disabled={
                policy === snap.playerCulturePolicy ||
                (snap.playerCulturePolicyCooldownDays ?? 0) > 0 ||
                player.prestige < (snap.playerCulturePolicyCost ?? 0)
              }
              onPress={() => send({ t: "setCulturePolicy", policy })}
            />
          ),
        )}
        {snap.playerCultures?.map((c) => (
          <Card key={c.culture}>
            <Heading>{c.name}</Heading>
            <Copy>
              {c.primary
                ? "Primary culture"
                : c.accepted
                  ? "Accepted"
                  : "Not accepted"}{" "}
              · {percent(c.share)} · {number(c.size, 0)} people
            </Copy>
            <Fact label="Militancy" value={number(c.avgMilitancy)} />
            <Fact
              label="Assimilated last month"
              value={number(c.assimilatedLastMonth, 0)}
              trace={
                c.assimilationFactors
                  ? Object.entries(c.assimilationFactors).map(
                      ([label, value]) => ({ label, value }),
                    )
                  : undefined
              }
            />
            <Copy>
              Acceptance costs {c.acceptCost} prestige and unlocks about{" "}
              {number(c.manpowerPreview, 0)} soldier-eligible people.{" "}
              {c.acceptBlockedReason}
            </Copy>
            {!c.primary && (
              <Button
                label={`${c.accepted ? "Revoke acceptance of" : "Accept"} ${c.name}`}
                disabled={!c.accepted && !c.canAccept}
                onPress={() =>
                  send({
                    t: "setCultureAccepted",
                    culture: c.culture,
                    accepted: !c.accepted,
                  })
                }
              />
            )}
          </Card>
        ))}
        <Heading>National movements</Heading>
        {!snap.playerMovements?.length && <Copy>No national movements.</Copy>}
        {snap.playerMovements?.map((m) => (
          <Card key={m.id}>
            <Heading>{m.cultureName}</Heading>
            <Fact
              label="Radicalism"
              value={number(m.radicalism)}
              trace={Object.entries(m.radicalDelta).map(([label, value]) => ({
                label,
                value,
              }))}
            />
            <Copy>
              {number(m.adherents, 0)} adherents · Militancy{" "}
              {number(m.militancy)} ·{" "}
              {m.boiling
                ? "Uprising threatened"
                : `Uprising blocked by ${m.gateBlocked}`}
            </Copy>
            <Copy>{m.heartlandNames.join(", ")}</Copy>
          </Card>
        ))}
      </>
    );
  if (page === "market")
    return (
      <>
        <Copy>
          Set standing daily purchases or sales. Orders clear against the world
          market and use your treasury or held stockpile.
        </Copy>
        <Fact label="Daily order quantity" value={amount} />
        <View style={s.actions}>
          <Button
            label="Decrease order quantity"
            disabled={amount <= 1}
            onPress={() => setAmount(Math.max(1, amount - 10))}
          />
          <Button
            label="Increase order quantity"
            onPress={() => setAmount(amount + 10)}
          />
        </View>
        {snap.market.map((g) => {
          const order = snap.playerStockpileOrders[g.good];
          return (
            <Card key={g.good}>
              <Heading>{goodName(g.good)}</Heading>
              <Fact
                label="Price"
                value={money(g.price)}
                trace={Object.entries(g.priceTrace).map(([label, value]) => ({
                  label,
                  value,
                }))}
              />
              <Copy>
                Supply {number(g.supply)} · Demand {number(g.demand)} · Filled{" "}
                {percent(
                  g.demand > 0 ? Math.max(0, 1 - g.unmet / g.demand) : 1,
                )}
              </Copy>
              <Fact
                label="Stockpile"
                value={number(snap.playerStockpile[g.good] ?? 0)}
              />
              <Copy>
                Order: {order?.mode ?? "off"} {order?.dailyAmount ?? 0} per day.
              </Copy>
              <View style={s.actions}>
                {(["buy", "sell", "off"] as const).map((mode) => (
                  <Button
                    key={mode}
                    label={`${mode === "off" ? "Stop orders for" : mode === "buy" ? "Buy" : "Sell"} ${goodName(g.good)}`}
                    onPress={() =>
                      send({
                        t: "setStockpileOrder",
                        good: g.good,
                        mode,
                        dailyAmount: mode === "off" ? 0 : amount,
                      })
                    }
                  />
                ))}
              </View>
            </Card>
          );
        })}
      </>
    );
  if (page === "politics")
    return !detail ? (
      <Copy>Assembling parliamentary brief...</Copy>
    ) : (
      <>
        <Copy>
          {words(detail.government)} · {detail.rulingParty} (
          {detail.rulingIdeology})
        </Copy>
        <Fact
          label="Political suppression"
          value={percent(detail.politicalSuppression)}
        />
        <Fact label="Militancy" value={number(detail.avgMilitancy)} />
        <Fact label="Consciousness" value={number(detail.avgConsciousness)} />
        <Copy>
          {detail.election.elective
            ? `Next election ${detail.election.nextYear}, in ${detail.election.yearsToNext} years.`
            : "Government is not elective."}{" "}
          Last result: {detail.election.lastResult}.
        </Copy>
        {detail.election.ideologyShares.map((v) => (
          <Fact
            key={v.ideology}
            label={`Vote: ${v.ideology}`}
            value={percent(v.share)}
          />
        ))}
        <Heading>Upper house</Heading>
        {detail.upperHouse.map((v) => (
          <Fact key={v.ideology} label={v.ideology} value={percent(v.share)} />
        ))}
        <Heading>Parties and platforms</Heading>
        {detail.parties.map((p) => (
          <Card key={p.key}>
            <Copy>
              {p.name}
              {p.ruling ? " (ruling)" : ""} · {p.ideology}
            </Copy>
            {p.positions.map((pos) => (
              <Copy key={pos.reform}>
                {words(pos.reform)}: {pos.current} to {pos.level}
              </Copy>
            ))}
          </Card>
        ))}
        <Heading>Reforms</Heading>
        {data.reforms.map((reform) => (
          <Card key={reform.key}>
            <Heading>{reform.name}</Heading>
            <Copy>
              {reform.category} · Current:{" "}
              {reform.options[detail.reforms[reform.key] ?? 0]?.name}
            </Copy>
            {reform.options.map((option, level) => {
              const gate = detail.reformsAvailable.find(
                (a) => a.reform === reform.key && a.level === level,
              );
              const current = detail.reforms[reform.key] === level;
              return (
                <View key={option.key} style={{ gap: 8 }}>
                  <Copy>{option.effects.join(" · ")}</Copy>
                  {gate && (
                    <Copy>
                      Support {percent(gate.support)} /{" "}
                      {percent(gate.requiredSupport)} · {money(gate.costMoney)}{" "}
                      and {gate.costPrestige} prestige. {gate.reason}
                    </Copy>
                  )}
                  {!gate && !current && (
                    <Copy>Reforms cannot be reversed once enacted.</Copy>
                  )}
                  <Button
                    label={`${current ? "Enacted" : "Enact"} ${option.name}`}
                    disabled={current || !gate?.legal}
                    onPress={() =>
                      send({ t: "enactReform", reform: reform.key, level })
                    }
                  />
                </View>
              );
            })}
          </Card>
        ))}
        <Heading>Agitation and unrest</Heading>
        {detail.topReformDemands.map((d) => (
          <Fact
            key={d.reform}
            label={words(d.reform)}
            value={percent(d.support)}
          />
        ))}
        {detail.stateUnrest.map((v) => (
          <Fact
            key={v.stateId}
            label={v.name}
            value={`Risk ${number(v.risk)} · Militancy ${number(v.militancy)}`}
          />
        ))}
      </>
    );
  if (page === "production")
    return (
      <>
        <Copy>
          Factory construction costs £220 plus £45 for each existing factory in
          the state. Technology and coast requirements apply.
        </Copy>
        {player.constructionBlocked && (
          <Copy>Construction blocked by bankruptcy.</Copy>
        )}
        <Picker
          label="industrial states"
          items={snap.playerStates}
          id={(p) => p.id}
          name={(p) => p.name}
          selected={state}
          onSelect={(p) => setState(p.id)}
        />
        {state != null &&
          (() => {
            const chosen = snap.playerStates.find((p) => p.id === state);
            if (!chosen) return null;
            const cost = 220 + chosen.factoryCount * 45;
            return (
              <Card>
                <Heading>Build in {chosen.name}</Heading>
                <Fact label="Build cost" value={money(cost)} />
                {data.recipes
                  .filter((r) => r.building === "factory")
                  .map((r) => {
                    const tech =
                      !r.requiresTech ||
                      !!snap.playerTech?.techs.includes(r.requiresTech);
                    const coast = !r.requiresCoastal || chosen.coastal;
                    return (
                      <View key={r.key} style={{ gap: 8 }}>
                        <Copy>
                          {r.inputs
                            .map(
                              (g) => `${number(g.amount)} ${goodName(g.good)}`,
                            )
                            .join(" + ") || "No inputs"}{" "}
                          → {number(r.output.amount)} {goodName(r.output.good)}
                        </Copy>
                        {!tech && (
                          <Copy>Requires {words(r.requiresTech!)}.</Copy>
                        )}
                        {!coast && <Copy>Requires a coastal state.</Copy>}
                        <Button
                          label={`Build ${r.name ?? words(r.key)} in ${chosen.name}`}
                          disabled={
                            player.constructionBlocked ||
                            player.treasury < cost ||
                            !tech ||
                            !coast
                          }
                          onPress={() =>
                            send({
                              t: "buildFactory",
                              state: chosen.id,
                              recipe: r.key,
                            })
                          }
                        />
                      </View>
                    );
                  })}
              </Card>
            );
          })()}
        <Heading>Active production</Heading>
        {snap.playerProduction.map((p, i) => (
          <Card key={i}>
            <Heading>{p.locationName}</Heading>
            <Copy>
              {words(p.recipe)} · {goodName(p.outputGood)} · Level {p.level}
            </Copy>
            <Fact
              label="Employment"
              value={`${number(p.employment, 0)} / ${number(p.capacity, 0)}`}
            />
            <Fact label="Output" value={number(p.outputAmount)} />
            <Fact
              label="Profit"
              value={money(p.profit)}
              trace={[
                { label: "Inputs", value: p.inputCost },
                { label: "Wages", value: p.wages },
                { label: "Operating cost", value: p.operating },
                { label: "Input fill", value: p.inputFill },
                { label: "Cash reserve", value: p.cashReserve },
                { label: "Profitable weeks", value: p.profitableWeeks },
                { label: "Loss weeks", value: p.lossWeeks },
              ]}
            />
          </Card>
        ))}
      </>
    );
  if (page === "research")
    return (
      <>
        <Fact
          label="Research points"
          value={number(snap.playerTech?.researchPoints ?? 0)}
        />
        <Fact
          label="Monthly research"
          value={number(snap.playerTech?.monthlyResearch ?? 0)}
          trace={
            snap.playerTech?.researchBreakdown
              ? Object.entries(snap.playerTech.researchBreakdown).map(
                  ([label, value]) => ({ label, value }),
                )
              : undefined
          }
        />
        <Copy>
          Current:{" "}
          {snap.playerTech?.statuses.find(
            (t) => t.key === snap.playerTech?.current,
          )?.name ?? "None selected"}{" "}
          · {number(snap.playerTech?.progress ?? 0)} /{" "}
          {snap.playerTech?.currentCost ?? 0} points.
        </Copy>
        {snap.playerTech?.current && (
          <Button
            label="Cancel current research"
            onPress={() => send({ t: "setResearch", tech: null })}
          />
        )}
        {snap.playerTech?.statuses.map((t) => (
          <Card key={t.key}>
            <Heading>{t.name}</Heading>
            <Copy>
              {t.category} · {t.year} · {t.cost} points ·{" "}
              {t.etaMonths == null
                ? "No completion estimate"
                : `${number(t.etaMonths)} months`}
            </Copy>
            <Copy>{t.effectsSummary.join(" · ")}</Copy>
            <Copy>{t.researched ? "Researched" : t.reason}</Copy>
            <Button
              label={`Research ${t.name}`}
              disabled={
                !t.available ||
                t.researched ||
                t.key === snap.playerTech?.current
              }
              onPress={() => send({ t: "setResearch", tech: t.key })}
            />
          </Card>
        ))}
        <Heading>Inventions</Heading>
        {snap.playerTech?.inventionStatuses.map((i) => (
          <Card key={i.key}>
            <Heading>{i.name}</Heading>
            <Copy>{i.description}</Copy>
            <Copy>{i.effectsSummary.join(" · ")}</Copy>
            <Copy>
              {i.owned
                ? "Discovered"
                : i.prereqMet
                  ? `Brewing: ${percent(i.monthlyChance ?? 0)} monthly chance`
                  : `Requires ${words(i.prereqTech)}`}
            </Copy>
          </Card>
        ))}
      </>
    );
  if (page === "military")
    return (
      <>
        <Fact label="Military score" value={number(player.militaryScore)} />
        <Fact
          label="Standing regiment capacity"
          value={
            player.standingRegimentCapacity ??
            detail?.military.standingRegimentCapacity ??
            0
          }
        />
        <Fact
          label="Mobilization capacity"
          value={player.mobilizationCapacity}
        />
        <View style={s.actions}>
          <Button
            label="Mobilize reserves"
            onPress={() => send({ t: "mobilize" })}
          />
          <Button
            label="Stand down reserves"
            onPress={() => send({ t: "demobilize" })}
          />
        </View>
        <Heading>Recruitment and shipbuilding</Heading>
        <Picker
          label="recruitment provinces"
          items={owned}
          name={(p) => p.name}
          id={(p) => p.id}
          selected={state}
          onSelect={(p) => setState(p.id)}
        />
        {state != null && owned.some((p) => p.id === state) && (
          <Card>
            <Heading>{provinceName(state)}</Heading>
            {(player.availableRegimentTypes ?? ["infantry"]).map((type) => (
              <View key={type}>
                <Fact label={words(type)} value={composition[type] ?? 0} />
                <View style={s.actions}>
                  <Button
                    label={`Fewer ${type}`}
                    disabled={!composition[type]}
                    onPress={() =>
                      setComposition({
                        ...composition,
                        [type]: Math.max(0, (composition[type] ?? 0) - 1),
                      })
                    }
                  />
                  <Button
                    label={`More ${type}`}
                    disabled={(composition[type] ?? 0) >= 20}
                    onPress={() =>
                      setComposition({
                        ...composition,
                        [type]: (composition[type] ?? 0) + 1,
                      })
                    }
                  />
                </View>
              </View>
            ))}
            <Copy>
              The engine checks soldier support, treasury and capacity when
              recruiting.
            </Copy>
            <Button
              label={`Recruit formation in ${provinceName(state)}`}
              disabled={!Object.values(composition).some((n) => n > 0)}
              onPress={() =>
                send({
                  t: "recruitArmyWithComposition",
                  province: state,
                  composition,
                })
              }
            />
            {seed.provinces[state]?.coastal && (
              <>
                <Fact label="Ships per order" value={count} />
                <View style={s.actions}>
                  <Button
                    label="Fewer ships"
                    disabled={count <= 1}
                    onPress={() => setCount(count - 1)}
                  />
                  <Button
                    label="More ships"
                    disabled={count >= 20}
                    onPress={() => setCount(count + 1)}
                  />
                </View>
                {(
                  player.availableShipTypes ?? [
                    "transport",
                    "frigate",
                    "manofwar",
                  ]
                ).map((shipType) => (
                  <Button
                    key={shipType}
                    label={`Build ${count} ${shipType} in ${provinceName(state)}`}
                    onPress={() =>
                      send({
                        t: "buildFleet",
                        province: state,
                        shipType,
                        count,
                      })
                    }
                  />
                ))}
              </>
            )}
          </Card>
        )}
        <Heading>Orders destination</Heading>
        <Copy>
          Select a province here or on the map. The engine validates routes,
          access and coastal landings.
        </Copy>
        {destinationPicker}
        <Heading>Armies</Heading>
        {!ownArmies.length && <Copy>No armies raised.</Copy>}
        {ownArmies.map((a) => (
          <Card key={a.id}>
            <Heading>Army {a.id + 1}</Heading>
            <Copy>
              {provinceName(a.location)} · {a.regiments.length} regiments ·{" "}
              {a.supplied ? "In supply" : "Out of supply"}
            </Copy>
            <Copy>
              {a.regiments
                .map(
                  (r) =>
                    `${r.type}: ${number(r.strength)}, organization ${number(r.organization)}`,
                )
                .join(" · ")}
            </Copy>
            {!a.leader && (
              <Button
                label={`Assign general to army ${a.id + 1}`}
                onPress={() => send({ t: "assignGeneral", army: a.id })}
              />
            )}
            {a.leader && (
              <Copy>
                {a.leader.name} · Attack {a.leader.attack} · Defense{" "}
                {a.leader.defense}
              </Copy>
            )}
            <Button
              label={`Move army ${a.id + 1} to ${destination == null ? "selected destination" : provinceName(destination)}`}
              disabled={destination == null}
              onPress={() => {
                if (destination != null)
                  send({ t: "moveArmy", army: a.id, target: destination });
              }}
            />
            <Button
              label={`Select army ${a.id + 1} for embarkation`}
              onPress={() => setArmy(a.id)}
            />
          </Card>
        ))}
        <Heading>Fleets</Heading>
        <Copy>
          {army == null
            ? "Select an army above to embark it."
            : `Embarkation selection: army ${army + 1}`}
        </Copy>
        {!ownFleets.length && <Copy>No fleets built.</Copy>}
        {ownFleets.map((f) => (
          <Card key={f.id}>
            <Heading>Fleet {f.id + 1}</Heading>
            <Copy>
              {provinceName(f.location)} · {f.ships.length} ships ·{" "}
              {f.embarkedArmy >= 0
                ? `Carrying army ${f.embarkedArmy + 1}`
                : "No embarked army"}
            </Copy>
            <Copy>
              {f.ships
                .map((ship) => `${ship.type}: ${number(ship.strength)}`)
                .join(" · ")}
            </Copy>
            <Button
              label={`Move fleet ${f.id + 1}`}
              disabled={destination == null}
              onPress={() => {
                if (destination != null)
                  send({ t: "moveFleet", fleet: f.id, target: destination });
              }}
            />
            <Button
              label={`Embark army on fleet ${f.id + 1}`}
              disabled={army == null || f.embarkedArmy >= 0}
              onPress={() => {
                if (army != null) send({ t: "embarkArmy", army, fleet: f.id });
              }}
            />
            <Button
              label={`Disembark army from fleet ${f.id + 1}`}
              disabled={destination == null || f.embarkedArmy < 0}
              onPress={() => {
                if (destination != null)
                  send({
                    t: "disembarkArmy",
                    fleet: f.id,
                    target: destination,
                  });
              }}
            />
          </Card>
        ))}
        <Heading>Wars and peace conferences</Heading>
        {snap.wars
          .filter(
            (w) =>
              w.attackers.includes(snap.playerNation) ||
              w.defenders.includes(snap.playerNation),
          )
          .map((war) => (
            <Peace
              key={war.id}
              war={war}
              player={snap.playerNation}
              nationName={nationName}
              stateName={stateName}
              send={send}
            />
          ))}
        <Heading>Rebellions</Heading>
        {snap.rebellions.map((r) => (
          <Copy key={r.id}>
            {nationName(r.targetNation)} · {stateName(r.originState)} ·{" "}
            {words(r.demand.type)}
          </Copy>
        ))}
        <Heading>Recent battles</Heading>
        {snap.recentBattles
          ?.slice()
          .reverse()
          .map((b, i) => (
            <Card key={i}>
              <Copy>
                {b.provinceName} · Day {b.day}
              </Copy>
              <Fact
                label="Attacker casualties"
                value={number(b.attackerLosses, 0)}
              />
              <Fact
                label="Defender casualties"
                value={number(b.defenderLosses, 0)}
              />
            </Card>
          ))}
      </>
    );
  if (page === "diplomacy") {
    const foreign = target == null ? null : snap.nations[target];
    const relation =
      foreign &&
      snap.relations.filter(
        (r) =>
          (r.a === target && r.b === snap.playerNation) ||
          (r.b === target && r.a === snap.playerNation),
      );
    const allied = relation && relation.some((r) => r.kind === "alliance");
    const targetStates = seed.states.filter((s) =>
      s.provinceIds.some((id) => snap.provinces[id]?.owner === target),
    );
    const needsState = [
      "annex_state",
      "liberate_state",
      "take_colony",
    ].includes(goal);
    const goalState = needsState ? state : -1;
    const validState = !needsState || targetStates.some((s) => s.id === state);
    const cb = snap.playerCbs.find(
      (c) =>
        c.target === target &&
        c.goal === goal &&
        c.stateId === goalState &&
        c.expiresDay >= snap.day,
    );
    return (
      <>
        <Fact
          label="Diplomatic points"
          value={number(snap.playerDiplomaticPoints)}
        />
        <Fact
          label="Infamy"
          value={`${number(player.infamy)} / ${snap.infamyLimit}`}
        />
        <Fact label="Influence pool" value={number(snap.playerInfluencePool)} />
        {player.spheredBy >= 0 && (
          <>
            <Copy>In the sphere of {nationName(player.spheredBy)}.</Copy>
            <Button
              label="Leave sphere"
              onPress={() => send({ t: "leaveSphere" })}
            />
          </>
        )}
        <Picker
          label="diplomatic nations"
          items={snap.nations.filter(
            (n) => n.id !== snap.playerNation && n.numProvinces > 0,
          )}
          name={(n) => n.name}
          id={(n) => n.id}
          selected={target}
          onSelect={(n) => {
            setTarget(n.id);
            setState(null);
            setConfirmWar(false);
          }}
        />
        {foreign && (
          <Card>
            <Heading>{foreign.name}</Heading>
            <Copy>
              {foreign.atWar ? "At war" : "At peace"}
              {allied ? " · Allied" : ""} · Sphere:{" "}
              {foreign.spheredBy >= 0
                ? nationName(foreign.spheredBy)
                : "Independent"}
            </Copy>
            {relation &&
              relation.map((r, i) => (
                <Copy key={i}>
                  {r.kind} · Opinion {r.opinion} · Expires day {r.expiresDay}
                </Copy>
              ))}
            {snap.playerAlliancePreviews
              .filter((a) => a.target === foreign.id)
              .map((a) => (
                <Fact
                  key={a.target}
                  label="Alliance acceptance"
                  value={`${number(a.score)} / 70`}
                />
              ))}
            <Button
              label={`${allied ? "End alliance with" : "Propose alliance to"} ${foreign.name}`}
              onPress={() =>
                send(
                  allied
                    ? {
                        t: "cancelRelation",
                        target: foreign.id,
                        kind: "alliance",
                      }
                    : { t: "proposeAlliance", target: foreign.id },
                )
              }
            />
            <Button
              label={`Guarantee ${foreign.name}`}
              onPress={() => send({ t: "offerGuarantee", target: foreign.id })}
            />
            <Button
              label={`Declare rivalry with ${foreign.name}`}
              disabled={
                snap.playerRivalryCount >= snap.rivalryCap ||
                snap.playerDiplomaticPoints < snap.rivalryDpCost
              }
              onPress={() => send({ t: "addRival", target: foreign.id })}
            />
            {(["guarantee", "rivalry"] as const).map(
              (kind) =>
                relation &&
                relation.some((r) => r.kind === kind) && (
                  <Button
                    key={kind}
                    label={`Cancel ${kind} with ${foreign.name}`}
                    onPress={() =>
                      send({ t: "cancelRelation", target: foreign.id, kind })
                    }
                  />
                ),
            )}
            <Button
              label={`Influence ${foreign.name}`}
              disabled={
                player.gpRank < 1 ||
                player.gpRank > 8 ||
                (foreign.gpRank > 0 && foreign.gpRank <= 8) ||
                snap.playerInfluencePool <= 0
              }
              onPress={() => send({ t: "influenceNation", target: foreign.id })}
            />
            {snap.playerInfluenceTargets
              .filter((i) => i.target === foreign.id)
              .map((i) => (
                <Fact
                  key={i.target}
                  label="Influence"
                  value={number(i.points)}
                />
              ))}
            <Heading>War goals</Heading>
            {(
              [
                "humiliate",
                "annex_state",
                "liberate_state",
                "add_to_sphere",
                "take_colony",
                "cut_down_to_size",
              ] as const
            ).map((g) => (
              <Button
                key={g}
                label={`${goal === g ? "Selected: " : ""}${words(g)}`}
                onPress={() => {
                  setGoal(g);
                  setConfirmWar(false);
                }}
              />
            ))}
            {needsState && (
              <Picker
                label="war goal states"
                items={targetStates}
                name={(s) => s.name}
                id={(s) => s.id}
                selected={state}
                onSelect={(s) => {
                  setState(s.id);
                  setConfirmWar(false);
                }}
              />
            )}
            <Copy>
              Fabrication costs {snap.fabricateCbCostByGoal[goal]} diplomatic
              points. Declaration with a valid pretext costs{" "}
              {snap.warGoalInfamyUse[goal]} infamy.{" "}
              {cb
                ? "Valid pretext held."
                : "No valid pretext held; an unjustified declaration carries additional infamy."}
            </Copy>
            <Button
              label={`Fabricate ${words(goal)} pretext against ${foreign.name}`}
              disabled={
                !validState ||
                snap.playerDiplomaticPoints < snap.fabricateCbCostByGoal[goal]
              }
              onPress={() =>
                send({
                  t: "fabricateCB",
                  target: foreign.id,
                  goal,
                  state: goalState ?? -1,
                })
              }
            />
            <Button
              label={`Declare war on ${foreign.name}`}
              disabled={!validState}
              onPress={() => setConfirmWar(true)}
            />
            {confirmWar && (
              <>
                <Copy>
                  This begins a war against {foreign.name} for {words(goal)}
                  {needsState ? ` in ${stateName(state!)}` : ""}. Allied nations
                  may join.
                </Copy>
                <Button
                  label={`Confirm war on ${foreign.name}`}
                  onPress={() => {
                    send({
                      t: "declareWar",
                      target: foreign.id,
                      goal,
                      state: goalState ?? -1,
                    });
                    setConfirmWar(false);
                  }}
                />
                <Button
                  label="Cancel war declaration"
                  onPress={() => setConfirmWar(false)}
                />
              </>
            )}
          </Card>
        )}
        <Heading>Pending and valid pretexts</Heading>
        {[...snap.playerPendingCbs, ...snap.playerCbs].map((c, i) => (
          <Copy key={i}>
            {nationName(c.target)} · {words(c.goal)} ·{" "}
            {c.readyDay > snap.day
              ? `Ready in ${c.readyDay - snap.day} days`
              : `Expires day ${c.expiresDay}`}
          </Copy>
        ))}
        {snap.wars
          .filter(
            (w) =>
              w.attackers.includes(snap.playerNation) ||
              w.defenders.includes(snap.playerNation),
          )
          .map((war) => (
            <Peace
              key={war.id}
              war={war}
              player={snap.playerNation}
              nationName={nationName}
              stateName={stateName}
              send={send}
            />
          ))}
      </>
    );
  }
  if (page === "great_powers")
    return (
      <>
        <Fact label="Your power score" value={number(snap.playerPowerScore)} />
        <Fact label="Ninth power score" value={number(snap.ninthPowerScore)} />
        {snap.greatPowers.map((gp) => (
          <Card key={gp.nation}>
            <Heading>
              {gp.rank}. {nationName(gp.nation)}
            </Heading>
            <Fact label="Power" value={number(gp.score)} />
            <Copy>
              Sphere:{" "}
              {snap.nations[gp.nation]?.sphereMembers
                .map(nationName)
                .join(", ") || "None"}
            </Copy>
          </Card>
        ))}
      </>
    );
  if (page === "colonization")
    return (
      <>
        <Fact
          label="Available colonial points"
          value={player.colonialPoints ?? 0}
          trace={
            player.colonialPointsBreakdown
              ? Object.entries(player.colonialPointsBreakdown).map(
                  ([label, value]) => ({ label, value }),
                )
              : undefined
          }
        />
        {!snap.playerClaimableColonialStates?.length && (
          <Copy>
            No reachable uncolonized states. Naval bases, technology and
            adjacent territory extend your reach.
          </Copy>
        )}
        {snap.playerClaimableColonialStates?.map((c) => {
          const claim = snap.colonialClaims?.find(
            (p) => p.stateId === c.stateId,
          );
          const ours = claim?.claimants.some(
            (p) => p.nation === snap.playerNation,
          );
          return (
            <Card key={c.stateId}>
              <Heading>{stateName(c.stateId)}</Heading>
              <Copy>
                {c.reach} reach · Tension {number(claim?.tension ?? 0)} ·{" "}
                {claim?.etaDays == null
                  ? "No completion estimate"
                  : `${claim.etaDays} days to completion`}
              </Copy>
              {claim?.claimants.map((p) => (
                <Fact
                  key={p.nation}
                  label={nationName(p.nation)}
                  value={percent(p.progress)}
                />
              ))}
              <Button
                label={`${ours ? "Claiming" : "Claim"} ${stateName(c.stateId)}`}
                disabled={ours}
                onPress={() => send({ t: "colonize", state: c.stateId })}
              />
            </Card>
          );
        })}
      </>
    );
  if (page === "formables")
    return (
      <>
        {!snap.playerFormables?.length && (
          <Copy>
            No national unification available to your nation in this world.
          </Copy>
        )}
        {snap.playerFormables?.map((f) => (
          <Card key={f.key}>
            <Heading>{f.name}</Heading>
            <Copy>
              {Math.round((f.controlledCoreShare ?? 0) * 100)}% of the core population controlled
              (need {Math.round((f.requiredCoreShare ?? 0) * 100)}%) · Reward {f.prestigeReward ?? 0} prestige.
            </Copy>
            {f.requirements.map((r) => (
              <Copy key={r.key}>
                {r.met ? "✓" : "○"} {r.label}: {r.detail}
              </Copy>
            ))}
            {f.coreBreakdown?.map((c) => (
              <Copy key={c.stateId}>
                {stateName(c.stateId)} · {c.kind} · {nationName(c.owner)}
              </Copy>
            ))}
            <Copy>{f.reason}</Copy>
            <Button
              label={`Proclaim ${f.name}`}
              disabled={!f.ready}
              onPress={() => send({ t: "formNation", key: f.key })}
            />
          </Card>
        ))}
        {snap.playerBalanceOfPower && (
          <Copy>
            Balance of power: {snap.playerBalanceOfPower.formableName} alarms{" "}
            {snap.playerBalanceOfPower.alarmedGpCount} great powers. Monthly
            opinion loss {snap.playerBalanceOfPower.monthlyOpinionHit}.
          </Copy>
        )}
      </>
    );
  if (page === "decisions")
    return (
      <>
        {!snap.playerDecisions?.length && (
          <Copy>No national decisions available.</Copy>
        )}
        {snap.playerDecisions?.map((d) => (
          <Card key={d.id}>
            <Heading>{d.title}</Heading>
            <Copy>{d.description}</Copy>
            <Copy>{d.costSummary.join(" · ")}</Copy>
            <Copy>{d.effectsSummary.join(" · ")}</Copy>
            {d.progressLines?.map((line, i) => (
              <Copy key={i}>{line}</Copy>
            ))}
            <Copy>{d.reason}</Copy>
            <Button
              label={`Take decision: ${d.title}`}
              disabled={!d.available}
              onPress={() => send({ t: "takeDecision", decision: d.id })}
            />
          </Card>
        ))}
      </>
    );
  if (page === "events")
    return (
      <>
        {!snap.pendingPlayerEvents?.length && (
          <Copy>No events awaiting your decision.</Copy>
        )}
        {snap.pendingPlayerEvents?.map((event) => (
          <Card key={event.instanceId}>
            <Heading>{event.title}</Heading>
            <Copy>{event.description}</Copy>
            {event.choices.map((c) => (
              <View key={c.id} style={{ gap: 8 }}>
                <Copy>{c.description}</Copy>
                <Copy>{c.effectsSummary.join(" · ")}</Copy>
                {!c.available && <Copy>{c.unavailableReason}</Copy>}
                <Button
                  label={`${event.title}: ${c.label}`}
                  disabled={!c.available}
                  onPress={() =>
                    send({
                      t: "resolveEvent",
                      instanceId: event.instanceId,
                      choiceId: c.id,
                    })
                  }
                />
              </View>
            ))}
          </Card>
        ))}
      </>
    );
  if (page === "crisis") {
    const crisis = snap.activeCrisis;
    const lead =
      crisis &&
      (crisis.attackerLead === snap.playerNation ||
        crisis.defenderLead === snap.playerNation);
    return (
      <>
        <Fact
          label="World tension"
          value={number(snap.worldTension ?? 0)}
          trace={snap.tensionTrace}
        />
        <Fact
          label="Monthly tension change"
          value={number(snap.tensionNetDelta ?? 0)}
        />
        {crisis ? (
          <Card>
            <Heading>
              {words(crisis.type)} over {nationName(crisis.subject)}
            </Heading>
            <Copy>
              {nationName(crisis.attackerLead)} against{" "}
              {nationName(crisis.defenderLead)} · Demand: {words(crisis.demand)}
            </Copy>
            <Fact label="Temperature" value={number(crisis.temperature)} />
            <Copy>
              Deadline in {Math.max(0, crisis.deadlineDay - snap.day)} days.
            </Copy>
            <Copy>
              Attacker backing:{" "}
              {crisis.attackerBackers.map(nationName).join(", ")}. Defender
              backing: {crisis.defenderBackers.map(nationName).join(", ")}.
            </Copy>
            {snap.crisisShowdown && (
              <Copy>
                Forecast: {words(snap.crisisShowdown.forecast)} · Power ratio{" "}
                {number(snap.crisisShowdown.powerRatio)}. Pressing raises
                temperature to {number(snap.crisisShowdown.pressTempAfter)}.
              </Copy>
            )}
            {(["attacker", "defender"] as const).map((side) => (
              <Button
                key={side}
                label={`Back crisis ${side}`}
                disabled={!!lead || player.gpRank < 1 || player.gpRank > 8}
                onPress={() =>
                  send({ t: "crisisBackSide", crisis: crisis.id, side })
                }
              />
            ))}
            <Button
              label="Press crisis demand"
              disabled={!lead || crisis.pressedBy.includes(snap.playerNation)}
              onPress={() =>
                send({ t: "crisisPressDemand", crisis: crisis.id })
              }
            />
            <Button
              label="Back down from crisis"
              disabled={!lead}
              onPress={() => send({ t: "crisisBackDown", crisis: crisis.id })}
            />
          </Card>
        ) : (
          <Copy>No active international crisis.</Copy>
        )}
        <Heading>Flashpoints</Heading>
        {snap.crisisCandidates?.map((c, i) => (
          <Copy key={i}>
            {nationName(c.subject)} · {words(c.type)} · Pressure{" "}
            {number(c.score)}
          </Copy>
        ))}
        <Heading>Congress history</Heading>
        {snap.congressHistory
          ?.slice()
          .reverse()
          .map((c) => (
            <Card key={c.id}>
              <Heading>{c.name}</Heading>
              <Copy>
                Day {c.day} · {c.outcome} · {c.detail}
              </Copy>
            </Card>
          ))}
      </>
    );
  }
  if (page === "recap")
    return (
      <>
        <Heading>
          {snap.campaignOver ? "Campaign complete" : "Your century so far"}
        </Heading>
        <Copy>
          {snap.campaignOver === "eliminated"
            ? "Your nation has been eliminated."
            : snap.campaignOver === "century"
              ? "Your century has ended."
              : `Campaign began ${snap.startDate?.year ?? 1830}.`}
        </Copy>
        <Fact label="Wars fought" value={snap.chronicleWarsFought ?? 0} />
        {snap.chronicle
          ?.slice()
          .reverse()
          .map((line, i) => (
            <Card key={i}>
              <Heading>{line.year}</Heading>
              <Copy>
                {Object.entries(line)
                  .filter(([key]) => key !== "year")
                  .map(
                    ([key, value]) =>
                      `${words(key)}: ${typeof value === "number" ? number(value) : String(value)}`,
                  )
                  .join(" · ")}
              </Copy>
            </Card>
          ))}
      </>
    );
  if (page === "province")
    return (
      <>
        {selectedProvince == null ? (
          <Copy>
            Select a province on the map to inspect its population, resources
            and defenses.
          </Copy>
        ) : !provinceDetail || provinceDetail.id !== selectedProvince ? (
          <Copy>Fetching province ledger...</Copy>
        ) : (
          <Card>
            <Heading>{provinceDetail.name}</Heading>
            <Copy>
              Owner {nationName(provinceDetail.owner)} · Controller{" "}
              {nationName(provinceDetail.controller)} · {provinceDetail.terrain}
            </Copy>
            <Fact label="Fort level" value={provinceDetail.fortLevel} />
            <Fact
              label="Naval base level"
              value={provinceDetail.navalBaseLevel}
            />
            <Copy>
              Resource:{" "}
              {goodName(
                data.recipes.find((r) => r.key === provinceDetail.rgo.recipe)
                  ?.output.good ?? -1,
              )}{" "}
              · Level {provinceDetail.rgo.level}
            </Copy>
            {provinceDetail.pops.map((p, i) => (
              <Copy key={i}>
                {words(p.type)} · {number(p.size, 0)} people · Needs{" "}
                {percent(p.needsMet)} · Militancy {number(p.militancy)}
              </Copy>
            ))}
            {provinceDetail.cultures?.map((c) => (
              <Copy key={c.culture}>
                {c.name} · {percent(c.share)} ·{" "}
                {c.accepted ? "Accepted" : "Not accepted"}
              </Copy>
            ))}
          </Card>
        )}
      </>
    );
  return null;
}
function Peace({
  war,
  player,
  nationName,
  stateName,
  send,
}: {
  war: War;
  player: number;
  nationName: (id: number) => string;
  stateName: (id: number) => string;
  send: (cmd: Command) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const attacker = war.attackers.includes(player);
  const side = attacker ? war.attackers : war.defenders;
  const score = attacker ? war.score : -war.score;
  const available = Math.max(0, score);
  const cost = selected.reduce(
    (sum, index) => sum + (war.goals[index]?.scoreValue ?? 0),
    0,
  );
  return (
    <Card>
      <Heading>Peace conference</Heading>
      <Copy>
        {war.attackers.map(nationName).join(", ")} against{" "}
        {war.defenders.map(nationName).join(", ")}
      </Copy>
      <Fact
        label="Your warscore"
        value={number(score)}
        trace={
          war.scoreBreakdown
            ? Object.entries(war.scoreBreakdown).map(([label, value]) => ({
                label,
                value: attacker ? value : -value,
              }))
            : undefined
        }
      />
      <Copy>
        Exhaustion: attackers {number(war.attackerExhaustion)}, defenders{" "}
        {number(war.defenderExhaustion)}.
      </Copy>
      {war.goals.map(
        (g, index) =>
          side.includes(g.holder) && (
            <Button
              key={index}
              label={`${selected.includes(index) ? "Remove" : "Add"} peace term: ${words(g.type)}${g.stateId >= 0 ? ` in ${stateName(g.stateId)}` : ""} (${g.scoreValue})`}
              onPress={() =>
                setSelected(
                  selected.includes(index)
                    ? selected.filter((i) => i !== index)
                    : [...selected, index],
                )
              }
            />
          ),
      )}
      <Copy>
        Selected terms {cost} / {number(available)} warscore. Opposing
        exhaustion also affects acceptance.
      </Copy>
      <Button
        label="Offer selected peace terms"
        disabled={!selected.length || cost > available}
        onPress={() =>
          send({ t: "offerPeace", war: war.id, goalsToEnforce: selected })
        }
      />
      <Button
        label="Offer white peace"
        onPress={() =>
          send({ t: "offerPeace", war: war.id, goalsToEnforce: [] })
        }
      />
    </Card>
  );
}
