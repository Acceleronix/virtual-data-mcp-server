import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EUOneAPIUtils, type EUOneEnvironment } from "./utils";
import { z } from "zod";

export class VirtualDataMCP extends McpAgent {
	server = new McpServer({
		name: "EUOne IoT MCP Server",
		version: "2.0.0",
	});

	async init() {
		const env = this.env as unknown as EUOneEnvironment;

		// Validate environment variables
		if (!env.BASE_URL || !env.APP_ID || !env.APP_SECRET || !env.INDUSTRY_CODE) {
			throw new Error("Missing required EUOne API environment variables: BASE_URL, APP_ID, APP_SECRET, INDUSTRY_CODE");
		}

		// Health check / login test tool
		this.addHealthCheckTool(env);

		// TSL model tool
		this.addTslModelTool(env);
	}

	private addHealthCheckTool(env: EUOneEnvironment) {
		this.server.tool(
			"login_test",
			"Test EUOne API login and authentication status",
			{},
			async () => {
				try {
					const health = await EUOneAPIUtils.healthCheck(env);
					return {
						content: [
							{
								type: "text",
								text: `✅ EUOne API Login Test: ${health.status}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ EUOne API Login Test Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}

	private addTslModelTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_tsl_model",
			"Get TSL (Thing Specification Language) model by product key",
			{
				productKey: {
					type: "string",
					description: "The product key to query TSL model for",
					required: true,
				},
			},
			async (args) => {
				try {
					const productKey = z.string().parse(args.productKey);
					const tslData = await EUOneAPIUtils.getTslModel(env, productKey);

					// Format the TSL model data for display
					let responseText = `📋 TSL Model for Product Key: ${productKey}\n\n`;
					
					if (tslData.profile) {
						responseText += `**Profile Information:**\n`;
						responseText += `- Product Key: ${tslData.profile.productKey || 'N/A'}\n`;
						responseText += `- Version: ${tslData.profile.version || 'N/A'}\n\n`;
					}

					if (tslData.properties && Array.isArray(tslData.properties)) {
						responseText += `**Properties (${tslData.properties.length}):**\n`;
						tslData.properties.forEach((prop: any, index: number) => {
							responseText += `${index + 1}. **${prop.identifier || 'Unknown'}** - ${prop.name || 'No name'}\n`;
							responseText += `   - Type: ${prop.dataType?.type || 'Unknown'}\n`;
							responseText += `   - Access: ${prop.accessMode || 'Unknown'}\n`;
							if (prop.description) {
								responseText += `   - Description: ${prop.description}\n`;
							}
							responseText += `\n`;
						});
					}

					if (tslData.services && Array.isArray(tslData.services)) {
						responseText += `**Services (${tslData.services.length}):**\n`;
						tslData.services.forEach((service: any, index: number) => {
							responseText += `${index + 1}. **${service.identifier || 'Unknown'}** - ${service.name || 'No name'}\n`;
							if (service.description) {
								responseText += `   - Description: ${service.description}\n`;
							}
							responseText += `\n`;
						});
					}

					if (tslData.events && Array.isArray(tslData.events)) {
						responseText += `**Events (${tslData.events.length}):**\n`;
						tslData.events.forEach((event: any, index: number) => {
							responseText += `${index + 1}. **${event.identifier || 'Unknown'}** - ${event.name || 'No name'}\n`;
							if (event.description) {
								responseText += `   - Description: ${event.description}\n`;
							}
							responseText += `\n`;
						});
					}

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
								text: `❌ Error getting TSL model: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}
}