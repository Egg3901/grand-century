import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { ChildProcess } from "node:child_process";
const url = "ws://127.0.0.1:1437";
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: "1437", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch("http://127.0.0.1:1437/")).ok;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
});
test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) =>
        setTimeout(() => {
          server.kill("SIGKILL");
          resolve(null);
        }, 5000),
      ),
    ]);
  }
});
test("native host interoperates with the web lobby client, preserves its seat on reconnect and exchanges chat", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Capture only this test's sockets so interruption cannot affect a real session.
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    (window as any).nativeSockets = [];
    window.WebSocket = class extends Original {
      constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols);
        if (String(address).startsWith("ws://127.0.0.1:1437"))
          (window as any).nativeSockets.push(this);
      }
    };
  });
  await page.goto("/tests/native-graphics/index.html?menus");
  await page.getByRole("button", { name: "Multiplayer", exact: true }).click();
  await page.getByRole("textbox", { name: "Multiplayer server URL" }).fill(url);
  await page
    .getByRole("textbox", { name: "Multiplayer player name" })
    .fill("Native host");
  await page
    .getByRole("button", { name: "Connect to multiplayer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create multiplayer game", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search multiplayer nations" })
    .fill("United Kingdom");
  await page
    .getByRole("button", { name: "Select United Kingdom", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Share multiplayer invitation", exact: true })
    .click();
  const invitation: string = await page.evaluate(
    () => (window as any).sharedInvitation,
  );
  const id = new URL(
    invitation.replace("Join Grand Century: ", ""),
  ).searchParams.get("session")!;
  // Import the same shared client used by the web Lobby, with no native adapter.
  await page.evaluate(
    async ({ id, url }) => {
      const { LobbyClient } = await import("/src/net/lobbyClient.ts");
      const client = new LobbyClient({ url, playerName: "Web guest" });
      (window as any).webGuest = client;
      client.onLobbyState((lobby: any) => {
        const self = lobby.players.find((p: any) => p.clientId === lobby.you);
        if (!self?.nationTag) client.selectNation("FRA");
        else if (!self.ready) client.setReady(true);
      });
      client.onMessage((message: any) => {
        if (message.t === "snapshot")
          (window as any).webSnapshot = message.snapshot;
      });
      client.onChat((line: any) => {
        (window as any).webChat = line;
      });
      client.joinLobby(id);
    },
    { id, url },
  );
  await page
    .getByRole("button", { name: "Ready to start", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start multiplayer campaign", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Economy", exact: true }).click();
  await page
    .getByRole("button", { name: "Raise poor tax", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as any).webSnapshot;
        return s?.nations.find((n: any) => n.tag === "ENG")?.taxRatePoor;
      }),
    )
    .toBeCloseTo(0.5);
  await page.getByRole("button", { name: "All menus", exact: true }).click();
  await page
    .getByRole("button", { name: "Session and chat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Multiplayer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Multiplayer chat message" })
    .fill("Native to web");
  await page
    .getByRole("button", { name: "Send multiplayer chat", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).webChat?.text))
    .toBe("Native to web");
  await page.evaluate(() => (window as any).webGuest.sendChat("Web to native"));
  await expect(
    page.getByText("Web guest: Web to native", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window as any).nativeSockets[0].close());
  await expect(page.getByText(/Connection: reconnecting/)).toBeVisible();
  await expect(page.getByText(/Connection: connected/)).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", {
      name: "Return to multiplayer campaign",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Open Economy", exact: true }).click();
  await expect(page.getByText("50%", { exact: true }).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Raise poor tax", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as any).webSnapshot;
        return s?.nations.find((n: any) => n.tag === "ENG")?.taxRatePoor;
      }),
    )
    .toBeCloseTo(0.55);
  expect(
    await page.evaluate(() => {
      const s = (window as any).webSnapshot;
      return s.nations[s.playerNation].tag;
    }),
  ).toBe("FRA");
  await page.evaluate(() => (window as any).webGuest.dispose());
  expect(errors).toEqual([]);
});
