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

	async init() {
		const env = this.env as unknown as EUOneEnvironment;

		// Validate environment variables
		if (!env.BASE_URL || !env.APP_ID || !env.APP_SECRET || !env.INDUSTRY_CODE) {
			throw new Error(
				"Missing required Acceleronix SaaS API environment variables: BASE_URL, APP_ID, APP_SECRET, INDUSTRY_CODE",
			);
		}

		// Auto-login on server initialization with improved error handling
		try {
			console.log("🚀 MCP Server initializing - attempting automatic login...");
			await EUOneAPIUtils.ensureValidToken(env);
			console.log("✅ Auto-login successful - MCP server ready");
		} catch (error) {
			console.error("❌ Auto-login failed during initialization:", error);
			// Don't throw error here - allow server to start even if login fails
			// Login will be retried when tools are called with automatic refresh
			console.log(
				"⚠️ MCP server starting without initial authentication - login will be attempted on first tool use with auto-refresh",
			);
		}

		// Health check / login test tool
		this.addHealthCheckTool(env);

		// TSL model tool
		this.addTslModelTool(env);

		// Product list tool
		this.addProductListTool(env);

		// Device list tool
		this.addDeviceListTool(env);

		// Device report tool
		this.addDeviceReportTool(env);
	}

	private addHealthCheckTool(env: EUOneEnvironment) {
		this.server.tool(
			"login_test",
			"Test Acceleronix SaaS API login and authentication status",
			{},
			async () => {
				try {
					const health = await EUOneAPIUtils.healthCheck(env);
					return {
						content: [
							{
								type: "text",
								text: `✅ Acceleronix SaaS API Login Test: ${health.status}`,
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

	private addTslModelTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_tsl_model",
			"Get TSL (Thing Specification Language) model by product key",
			{
				type: "object",
				properties: {
					productKey: {
						type: "string",
						description: "The product key to query TSL model for",
					},
				},
				required: ["productKey"],
			},
			async (args) => {
				try {
					console.log(
						"get_tsl_model args received:",
						JSON.stringify(args, null, 2),
					);
					console.log("get_tsl_model args type:", typeof args);
					console.log(
						"get_tsl_model args keys:",
						args ? Object.keys(args) : "null/undefined",
					);

					// Handle different possible argument formats
					let productKey: string;

					if (!args) {
						throw new Error(
							"No arguments provided - productKey parameter is required",
						);
					}

					// Check if args.productKey exists
					if (args.productKey) {
						productKey = args.productKey;
					}
					// Check if args itself is the productKey (string parameter)
					else if (typeof args === "string") {
						productKey = args;
					}
					// Check if the first argument is productKey
					else if (args[0]) {
						productKey = args[0];
					} else {
						throw new Error(
							"productKey parameter is required - please provide a valid product key",
						);
					}

					// Validate productKey
					if (!productKey || typeof productKey !== "string") {
						throw new Error("productKey must be a non-empty string");
					}

					const validatedProductKey = z.string().min(1).parse(productKey);
					console.log("Validated productKey:", validatedProductKey);

					const tslData = await EUOneAPIUtils.getTslModel(
						env,
						validatedProductKey,
					);

					// Format the TSL model data for display
					let responseText = `📋 TSL Model for Product Key: ${validatedProductKey}\n\n`;

					if (tslData.profile) {
						responseText += `**Profile Information:**\n`;
						responseText += `- Product Key: ${tslData.profile.productKey || "N/A"}\n`;
						responseText += `- Version: ${tslData.profile.version || "N/A"}\n\n`;
					}

					if (tslData.properties && Array.isArray(tslData.properties)) {
						responseText += `**Properties (${tslData.properties.length}):**\n`;
						tslData.properties.forEach((prop: any, index: number) => {
							responseText += `${index + 1}. **${prop.identifier || "Unknown"}** - ${prop.name || "No name"}\n`;
							responseText += `   - Type: ${prop.dataType?.type || "Unknown"}\n`;
							responseText += `   - Access: ${prop.accessMode || "Unknown"}\n`;
							if (prop.description) {
								responseText += `   - Description: ${prop.description}\n`;
							}
							responseText += `\n`;
						});
					}

					if (tslData.services && Array.isArray(tslData.services)) {
						responseText += `**Services (${tslData.services.length}):**\n`;
						tslData.services.forEach((service: any, index: number) => {
							responseText += `${index + 1}. **${service.identifier || "Unknown"}** - ${service.name || "No name"}\n`;
							if (service.description) {
								responseText += `   - Description: ${service.description}\n`;
							}
							responseText += `\n`;
						});
					}

					if (tslData.events && Array.isArray(tslData.events)) {
						responseText += `**Events (${tslData.events.length}):**\n`;
						tslData.events.forEach((event: any, index: number) => {
							responseText += `${index + 1}. **${event.identifier || "Unknown"}** - ${event.name || "No name"}\n`;
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
					console.error("get_tsl_model error:", error);

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
								text: `❌ Error getting TSL model: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceListTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_list",
			"Get list of devices with optional filtering parameters",
			{
				type: "object",
				properties: {
					deviceQueryKey: {
						type: "string",
						description: "Device name/DeviceKey/Device SN for search",
					},
					enableListSubData: {
						type: "boolean",
						description: "Whether to show sub-level data (default: false)",
					},
					onlineStatus: {
						type: "number",
						description: "Online status filter: 0=offline, 1=online",
					},
					pageNum: {
						type: "number",
						description: "Page number (default: 1)",
					},
					pageSize: {
						type: "number",
						description: "Page size (default: 10)",
					},
					productId: {
						type: "number",
						description: "Product ID filter",
					},
					runningStatus: {
						type: "number",
						description:
							"Running status: 1=normal, 2=warning, 3=fault, 4=fault+warning",
					},
					orgId: {
						type: "number",
						description: "Organization ID filter",
					},
				},
				required: [],
			},
			async (args) => {
				try {
					console.log(
						"get_device_list args received:",
						JSON.stringify(args, null, 2),
					);

					// Parse and validate arguments
					const options: any = {};

					if (args && typeof args === "object") {
						if (args.deviceQueryKey)
							options.deviceQueryKey = args.deviceQueryKey;
						if (typeof args.enableListSubData === "boolean")
							options.enableListSubData = args.enableListSubData;
						if (typeof args.onlineStatus === "number")
							options.onlineStatus = args.onlineStatus;
						if (typeof args.pageNum === "number")
							options.pageNum = args.pageNum;
						if (typeof args.pageSize === "number")
							options.pageSize = args.pageSize;
						if (typeof args.productId === "number")
							options.productId = args.productId;
						if (typeof args.runningStatus === "number")
							options.runningStatus = args.runningStatus;
						if (typeof args.orgId === "number") options.orgId = args.orgId;
					}

					console.log("Processed options:", JSON.stringify(options, null, 2));

					const deviceList = await EUOneAPIUtils.getDeviceList(env, options);

					// Format the device list data for display
					let responseText = `📱 Device List (Page ${options.pageNum || 1})\n\n`;

					if (!deviceList || deviceList.length === 0) {
						responseText += "No devices found.\n";
					} else {
						responseText += `**Found ${deviceList.length} devices:**\n\n`;

						deviceList.forEach((device: any, index: number) => {
							responseText += `${index + 1}. **${device.deviceName || device.deviceKey || "Unknown Device"}**\n`;
							responseText += `   - Device ID: ${device.deviceId || "N/A"}\n`;
							responseText += `   - Device Key: ${device.deviceKey || "N/A"}\n`;
							responseText += `   - Device SN: ${device.deviceSn || "N/A"}\n`;
							responseText += `   - Product: ${device.productName || "N/A"} (ID: ${device.productId || "N/A"})\n`;
							responseText += `   - Online Status: ${device.onlineStatus === 1 ? "🟢 Online" : "🔴 Offline"}\n`;

							// Running status
							const statusMap: { [key: number]: string } = {
								1: "✅ Normal",
								2: "⚠️ Warning",
								3: "❌ Fault",
								4: "⚠️❌ Fault + Warning",
							};
							responseText += `   - Running Status: ${statusMap[device.runningStatus] || "Unknown"}\n`;

							// Activation status
							responseText += `   - Activation: ${device.activationStatus === 1 ? "Activated" : "Not Activated"}\n`;

							// Network type
							const netWayMap: { [key: number]: string } = {
								1: "WiFi",
								2: "Cellular",
								3: "NB-IoT",
								4: "Other",
								5: "Bluetooth",
							};
							responseText += `   - Network: ${netWayMap[device.netWay] || "Unknown"}\n`;

							// Organization
							if (device.orgName) {
								responseText += `   - Organization: ${device.orgName}\n`;
							}

							// Last online time
							if (device.tsLastOnlineTime) {
								const lastOnline = new Date(
									device.tsLastOnlineTime,
								).toLocaleString();
								responseText += `   - Last Online: ${lastOnline}\n`;
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
					console.error("get_device_list error:", error);

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
								text: `❌ Error getting device list: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceReportTool(env: EUOneEnvironment) {
		this.server.tool(
			"report_device_data",
			"Report device data using device's TSL model properties",
			{
				type: "object",
				properties: {
					productKey: {
						type: "string",
						description: "Product key (PK) of the device",
					},
					deviceKey: {
						type: "string",
						description: "Device key (DK) of the device",
					},
					data: {
						type: "object",
						description:
							"Device property data based on TSL model (key-value pairs)",
						additionalProperties: true,
					},
					upTsTime: {
						type: "number",
						description:
							"Report timestamp (optional, defaults to current time)",
					},
				},
				required: ["productKey", "deviceKey", "data"],
			},
			async (args) => {
				try {
					console.log(
						"report_device_data args received:",
						JSON.stringify(args, null, 2),
					);

					// Validate required parameters
					if (!args || !args.productKey || !args.deviceKey || !args.data) {
						throw new Error(
							"Missing required parameters: productKey, deviceKey, and data are required",
						);
					}

					// Validate that data is an object with properties
					if (
						typeof args.data !== "object" ||
						Object.keys(args.data).length === 0
					) {
						throw new Error(
							"data parameter must be a non-empty object containing device properties",
						);
					}

					const options = {
						productKey: args.productKey,
						deviceKey: args.deviceKey,
						data: args.data,
						upTsTime: args.upTsTime,
					};

					console.log(
						"Processed device report options:",
						JSON.stringify(options, null, 2),
					);

					const result = await EUOneAPIUtils.reportDeviceData(env, options);

					// Format the response
					let responseText = `📤 Device Data Report Successful\n\n`;
					responseText += `**Device Information:**\n`;
					responseText += `- Product Key: ${options.productKey}\n`;
					responseText += `- Device Key: ${options.deviceKey}\n`;
					responseText += `- Report Time: ${new Date(options.upTsTime || Date.now()).toLocaleString()}\n\n`;

					responseText += `**Reported Properties:**\n`;
					for (const [key, value] of Object.entries(options.data)) {
						responseText += `- ${key}: ${JSON.stringify(value)}\n`;
					}

					if (result && typeof result === "object") {
						responseText += `\n**API Response:**\n`;
						if (result.code !== undefined) {
							responseText += `- Status Code: ${result.code}\n`;
						}
						if (result.msg) {
							responseText += `- Message: ${result.msg}\n`;
						}
						if (result.data) {
							responseText += `- Response Data: ${JSON.stringify(result.data)}\n`;
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
					console.error("report_device_data error:", error);

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
								text: `❌ Error reporting device data: ${errorMessage}`,
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
						description: "Page size (default: 12)",
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

					const productData = await EUOneAPIUtils.getProductList(env, options);

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
			"Get paginated list of products (15 items per page) with cursor-based navigation",
			{
				type: "object",
				properties: {
					cursor: {
						type: "string",
						description:
							"Cursor for pagination (optional, omit for first page)",
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

					const DEFAULT_PAGE_SIZE = 15;
					let pageNo = 1;
					let pageSize = DEFAULT_PAGE_SIZE;

					// Parse cursor if provided
					if (args && args.cursor) {
						try {
							const cursorData = decodeCursor(args.cursor);
							pageNo = cursorData.pageNo;
							pageSize = cursorData.pageSize || DEFAULT_PAGE_SIZE;
							console.log(`📄 Cursor decoded: page ${pageNo}, size ${pageSize}`);
						} catch (error) {
							throw new Error("Invalid cursor format");
						}
					}

					// Build API options for simplified method
					const options = {
						pageNum: pageNo,
						pageSize: pageSize,
						...(args && typeof args === "object" && {
							...(args.productName && { productName: args.productName }),
							...(args.productKey && { productKey: args.productKey }),
							...(typeof args.releaseStatus === "number" && { releaseStatus: args.releaseStatus }),
							...(args.searchValue && { searchValue: args.searchValue }),
						}),
					};

					console.log("📋 API request options:", JSON.stringify(options, null, 2));

					// Call simplified method with fresh authentication each time
					console.log("🔑 Calling getProductListPaginated with fresh authentication...");
					const productData = await EUOneAPIUtils.getProductListPaginated(env, options);

					// Format the simplified response
					const products = productData.rows || [];
					const total = productData.total || 0;
					
					console.log("✅ Successfully retrieved", products.length, "products out of", total, "total");

					let responseText = `📋 **Product List Summary**\n`;
					responseText += `Page ${pageNo} of ${Math.ceil(total / pageSize)} | ${pageSize} items per page | ${total} total products\n`;
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
							const statusText = product.releaseStatus === 1 ? "Published" : "Unpublished";
							responseText += `   ${statusEmoji} Status: ${statusText}\n`;

							// Access type
							const accessEmoji = product.accessType === 1 ? "🔒" : "🌐";
							const accessText = product.accessType === 1 ? "Private" : "Public";
							responseText += `   ${accessEmoji} Access: ${accessText}\n`;

							if (product.createTime) {
								const createTime = new Date(product.createTime).toLocaleDateString();
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
						
						responseText += `🎯 **Summary**: Showing ${products.length} products (${((pageNo - 1) * pageSize + 1)} - ${Math.min(pageNo * pageSize, total)} of ${total})\n`;
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
