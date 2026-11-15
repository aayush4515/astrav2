import { splitSentences } from "../features/voice/VoiceEngine";

describe("splitSentences", () => {
  it("splits long speech into sentences for streamed playback", () => {
    expect(splitSentences("Welcome back, Commander Alex. Your evening health assessment is beginning. Say cancel to stop.")).toEqual([
      "Welcome back, Commander Alex.",
      "Your evening health assessment is beginning.",
      "Say cancel to stop.",
    ]);
  });

  it("keeps short acknowledgements whole and tolerates missing punctuation", () => {
    expect(splitSentences("Got it, 7.")).toEqual(["Got it, 7."]);
    expect(splitSentences("No new symptoms. Noted.")).toEqual(["No new symptoms. Noted."]);
    expect(splitSentences("Measuring body mass")).toEqual(["Measuring body mass"]);
  });
});
