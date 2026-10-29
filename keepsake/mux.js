/* Keepsake - joins Instagram's separate best-quality video file and its
   sound file into one MP4, in the browser, without re-encoding.
   Instagram keeps its 1080p (and taller) versions only as a video-only file
   plus a separate AAC sound file (PLAN 2.4); this copies every packet of
   both into one MP4 with the index up front. Loaded with import() only when
   a best-quality save starts. Muxer: mediabunny 1.61.0 (MPL-2.0), vendored
   unmodified in vendor/ (PLAN D8). */
import {
  Input, Output, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS,
  EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource
} from './vendor/mediabunny.min.mjs';

/* videoBlob: the video-only MP4 (VP9 in M0 and M1). audioBlob: the AAC
   file, or null for a silent post. Resolves to a video/mp4 Blob. */
export async function mux(videoBlob, audioBlob, onProgress) {
  const vIn = new Input({ source: new BlobSource(videoBlob), formats: ALL_FORMATS });
  const vTrack = await vIn.getPrimaryVideoTrack();
  if (!vTrack) throw new Error('no video track');
  const aIn = audioBlob ? new Input({ source: new BlobSource(audioBlob), formats: ALL_FORMATS }) : null;
  const aTrack = aIn ? await aIn.getPrimaryAudioTrack() : null;

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const vSrc = new EncodedVideoPacketSource(vTrack.codec);
  output.addVideoTrack(vSrc, { rotation: vTrack.rotation });
  let aSrc = null;
  if (aTrack) {
    aSrc = new EncodedAudioPacketSource(aTrack.codec);
    output.addAudioTrack(aSrc);
  }
  await output.start();

  const duration = (await vTrack.computeDuration()) || 1;
  const lanes = [{ it: new EncodedPacketSink(vTrack).packets(), src: vSrc, config: await vTrack.getDecoderConfig(), first: true }];
  if (aTrack) lanes.push({ it: new EncodedPacketSink(aTrack).packets(), src: aSrc, config: await aTrack.getDecoderConfig(), first: true });
  for (const l of lanes) l.next = await l.it.next();

  // Feed whichever track is behind, so the two stay interleaved by time.
  for (;;) {
    let lane = null;
    for (const l of lanes) {
      if (!l.next.done && (!lane || l.next.value.timestamp < lane.next.value.timestamp)) lane = l;
    }
    if (!lane) break;
    const packet = lane.next.value;
    await lane.src.add(packet, lane.first ? { decoderConfig: lane.config } : undefined);
    lane.first = false;
    if (lane.src === vSrc && onProgress) onProgress(Math.min(1, packet.timestamp / duration));
    lane.next = await lane.it.next();
  }
  for (const l of lanes) l.src.close();
  await output.finalize();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
