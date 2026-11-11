import { describe, expect, it } from "vitest";
import mailer from "../email-worker/index";

type Sent = { to: string; from: string; subject: string; text: string };

function relay(send: (m: Sent) => Promise<{ messageId: string }>, token = "relay") {
  const env = { EMAIL: { send }, RELAY_TOKEN: token, MAIL_FROM: "noreply@site.test" };
  return (body: unknown, auth = "Bearer relay") =>
    mailer.fetch(
      new Request("https://mailer.test/", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify(body) }),
      env as never
    );
}

const message = { to: "ada@example.com", subject: "Confirm your email", text: "A link." };

describe("the mail relay", () => {
  it("sends one message from the configured address", async () => {
    const sent: Sent[] = [];
    const res = await relay(async (m) => (sent.push(m), { messageId: "m1" }))(message);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "m1" });
    expect(sent).toEqual([{ ...message, from: "noreply@site.test" }]);
  });

  it("refuses callers without the relay token, and stays shut without one", async () => {
    const never = async () => {
      throw new Error("sent");
    };
    expect((await relay(never)(message, "Bearer wrong")).status).toBe(401);
    expect((await relay(never)(message, "")).status).toBe(401);
    expect((await relay(never, "")(message, "Bearer ")).status).toBe(503);
  });

  it("takes a single recipient only, and bounds the message", async () => {
    const send = relay(async () => ({ messageId: "x" }));
    expect((await send({ ...message, to: "a@example.com, b@example.com" })).status).toBe(422);
    expect((await send({ ...message, to: "Eve <eve@example.com>" })).status).toBe(422);
    expect((await send({ ...message, text: "" })).status).toBe(422);
    expect((await send({ ...message, text: "x".repeat(10_001) })).status).toBe(413);
  });

  it("reports the send error's code without the recipient", async () => {
    const res = await relay(async () => {
      throw Object.assign(new Error("ada@example.com rejected"), { code: "E_RECIPIENT_NOT_ALLOWED" });
    })(message);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("E_RECIPIENT_NOT_ALLOWED");
    expect(text).not.toContain("ada@example.com");
  });
});
