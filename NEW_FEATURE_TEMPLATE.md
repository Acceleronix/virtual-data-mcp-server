# MCP 新功能开发模板

本文档提供了为 Acceleronix IoT MCP Server 添加新功能的完整指南和模板。

## 📋 现有系统架构分析

### 🔍 核心组件结构

1. **MCP工具定义** (`src/server.ts` - addXxxTool方法)
2. **API调用实现** (`src/utils.ts` - EUOneAPIUtils类方法)
3. **认证机制** (SHA-256 + token缓存，已实现)
4. **响应格式化** (将API响应转为用户友好格式)
5. **首页展示** (`src/index.ts` - 工具列表更新)

### 🔑 认证系统 (已实现，无需修改)

```typescript
// 认证配置
interface EUOneEnvironment {
    BASE_URL: string;           // https://euone-api.acceleronix.io
    APP_ID: string;             // 应用ID
    APP_SECRET: string;         // 应用密钥
    INDUSTRY_CODE: string;      // 行业代码 (eam)
}

// Token获取 (自动处理)
Authorization: {token}          // 直接token，无Bearer前缀
Content-Type: application/json
Accept-Language: en-US
```

## 🎯 新功能开发清单

### **1. API基础信息** ✅ 必需

```markdown
**API端点**: 
- 完整路径: /v2/xxx/xxx/xxx
- HTTP方法: GET | POST | PUT | DELETE
- 基础URL: 使用环境变量 env.BASE_URL

**示例**:
- 端点: /v2/device/openapi/ent/v1/device/list
- 方法: POST
```

### **2. 请求参数规范** ✅ 必需

```typescript
// 查询参数 (用于GET请求)
interface QueryParams {
    pageNum?: number;           // 页码，从1开始
    pageSize?: number;          // 每页数量
    productKey?: string;        // 产品密钥
}

// 请求体参数 (用于POST请求)
interface RequestBody {
    deviceId: string;           // 必需参数
    startTime?: string;         // 可选参数
    endTime?: string;           // 可选参数
}
```

### **3. 响应结构** ✅ 必需

```json
// 成功响应样例
{
    "code": 200,                    // 业务状态码 (200=成功)
    "msg": "Successful",            // 响应消息
    "total": 31,                    // 总数 (分页场景)
    "rows": [                       // 数据数组 或 "data": {}
        {
            "id": 3042,
            "name": "设备名称",
            "status": 1
        }
    ]
}

// 错误响应样例
{
    "code": 400,                    // 错误码
    "msg": "Parameter error"        // 错误信息
}
```

### **4. MCP工具配置** ✅ 必需

```typescript
// 工具Schema定义
{
    type: "object",
    properties: {
        deviceId: {
            type: "string",
            description: "设备ID (必需，例如: 'device123')"
        },
        startTime: {
            type: "string",
            description: "开始时间 (可选，格式: YYYY-MM-DD)"
        }
    },
    required: ["deviceId"]          // 必需参数列表
}
```

## 🚀 开发模板

### **步骤1: 在 utils.ts 添加API方法**

```typescript
// 添加到 EUOneAPIUtils 类中
static async getNewFeatureData(
    env: EUOneEnvironment,
    options: {
        deviceId: string;           // 必需参数
        startTime?: string;         // 可选参数
        endTime?: string;           // 可选参数
        pageNum?: number;
        pageSize?: number;
    }
): Promise<any> {
    return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
        console.log("🔐 Using token for new feature");

        // GET请求示例
        const queryParams = new URLSearchParams();
        queryParams.append("deviceId", options.deviceId);
        if (options.startTime) queryParams.append("startTime", options.startTime);
        
        const response = await fetch(
            `${env.BASE_URL}/v2/xxx/xxx/xxx?${queryParams.toString()}`,
            {
                method: "GET",
                headers: {
                    Authorization: token,
                    "Accept-Language": "en-US",
                    "Content-Type": "application/json",
                },
            }
        );

        // POST请求示例
        /*
        const requestBody = {
            deviceId: options.deviceId,
            startTime: options.startTime,
            endTime: options.endTime,
            pageNum: options.pageNum || 1,
            pageSize: options.pageSize || 10,
        };

        const response = await fetch(`${env.BASE_URL}/v2/xxx/xxx/xxx`, {
            method: "POST",
            headers: {
                Authorization: token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });
        */

        console.log("📡 API response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ API error response:", errorText);
            throw new Error(`API call failed: HTTP ${response.status} - ${errorText}`);
        }

        const result = (await response.json()) as any;
        console.log("📋 API response:", JSON.stringify(result, null, 2));

        if (result.code !== 200) {
            throw new Error(`API call failed: Code ${result.code} - ${result.msg || "Unknown error"}`);
        }

        return result;
    });
}
```

### **步骤2: 在 server.ts 添加MCP工具**

