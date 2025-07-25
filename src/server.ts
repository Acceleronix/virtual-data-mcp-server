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

		// Upload device data tool
		this.addUploadDeviceDataTool(env);
		console.log("✅ Upload device data tool registered");

		// Device list tool
		this.addDeviceListTool(env);
		console.log("✅ Device list tool registered");

		// Product TSL tool
		this.addProductTslTool(env);
		console.log("✅ Product TSL tool registered");

		// Device location tool
		this.addDeviceLocationTool(env);
		console.log("✅ Device location tool registered");

		console.log("📋 MCP tools registered successfully");

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
						description: "Number of products per page, max 200 (default: 50). Use pageSize: 31 to get all your products.",
					},
					pageNum: {
						type: "number", 
						description: "Page number starting from 1 (optional, default: 1)",
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

					const DEFAULT_PAGE_SIZE = 50; // Large enough to get most product lists in one call
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
						
						// FIX: Only pass pageNum and pageSize as per user specification
						// Removed optional filters that may cause 403 errors

						const apiUrl = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
						console.log("📋 API URL:", apiUrl);

						const apiResponse = await fetch(apiUrl, {
							method: "GET",
							headers: {
								Authorization: token,  // FIX: Direct token, no "Bearer " prefix
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
					if (total > products.length) {
						responseText += `💡 Showing ${products.length} of ${total} products. Use pageSize: ${Math.min(200, total)} to get all products.\n`;
					}
					responseText += `============================================================\n\n`;

					if (products.length === 0) {
						responseText += "❌ No products found.\n\n";
					} else {
						products.forEach((product: any, index: number) => {
							responseText += `${index + 1}. **${product.productName || "Unnamed Product"}**\n`;
							responseText += `   📋 Product Key: \`${product.productKey || "N/A"}\`\n`;
							responseText += `   🆔 Product ID: ${product.id || "N/A"}\n`;  // FIX: Use 'id' field
							responseText += `   🏢 Vendor: ${product.vendorName || "N/A"} (ID: ${product.vendorId || "N/A"})\n`;
							responseText += `   🏷️ Category: ${product.categoryName || "N/A"} - ${product.itemValue || "N/A"}\n`;
							responseText += `   📊 Devices: ${product.deviceNum || 0}\n`;

							// Status with emojis - FIX: releaseStatus = 2 means Published based on JSON
							const statusEmoji = product.releaseStatus === 2 ? "✅" : "⏸️";
							const statusText = product.releaseStatus === 2 ? "Published" : "Unpublished";
							responseText += `   ${statusEmoji} Status: ${statusText}\n`;

							// Access type - enhanced mapping
							const getAccessType = (type: number) => {
								switch(type) {
									case 0: return { emoji: "🌐", text: "Public" };
									case 1: return { emoji: "🔒", text: "Private" };
									case 2: return { emoji: "🏢", text: "Enterprise" };
									default: return { emoji: "❓", text: "Unknown" };
								}
							};
							const access = getAccessType(product.accessType);
							responseText += `   ${access.emoji} Access: ${access.text}\n`;

							if (product.tsCreateTime) {  // FIX: Use 'tsCreateTime' field
								const createTime = new Date(product.tsCreateTime).toLocaleDateString();
								responseText += `   📅 Created: ${createTime}\n`;
							}

							responseText += `\n`;
						});

						if (total > products.length) {
							responseText += `📊 **Summary**: Showing ${products.length} of ${total} total products\n`;
							responseText += `💡 To see all products at once, call: get_product_list with pageSize: ${total}\n`;
							responseText += `📄 Or browse by pages: pageNum: 2, pageNum: 3, etc.\n`;
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


	private addUploadDeviceDataTool(env: EUOneEnvironment) {
		this.server.tool(
			"upload_device_data",
			{
				deviceKey: z.string().describe("Device key to upload data for (required, e.g., 'VDU1293621240625108')"),
				productKey: z.string().describe("Product key for the device (required, e.g., 'pe17Ez' from get_product_list)"),
				data: z.record(z.any()).describe("Device TSL model data as key-value pairs (required, e.g., {\"temperature\": 26.7, \"humidity\": 68})"),
				upTsTime: z.number().optional().describe("Upload timestamp in milliseconds (optional, defaults to current time)")
			},
			async ({ deviceKey, productKey, data, upTsTime }) => {
				console.log("🔥 upload_device_data function ENTRY - parameters:", { deviceKey, productKey, data, upTsTime });
				
				try {
					console.log("🚀 upload_device_data called with parameters:", { deviceKey, productKey, data, upTsTime });

					// Parameter validation
					if (!deviceKey || typeof deviceKey !== "string" || deviceKey.trim() === "") {
						throw new Error("deviceKey is required and must be a non-empty string");
					}

					if (!productKey || typeof productKey !== "string" || productKey.trim() === "") {
						throw new Error("productKey is required and must be a non-empty string");
					}

					if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
						throw new Error("data is required and must be a non-empty object with device property values");
					}

					const validDeviceKey = deviceKey.trim();
					const validProductKey = productKey.trim();
					const timestamp = upTsTime || Date.now();

					console.log("✅ Using validated parameters:", { 
						deviceKey: validDeviceKey, 
						productKey: validProductKey, 
						data,
						upTsTime: timestamp
					});

					// Call the API using existing reportDeviceData method
					const uploadResult = await EUOneAPIUtils.reportDeviceData(env, {
						deviceKey: validDeviceKey,
						productKey: validProductKey,
						data: data,
						upTsTime: timestamp
					});

					console.log("✅ Device data uploaded successfully");

					// Format the response
					let responseText = `📤 **Device Data Upload Result**\n`;
					responseText += `Device Key: \`${validDeviceKey}\`\n`;
					responseText += `Product Key: \`${validProductKey}\`\n`;
					responseText += `Upload Time: ${new Date(timestamp).toISOString()}\n`;
					responseText += `Data Properties: ${Object.keys(data).length} properties\n`;
					responseText += `============================================================\n\n`;

					if (uploadResult.code === 200) {
						responseText += `✅ **Upload Successful**\n`;
						responseText += `Status: ${uploadResult.msg || "Data uploaded successfully"}\n\n`;
						
						responseText += `📊 **Uploaded Data:**\n`;
						Object.entries(data).forEach(([key, value]) => {
							responseText += `   • ${key}: ${value}\n`;
						});
						
						responseText += `\n💡 The device data has been successfully uploaded to the IoT platform.\n`;
					} else {
						responseText += `❌ **Upload Failed**\n`;
						responseText += `Error: ${uploadResult.msg || "Unknown error"}\n`;
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
					console.error("❌ upload_device_data error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error uploading device data: ${errorMessage}`,
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
			{
				pageNum: z.number().optional().describe("Page number starting from 1 (optional, default: 1)"),
				pageSize: z.number().optional().describe("Number of devices per page, max 1000 (optional, default: 10)"),
				productId: z.number().optional().describe("Product ID to filter devices (optional, e.g., 2989)"),
				deviceKey: z.string().optional().describe("Device key to filter by specific device (optional)"),
				deviceName: z.string().optional().describe("Device name to filter by device name (optional)"),
				deviceQueryKey: z.string().optional().describe("Search by device key, name, or SN (optional)"),
				activationStatus: z.number().optional().describe("Activation status: 0=not activated, 1=activated (optional, default: 1)"),
				onlineStatus: z.number().optional().describe("Online status: 0=offline, 1=online (optional)"),
				runningStatus: z.number().optional().describe("Running status: 1=normal, 2=alarm, 3=fault, 4=fault+alarm (optional)"),
				accessType: z.number().optional().describe("Device type: 0=direct device, 1=gateway, 2=gateway sub-device (optional)"),
				productKey: z.string().optional().describe("Product key to filter devices (optional, e.g., 'pe17Ez')"),
				orgId: z.number().optional().describe("Organization ID to filter devices (optional)")
			},
			async ({ pageNum, pageSize, productId, deviceKey, deviceName, deviceQueryKey, activationStatus, onlineStatus, runningStatus, accessType, productKey, orgId }) => {
				console.log("🔥 get_device_list function ENTRY - parameters:", { pageNum, pageSize, productId, deviceKey, deviceName, deviceQueryKey, activationStatus, onlineStatus, runningStatus, accessType, productKey, orgId });
				
				try {
					console.log("🚀 get_device_list called with parameters:", { pageNum, pageSize, productId, deviceKey, deviceName, deviceQueryKey, activationStatus, onlineStatus, runningStatus, accessType, productKey, orgId });

					// Call the API
					const deviceListData = await EUOneAPIUtils.getDeviceList(env, {
						pageNum,
						pageSize,
						productId,
						deviceKey,
						deviceName,
						deviceQueryKey,
						activationStatus,
						onlineStatus,
						runningStatus,
						accessType,
						productKey,
						orgId
					});

					// Format the response
					const devices = deviceListData.rows || [];
					const total = deviceListData.total || 0;
					
					console.log("✅ Successfully retrieved", devices.length, "devices out of", total, "total");

					let responseText = `📱 **Device List**\n`;
					responseText += `Found ${devices.length} devices (Total: ${total})\n`;
					if (total > devices.length) {
						responseText += `💡 Showing ${devices.length} of ${total} devices. Use pageNum and pageSize parameters for pagination.\n`;
					}
					responseText += `============================================================\n\n`;

					if (devices.length === 0) {
						responseText += "❌ No devices found matching the criteria.\n\n";
					} else {
						devices.forEach((device: any, index: number) => {
							responseText += `${index + 1}. **${device.deviceName || "Unnamed Device"}**\n`;
							responseText += `   📋 Device Key: \`${device.deviceKey || "N/A"}\`\n`;
							responseText += `   🆔 Device ID: ${device.deviceId || "N/A"}\n`;
							responseText += `   📦 Product: ${device.productName || "N/A"} (\`${device.productKey || "N/A"}\`)\n`;
							responseText += `   🏢 Organization: ${device.orgName || "N/A"} (ID: ${device.orgId || "N/A"})\n`;

							// Status indicators
							const onlineEmoji = device.onlineStatus === 1 ? "🟢" : "🔴";
							const onlineText = device.onlineStatus === 1 ? "Online" : "Offline";
							responseText += `   ${onlineEmoji} Status: ${onlineText}\n`;

							const activationEmoji = device.activationStatus === 1 ? "✅" : "⏸️";
							const activationText = device.activationStatus === 1 ? "Activated" : "Not Activated";
							responseText += `   ${activationEmoji} Activation: ${activationText}\n`;

							// Running status
							const runningStatusMap: Record<number, { emoji: string; text: string }> = {
								1: { emoji: "✅", text: "Normal" },
								2: { emoji: "⚠️", text: "Alarm" },
								3: { emoji: "❌", text: "Fault" },
								4: { emoji: "🚨", text: "Fault+Alarm" }
							};
							const runningInfo = runningStatusMap[device.runningStatus as number] || { emoji: "❓", text: "Unknown" };
							responseText += `   ${runningInfo.emoji} Running: ${runningInfo.text}\n`;

							// Device type
							const accessTypeMap: Record<number, string> = {
								0: "📡 Direct Device",
								1: "🌐 Gateway",  
								2: "📟 Gateway Sub-device"
							};
							const deviceType = accessTypeMap[device.accessType as number] || "❓ Unknown";
							responseText += `   ${deviceType}\n`;

							// Network type
							const netWayMap: Record<number, string> = {
								1: "📶 WiFi",
								2: "📱 Cellular",
								3: "📡 NB-IoT",
								4: "🔗 Other"
							};
							const netType = netWayMap[device.netWay as number] || "❓ Unknown";
							responseText += `   ${netType}\n`;

							// Timestamps
							if (device.tsLastOnlineTime) {
								const lastOnline = new Date(device.tsLastOnlineTime).toLocaleString();
								responseText += `   ⏰ Last Online: ${lastOnline}\n`;
							}

							if (device.tsCreateTime) {
								const createTime = new Date(device.tsCreateTime).toLocaleString();
								responseText += `   📅 Created: ${createTime}\n`;
							}

							// Model and additional info
							if (device.modelSpec) {
								responseText += `   🔧 Model: ${device.modelSpec}\n`;
							}

							if (device.iccid) {
								responseText += `   📇 ICCID: ${device.iccid}\n`;
							}

							// Device properties (if available)
							if (device.prop && Object.keys(device.prop).length > 0) {
								responseText += `   📊 **Current Data**:\n`;
								Object.entries(device.prop).forEach(([key, value]) => {
									if (typeof value === 'object' && value !== null) {
										responseText += `     • ${key}: ${JSON.stringify(value)}\n`;
									} else {
										responseText += `     • ${key}: ${value}\n`;
									}
								});
							}

							responseText += `\n`;
						});

						if (total > devices.length) {
							responseText += `📊 **Summary**: Showing ${devices.length} of ${total} total devices\n`;
							responseText += `💡 Use pageNum and pageSize parameters for pagination\n`;
							responseText += `📄 Example: get_device_list with pageNum: 2, pageSize: 20\n`;
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
					console.error("❌ get_device_list error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
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

	private addProductTslTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_product_tsl",
			{
				productKey: z.string().describe("Product key to get TSL properties for (required, e.g., 'pe17Ez' from get_product_list)"),
				labelId: z.number().optional().describe("Label ID to filter properties by (optional)"),
				propCode: z.string().optional().describe("Property code to filter by specific property (optional)"),
				propName: z.string().optional().describe("Property name to filter by specific property name (optional)")
			},
			async ({ productKey, labelId, propCode, propName }) => {
				console.log("🔥 get_product_tsl function ENTRY - parameters:", { productKey, labelId, propCode, propName });
				
				try {
					console.log("🚀 get_product_tsl called with parameters:", { productKey, labelId, propCode, propName });

					// Parameter validation
					if (!productKey || typeof productKey !== "string" || productKey.trim() === "") {
						throw new Error("productKey is required and must be a non-empty string");
					}

					const validProductKey = productKey.trim();

					console.log("✅ Using validated parameters:", { 
						productKey: validProductKey, 
						labelId,
						propCode,
						propName
					});

					// Call the API using the new getProductTsl method
					const tslResult = await EUOneAPIUtils.getProductTsl(env, {
						productKey: validProductKey,
						labelId,
						propCode,
						propName
					});

					console.log("✅ Product TSL data retrieved successfully");

					// Format the response
					const tslProperties = tslResult.data || [];
					
					let responseText = `📋 **Product TSL Properties**\n`;
					responseText += `Product Key: \`${validProductKey}\`\n`;
					responseText += `Found ${tslProperties.length} properties\n`;
					responseText += `============================================================\n\n`;

					if (tslProperties.length === 0) {
						responseText += "❌ No TSL properties found for this product.\n\n";
					} else {
						tslProperties.forEach((prop: any, index: number) => {
							responseText += `${index + 1}. **${prop.name || "Unnamed Property"}**\n`;
							responseText += `   📋 Code: \`${prop.code || "N/A"}\`\n`;
							responseText += `   🆔 ID: ${prop.id || "N/A"}\n`;
							responseText += `   📊 Data Type: ${prop.dataType || "N/A"}\n`;
							responseText += `   🔧 Type: ${prop.type || "N/A"}\n`;
							responseText += `   📝 Sub Type: ${prop.subType || "N/A"}\n`;
							
							if (prop.desc) {
								responseText += `   📖 Description: ${prop.desc}\n`;
							}

							// Control and display settings
							const controlEmoji = prop.enableControl ? "✅" : "❌";
							responseText += `   ${controlEmoji} Controllable: ${prop.enableControl ? "Yes" : "No"}\n`;
							
							const displayEmoji = prop.display ? "👁️" : "🚫";
							responseText += `   ${displayEmoji} Display: ${prop.display ? "Yes" : "No"}\n`;

							if (prop.unit) {
								responseText += `   📏 Unit: ${prop.unit}\n`;
							}

							// Specs information
							if (prop.specs && Array.isArray(prop.specs) && prop.specs.length > 0) {
								responseText += `   📐 **Specifications:**\n`;
								prop.specs.forEach((spec: any, specIndex: number) => {
									if (spec.name) {
										responseText += `     ${specIndex + 1}. ${spec.name}\n`;
									}
									if (spec.dataType) {
										responseText += `        • Data Type: ${spec.dataType}\n`;
									}
									if (spec.min !== null && spec.min !== undefined) {
										responseText += `        • Min: ${spec.min}\n`;
									}
									if (spec.max !== null && spec.max !== undefined) {
										responseText += `        • Max: ${spec.max}\n`;
									}
									if (spec.step !== null && spec.step !== undefined) {
										responseText += `        • Step: ${spec.step}\n`;
									}
									if (spec.unit) {
										responseText += `        • Unit: ${spec.unit}\n`;
									}
									if (spec.value !== null && spec.value !== undefined) {
										responseText += `        • Value: ${spec.value}\n`;
									}
									// Handle nested specs (like RGB color components)
									if (spec.specs && Array.isArray(spec.specs) && spec.specs.length > 0) {
										responseText += `        • Sub-specs: ${spec.specs.length} items\n`;
										spec.specs.forEach((subSpec: any, subIndex: number) => {
											if (subSpec.min !== null && subSpec.max !== null) {
												responseText += `          ${subIndex + 1}. Range: ${subSpec.min}-${subSpec.max}\n`;
											}
										});
									}
								});
							}

							if (prop.sortNum) {
								responseText += `   📊 Sort Order: ${prop.sortNum}\n`;
							}

							responseText += `\n`;
						});

						responseText += `📊 **Summary**: Retrieved ${tslProperties.length} TSL properties for product \`${validProductKey}\`\n`;
						responseText += `💡 These properties define how the device data should be structured and what controls are available.\n`;
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
					console.error("❌ get_product_tsl error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting product TSL: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceLocationTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_location",
			"Get device location information including GPS coordinates, address, and positioning details",
			{
				deviceId: z.number().describe("Device ID to get location information for (required, e.g., 9644)")
			},
			async ({ deviceId }) => {
				console.log("🔥 get_device_location function ENTRY - parameters:", { deviceId });
				
				try {
					console.log("🚀 get_device_location called with parameters:", { deviceId });

					// Parameter validation
					if (!deviceId || typeof deviceId !== "number") {
						throw new Error("deviceId is required and must be a number");
					}

					console.log("✅ Using validated parameters:", { deviceId });

					// Call the API using the new getDeviceLocation method
					const locationResult = await EUOneAPIUtils.getDeviceLocation(env, {
						deviceId
					});

					console.log("✅ Device location data retrieved successfully");

					// Format the response
					const locationData = locationResult.data;
					
					if (!locationData) {
						return {
							content: [
								{
									type: "text",
									text: `❌ No location data found for device ID: ${deviceId}`,
								},
							],
						};
					}
					
					let responseText = `📍 **Device Location Information**\n`;
					responseText += `Device ID: \`${locationData.deviceId || deviceId}\`\n`;
					responseText += `Device Name: \`${locationData.deviceName || "N/A"}\`\n`;
					responseText += `Device Key: \`${locationData.deviceKey || "N/A"}\`\n`;
					responseText += `Product Key: \`${locationData.productKey || "N/A"}\`\n`;
					responseText += `============================================================\n\n`;

					// Location Mode and Type
					responseText += `📡 **Positioning Information**\n`;
					responseText += `   🔧 Locate Mode: ${locationData.locateMode || "N/A"}\n`;
					responseText += `   📊 Locate Type: ${locationData.locateType || "N/A"} (${locationData.locateTypeStr || "N/A"})\n`;
					
					if (locationData.tsLocateTime) {
						const locateTime = new Date(locationData.tsLocateTime);
						responseText += `   ⏰ Last Location Time: ${locateTime.toISOString()}\n`;
					}
					responseText += `\n`;

					// GPS Coordinates
					responseText += `🌐 **GPS Coordinates**\n`;
					if (locationData.wgsLng && locationData.wgsLat) {
						responseText += `   🗺️ WGS84: ${locationData.wgsLat}, ${locationData.wgsLng}\n`;
					}
					if (locationData.gcjLng && locationData.gcjLat) {
						responseText += `   🇨🇳 GCJ02: ${locationData.gcjLat}, ${locationData.gcjLng}\n`;
					}
					if (locationData.bdLng && locationData.bdLat) {
						responseText += `   🅱️ Baidu: ${locationData.bdLat}, ${locationData.bdLng}\n`;
					}
					responseText += `\n`;

					// Address Information
					if (locationData.address || locationData.detailAddress) {
						responseText += `📍 **Address Information**\n`;
						if (locationData.address) {
							responseText += `   🏠 Address: ${locationData.address}\n`;
						}
						if (locationData.detailAddress) {
							responseText += `   🏠 Detail Address: ${locationData.detailAddress}\n`;
						}
						responseText += `\n`;
					}

					// Device Status
					responseText += `📱 **Device Status**\n`;
					const onlineStatus = locationData.onlineStatus === 1 ? "🟢 Online" : "🔴 Offline";
					responseText += `   📶 Online Status: ${onlineStatus}\n`;
					responseText += `\n`;

					// Technical Details
					const technicalDetails = [];
					if (locationData.hdop !== null && locationData.hdop !== undefined) {
						technicalDetails.push(`HDOP: ${locationData.hdop}`);
					}
					if (locationData.satellites !== null && locationData.satellites !== undefined) {
						technicalDetails.push(`Satellites: ${locationData.satellites}`);
					}
					if (locationData.soc !== null && locationData.soc !== undefined) {
						technicalDetails.push(`SOC: ${locationData.soc}`);
					}
					if (locationData.speed !== null && locationData.speed !== undefined) {
						technicalDetails.push(`Speed: ${locationData.speed}`);
					}
					if (locationData.height !== null && locationData.height !== undefined) {
						technicalDetails.push(`Height: ${locationData.height}`);
					}
					if (locationData.ggaStatus !== null && locationData.ggaStatus !== undefined) {
						technicalDetails.push(`GGA Status: ${locationData.ggaStatus}`);
					}

					if (technicalDetails.length > 0) {
						responseText += `🔧 **Technical Details**\n`;
						technicalDetails.forEach(detail => {
							responseText += `   • ${detail}\n`;
						});
						responseText += `\n`;
					}

					// Mount Information
					if (locationData.mountId || locationData.mountName) {
						responseText += `🏔️ **Mount Information**\n`;
						if (locationData.mountId) {
							responseText += `   🆔 Mount ID: ${locationData.mountId}\n`;
						}
						if (locationData.mountName) {
							responseText += `   📛 Mount Name: ${locationData.mountName}\n`;
						}
						responseText += `\n`;
					}

					// Additional Information
					if (locationData.productFileUrl || locationData.localPhoto) {
						responseText += `📸 **Media Information**\n`;
						if (locationData.productFileUrl) {
							responseText += `   🔗 Product File URL: ${locationData.productFileUrl}\n`;
						}
						if (locationData.localPhoto) {
							responseText += `   📷 Local Photo: ${locationData.localPhoto}\n`;
						}
						responseText += `\n`;
					}

					responseText += `📊 **Summary**: Successfully retrieved location information for device \`${locationData.deviceName || deviceId}\`\n`;
					if (locationData.address) {
						responseText += `📍 Current location: ${locationData.address}\n`;
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
					console.error("❌ get_device_location error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting device location: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}
}
