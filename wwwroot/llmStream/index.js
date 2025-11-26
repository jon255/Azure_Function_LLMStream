const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");

let globalThreadId = null; 

module.exports = async function (context, req) {

    const userText = req.body?.text || "";

    // Streaming response headers
    context.res = {
        status: 200,
        isRaw: true,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive"
        },
        body: ""
    };

    // IMPORTANT — this is the trick that makes .write() available!
    const res = context.res;

    try {
        const endpoint = process.env.AZURE_AI_PROJECT_ENDPOINT;
        const agentId = process.env.AZURE_AI_AGENT_ID;

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
                res.write("data: [DONE]\n\n");
                break;
            }
        }

    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
        res.end();
    }
};