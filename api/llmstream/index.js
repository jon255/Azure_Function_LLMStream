const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");

let globalThreadId = null;

module.exports = async function (context, req) {
    context.log("LLM Streaming function invoked.");

    const userText = req.body?.text || "";

    const endpoint = process.env.AZURE_AI_PROJECT_ENDPOINT;
    const agentId = process.env.AZURE_AI_AGENT_ID;

    if (!endpoint || !agentId) {
        context.res = {
            status: 500,
            body: "Missing endpoint or agent ID"
        };
        return;
    }

    // Enable raw streaming
    context.res = {
        isRaw: true,
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        },
        body: ""
    };

    const res = context.res;

    try {
        const credential = new DefaultAzureCredential();
        const client = new AIProjectClient(endpoint, credential);

        if (!globalThreadId) {
            const thread = await client.agents.threads.create();
            globalThreadId = thread.id;
        }

        await client.agents.messages.create(globalThreadId, "user", userText);

        const stream = await client.agents.runs.stream(globalThreadId, agentId);

        for await (const event of stream) {

            if (event.type === "response.output_text.delta") {
                res.write(`data: ${JSON.stringify({ token: event.text })}\n\n`);
            }

            if (event.type === "response.completed") {
                res.write(`data: [DONE]\n\n`);
                break;
            }
        }

    } catch (err) {
        context.log("STREAM ERROR", err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }

    context.done();
};
