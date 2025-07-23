import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	type EUOneEnvironment,
	EUOneAPIUtils,
} from "./utils";
import { z } from "zod";

export class VirtualDataMCP extends McpAgent {
	server = new McpServer({
		name: "Acceleronix SaaS IoT MCP Server",
		version: "2.0.0",
	});


	async init() {
		console.log("🚀 MCP Server starting initialization...");
		const env = this.env as unknown as EUOneEnvironment;

		// Log environment variables for debugging (without sensitive values)
		console.log("🔍 Environment check:");
		console.log("  - BASE_URL:", env.BASE_URL ? "✅ Set" : "❌ Missing");
		console.log("  - APP_ID:", env.APP_ID ? "✅ Set" : "❌ Missing");
		console.log("  - APP_SECRET:", env.APP_SECRET ? "✅ Set" : "❌ Missing");  
		console.log("  - INDUSTRY_CODE:", env.INDUSTRY_CODE ? "✅ Set" : "❌ Missing");

		// Validate environment variables - but don't throw error to allow tools registration
		if (!env.BASE_URL || !env.APP_ID || !env.APP_SECRET || !env.INDUSTRY_CODE) {
			console.error(
				"❌ Missing required Acceleronix SaaS API environment variables: BASE_URL, APP_ID, APP_SECRET, INDUSTRY_CODE",
			);
			console.log("⚠️ MCP server will start with limited functionality - tools will show authentication errors");
		}

		// Always register tools first, regardless of environment validation
		console.log("📋 Registering MCP tools...");
		
		// Health check / login test tool
		this.addHealthCheckTool(env);
		console.log("✅ Health check tool registered");

		// Product list tool
		this.addProductListTool(env);
		console.log("✅ Product list tools registered");

		console.log("📋 MCP tools registered successfully (simplified for testing)");

		// Auto-login on server initialization with improved error handling
		// This happens AFTER tools are registered and ensures token is ready for immediate use
		if (env.BASE_URL && env.APP_ID && env.APP_SECRET && env.INDUSTRY_CODE) {
			try {
				console.log("🔐 Pre-warming authentication for better user experience...");
				await EUOneAPIUtils.getAccessToken(env);
				console.log("✅ Authentication pre-warmed - MCP server ready for immediate use");
			} catch (error) {
				console.error("❌ Authentication pre-warming failed:", error);
				// Don't throw error here - allow server to start even if login fails
				// Login will be attempted when tools are called with automatic refresh
				console.log(
					"⚠️ MCP server started without pre-warmed authentication - login will be attempted on first tool use with auto-refresh",
				);
			}
		} else {
			console.log("⚠️ Skipping authentication pre-warming due to missing environment variables");
		}

		console.log("🚀 MCP Server initialization completed");
	}

