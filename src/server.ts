import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	EUOneAPIUtils,
	type EUOneEnvironment,
	encodeCursor,
	decodeCursor,
} from "./utils";
import { z } from "zod";

export class VirtualDataMCP extends McpAgent {
	server = new McpServer({
		name: "Acceleronix SaaS IoT MCP Server",
		version: "2.0.0",
	});

	// Instance-level token cache to ensure token sharing across tool calls
	private accessToken: string | null = null;
	private tokenExpiry: number = 0;

	// Instance-level token management to avoid Durable Object isolation issues
	private async getAccessToken(env: EUOneEnvironment): Promise<string> {
		// Check if we have a valid cached token (with 120 second buffer for safety)
		const bufferTime = 120 * 1000; // 120 seconds for better safety margin
		if (this.accessToken && Date.now() < this.tokenExpiry - bufferTime) {
			console.log("🔄 Using instance cached access token (expires in", Math.round((this.tokenExpiry - Date.now()) / 1000), "seconds)");
			return this.accessToken;
		}

		console.log("🔐 Access token expired or missing - requesting new token");

		// Generate authentication parameters exactly matching API Playground format
		const timestamp = Date.now().toString(); // Convert to string like API Playground
		const passwordPlain = `${env.APP_ID}${env.INDUSTRY_CODE}${timestamp}${env.APP_SECRET}`;

		console.log("🔍 Debug authentication generation:");
		console.log(`   APP_ID: ${env.APP_ID}`);
		console.log(`   INDUSTRY_CODE: ${env.INDUSTRY_CODE}`);
		console.log(`   timestamp: ${timestamp}`);
		console.log(`   passwordPlain: ${passwordPlain}`);

		// Create SHA-256 hash for password using optimized approach
		const encoder = new TextEncoder();
		const data = encoder.encode(passwordPlain);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const password = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		console.log(`   Generated password hash: ${password}`);

		// Login request payload (matching API Playground exactly)
		const payload = {
			appId: env.APP_ID,
			industryCode: env.INDUSTRY_CODE,
			timestamp: timestamp, // String format like API Playground
			password: password,
		};

		console.log("Login payload:", JSON.stringify(payload, null, 2));

		try {
			const response = await fetch(
				`${env.BASE_URL}/v2/sysuser/openapi/ent/v3/login/pwdAuth`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(payload),
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as any;
			console.log("Auth response:", JSON.stringify(data, null, 2));

			if (data.code !== 200) {
				throw new Error(
					`Authentication failed: ${data.msg || "Unknown error"}`,
				);
			}

			if (!data.data || !data.data.accessToken) {
				throw new Error(
					`Invalid authentication response: ${JSON.stringify(data)}`,
				);
			}

			this.accessToken = data.data.accessToken;

			if (!this.accessToken) {
				throw new Error("No access token received from API");
			}

			// Parse expiry time from string to number with enhanced error handling
			const expiresIn = parseInt(data.data.accessTokenExpireIn || "3600");
			// Set expiry to 1 hour from now (tokens typically last longer)
			this.tokenExpiry = Date.now() + expiresIn * 1000;

			console.log(
				`✅ New access token obtained, expires in ${expiresIn} seconds`,
			);

			return this.accessToken!;
		} catch (error) {
			console.error("API Error:", error);
			throw new Error("Failed to get access token");
		}
	}

	// Instance-level API call with automatic token refresh
	private async safeAPICallWithTokenRefresh<T>(
		env: EUOneEnvironment,
		apiCall: (token: string) => Promise<T>,
	): Promise<T> {
		try {
			// Get token from instance cache
			const token = await this.getAccessToken(env);
			return await apiCall(token);
		} catch (error) {
			// Check if it's a session timeout error
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const isSessionTimeout =
				errorMessage.includes("Session timed out") ||
				errorMessage.includes("session timeout") ||
				errorMessage.includes("401") ||
				errorMessage.includes("Unauthorized");

			if (isSessionTimeout) {
				console.log(
					"🔄 Session timeout/auth error detected, forcing token refresh and retrying...",
				);
				console.log("🔍 Error details:", errorMessage);

				// Clear instance cached token and get new one
				this.accessToken = null;
				this.tokenExpiry = 0;

				try {
					const newToken = await this.getAccessToken(env);
					console.log("🔐 Retrying API call with new token");

					// Retry the API call with new token
					return await apiCall(newToken);
				} catch (retryError) {
					console.error("❌ Retry failed:", retryError);
					throw new Error(
						`Retry API call failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
					);
				}
			}

			// Re-throw other errors
			throw error;
		}
	}

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
		// This happens AFTER tools are registered
		if (env.BASE_URL && env.APP_ID && env.APP_SECRET && env.INDUSTRY_CODE) {
			try {
				console.log("🔐 Attempting automatic login...");
				await this.getAccessToken(env);
				console.log("✅ Auto-login successful - MCP server ready with authentication");
			} catch (error) {
				console.error("❌ Auto-login failed during initialization:", error);
				// Don't throw error here - allow server to start even if login fails
				// Login will be retried when tools are called with automatic refresh
				console.log(
					"⚠️ MCP server started without initial authentication - login will be attempted on first tool use with auto-refresh",
				);
			}
		} else {
			console.log("⚠️ Skipping auto-login due to missing environment variables");
		}

		console.log("🚀 MCP Server initialization completed");
	}

	private addHealthCheckTool(env: EUOneEnvironment) {
		this.server.tool(
			"login_test",
			"Test Acceleronix SaaS API login and authentication status",
			{},
			async () => {
				try {
					const token = await this.getAccessToken(env);
					return {
						content: [
							{
								type: "text",
								text: `✅ Acceleronix SaaS API Login Test: OK - Authentication successful`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Acceleronix SaaS API Login Test Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}




	private addProductListTool(env: EUOneEnvironment) {
		// Basic product list tool
		this.server.tool(
			"get_product_list",
			"Get list of products with optional filtering and pagination parameters",
			{
				type: "object",
				properties: {
					productName: {
						type: "string",
						description: "Filter by product name",
					},
					productKey: {
						type: "string",
						description: "Filter by specific product key",
					},
					releaseStatus: {
						type: "number",
						description:
							"Filter by release status (0=unpublished, 1=published)",
					},
					searchValue: {
						type: "string",
						description: "General search value for products",
					},
					pageNum: {
						type: "number",
						description: "Page number (default: 1)",
					},
					pageSize: {
						type: "number",
						description: "Page size (default: 100, max: 200)",
					},
					accessType: {
						type: "number",
						description: "Access type filter",
					},
					connProtocol: {
						type: "number",
						description: "Connection protocol filter",
					},
					dataFormat: {
						type: "number",
						description: "Data format filter",
					},
					industrySceneCode: {
						type: "string",
						description: "Industry scene code filter",
					},
					netWay: {
						type: "number",
						description: "Network way filter",
					},
					sortType: {
						type: "number",
						description: "Sort type (1=ascending, 2=descending)",
					},
				},
				required: [],
			},
			async (args) => {
				try {
					console.log(
						"get_product_list args received:",
						JSON.stringify(args, null, 2),
					);

					// Parse and validate arguments
					const options: any = {};

					if (args && typeof args === "object") {
						if (args.productName) options.productName = args.productName;
						if (args.productKey) options.productKey = args.productKey;
						if (typeof args.releaseStatus === "number")
							options.releaseStatus = args.releaseStatus;
						if (args.searchValue) options.searchValue = args.searchValue;
						if (typeof args.pageNum === "number")
							options.pageNum = args.pageNum;
						if (typeof args.pageSize === "number")
							options.pageSize = args.pageSize;
						if (typeof args.accessType === "number")
							options.accessType = args.accessType;
						if (typeof args.connProtocol === "number")
							options.connProtocol = args.connProtocol;
						if (typeof args.dataFormat === "number")
							options.dataFormat = args.dataFormat;
						if (args.industrySceneCode)
							options.industrySceneCode = args.industrySceneCode;
						if (typeof args.netWay === "number") options.netWay = args.netWay;
						if (typeof args.sortType === "number")
							options.sortType = args.sortType;
					}

					console.log(
						"Processed product list options:",
						JSON.stringify(options, null, 2),
					);

					const productData = await this.safeAPICallWithTokenRefresh(env, async (token) => {
						// Build query parameters - only core parameters
						const queryParams = new URLSearchParams();

						// Set pagination parameters with optimized defaults
						const pageNum = options.pageNum ? String(options.pageNum) : "1";
						const pageSize = options.pageSize ? String(Math.min(options.pageSize, 200)) : "100"; // Default to 100, max 200

						queryParams.append("pageNum", pageNum);
						queryParams.append("pageSize", pageSize);

						// Add optional filters if provided
						if (options.productName)
							queryParams.append("productName", options.productName);
						if (options.productKey)
							queryParams.append("productKey", options.productKey);
						if (typeof options.releaseStatus === "number")
							queryParams.append("releaseStatus", String(options.releaseStatus));
						if (options.searchValue)
							queryParams.append("searchValue", options.searchValue);

						const url = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
						console.log("📝 Product list request URL:", url);

						const response = await fetch(url, {
							method: "GET",
							headers: {
								Authorization: `Bearer ${token}`,
								"Accept-Language": "en-US",
								"Content-Type": "application/json",
							},
						});

						console.log("📡 Product list response status:", response.status);

						if (!response.ok) {
							const errorText = await response.text();
							console.error("❌ Product list HTTP error response:", errorText);
							throw new Error(`HTTP ${response.status}: ${response.statusText}`);
						}

						const result = (await response.json()) as any;
						
						// ===== COMPREHENSIVE API RESPONSE LOGGING =====
						console.log("🔍 === COMPLETE PRODUCT LIST API RESPONSE (INSTANCE METHOD) ===");
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
						console.log("🔍 === END COMPLETE API RESPONSE (INSTANCE METHOD) ===");
						// ===== END COMPREHENSIVE LOGGING =====

						if (result.code !== 200) {
							throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
						}

						return result;
					});


					// Format the product list data for display
					let responseText = `📋 Product List (Page ${options.pageNum || 1})\n\n`;

					if (
						!productData ||
						!productData.rows ||
						productData.rows.length === 0
					) {
						responseText += "No products found.\n";
					} else {
						const products = productData.rows;
						const total = productData.total || 0;

						responseText += `**Found ${products.length} products (Total: ${total}):**\n\n`;

						products.forEach((product: any, index: number) => {
							responseText += `${index + 1}. **${product.productName || "Unnamed Product"}**\n`;
							responseText += `   - Product Key: ${product.productKey || "N/A"}\n`;
							responseText += `   - Product ID: ${product.productId || "N/A"}\n`;

							// Release status
							const releaseStatusMap: { [key: number]: string } = {
								0: "🔒 Unpublished",
								1: "✅ Published",
							};
							responseText += `   - Status: ${releaseStatusMap[product.releaseStatus] || "Unknown"}\n`;

							// Access type
							const accessTypeMap: { [key: number]: string } = {
								1: "Private",
								2: "Public",
							};
							responseText += `   - Access: ${accessTypeMap[product.accessType] || "Unknown"}\n`;

							// Connection protocol
							if (product.connProtocol !== undefined) {
								const protocolMap: { [key: number]: string } = {
									1: "MQTT",
									2: "CoAP",
									3: "HTTP",
									4: "WebSocket",
								};
								responseText += `   - Protocol: ${protocolMap[product.connProtocol] || "Unknown"}\n`;
							}

							// Data format
							if (product.dataFormat !== undefined) {
								const formatMap: { [key: number]: string } = {
									1: "JSON",
									2: "Binary",
									3: "Custom",
								};
								responseText += `   - Data Format: ${formatMap[product.dataFormat] || "Unknown"}\n`;
							}

							// Network way
							if (product.netWay !== undefined) {
								const netWayMap: { [key: number]: string } = {
									1: "WiFi",
									2: "Cellular",
									3: "Ethernet",
									4: "LoRa",
									5: "NB-IoT",
								};
								responseText += `   - Network: ${netWayMap[product.netWay] || "Unknown"}\n`;
							}

							// Industry scene
							if (product.industrySceneCode) {
								responseText += `   - Industry: ${product.industrySceneCode}\n`;
							}

							// Creation info
							if (product.createTime) {
								const createTime = new Date(
									product.createTime,
								).toLocaleString();
								responseText += `   - Created: ${createTime}\n`;
							}

							if (product.createBy) {
								responseText += `   - Created By: ${product.createBy}\n`;
							}

							if (product.remark) {
								responseText += `   - Remark: ${product.remark}\n`;
							}

							responseText += `\n`;
						});

						// Pagination info
						if (total > products.length) {
							const currentPage = options.pageNum || 1;
							const pageSize = options.pageSize || 12;
							const totalPages = Math.ceil(total / pageSize);
							responseText += `📄 Pagination: Page ${currentPage} of ${totalPages} (${total} total products)\n`;
							if (currentPage < totalPages) {
								responseText += `💡 Use pageNum: ${currentPage + 1} to get the next page.\n`;
							}
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
					console.error("get_product_list error:", error);

					let errorMessage = "Unknown error";
					if (error instanceof Error) {
						errorMessage = error.message;
					} else if (typeof error === "object" && error !== null) {
						errorMessage = JSON.stringify(error, null, 2);
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

		// Paginated product list tool for better token efficiency
		this.server.tool(
			"get_product_list_paginated",
			"Get paginated list of products (100 items per page by default) with cursor-based navigation",
			{
				type: "object",
				properties: {
					cursor: {
						type: "string",
						description:
							"Cursor for pagination (optional, omit for first page). Auto-optimized: 150 items first page, 100 items subsequent pages",
					},
					productName: {
						type: "string",
						description: "Filter by product name",
					},
					productKey: {
						type: "string",
						description: "Filter by specific product key",
					},
					releaseStatus: {
						type: "number",
						description:
							"Filter by release status (0=unpublished, 1=published)",
					},
					searchValue: {
						type: "string",
						description: "General search value for products",
					},
				},
				required: [],
			},
			async (args) => {
				try {
					console.log(
						"🚀 get_product_list_paginated called with args:",
						JSON.stringify(args, null, 2),
					);

					const DEFAULT_PAGE_SIZE = 100; // Optimized for larger product sets
					const MAX_PAGE_SIZE = 200; // API limit
					let pageNo = 1;
					let pageSize = DEFAULT_PAGE_SIZE;

					// Parse cursor if provided
					if (args && args.cursor) {
						try {
							const cursorData = decodeCursor(args.cursor);
							pageNo = cursorData.pageNo;
							pageSize = cursorData.pageSize || DEFAULT_PAGE_SIZE;
							console.log(
								`📄 Cursor decoded: page ${pageNo}, size ${pageSize}`,
							);
						} catch (error) {
							throw new Error("Invalid cursor format");
						}
					}

					// Apply filters and optimize page size if needed
					const hasFilters = args && (args.productName || args.productKey || args.searchValue || typeof args.releaseStatus === "number");
					
					// Auto-optimize page size based on context
					if (!hasFilters && pageNo === 1) {
						// First page without filters - use larger page size to capture all products
						pageSize = Math.min(MAX_PAGE_SIZE, 150); 
					}
					
					// Build API options for simplified method
					const options = {
						pageNum: pageNo,
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

					// Use instance-level token management
					const productData = await this.safeAPICallWithTokenRefresh(env, async (token) => {
						console.log("🔐 Using instance token for paginated product list");

						const queryParams = new URLSearchParams();
						queryParams.append("pageNum", String(pageNo));
						queryParams.append("pageSize", String(pageSize));

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
						console.log("🔍 === COMPLETE PRODUCT LIST API RESPONSE (PAGINATED TOOL) ===");
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
						console.log("🔍 === END COMPLETE API RESPONSE (PAGINATED TOOL) ===");
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

					let responseText = `📋 **Product List Summary**\n`;
					responseText += `Page ${pageNo} of ${Math.ceil(total / pageSize)} | ${pageSize} items per page | ${total} total products\n`;
					if (total > pageSize && !hasFilters) {
						responseText += `💡 Showing ${Math.min(pageSize, total)} of ${total} products. Use cursor pagination for more.\n`;
					}
					responseText += `============================================================\n\n`;

					if (products.length === 0) {
						responseText += "❌ No products found.\n\n";
					} else {
						products.forEach((product: any, index: number) => {
							const itemNumber = (pageNo - 1) * pageSize + index + 1;
							responseText += `${itemNumber}. **${product.productName || "Unnamed Product"}**\n`;
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

						// Pagination navigation
						const hasMorePages = pageNo * pageSize < total;

						if (hasMorePages) {
							const nextCursor = encodeCursor({
								pageNo: pageNo + 1,
								pageSize: pageSize,
								totalItems: total,
							});

							responseText += `📄 **Next Page Available**\n`;
							responseText += `Use cursor: \`${nextCursor}\`\n`;
							responseText += `Call this tool again with the cursor parameter to get page ${pageNo + 1}.\n\n`;
						}

						responseText += `🎯 **Summary**: Showing ${products.length} products (${(pageNo - 1) * pageSize + 1} - ${Math.min(pageNo * pageSize, total)} of ${total})\n`;
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
					console.error("❌ get_product_list_paginated error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting paginated product list: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}
}
