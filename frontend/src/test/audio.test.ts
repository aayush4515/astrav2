import { downsample, encodeWav } from "../features/voice/audio";

describe("audio encoding", () => {
  it("downsamples 48 kHz to 16 kHz", () => {
    const input = new Float32Array(4800).fill(0.5);
    const out = downsample(input, 48000, 16000);
    expect(out.length).toBe(1600);
    expect(out[10]).toBeCloseTo(0.5);
  });

  it("writes a valid 16-bit mono WAV header", async () => {
    const blob = encodeWav(new Float32Array(160), 16000);
    const ab = await new Promise<ArrayBuffer>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.readAsArrayBuffer(blob);
    });
    const buf = new DataView(ab);
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => buf.getUint8(o + i)));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(buf.getUint16(22, true)).toBe(1);
    expect(buf.getUint32(24, true)).toBe(16000);
    expect(buf.getUint16(34, true)).toBe(16);
    expect(blob.size).toBe(44 + 320);
  });
});
