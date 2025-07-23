import { z } from "zod";

export interface EUOneEnvironment {
	BASE_URL: string;
	APP_ID: string;
	APP_SECRET: string;
	INDUSTRY_CODE: string;
}

// Global token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Pagination cursor interface
interface PaginationCursor {
	pageNo: number;
	pageSize: number;
	productKey?: string;
	totalItems?: number;
}

// Pagination utility functions
export function encodeCursor(cursor: PaginationCursor): string {
	return btoa(JSON.stringify(cursor));
}

export function decodeCursor(cursorStr: string): PaginationCursor {
	try {
		return JSON.parse(atob(cursorStr));
	} catch (error) {
		throw new Error("Invalid cursor format");
	}
}

export class EUOneAPIUtils {
	static async getAccessToken(env: EUOneEnvironment): Promise<string> {
		// Check if we have a valid cached token (with 60 second buffer for safety)
		const bufferTime = 60 * 1000; // 60 seconds
		if (accessToken && Date.now() < tokenExpiry - bufferTime) {
			console.log("🔄 Using cached access token");
			return accessToken;
		}

		console.log("🔐 Access token expired or missing - requesting new token");

		// Generate authentication parameters
		const timestamp = Date.now();
		const passwordPlain = `${env.APP_ID}${env.INDUSTRY_CODE}${timestamp}${env.APP_SECRET}`;

		// Create SHA-256 hash for password
		const passwordBuffer = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(passwordPlain),
		);
		const password = Array.from(new Uint8Array(passwordBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		// Login request payload (matching Python example structure)
		const payload = {
			appId: env.APP_ID,
			industryCode: env.INDUSTRY_CODE,
			timestamp: timestamp,
			password: password,
		};

		console.log("Login payload:", JSON.stringify(payload, null, 2));

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
			throw new Error(`Authentication failed: ${response.status}`);
		}

		const data = (await response.json()) as any;
		console.log("Auth response:", JSON.stringify(data, null, 2));

		if (data.code !== 200) {
			throw new Error(`Authentication failed: ${data.msg || "Unknown error"}`);
		}

		if (!data.data || !data.data.accessToken) {
			throw new Error(
				`Invalid authentication response: ${JSON.stringify(data)}`,
			);
		}

		accessToken = data.data.accessToken;
		// Parse expiry time from string to number
		const expiresIn = parseInt(data.data.accessTokenExpireIn || "3600");
		tokenExpiry = Date.now() + expiresIn * 1000;

		console.log(
			`✅ New access token obtained, expires in ${expiresIn} seconds`,
		);

		return accessToken!;
	}

