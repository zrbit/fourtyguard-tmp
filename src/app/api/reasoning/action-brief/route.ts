import { z } from "zod";

export const runtime = "nodejs";

const actionSchema = z.object({ title: z.string().max(100), when: z.string().max(120), reason: z.string().max(500) });
const requestSchema = z.object({
  anomalyF: z.number().finite().min(-50).max(50), warmerThan: z.number().int().min(0).max(20), controlCount: z.number().int().min(0).max(20),
  forecast: z.object({ peakTemperatureF: z.number().finite().min(-50).max(160), peakApparentF: z.number().finite().min(-50).max(180), peakSolarWm2: z.number().finite().min(0).max(1600), peakTime: z.string().max(40) }),
  actions: z.array(actionSchema).min(1).max(3),
});
const briefSchema = z.object({ brief: z.string().min(1).max(600), verifyFirst: z.array(z.string().min(1).max(180)).min(1).max(2) });

function parseModelJson(content: string) {
  const normalized = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return briefSchema.parse(JSON.parse(normalized));
}

export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return Response.json({ error: "AI site brief is not configured yet." }, { status: 503 });
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await request.json()); } catch { return Response.json({ error: "The action-plan evidence was invalid." }, { status: 400 }); }
  const system = "You write a cautious heat-action briefing. Use only the supplied facts. Do not state or imply that a feature caused the heat anomaly, promise a temperature reduction, give medical advice, or add an intervention beyond the supplied actions. Return only a valid JSON object, without markdown, with exactly: brief (two concise sentences) and verifyFirst (one or two practical site checks).";
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b", temperature: 0.2, max_tokens: 220, messages: [{ role: "system", content: system }, { role: "user", content: `Evidence for this action plan: ${JSON.stringify(input)}` }] }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const body = await upstream.json() as { choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } };
    if (!upstream.ok) throw new Error(body.error?.message ?? "Groq could not create a site brief.");
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned an empty site brief.");
    return Response.json(parseModelJson(content));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Groq could not create a site brief." }, { status: 502 });
  }
}
