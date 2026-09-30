import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { UiAlert } from "../../../src/ui/alerts";
const tones = {
  war: require("../assets/audio/war.wav"),
  peace: require("../assets/audio/peace.wav"),
  bankruptcy: require("../assets/audio/bankruptcy.wav"),
  rebellion: require("../assets/audio/rebellion.wav"),
  election: require("../assets/audio/election.wav"),
  event: require("../assets/audio/event.wav"),
};
export function NativeAudio({
  alerts,
  muted,
  active,
}: {
  alerts: readonly UiAlert[];
  muted: boolean;
  active: boolean;
}) {
  const ambient = useAudioPlayer(require("../assets/audio/ambient.wav"));
  const tone = useAudioPlayer(tones.event);
  const heard = useRef<string | null>(null);
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    }).catch(() => {});
    ambient.loop = true;
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        ambient.pause();
        tone.pause();
      } else if (!muted && active) ambient.play();
    });
    if (muted || !active) {
      ambient.pause();
      tone.pause();
    } else ambient.play();
    return () => {
      listener.remove();
      ambient.pause();
      tone.pause();
    };
  }, [ambient, tone, muted, active]);
  useEffect(() => {
    const latest = alerts.at(-1);
    if (!latest || heard.current === latest.id) return;
    heard.current = latest.id;
    if (
      muted ||
      !active ||
      (latest.kind === "election" &&
        /elections this month/i.test(latest.message))
    )
      return;
    tone.replace(tones[latest.kind as keyof typeof tones] ?? tones.event);
    tone.play();
  }, [alerts, muted, active, tone]);
  return null;
}
