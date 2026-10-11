// A sample-accurate tap on the real output of the engine's worklet, shared by the checks that listen to the sound
// (stereo.mjs, mixer.mjs). The page's own meter only shows the louder channel, and an AnalyserNode per channel reads two
// different slices of the loop (they are read one after the other while the audio keeps running), so comparing the two
// is a race. This tap sees every sample of both channels, so what it reports does not depend on when it is read.
//
// Rules that keep a check free of timing luck:
//  - Judge the channels against each other inside ONE window (`diffPeak`, or one channel's peak against the other's).
//  - Judge two windows against each other only if each covers a whole loop (`LOOP_WINDOW_MS`), and then with a margin:
//    consecutive passes of the demo loop peak up to ~3% differently (hits stack differently), and the master soft-clips
//    (tanh), so a gain of 0.5 gives a peak ratio of about 0.55, not 0.5. Test "clearly louder / about half", not equality.
//  - Never trust silence from a dead tap: `listen` throws when no audio went through it.

/** The demo drum loop is one bar at 120 BPM: 2 s. A window this long, plus a margin, always holds a whole loop. */
export const LOOP_WINDOW_MS = 2600

/** Install before the page loads: wraps the engine's worklet node so every one made is tapped. */
export const installAudioTap = (page) =>
  page.addInitScript(() => {
    const Original = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Original {
      constructor(ctx, name, options) {
        super(ctx, name, options)
        const tap = ctx.createScriptProcessor(1024, 2, 1)
        tap.channelCount = 2
        tap.channelCountMode = 'explicit'
        const mute = ctx.createGain() // the processor only runs while it reaches the destination
        mute.gain.value = 0
        this.connect(tap)
        tap.connect(mute)
        mute.connect(ctx.destination)
        let acc
        const reset = () => {
          acc = { frames: 0, sum: [0, 0], peak: [0, 0], diffPeak: 0 }
        }
        reset()
        tap.onaudioprocess = (event) => {
          const channels = [event.inputBuffer.getChannelData(0), event.inputBuffer.getChannelData(1)]
          const length = channels[0].length
          for (let i = 0; i < length; i++) {
            for (let c = 0; c < 2; c++) {
              const v = channels[c][i]
              acc.sum[c] += v * v
              acc.peak[c] = Math.max(acc.peak[c], Math.abs(v))
            }
            acc.diffPeak = Math.max(acc.diffPeak, Math.abs(channels[0][i] - channels[1][i]))
          }
          acc.frames += length
        }
        window.__tap = {
          reset,
          read: () => ({ frames: acc.frames, rms: acc.sum.map((s) => Math.sqrt(s / Math.max(1, acc.frames))), peak: [...acc.peak], diffPeak: acc.diffPeak }),
        }
      }
    }
  })

/**
 * Listen for `ms` and report what went through both channels in that window: `peak` and `rms` per channel
 * ([left, right]) and `diffPeak`, the largest |left - right| (0 when the channels are identical).
 */
export const listen = async (page, ms) => {
  await page.evaluate(() => window.__tap.reset())
  await page.waitForTimeout(ms)
  const heard = await page.evaluate(() => window.__tap.read())
  if (heard.frames === 0) throw new Error('the audio tap heard nothing at all (no audio context running?), so silence would prove nothing')
  return heard
}

/** `peak` and `diffPeak` rounded for a readable check line. */
export const show = (heard) => JSON.stringify({ peak: heard.peak.map((v) => +v.toFixed(4)), diffPeak: +heard.diffPeak.toExponential(2) })