	static async safeAPICall<T>(apiCall: () => Promise<T>): Promise<T> {
		try {
			return await apiCall();
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`API Error: ${error.message}`);
			}
			throw new Error("Unknown API error occurred");
		}
	}

	static async healthCheck(env: EUOneEnvironment): Promise<{ status: string }> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			return { status: "OK - Authentication successful" };
		});
	}

	static async getTslModel(
		env: EUOneEnvironment,
		productKey: string,
	): Promise<any> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);

			const response = await fetch(
				`${env.BASE_URL}/v2/product/openapi/ent/v1/product/tsl/acquireTslModelByProductKey?productKey=${encodeURIComponent(productKey)}`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);

			if (!response.ok) {
				throw new Error(`API call failed: ${response.status}`);
			}

			const result = (await response.json()) as any;
			if (result.code !== 200) {
				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			return result.data || {};
		});
	}

	static async getDeviceList(
		env: EUOneEnvironment,
		options: {
			deviceQueryKey?: string;
			enableListSubData?: boolean;
			extFiledList?: string[];
			mountId?: number;
			onlineStatus?: number;
			pageNum?: number;
			pageSize?: number;
			productId?: number;
			runningStatus?: number;
			orgId?: number;
		} = {},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("🔐 Using token for device list (length):", token.length);
			console.log(
				"⏰ Token expiry check - current time:",
				new Date().toISOString(),
			);
			console.log("⏰ Token expires at:", new Date(tokenExpiry).toISOString());
			console.log(
				"⏰ Time until expiry (minutes):",
				Math.round((tokenExpiry - Date.now()) / 60000),
			);

			// Set default values
			const requestBody = {
				pageNum: options.pageNum || 1,
				pageSize: options.pageSize || 10,
				...options,
			};

			console.log(
				"📝 Device list request body:",
				JSON.stringify(requestBody, null, 2),
			);

			const response = await fetch(
				`${env.BASE_URL}/v2/device/openapi/ent/v1/device/list`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(requestBody),
				},
			);

			console.log("📡 Device list response status:", response.status);
			console.log(
				"📡 Device list response headers:",
				Object.fromEntries(response.headers.entries()),
			);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device list HTTP error response:", errorText);
				throw new Error(`API call failed: ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log(
				"📱 Device list API response:",
				JSON.stringify(result, null, 2),
			);

			if (result.code !== 200) {
				// If session timeout, try to refresh token and retry once
				if (result.msg && result.msg.includes("Session timed out")) {
					console.log(
						"🔄 Session timeout detected, forcing token refresh and retrying...",
					);
					// Clear the cached token to force refresh
					accessToken = null;
					tokenExpiry = 0;

					// Get new token
					const newToken = await EUOneAPIUtils.getAccessToken(env);
					console.log("🔐 Retrying with new token (length):", newToken.length);

					// Retry the request with new token
					const retryResponse = await fetch(
						`${env.BASE_URL}/v2/device/openapi/ent/v1/device/list`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${newToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify(requestBody),
						},
					);

					if (!retryResponse.ok) {
						const retryErrorText = await retryResponse.text();
						throw new Error(
							`Retry API call failed: ${retryResponse.status} - ${retryErrorText}`,
						);
					}

					const retryResult = (await retryResponse.json()) as any;
					console.log(
						"🔄 Retry response:",
						JSON.stringify(retryResult, null, 2),
					);

					if (retryResult.code !== 200) {
						throw new Error(
							`Retry API call failed: ${retryResult.msg || "Unknown error"}`,
						);
					}

					return retryResult.rows || [];
				}

				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			return result.rows || [];
		});
	}

	static async getProductList(
		env: EUOneEnvironment,
		options: {
			accessType?: number;
			connProtocol?: number;
			createBy?: string;
			createTime?: string;
			createUserId?: number;
			dataFormat?: number;
			industrySceneCode?: string;
			industrySceneId?: number;
			netWay?: number;
			productKey?: string;
			productKeyList?: string[];
			productList?: number[];
			productName?: string;
			releaseStatus?: number;
			remark?: string;
			searchValue?: string;
			sortType?: number;
			tenantId?: number;
			updateBy?: string;
			updateTime?: string;
			vendorId?: number;
			pageNum?: string | number;
			pageSize?: string | number;
		} = {},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("🔐 Using token for product list (length):", token.length);
			console.log(
				"⏰ Token expiry check - current time:",
				new Date().toISOString(),
			);
			console.log("⏰ Token expires at:", new Date(tokenExpiry).toISOString());
			console.log(
				"⏰ Time until expiry (minutes):",
				Math.round((tokenExpiry - Date.now()) / 60000),
			);

			// Build query parameters
			const queryParams = new URLSearchParams();

			// Set default values for pagination
			const pageNum = options.pageNum ? String(options.pageNum) : "1";
			const pageSize = options.pageSize ? String(options.pageSize) : "12";

			queryParams.append("pageNum", pageNum);
			queryParams.append("pageSize", pageSize);

			// Add optional parameters if provided
			if (options.accessType !== undefined)
				queryParams.append("accessType", String(options.accessType));
			if (options.connProtocol !== undefined)
				queryParams.append("connProtocol", String(options.connProtocol));
			if (options.createBy) queryParams.append("createBy", options.createBy);
			if (options.createTime)
				queryParams.append("createTime", options.createTime);
			if (options.createUserId !== undefined)
				queryParams.append("createUserId", String(options.createUserId));
			if (options.dataFormat !== undefined)
				queryParams.append("dataFormat", String(options.dataFormat));
			if (options.industrySceneCode)
				queryParams.append("industrySceneCode", options.industrySceneCode);
			if (options.industrySceneId !== undefined)
				queryParams.append("industrySceneId", String(options.industrySceneId));
			if (options.netWay !== undefined)
				queryParams.append("netWay", String(options.netWay));
			if (options.productKey)
				queryParams.append("productKey", options.productKey);
			if (options.productKeyList && options.productKeyList.length > 0) {
				options.productKeyList.forEach((key) =>
					queryParams.append("productKeyList", key),
				);
			}
			if (options.productList && options.productList.length > 0) {
				options.productList.forEach((id) =>
					queryParams.append("productList", String(id)),
				);
			}
			if (options.productName)
				queryParams.append("productName", options.productName);
			if (options.releaseStatus !== undefined)
				queryParams.append("releaseStatus", String(options.releaseStatus));
			if (options.remark) queryParams.append("remark", options.remark);
			if (options.searchValue)
				queryParams.append("searchValue", options.searchValue);
			if (options.sortType !== undefined)
				queryParams.append("sortType", String(options.sortType));
			if (options.tenantId !== undefined)
				queryParams.append("tenantId", String(options.tenantId));
			if (options.updateBy) queryParams.append("updateBy", options.updateBy);
			if (options.updateTime)
				queryParams.append("updateTime", options.updateTime);
			if (options.vendorId !== undefined)
				queryParams.append("vendorId", String(options.vendorId));

			const url = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
			console.log("📝 Product list request URL:", url);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					"Accept-Language": "en-US",
				},
			});

			console.log("📡 Product list response status:", response.status);
			console.log(
				"📡 Product list response headers:",
				Object.fromEntries(response.headers.entries()),
			);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Product list HTTP error response:", errorText);
				throw new Error(`API call failed: ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log(
				"📋 Product list API response:",
				JSON.stringify(result, null, 2),
			);

			if (result.code !== 200) {
				// If session timeout, try to refresh token and retry once
				if (result.msg && result.msg.includes("Session timed out")) {
					console.log(
						"🔄 Session timeout detected, forcing token refresh and retrying...",
					);
					// Clear the cached token to force refresh
					accessToken = null;
					tokenExpiry = 0;

					// Get new token
					const newToken = await EUOneAPIUtils.getAccessToken(env);
					console.log("🔐 Retrying with new token (length):", newToken.length);

					// Retry the request with new token
					const retryResponse = await fetch(url, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${newToken}`,
							"Content-Type": "application/json",
							"Accept-Language": "en-US",
						},
					});

					if (!retryResponse.ok) {
						const retryErrorText = await retryResponse.text();
						throw new Error(
							`Retry API call failed: ${retryResponse.status} - ${retryErrorText}`,
						);
					}

					const retryResult = (await retryResponse.json()) as any;
					console.log(
						"🔄 Retry response:",
						JSON.stringify(retryResult, null, 2),
					);

					if (retryResult.code !== 200) {
						throw new Error(
							`Retry API call failed: ${retryResult.msg || "Unknown error"}`,
						);
					}

					return retryResult;
				}

				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			return result;
		});
	}

	static async reportDeviceData(
		env: EUOneEnvironment,
		options: {
			productKey: string;
			deviceKey: string;
			data: Record<string, any>; // Dynamic properties from device's TSL model
			upTsTime?: number;
		},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("🔐 Using token for device report (length):", token.length);

			// Set default timestamp if not provided
			const requestBody = {
				productKey: options.productKey,
				deviceKey: options.deviceKey,
				data: options.data, // User-provided property values
				upTsTime: options.upTsTime || Date.now(),
			};

			console.log(
				"📤 Device report request body:",
				JSON.stringify(requestBody, null, 2),
			);

			const response = await fetch(`${env.BASE_URL}/v2/device/data/fake/up`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			console.log("📡 Device report response status:", response.status);
			console.log(
				"📡 Device report response headers:",
				Object.fromEntries(response.headers.entries()),
			);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device report HTTP error response:", errorText);
				throw new Error(`API call failed: ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log(
				"📤 Device report API response:",
				JSON.stringify(result, null, 2),
			);

			// Handle potential session timeout and retry
			if (result.code && result.code !== 200) {
				if (result.msg && result.msg.includes("Session timed out")) {
					console.log(
						"🔄 Session timeout detected, forcing token refresh and retrying...",
					);
					// Clear the cached token to force refresh
					accessToken = null;
					tokenExpiry = 0;

					// Get new token
					const newToken = await EUOneAPIUtils.getAccessToken(env);
					console.log(
						"🔐 Retrying device report with new token (length):",
						newToken.length,
					);

					// Retry the request with new token
					const retryResponse = await fetch(
						`${env.BASE_URL}/v2/device/data/fake/up`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${newToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify(requestBody),
						},
					);

					if (!retryResponse.ok) {
						const retryErrorText = await retryResponse.text();
						throw new Error(
							`Retry API call failed: ${retryResponse.status} - ${retryErrorText}`,
						);
					}

					const retryResult = (await retryResponse.json()) as any;
					console.log(
						"🔄 Device report retry response:",
						JSON.stringify(retryResult, null, 2),
					);

					if (retryResult.code && retryResult.code !== 200) {
						throw new Error(
							`Retry API call failed: ${retryResult.msg || "Unknown error"}`,
						);
					}

					return retryResult;
				}

				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			// For successful response (code 200 or no code field)
			return result;
		});
	}
}
