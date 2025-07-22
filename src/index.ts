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
                <h1>EUOne IoT MCP Server</h1>
                <p>Acceleronix Platform Virtual Device MCP server</p>
                <p>MCP SSE Endpoint: /sse</p>
                <p>MCP HTTP Endpoint: /mcp</p>
                <p>Status: Ready</p>
                <p>Version: 2.0.0</p>
                <p>API Base URL: https://euone-api.acceleronix.io/</p>
                <br>
                <h2>Available Tools:</h2>
                <ul>
                    <li><strong>Login Test:</strong> login_test - Test EUOne API authentication</li>
                    <li><strong>Get TSL Model:</strong> get_tsl_model - Get Thing Specification Language model by product key</li>
                </ul>
                <br>
                <h3>Environment Variables Required:</h3>
                <ul>
                    <li>BASE_URL - EUOne API base URL</li>
                    <li>APP_ID - Application ID for authentication</li>
                    <li>APP_SECRET - Application secret for authentication</li>
                    <li>INDUSTRY_CODE - Industry code (e.g., "eam")</li>
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
