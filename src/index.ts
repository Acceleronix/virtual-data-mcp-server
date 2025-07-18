import { VirtualDataMCP } from "./server";

// Export the MCP class for Durable Objects
export { VirtualDataMCP };

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Direct SSE endpoint
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return VirtualDataMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		// HTTP endpoint
		if (url.pathname === "/mcp") {
			return VirtualDataMCP.serve("/mcp").fetch(request, env, ctx);
		}

		// Homepage
		if (url.pathname === "/") {
			return new Response(
				`
                <h1>IoT MCP Server - Minimal</h1>
                <p>Acceleronix IoT Platform MCP Server (Minimal Feature Set)</p>
                <p>MCP SSE Endpoint: /sse</p>
                <p>MCP HTTP Endpoint: /mcp</p>
                <p>Status: Ready</p>
                <p>Version: 1.0.0</p>
                <br>
                <h2>Available IoT Tools:</h2>
                <ul>
                    <li><strong>Health Check:</strong> health_check</li>
                    <li><strong>Product Management:</strong> list_products</li>
                </ul>
            `,
				{
					headers: { "content-type": "text/html" },
				},
			);
		}

		return new Response("Not found", { status: 404 });
	},
};
