import { useEffect, useRef, useState } from "react";
import { Share, ScrollView, TextInput, View } from "react-native";
import { LobbyClient } from "../../../src/net/lobbyClient";
import { listScenarios } from "../../../src/data/generated";
import type {
  LobbyStateMessage,
  PresencePlayer,
  SessionListEntry,
  SessionMode,
} from "../../../src/net/sessionProtocol";
import type { FromWorker, ToWorker } from "../../../src/shared/types";
import type { CampaignTransport, Exported } from "./NativeSimTransport";
import type { Session } from "./useCampaign";
import { validSeed } from "./campaign";
import {
  Button,
  Card,
  Copy,
  Fact,
  Heading,
  Picker,
  panelStyles as s,
} from "./PanelControls";

export const NATIVE_MULTIPLAYER_URL =
  "wss://lakesidegames.net/games/grand-century/ws";
export function inviteSession(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "grandcentury:" ||
      parsed.hostname !== "multiplayer"
    )
      return null;
    const id = parsed.searchParams.get("session");
    return id && /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export class NativeLobbyTransport implements CampaignTransport {
  private handler: ((message: FromWorker) => void) | null = null;
  private listeners = new Set<(message: FromWorker) => void>();
  constructor(readonly client: LobbyClient) {
    client.onMessage((message) => {
      this.handler?.(message);
      for (const listener of this.listeners) listener(message);
    });
  }
  send(message: ToWorker) {
    this.client.send(message);
  }
  onMessage(handler: (message: FromWorker) => void) {
    this.handler = handler;
  }
  subscribe(handler: (message: FromWorker) => void) {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }
  async exportSave(): Promise<Exported> {
    throw new Error(
      "Multiplayer campaigns are held by the session server. Local checkpoints are available for single player.",
    );
  }
  async importSave(_payload: Uint8Array): Promise<void> {
    throw new Error("Leave multiplayer before loading a local campaign.");
  }
  dispose() {
    this.handler = null;
    this.listeners.clear();
    this.client.dispose();
  }
}
export function useMultiplayer() {
  const connection = useRef<NativeLobbyTransport | null>(null);
  const [status, setStatus] = useState("disconnected");
  const [notice, setNotice] = useState("");
  const [lobby, setLobby] = useState<LobbyStateMessage | null>(null);
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [presence, setPresence] = useState<PresencePlayer[]>([]);
  const [chat, setChat] = useState<
    { from: string; name: string; text: string; at: number }[]
  >([]);
  const [session, setSession] = useState<Session | null>(null);
  const connect = (url: string, playerName: string) => {
    connection.current?.dispose();
    setSession(null);
    setLobby(null);
    setSessions([]);
    setChat([]);
    setNotice("");
    setPresence([]);
    const client = new LobbyClient({
      url,
      playerName,
      autoReconnect: true,
      onConnection: setStatus,
    });
    const transport = new NativeLobbyTransport(client);
    connection.current = transport;
    client.onLobbyState(setLobby);
    client.onSessionList(setSessions);
    client.onLobbyError(setNotice);
    client.onPresence(setPresence);
    client.onChat((line) => setChat((lines) => [...lines.slice(-79), line]));
    transport.onMessage((message) => {
      if (message.t === "snapshot") {
        const snapshot = message.snapshot;
        setSession({
          online: true,
          transport,
          snapshot,
          config: {
            id: client.sessionId ?? "online",
            name: client.lastLobby?.name ?? "Multiplayer campaign",
            seed: snapshot.seed ?? 1830,
            mapMode: snapshot.mapMode ?? "historical",
            scenarioId: snapshot.scenarioId ?? "1830-01-01",
            playerNation: snapshot.playerNation,
            autosaveMinutes: 5,
          },
        });
      } else if (message.t === "log" && !message.msg.startsWith("clientId:"))
        setNotice(message.msg);
    });
    client.listSessions();
  };
  const leave = () => {
    connection.current?.client.leaveSession();
    connection.current?.dispose();
    connection.current = null;
    setSession(null);
    setLobby(null);
    setStatus("disconnected");
  };
  useEffect(() => () => connection.current?.dispose(), []);
  return {
    connect,
    leave,
    status,
    notice,
    lobby,
    sessions,
    presence,
    chat,
    session,
    client: connection.current?.client ?? null,
  };
}
export type MultiplayerState = ReturnType<typeof useMultiplayer>;
export function MultiplayerScreen({
  multiplayer: mp,
  onBack,
  onPlay,
  invitation,
}: {
  multiplayer: MultiplayerState;
  onBack: () => void;
  onPlay: () => void;
  invitation: string | null;
}) {
  const [url, setURL] = useState(NATIVE_MULTIPLAYER_URL);
  const [name, setName] = useState("Player");
  const [room, setRoom] = useState("My Grand Century game");
  const [seed, setSeed] = useState("1830");
  const [mode, setMode] = useState<SessionMode>("competitive");
  const [scenario, setScenario] = useState("1830-01-01");
  const [join, setJoin] = useState(invitation ?? "");
  const [draft, setDraft] = useState("");
  const [inviteOpened, setInviteOpened] = useState(false);
  const launched = useRef(!!mp.session);
  useEffect(() => {
    if (invitation) {
      setJoin(invitation);
      setInviteOpened(false);
    }
  }, [invitation]);
  useEffect(() => {
    if (mp.session && mp.status === "connected" && !launched.current) {
      launched.current = true;
      onPlay();
    }
  }, [!!mp.session, mp.status]);
  useEffect(() => {
    if (invitation && mp.client && mp.status === "connected" && !inviteOpened) {
      setInviteOpened(true);
      mp.client.joinLobby(invitation);
    }
  }, [invitation, mp.client, mp.status, inviteOpened]);
  const self = mp.lobby?.players.find((p) => p.clientId === mp.lobby?.you);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f4eddf" }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Button label="Back to main menu" onPress={onBack} />
      <Heading>Multiplayer</Heading>
      <Copy>
        Connection: {mp.status}. Online campaigns are server-authoritative.
        Single player remains fully offline.
      </Copy>
      {!!mp.notice && <Copy>{mp.notice}</Copy>}
      {!mp.client ? (
        <>
          <TextInput
            style={s.input}
            accessibilityLabel="Multiplayer player name"
            value={name}
            onChangeText={setName}
            maxLength={24}
          />
          <TextInput
            style={s.input}
            accessibilityLabel="Multiplayer server URL"
            value={url}
            onChangeText={setURL}
            autoCapitalize="none"
          />
          <Button
            label="Connect to multiplayer"
            disabled={!/^wss?:\/\/[^\s]+$/.test(url)}
            onPress={() => mp.connect(url, name)}
          />
        </>
      ) : (
        <>
          {mp.status === "disconnected" && (
            <Button
              label="Reconnect multiplayer"
              onPress={() => mp.client?.reconnect()}
            />
          )}
          {!mp.lobby && !mp.session && (
            <>
              <Heading>Join a game</Heading>
              <TextInput
                style={s.input}
                accessibilityLabel="Multiplayer session code"
                value={join}
                onChangeText={setJoin}
                autoCapitalize="none"
              />
              <Button
                label="Join session code"
                disabled={!join.trim() || mp.status !== "connected"}
                onPress={() => mp.client?.joinLobby(join.trim())}
              />
              <Button
                label="Refresh multiplayer games"
                onPress={() => mp.client?.listSessions()}
              />
              {mp.sessions.map((game) => (
                <Card key={game.id}>
                  <Copy>
                    {game.name} · {game.mode} · {game.playerCount}/
                    {game.maxPlayers} · {game.phase}
                  </Copy>
                  <Button
                    label={`Join ${game.name}`}
                    disabled={
                      game.phase !== "lobby" ||
                      game.playerCount >= game.maxPlayers
                    }
                    onPress={() => mp.client?.joinLobby(game.id)}
                  />
                </Card>
              ))}
              <Heading>Host a game</Heading>
              <TextInput
                style={s.input}
                accessibilityLabel="Multiplayer game name"
                value={room}
                onChangeText={setRoom}
                maxLength={60}
              />
              <TextInput
                style={s.input}
                accessibilityLabel="Multiplayer seed"
                value={seed}
                onChangeText={setSeed}
                keyboardType="number-pad"
              />
              <View style={s.actions}>
                {(["competitive", "coop"] as const).map((value) => (
                  <Button
                    key={value}
                    label={`${mode === value ? "Selected: " : ""}${value}`}
                    onPress={() => setMode(value)}
                  />
                ))}
              </View>
              <Picker
                label="multiplayer scenarios"
                items={listScenarios().filter(
                  (s) => s.status === "playable" || s.status === "preview",
                )}
                name={(s) => `${s.startDate.year} ${s.title}`}
                id={(s) => s.id}
                selected={scenario}
                onSelect={(s) => setScenario(s.id)}
              />
              <Button
                label="Create multiplayer game"
                disabled={validSeed(seed) === null || mp.status !== "connected"}
                onPress={() =>
                  mp.client?.createSession({
                    name: room,
                    seed: validSeed(seed)!,
                    scenarioId: scenario,
                    mode,
                    maxPlayers: 8,
                  })
                }
              />
            </>
          )}
          {mp.lobby && (
            <>
              <Heading>{mp.lobby.name}</Heading>
              <Copy>Session code: {mp.lobby.sessionId}</Copy>
              <Copy>
                Invite: grandcentury://multiplayer?session={mp.lobby.sessionId}
              </Copy>
              <Button
                label="Share multiplayer invitation"
                onPress={() => {
                  void Share.share({
                    message: `Join Grand Century: grandcentury://multiplayer?session=${mp.lobby!.sessionId}`,
                  });
                }}
              />
              {mp.lobby.players.map((p) => (
                <Fact
                  key={p.clientId}
                  label={`${p.name}${p.leader ? " (host)" : ""}`}
                  value={`${p.nationTag ?? "Choose nation"} · Team ${p.team ?? "-"} · ${p.ready ? "Ready" : "Not ready"}`}
                />
              ))}
              {mp.lobby.phase === "lobby" && (
                <>
                  <Picker
                    label="multiplayer nations"
                    items={mp.lobby.nations.filter(
                      (n) =>
                        n.tag === self?.nationTag ||
                        !mp.lobby?.takenNations.includes(n.tag),
                    )}
                    id={(n) => n.tag}
                    name={(n) => n.name}
                    selected={self?.nationTag ?? null}
                    onSelect={(n) => mp.client?.selectNation(n.tag)}
                  />
                  {mp.lobby.mode === "coop" && (
                    <View style={s.actions}>
                      {[1, 2, 3, 4].map((team) => (
                        <Button
                          key={team}
                          label={`Join team ${team}`}
                          onPress={() => mp.client?.selectTeam(team)}
                        />
                      ))}
                    </View>
                  )}
                  <Button
                    label={self?.ready ? "Mark not ready" : "Ready to start"}
                    disabled={
                      !self?.nationTag ||
                      (mp.lobby.mode === "coop" && self?.team == null)
                    }
                    onPress={() => mp.client?.setReady(!self?.ready)}
                  />
                  {self?.leader && (
                    <Button
                      label="Start multiplayer campaign"
                      disabled={mp.lobby.players.some(
                        (p) => !p.ready || !p.nationTag,
                      )}
                      onPress={() => mp.client?.leaderStart()}
                    />
                  )}
                </>
              )}
            </>
          )}
          {!!mp.presence.length && (
            <>
              <Heading>Players online</Heading>
              {mp.presence.map((p) => (
                <Copy key={p.clientId}>
                  {p.name} · {p.nationTag} ·{" "}
                  {p.connected ? "Connected" : "Reconnecting"}
                </Copy>
              ))}
            </>
          )}
          <Heading>Session chat</Heading>
          {mp.chat.map((line, i) => (
            <Copy key={i}>
              {line.name}: {line.text}
            </Copy>
          ))}
          <TextInput
            style={s.input}
            accessibilityLabel="Multiplayer chat message"
            value={draft}
            onChangeText={setDraft}
            maxLength={400}
          />
          <Button
            label="Send multiplayer chat"
            disabled={!draft.trim() || mp.status !== "connected" || !mp.lobby}
            onPress={() => {
              mp.client?.sendChat(draft.trim());
              setDraft("");
            }}
          />
          {mp.session && (
            <Button label="Return to multiplayer campaign" onPress={onPlay} />
          )}
          <Button label="Leave multiplayer" onPress={mp.leave} />
        </>
      )}
    </ScrollView>
  );
}
