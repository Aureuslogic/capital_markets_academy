// Capital Markets Academy: email a summary of each finished CMA voice call.
// Vapi posts its end-of-call report here; we forward a short summary to Formspree,
// which emails it to the address set on the Formspree form.

const CMA_ASSISTANT_ID = "fb26a312-0d2a-4683-9db8-38e4b00c61da";
const FORMSPREE_URL = "https://formspree.io/f/meewwqvk";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

function firstMatch(re, text) {
  const m = (text || "").match(re);
  return m ? m[0].trim() : "";
}

function userLines(transcript) {
  return (transcript || "")
    .split("\n")
    .filter((l) => /^(user|customer)\s*:/i.test(l.trim()))
    .join("\n");
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("CMA call report endpoint", { status: 200 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const msg = body && body.message;
  if (!msg || msg.type !== "end-of-call-report") {
    return Response.json({ ignored: true });
  }

  const call = msg.call || {};
  const assistantId = call.assistantId || (msg.assistant && msg.assistant.id);
  if (assistantId !== CMA_ASSISTANT_ID) {
    return Response.json({ ignored: true });
  }

  const analysis = msg.analysis || {};
  const artifact = msg.artifact || {};
  const transcript = artifact.transcript || msg.transcript || "";
  const summary = analysis.summary || msg.summary || "No summary was generated for this call.";
  const sd = analysis.structuredData || {};

  const callerText = userLines(transcript) || transcript;
  const email = sd.email || firstMatch(EMAIL_RE, callerText);
  const phone = sd.phone || firstMatch(PHONE_RE, callerText) || (call.customer && call.customer.number) || "";
  const name = sd.name || "";

  const started = msg.startedAt || call.startedAt || "";
  const ended = msg.endedAt || call.endedAt || "";
  const minutes =
    started && ended ? ((new Date(ended) - new Date(started)) / 60000).toFixed(1) : "";

  const payload = {
    _subject: `New CMA voice call${name ? `: ${name}` : ""}`,
    source: "CMA website voice assistant",
    caller_name: name || "See transcript",
    caller_email: email || "See transcript",
    caller_phone: phone || "See transcript",
    call_summary: summary,
    call_length_minutes: minutes,
    call_ended_reason: msg.endedReason || "",
    call_started: started,
    vapi_call_id: call.id || "",
    transcript: transcript.slice(0, 12000),
  };
  if (EMAIL_RE.test(email)) payload.email = email;

  const res = await fetch(FORMSPREE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Formspree error", res.status, detail.slice(0, 500));
    return Response.json({ ok: false, status: res.status }, { status: 502 });
  }
  return Response.json({ ok: true });
};

export const config = { path: "/api/vapi-call-report" };
