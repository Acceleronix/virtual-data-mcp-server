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
                <h1>Acceleronix SaaS IoT MCP Server</h1>
                <p>Acceleronix Platform Virtual Device MCP server</p>
                <p>MCP SSE Endpoint: /sse</p>
                <p>MCP HTTP Endpoint: /mcp</p>
                <p>Status: Ready</p>
                <p>Version: 2.0.0</p>
                <p>API Base URL: https://euone-api.acceleronix.io/</p>
                <br>
                <h2>Available Tools:</h2>
                <ul>
                    <li><strong>Health Check:</strong> health_check - Comprehensive health check with authentication, token status, and API connectivity</li>
                    <li><strong>Get Product List:</strong> get_product_list - Get list of products with intelligent pagination and filtering</li>
                    <li><strong>Get Product TSL:</strong> get_product_tsl - Get product Thing Specification Language (TSL) model defining device properties and controls</li>
                    <li><strong>Upload Device Data:</strong> upload_device_data - Upload device TSL model data to simulate device data reporting</li>
                </ul>
                <br>
                <h3>Environment Variables Required:</h3>
                <ul>
                    <li>BASE_URL - Acceleronix SaaS API base URL</li>
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
