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

export class EUOneAPIUtils {
	static async getAccessToken(env: EUOneEnvironment): Promise<string> {
		// Check if we have a valid cached token (with 60 second buffer for safety)
		const bufferTime = 60 * 1000; // 60 seconds
		if (accessToken && Date.now() < (tokenExpiry - bufferTime)) {
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

		const response = await fetch(`${env.BASE_URL}/v2/sysuser/openapi/ent/v3/login/pwdAuth`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`Authentication failed: ${response.status}`);
		}

		const data = (await response.json()) as any;
		console.log("Auth response:", JSON.stringify(data, null, 2));
		
		if (data.code !== 200) {
			throw new Error(`Authentication failed: ${data.msg || 'Unknown error'}`);
		}

		if (!data.data || !data.data.accessToken) {
			throw new Error(`Invalid authentication response: ${JSON.stringify(data)}`);
		}

		accessToken = data.data.accessToken;
		// Parse expiry time from string to number
		const expiresIn = parseInt(data.data.accessTokenExpireIn || '3600');
		tokenExpiry = Date.now() + expiresIn * 1000;

		console.log(`✅ New access token obtained, expires in ${expiresIn} seconds`);
		
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

	static async getTslModel(env: EUOneEnvironment, productKey: string): Promise<any> {
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
				throw new Error(`API call failed: ${result.msg || 'Unknown error'}`);
			}

			return result.data || {};
		});
	}

	static async getDeviceList(env: EUOneEnvironment, options: {
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
	} = {}): Promise<any> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("🔐 Using token for device list (length):", token.length);
			console.log("⏰ Token expiry check - current time:", new Date().toISOString());
			console.log("⏰ Token expires at:", new Date(tokenExpiry).toISOString());
			console.log("⏰ Time until expiry (minutes):", Math.round((tokenExpiry - Date.now()) / 60000));

			// Set default values
			const requestBody = {
				pageNum: options.pageNum || 1,
				pageSize: options.pageSize || 10,
				...options
			};

			console.log("📝 Device list request body:", JSON.stringify(requestBody, null, 2));

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
			console.log("📡 Device list response headers:", Object.fromEntries(response.headers.entries()));

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device list HTTP error response:", errorText);
				throw new Error(`API call failed: ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log("📱 Device list API response:", JSON.stringify(result, null, 2));
			
			if (result.code !== 200) {
				// If session timeout, try to refresh token and retry once
				if (result.msg && result.msg.includes("Session timed out")) {
					console.log("🔄 Session timeout detected, forcing token refresh and retrying...");
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
						throw new Error(`Retry API call failed: ${retryResponse.status} - ${retryErrorText}`);
					}

					const retryResult = (await retryResponse.json()) as any;
					console.log("🔄 Retry response:", JSON.stringify(retryResult, null, 2));
					
					if (retryResult.code !== 200) {
						throw new Error(`Retry API call failed: ${retryResult.msg || 'Unknown error'}`);
					}
					
					return retryResult.rows || [];
				}
				
				throw new Error(`API call failed: ${result.msg || 'Unknown error'}`);
			}

			return result.rows || [];
		});
	}

	static async reportDeviceData(env: EUOneEnvironment, options: {
		productKey: string;
		deviceKey: string;
		data: Record<string, any>; // Dynamic properties from device's TSL model
		upTsTime?: number;
	}): Promise<any> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("🔐 Using token for device report (length):", token.length);

			// Set default timestamp if not provided
			const requestBody = {
				productKey: options.productKey,
				deviceKey: options.deviceKey,
				data: options.data, // User-provided property values
				upTsTime: options.upTsTime || Date.now()
			};

			console.log("📤 Device report request body:", JSON.stringify(requestBody, null, 2));

			const response = await fetch(
				`${env.BASE_URL}/v2/device/data/fake/up`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(requestBody),
				},
			);

			console.log("📡 Device report response status:", response.status);
			console.log("📡 Device report response headers:", Object.fromEntries(response.headers.entries()));

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device report HTTP error response:", errorText);
				throw new Error(`API call failed: ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log("📤 Device report API response:", JSON.stringify(result, null, 2));
			
			// Handle potential session timeout and retry
			if (result.code && result.code !== 200) {
				if (result.msg && result.msg.includes("Session timed out")) {
					console.log("🔄 Session timeout detected, forcing token refresh and retrying...");
					// Clear the cached token to force refresh
					accessToken = null;
					tokenExpiry = 0;
					
					// Get new token
					const newToken = await EUOneAPIUtils.getAccessToken(env);
					console.log("🔐 Retrying device report with new token (length):", newToken.length);
					
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
						throw new Error(`Retry API call failed: ${retryResponse.status} - ${retryErrorText}`);
					}

					const retryResult = (await retryResponse.json()) as any;
					console.log("🔄 Device report retry response:", JSON.stringify(retryResult, null, 2));
					
					if (retryResult.code && retryResult.code !== 200) {
						throw new Error(`Retry API call failed: ${retryResult.msg || 'Unknown error'}`);
					}
					
					return retryResult;
				}
				
				throw new Error(`API call failed: ${result.msg || 'Unknown error'}`);
			}

			// For successful response (code 200 or no code field)
			return result;
		});
	}
}