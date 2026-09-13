/* ====================================================================
 * policy-local -- rung 6 without a key, a bill or a network.
 *
 * The same seam, the same brief and the same grammar as policy-model.mjs;
 * the only thing that changes is who is reading. This one talks to an
 * OpenAI-compatible chat endpoint over plain `fetch`, which means it needs
 * **no dependency at all** -- not even the one thing this repository was
 * otherwise not dependency-free for.
 *
 *     node core/run-model.mjs --local --model qwen --n 5
 *
 * WHY THIS IS WORTH HAVING, and it is not thrift. The first reading of
 * rung 6 was integrity 1.000 over 7 claims by a frontier model, which says
 * the oracle works and says nothing at all about whether the task is hard.
 * A 4B model on the same routes is the cheapest way to find out, because a
 * measure that nothing can fail is not a measure. Roadmap item 5's "weaker
 * readers" is exactly this, and it turns out not to need an account.
 *
 * WHAT IS NOT CLAIMED. A local model is not a controlled comparison with a
 * frontier one: different tokenizer, different sampler, a context two
 * orders of magnitude smaller, and no prompt caching. It answers "can this
 * task be failed", not "how do these two models rank".
 * ==================================================================== */

import { observe, TOOLS, BRIEF, DEFAULT_TASK, actionOf } from "./policy-model.mjs";

const DEFAULT_BASE = process.env.OPENAI_BASE_URL || "http://127.0.0.1:8081/v1";

/* Anthropic's tool shape is {name, description, input_schema}; OpenAI's is
   {type:"function", function:{name, description, parameters}}. Same schema
   inside, so the grammar is translated rather than restated -- restating it
   is how the two halves of a twin drift apart (§17.10, and bug log 24 for
   the most recent one). */
const asOpenAITools = tools => tools.map(t => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema }
}));

/**
 * localPolicy -- an async policy for runEpisodeAsync, against an
 * OpenAI-compatible endpoint.
 *
 * opts: { model, baseUrl, task, maxTokens, temperature, onStep }
 */
function localPolicy({ model = "qwen", baseUrl = DEFAULT_BASE, task = DEFAULT_TASK,
                       maxTokens = 1200, temperature = 0.7, timeoutMs = 180000,
                       onStep = null } = {}){
  /* The system turn carries the brief; the first user turn carries the task
     and the first observation. After that every observation goes back as a
     `tool` message answering the call just made, so the conversation stays a
     legal tool exchange rather than a pile of user turns -- the same shape
     policy-model.mjs keeps for the same reason. */
  const messages = [{ role: "system", content: BRIEF }];
  const tools = asOpenAITools(TOOLS);
  const log = [];
  let pendingId = null;

  const p = async (s) => {
    const text = observe(s);
    if (pendingId){
      messages.push({ role: "tool", tool_call_id: pendingId, content: text });
      pendingId = null;
    } else {
      messages.push({ role: "user", content: `${task}\n\n${text}` });
    }

    const ctl = AbortSignal.timeout(timeoutMs);
    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   /* llama-swap does not check it; clients insist on one */
                   "Authorization": `Bearer ${process.env.OPENAI_API_KEY || "local"}` },
        body: JSON.stringify({ model, messages, tools, tool_choice: "required",
                               max_tokens: maxTokens, temperature }),
        signal: ctl
      });
    } catch (e){
      throw new Error(`local endpoint ${baseUrl} did not answer: ${e.message}\n` +
        "Is llama-swap running?  curl 127.0.0.1:8081/v1/models");
    }
    if (!res.ok){
      const detail = (await res.text()).slice(0, 400);
      /* Running out of context is not a harness failure, it is the reader
         failing -- and on a 4B model with an 8K window against pages of
         3,200 symbols it is the MOST likely way to fail. Ending the
         excursion here records it as what it is: a reader that could not
         hold the room it was standing in. Crashing the run instead would
         throw away the finding and report nothing.

         Note what this costs: such an episode ends with whatever claims it
         had already made, so its integrity is real but its step count is
         short. Read the two together or a reader that quits early looks
         careful. */
      if (/exceed_context_size|context (size|length)|too many tokens/i.test(detail)){
        const used = detail.match(/\((\d+) tokens\)/)?.[1] ?? "?";
        if (onStep) onStep({ step: s.steps, action: null, outOfContext: true, tokens: used });
        log.push({ step: s.steps, finish_reason: "out_of_context", tokens: used });
        return { kind: "report",
                 found: `(the reader ran out of context at step ${s.steps}, ${used} tokens)` };
      }
      throw new Error(`local endpoint returned ${res.status}: ${detail}`);
    }
    const body = await res.json();
    const choice = body.choices?.[0];
    const msg = choice?.message ?? {};
    log.push({ step: s.steps, model: body.model, finish_reason: choice?.finish_reason,
               usage: body.usage ?? null });

    const call = msg.tool_calls?.[0];
    /* A small model that answers in prose instead of calling a tool has
       ended its own excursion. Recorded as a report rather than retried,
       because a retry would be the harness doing the reader's job -- and
       "named no action" is a real way to fail this task. */
    if (!call){
      if (onStep) onStep({ step: s.steps, action: null, noTool: true });
      return { kind: "report", found: "(the reader named no action)" };
    }

    /* Only the fields the protocol needs. Keeping the whole message would
       carry `reasoning_content`, which Gemma writes and which is not part
       of the exchange. */
    messages.push({ role: "assistant", content: msg.content ?? null,
                    tool_calls: [{ id: call.id, type: "function",
                                   function: { name: call.function.name,
                                               arguments: call.function.arguments } }] });
    pendingId = call.id;

    let input = {};
    try { input = JSON.parse(call.function.arguments || "{}"); }
    catch { /* malformed arguments are a refusal by apply(), not a crash here */ }
    const action = actionOf({ name: call.function.name, input });
    if (onStep) onStep({ step: s.steps, action, usage: body.usage ?? null });
    return action;
  };

  p.policyName = `local(${model})`;
  p.log = log;
  return p;
}

export { localPolicy, DEFAULT_BASE };
