import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IoTAPIUtils, type IoTEnvironment } from "./utils";

export class VirtualDataMCP extends McpAgent {
	server = new McpServer({
		name: "IoT MCP Server",
		version: "1.0.0",
	});

	async init() {
		const env = this.env as unknown as IoTEnvironment;

		// Validate environment variables
		if (!env.BASE_URL || !env.ACCESS_KEY || !env.ACCESS_SECRET) {
			throw new Error("Missing required IoT API environment variables");
		}

		// Health check tool
		this.addHealthCheckTool(env);

		// Product management tools - simplified
		this.addProductManagementTools(env);
	}

	private addHealthCheckTool(env: IoTEnvironment) {
		this.server.tool(
			"health_check",
			"Check IoT API connectivity and authentication status",
			{},
			async () => {
				try {
					const health = await IoTAPIUtils.healthCheck(env);
					return {
						content: [
							{
								type: "text",
								text: `✅ IoT API Health Check: ${health.status}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ IoT API Health Check Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}

	private addProductManagementTools(env: IoTEnvironment) {
		// List all products with detailed information
		this.server.tool(
			"list_products",
			"List all products with detailed information including access type, network way, and data format",
			{},
			async () => {
				try {
					const products = await IoTAPIUtils.listProducts(env);

					let responseText = `📋 Found ${products.length} products:\n\n`;

					products.forEach((product, index) => {
						responseText += `${index + 1}. **${product.productName}** (${product.productKey})\n`;
						responseText += `   - Access Type: ${IoTAPIUtils.formatAccessType(product.accessType)}\n`;
						responseText += `   - Data Format: ${IoTAPIUtils.formatDataFmt(product.dataFmt)}\n`;
						responseText += `   - Connect Platform: ${product.connectPlatform || "N/A"}\n`;
						responseText += `   - Created: ${IoTAPIUtils.formatTimestampWithTimezone(product.createTime)}\n`;
						responseText += `   - Updated: ${IoTAPIUtils.formatTimestampWithTimezone(product.updateTime)}\n\n`;
					});

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Error listing products: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}
}