	private addHealthCheckTool(env: EUOneEnvironment) {
		this.server.tool(
			"health_check",
			"Comprehensive health check - test authentication, token status, and API connectivity",
			{
				type: "object",
				properties: {},
				additionalProperties: false,
			},
			async (args) => {
				try {
					const healthStatus = await EUOneAPIUtils.healthCheck(env);
					
					let statusText = `🏥 **MCP Server Health Check**\n\n`;
					statusText += `✅ **Authentication**: ${healthStatus.status}\n`;
					statusText += `🔑 **Token Status**: ${healthStatus.tokenStatus}\n`;
					statusText += `⏰ **Token Expires**: ${healthStatus.tokenExpiry}\n`;
					statusText += `🌐 **API Connectivity**: ${healthStatus.apiConnectivity}\n\n`;
					
					if (healthStatus.apiConnectivity === "OK") {
						statusText += `🎯 **Overall Status**: All systems operational - ready for Claude Desktop use\n`;
					} else {
						statusText += `⚠️ **Overall Status**: Authentication OK but API connectivity issues detected\n`;
					}
					
					return {
						content: [
							{
								type: "text",
								text: statusText,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ **Health Check Failed**: ${error instanceof Error ? error.message : "Unknown error"}\n\nThis may indicate authentication issues or network connectivity problems.`,
							},
						],
					};
				}
			},
		);
		
	}




	private addProductListTool(env: EUOneEnvironment) {
		// Unified product list tool with intelligent pagination
		this.server.tool(
			"get_product_list",
			"Get list of products with intelligent pagination and filtering. Automatically optimized for different scenarios.",
			{
				type: "object",
				properties: {
					productName: {
						type: "string",
						description: "Filter by product name (optional)",
					},
					productKey: {
						type: "string",
						description: "Filter by specific product key (optional)",
					},
					releaseStatus: {
						type: "number",
						description: "Filter by release status: 0=unpublished, 1=published (optional)",
					},
					searchValue: {
						type: "string",
						description: "Search products by name or key (optional)",
					},
					pageSize: {
						type: "number",
						description: "Number of products per page, max 200 (optional, auto-optimized)",
					},
				},
				required: [],
			},
			async (args) => {
				try {
					console.log(
						"🚀 get_product_list called with args:",
						JSON.stringify(args, null, 2),
					);

					const DEFAULT_PAGE_SIZE = 10; // Small page size to match working health_check pattern
					const MAX_PAGE_SIZE = 200; // API limit

					// Apply intelligent page size optimization
					const hasFilters = args && (args.productName || args.productKey || args.searchValue || typeof args.releaseStatus === "number");
					let pageSize = DEFAULT_PAGE_SIZE;
					
					// Use custom page size if provided, but respect API limits
					if (args && typeof args.pageSize === "number") {
						pageSize = Math.min(args.pageSize, MAX_PAGE_SIZE);
					}
					
					// Build API options
					const options = {
						pageNum: 1, // Always start with first page for simplicity
						pageSize: pageSize,
						...(args &&
							typeof args === "object" && {
								...(args.productName && { productName: args.productName }),
								...(args.productKey && { productKey: args.productKey }),
								...(typeof args.releaseStatus === "number" && {
									releaseStatus: args.releaseStatus,
								}),
								...(args.searchValue && { searchValue: args.searchValue }),
							}),
					};

					console.log(
						"📋 API request options:",
						JSON.stringify(options, null, 2),
					);

					// Use centralized token management from utils
					const productData = await EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
						console.log("🔐 Using centralized token for product list");

						const queryParams = new URLSearchParams();
						queryParams.append("pageNum", String(options.pageNum));
						queryParams.append("pageSize", String(options.pageSize));

						// Add optional filters if provided
						if (options.productName)
							queryParams.append("productName", options.productName);
						if (options.productKey)
							queryParams.append("productKey", options.productKey);
						if (typeof options.releaseStatus === "number")
							queryParams.append("releaseStatus", String(options.releaseStatus));
						if (options.searchValue)
							queryParams.append("searchValue", options.searchValue);

						const apiUrl = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
						console.log("📋 API URL:", apiUrl);

						const apiResponse = await fetch(apiUrl, {
							method: "GET",
							headers: {
								Authorization: `Bearer ${token}`,
								"Accept-Language": "en-US",
								"Content-Type": "application/json",
							},
						});

						console.log("📡 API response status:", apiResponse.status);

						if (!apiResponse.ok) {
							const errorText = await apiResponse.text();
							console.error("❌ API error response:", errorText);
							throw new Error(
								`API call failed: ${apiResponse.status} - ${errorText}`,
							);
						}

						const result = (await apiResponse.json()) as any;
						
						// ===== COMPREHENSIVE API RESPONSE LOGGING =====
						console.log("🔍 === COMPLETE PRODUCT LIST API RESPONSE ===");
						console.log("📋 Full API Response (Pretty Print):");
						console.log(JSON.stringify(result, null, 2));
						console.log("🔢 Response Type:", typeof result);
						console.log("📊 Response Keys:", result ? Object.keys(result) : "No keys");
						console.log("📦 Data Structure Analysis:");
						console.log("  - code:", result.code);
						console.log("  - msg:", result.msg);
						console.log("  - data type:", typeof result.data);
						console.log("  - rows type:", typeof result.rows);
						console.log("  - rows length:", result.rows?.length || "No rows");
						console.log("  - total:", result.total);
						
						if (result.rows && Array.isArray(result.rows)) {
							console.log("📋 Products Array Details:");
							result.rows.forEach((product: any, index: number) => {
								console.log(`  Product ${index + 1}:`);
								console.log(`    - Keys: ${Object.keys(product)}`);
								console.log(`    - Product Name: ${product.productName}`);
								console.log(`    - Product Key: ${product.productKey}`);
								console.log(`    - Product ID: ${product.productId}`);
								console.log(`    - Full Product Data: ${JSON.stringify(product, null, 4)}`);
							});
						}
						console.log("🔍 === END COMPLETE API RESPONSE ===");
						// ===== END COMPREHENSIVE LOGGING =====

						if (result.code !== 200) {
							throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
						}

						return result;
					});

					// Format the simplified response
					const products = productData.rows || [];
					const total = productData.total || 0;

					console.log(
						"✅ Successfully retrieved",
						products.length,
						"products out of",
						total,
						"total",
					);

					let responseText = `📋 **Product List**\n`;
					responseText += `Found ${products.length} products (Total: ${total})\n`;
					if (total > pageSize) {
						responseText += `💡 Showing first ${pageSize} products. Use pageSize parameter for more (max: 200).\n`;
					}
					responseText += `============================================================\n\n`;

					if (products.length === 0) {
						responseText += "❌ No products found.\n\n";
					} else {
						products.forEach((product: any, index: number) => {
							responseText += `${index + 1}. **${product.productName || "Unnamed Product"}**\n`;
							responseText += `   📋 Product Key: \`${product.productKey || "N/A"}\`\n`;
							responseText += `   🆔 Product ID: ${product.productId || "N/A"}\n`;

							// Status with emojis
							const statusEmoji = product.releaseStatus === 1 ? "✅" : "⏸️";
							const statusText =
								product.releaseStatus === 1 ? "Published" : "Unpublished";
							responseText += `   ${statusEmoji} Status: ${statusText}\n`;

							// Access type
							const accessEmoji = product.accessType === 1 ? "🔒" : "🌐";
							const accessText =
								product.accessType === 1 ? "Private" : "Public";
							responseText += `   ${accessEmoji} Access: ${accessText}\n`;

							if (product.createTime) {
								const createTime = new Date(
									product.createTime,
								).toLocaleDateString();
								responseText += `   📅 Created: ${createTime}\n`;
							}

							responseText += `\n`;
						});

						if (total > products.length) {
							responseText += `📊 **Summary**: Showing ${products.length} of ${total} total products\n`;
							responseText += `💡 To see more products, use pageSize: ${Math.min(200, total)} in your next request.\n`;
						}
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
					console.error("❌ get_product_list error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting product list: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}
}