```typescript
// 添加到 VirtualDataMCP 类的 init() 方法中
this.addNewFeatureTool(env);
console.log("✅ New feature tool registered");

// 添加工具方法
private addNewFeatureTool(env: EUOneEnvironment) {
    this.server.tool(
        "get_new_feature",                          // 工具名称
        "获取新功能数据的描述说明",                     // 工具描述
        {
            type: "object",
            properties: {
                deviceId: {
                    type: "string",
                    description: "设备ID (必需，例如: 'device123')",
                },
                startTime: {
                    type: "string",
                    description: "开始时间 (可选，格式: YYYY-MM-DD)",
                },
                endTime: {
                    type: "string",
                    description: "结束时间 (可选，格式: YYYY-MM-DD)",
                },
            },
            required: ["deviceId"],                 // 必需参数
        },
        async (args) => {
            try {
                console.log("🚀 get_new_feature called with args:", JSON.stringify(args, null, 2));

                // 参数验证
                if (!args || !args.deviceId || typeof args.deviceId !== "string" || args.deviceId.trim() === "") {
                    throw new Error("deviceId is required and must be a non-empty string");
                }

                const deviceId = args.deviceId.trim();

                // 调用API
                const featureData = await EUOneAPIUtils.getNewFeatureData(env, {
                    deviceId: deviceId,
                    startTime: args.startTime,
                    endTime: args.endTime,
                });

                // 格式化响应
                const items = featureData.rows || featureData.data || [];
                const total = featureData.total || items.length;

                let responseText = `🔧 **新功能数据**\n`;
                responseText += `设备ID: \`${deviceId}\`\n`;
                responseText += `找到 ${items.length} 条记录\n`;
                if (featureData.total) {
                    responseText += `总计: ${total} 条\n`;
                }
                responseText += `============================================================\n\n`;

                if (items.length === 0) {
                    responseText += "❌ 未找到相关数据。\n\n";
                } else {
                    items.forEach((item: any, index: number) => {
                        responseText += `${index + 1}. **${item.name || item.title || "未命名"}**\n`;
                        responseText += `   🆔 ID: ${item.id || "N/A"}\n`;
                        responseText += `   📋 状态: ${item.status || "N/A"}\n`;
                        // 根据实际数据结构添加更多字段
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
                console.error("❌ get_new_feature error:", error);

                let errorMessage = "Unknown error occurred";
                if (error instanceof Error) {
                    errorMessage = error.message;
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Error getting new feature data: ${errorMessage}`,
                        },
                    ],
                };
            }
        },
    );
}
```

### **步骤3: 更新首页工具列表**

```typescript
// 在 src/index.ts 中添加新工具的描述
<li><strong>新功能名称:</strong> get_new_feature - 新功能的详细描述</li>
```

## 📝 需求提供模板

当你要添加新功能时，请按以下格式提供信息：

```markdown
## 新功能需求: [功能名称]

### 1. API信息
- **端点**: /v2/xxx/xxx/xxx
- **方法**: GET/POST
- **用途**: 简要描述功能用途

### 2. 请求参数
- **必需参数**:
  - deviceId (string): 设备ID
  - productKey (string): 产品密钥
  
- **可选参数**:
  - startTime (string): 开始时间
  - pageNum (number): 页码
  - pageSize (number): 每页数量

### 3. 响应示例
```json
{
    "code": 200,
    "msg": "success",
    "total": 10,
    "rows": [
        {
            "id": 123,
            "name": "示例名称",
            "status": 1
        }
    ]
}
```

### 4. 特殊要求 (如有)
- 分页支持: 是/否
- 错误处理: 特殊错误码说明
- 数据格式: 时间戳/日期格式等
```

## 🔧 常见模式

### 分页处理
```typescript
// 支持分页的参数
pageNum?: number;           // 页码，默认1
pageSize?: number;          // 每页数量，默认10，最大200

// 响应中的分页信息
total: number;              // 总记录数
rows: Array<any>;           // 当前页数据
```

### 时间参数
```typescript
// 时间戳格式 (毫秒)
startTime?: number;         // 1640995200000
endTime?: number;           // 1640995200000

// 日期字符串格式
startDate?: string;         // "2024-01-01"
endDate?: string;           // "2024-01-31"
```

### 错误处理
```typescript
// 统一错误处理
if (result.code !== 200) {
    throw new Error(`API call failed: Code ${result.code} - ${result.msg || "Unknown error"}`);
}
```

## ✅ 完成检查清单

- [ ] API方法添加到 utils.ts
- [ ] MCP工具添加到 server.ts
- [ ] 工具注册到 init() 方法
- [ ] 首页工具列表更新
- [ ] 参数验证完整
- [ ] 错误处理完善
- [ ] 响应格式化美观
- [ ] 测试部署成功

---

**使用方法**: 当你提供新功能的API信息时，我会根据这个模板自动生成完整的代码实现！