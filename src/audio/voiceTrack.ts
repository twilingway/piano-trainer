import * as Tone from "tone";

/*
 * A lesson level's sung voice: one recording whose second 0 is the song's
 * second 0. One voice sounds at a time; players are kept per URL so a level
 * opened again does not fetch its file twice.
 */
const players = new Map<string, Tone.Player>();
let sounding: Tone.Player | undefined;

/** Starts fetching a voice so it is ready by the time the song plays. */
export function loadVoiceTrack(url: string): void {
  if (players.has(url)) return;
  players.set(
    url,
    new Tone.Player({
      url,
      onerror: (error) => {
        console.warn(`Voice track ${url} did not load`, error);
      }
    }).toDestination()
  );
}

export function voiceTrackReady(url: string): boolean {
  return players.get(url)?.loaded === true;
}

/** Plays the voice from `offset` seconds into it at audio time `at`; past its end it stays silent. */
export function startVoiceTrack(url: string, at: number, offset: number): void {
  const player = players.get(url);
  if (!player?.loaded || offset >= player.buffer.duration) return;
  stopVoiceTrack();
  player.start(at, offset);
  sounding = player;
}

/** Stops the voice at audio time `at`, or now. */
export function stopVoiceTrack(at?: number): void {
  sounding?.stop(at);
  if (at === undefined) sounding = undefined;
}
