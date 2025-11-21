const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");

let globalThreadId = null;

module.exports = async function (context, req) {
    context.log("🔥 /api/llmStream invoked");

    const userText = req.body?.text || "";
    const endpoint = process.env.AZURE_AI_PROJECT_ENDPOINT;
    const agentId = process.env.AZURE_AI_AGENT_ID;

    // SSE headers (SWA safe)
    context.res = {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        },
        body: ""
    };

    // Enable flushing
    context.res.flush = true;

    // Helper write
    const write = (msg) => {
        context.res.write(msg);
        context.res.flush();
    };

    // Debug event
    write(`data: ${JSON.stringify({ debug: "sse-start" })}\n\n`);

    try {
        const credential = new DefaultAzureCredential();
        const client = new AIProjectClient(endpoint, credential);

        if (!globalThreadId) {
            const thread = await client.agents.threads.create();
            globalThreadId = thread.id;
            context.log("Thread created:", globalThreadId);
        }

        await client.agents.messages.create(globalThreadId, "user", userText);

        const run = await client.agents.runs.create(globalThreadId, agentId);
        context.log("Run created:", run.id);

        const stream = await client.agents.runs.stream(globalThreadId, run.id);

        for await (const event of stream) {
            context.log("EVENT:", event.type);

            if (event.type === "response.output_text.delta") {
                write(`data: ${JSON.stringify({ token: event.text })}\n\n`);
            }

            if (event.type === "response.completed") {
                write(`data: [DONE]\n\n`);
                break;
            }
        }

    } catch (err) {
        context.log("ERR:", err);
        write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
        context.done();
    }
};
