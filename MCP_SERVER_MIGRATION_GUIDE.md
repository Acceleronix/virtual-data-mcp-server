# Acceleronix IoT MCP Server 迁移指南

## 概述

本文档详细分析了 Acceleronix IoT MCP Server 的代码结构和功能，用于将其功能迁移到新的 MCP server 项目中。

## 项目架构

### 核心技术栈

- **部署平台**: Cloudflare Workers
- **Web 框架**: Hono
- **MCP 协议**: @modelcontextprotocol/sdk
- **认证**: OAuth 2.0 (演示实现)
- **持久化**: Cloudflare Durable Objects
- **代码质量**: Biome (格式化和代码检查)
- **类型系统**: TypeScript

### 文件结构分析

```
src/
├── index.ts          # 主入口点，路由处理
├── iot-server.ts     # MCP 服务器核心实现
├── iot-utils.ts      # IoT API 集成工具函数
├── app.ts           # OAuth 认证应用 (演示)
└── utils.ts         # HTML 渲染和 UI 工具函数
```

## 详细功能分析

### 1. 配置文件分析

#### wrangler.toml
```toml
name = "acc-mcp-server"
main = "src/index.ts"
compatibility_date = "2025-06-20"
compatibility_flags = ["nodejs_compat"]

[vars]
BASE_URL = "https://iot-api.acceleronix.io"

[[durable_objects.bindings]]
name = "MCP_OBJECT"
class_name = "IoTMCP"

[observability]
enabled = true
```

**关键配置要点:**
- 使用 Node.js 兼容模式
- 配置 Durable Objects 用于状态管理
- 环境变量 `BASE_URL` 指向 IoT API
- 需要通过 secrets 设置 `ACCESS_KEY` 和 `ACCESS_SECRET`

#### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "es2021",
    "module": "es2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["./worker-configuration.d.ts", "node"]
  }
}
```

### 2. 入口点分析 (src/index.ts)

**关键功能:**
- 导出 IoTMCP Durable Object 类
- 路由配置:
  - `/sse` - SSE 端点 (直接连接，无需 OAuth)
  - `/mcp` - HTTP 端点
  - `/` - 简单首页
- 无 OAuth 认证的简化设计

**迁移要点:**
- 路由结构简单明了
- 直接使用 Durable Objects 的 `serveSSE` 和 `serve` 方法
- 首页返回简单的 HTML 状态页面

### 3. IoT API 工具函数 (src/iot-utils.ts)

#### 核心接口和类型
```typescript
export interface IoTEnvironment {
  BASE_URL: string;
  ACCESS_KEY: string;
  ACCESS_SECRET: string;
}

export interface PaginationCursor {
  pageNo: number;
  pageSize: number;
  productKey?: string;
  totalItems?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
}
```

#### 认证机制
- 使用 SHA-256 签名的 accessKey 认证
- 全局 token 缓存，1小时过期
- 自动 token 刷新机制

#### 主要 API 功能
1. **产品管理**
   - `listProducts()` - 获取所有产品
   - `listProductsPaginated()` - 分页获取产品
   - `getProductTslJson()` - 获取产品 TSL 定义
   - `getProductThingModel()` - 获取产品物模型

2. **设备管理**
   - `listDevices()` - 获取设备列表
   - `listDevicesPaginated()` - 分页获取设备
   - `getDeviceDetail()` - 获取设备详情

3. **设备控制**
   - `powerSwitch()` - 电源开关控制 (基于 TSL 模型 FAN_SWITCH)
   - `fanMode()` - 风扇模式控制 (基于 TSL 模型 FAN_MODE)

4. **设备数据**
   - `queryDeviceLocation()` - 查询设备位置
   - `queryDeviceResources()` - 查询设备资源
   - `readDeviceData()` - 读取设备影子数据
   - `queryDeviceDataHistory()` - 查询设备数据历史
   - `queryDeviceEventHistory()` - 查询设备事件历史

5. **工具函数**
   - `formatTimestampWithTimezone()` - 时间戳格式化 (UTC 和 UTC+8)
   - `formatAccessType()` - 访问类型格式化
   - `formatNetworkWay()` - 网络方式格式化
   - `formatDataFmt()` - 数据格式化
   - `formatAuthMode()` - 认证模式格式化

#### 分页机制
- 使用 base64 编码的 cursor 进行分页
- 支持产品和设备的分页查询
- 自动检测下一页是否存在

### 4. MCP 服务器实现 (src/iot-server.ts)

#### 核心架构
```typescript
export class IoTMCP extends McpAgent {
  server = new McpServer({
    name: "IoT MCP Server",
    version: "1.0.0",
  });
}
```

#### 可用工具 (Tools)

1. **产品管理工具**
   - `list_products_detailed` - 详细产品列表
   - `list_products_paginated` - 分页产品列表
   - `get_product_definition` - 获取产品 TSL 定义
   - `get_product_thing_model` - 获取产品物模型

2. **设备管理工具**
   - `list_devices_paginated` - 分页设备列表
   - `get_device_details` - 获取设备详情
   - `get_device_tsl_properties` - 获取设备 TSL 属性
   - `get_device_latest_online_time` - 获取设备最新在线时间

3. **设备控制工具**
   - `power_switch` - 电源开关控制
   - `set_fan_mode` - 设置风扇模式

4. **设备数据工具**
   - `query_device_location` - 查询设备位置
   - `query_device_resources` - 查询设备资源
   - `read_device_shadow_data` - 读取设备影子数据
   - `read_device_properties` - 读取设备属性 (简化版)

5. **历史数据工具**
   - `get_device_data_history` - 获取设备数据历史
   - `get_device_event_history` - 获取设备事件历史

6. **系统工具**
   - `health_check` - 健康检查

#### 工具实现特点
- 使用 Zod 进行输入验证
- 统一的错误处理机制
- 格式化的输出，便于 Claude 理解
- 支持时区格式化 (UTC 和 UTC+8)
- 分页支持，避免 token 限制

### 5. OAuth 认证应用 (src/app.ts)

#### 功能特点
- 使用 Hono 框架构建
- 支持登录和授权流程
- 演示性质的实现
- 支持多种 OAuth 作用域

#### 主要路由
- `GET /` - 首页
- `GET /authorize` - 授权页面
- `POST /approve` - 处理授权请求

**注意**: 在实际的 MCP 服务器中，这个模块是可选的，因为可以直接使用 SSE 端点。

### 6. UI 工具函数 (src/utils.ts)

#### 主要功能
- HTML 模板渲染
- Tailwind CSS 样式
- Markdown 渲染支持
- OAuth 表单处理

**注意**: 此文件主要用于 OAuth 演示界面，在纯 MCP 服务器迁移中优先级较低。

## 迁移指导

### 1. 环境配置迁移
```bash
# 设置环境变量
npx wrangler secret put ACCESS_KEY
npx wrangler secret put ACCESS_SECRET

# 配置 wrangler.toml
[vars]
BASE_URL = "https://iot-api.acceleronix.io"

[[durable_objects.bindings]]
name = "MCP_OBJECT"
class_name = "IoTMCP"
```

### 2. 核心依赖
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.x.x",
    "agents": "^x.x.x",
    "hono": "^4.x.x",
    "zod": "^3.x.x"
  }
}
```

### 3. 关键迁移步骤

#### 步骤 1: 复制核心工具函数
- 将 `src/iot-utils.ts` 完整复制
- 确保所有接口和类型定义正确

#### 步骤 2: 迁移 MCP 服务器实现
- 复制 `IoTMCP` 类和所有工具定义
- 根据新项目需求调整工具集合

#### 步骤 3: 配置入口点
- 根据新项目架构调整路由
- 确保 Durable Objects 正确配置

#### 步骤 4: 测试和验证
- 使用 `health_check` 工具验证连接
- 测试关键 API 功能
- 验证分页机制

### 4. 注意事项

#### 安全考虑
- `ACCESS_KEY` 和 `ACCESS_SECRET` 必须通过 Cloudflare secrets 设置
- 避免在代码中硬编码敏感信息
- 使用 SHA-256 签名确保 API 安全

#### 性能优化
- 使用分页工具避免大量数据导致的 token 限制
- 实现 token 缓存机制
- 合理设置 API 请求超时

#### 错误处理
- 统一的错误消息格式
- 友好的用户错误提示
- 完整的日志记录

## 技术细节

### 1. TSL 模型集成
- 基于 Thing Specification Language (TSL) 的设备能力描述
- 支持 FAN_SWITCH (电源开关) 和 FAN_MODE (风扇模式) 控制
- 自动映射 TSL 属性到用户友好的参数

### 2. 时区处理
- 同时显示 UTC 和 UTC+8 时间
- 统一的时间戳格式化函数
- 支持多种时间字段的格式化

### 3. 分页实现
- Base64 编码的分页 cursor
- 自动检测下一页存在性
- 支持产品和设备的独立分页

### 4. 设备状态管理
- 在线/离线状态检测
- 多数据源的最新在线时间分析
- 设备生命周期事件追踪

## Acceleronix IoT API OpenAPI 规范

### API 基础信息

```yaml
openapi: 3.0.3
info:
  title: Acceleronix IoT Platform API
  description: IoT设备管理和控制API
  version: 1.0.0
  contact:
    name: Acceleronix IoT Platform
    url: https://iot-api.acceleronix.io
servers:
  - url: https://iot-api.acceleronix.io
    description: Production server
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          oneOf:
            - type: integer
            - type: object
          description: 响应代码，成功时为200
        msg:
          type: string
          description: 响应消息
        data:
          description: 响应数据
    PaginationInfo:
      type: object
      properties:
        pageNum:
          type: integer
          description: 当前页码
        pageSize:
          type: integer
          description: 每页大小
        total:
          type: integer
          description: 总条数
        pages:
          type: integer
          description: 总页数
```

### 1. 认证接口

#### 获取访问令牌
```yaml
paths:
  /v2/quecauth/accessKeyAuthrize/accessKeyLogin:
    get:
      summary: 获取访问令牌
      description: 使用AccessKey和AccessSecret获取API访问令牌
      parameters:
        - name: grant_type
          in: query
          required: true
          schema:
            type: string
            enum: [password]
        - name: username
          in: query
          required: true
          schema:
            type: string
            description: URL编码的认证参数字符串
        - name: password
          in: query
          required: true
          schema:
            type: string
            description: SHA-256签名的认证密码
      responses:
        '200':
          description: 成功获取令牌
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          access_token:
                            type: string
                            description: 访问令牌
                          token_type:
                            type: string
                            description: 令牌类型
                          expires_in:
                            type: integer
                            description: 过期时间（秒）
```

### 2. 产品管理接口

#### 获取产品列表
```yaml
  /v2/quecproductmgr/r3/openapi/products:
    get:
      summary: 获取产品列表
      description: 分页获取产品列表信息
      security:
        - BearerAuth: []
      parameters:
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 100
            minimum: 1
            maximum: 500
          description: 每页大小
        - name: pageNo
          in: query
          schema:
            type: integer
            default: 1
            minimum: 1
          description: 页码
      responses:
        '200':
          description: 成功获取产品列表
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/Product'
      components:
        schemas:
          Product:
            type: object
            properties:
              productKey:
                type: string
                description: 产品Key
              productName:
                type: string
                description: 产品名称
              accessType:
                type: integer
                description: 接入类型 (0:直连设备 1:网关设备 2:网关子设备)
              netWay:
                type: string
                description: 网络接入方式
              dataFmt:
                type: integer
                description: 数据格式 (0:透传 3:物模型)
              connectPlatform:
                type: string
                description: 连接平台
              createTime:
                type: integer
                description: 创建时间戳
              updateTime:
                type: integer
                description: 更新时间戳
```

#### 获取产品TSL定义
```yaml
  /v2/quectsl/openapi/product/export/tslFile:
    get:
      summary: 获取产品TSL定义
      description: 获取产品的Thing Specification Language定义
      security:
        - BearerAuth: []
      parameters:
        - name: productKey
          in: query
          schema:
            type: string
          description: 产品Key (与productId二选一)
        - name: productId
          in: query
          schema:
            type: integer
          description: 产品ID (与productKey二选一)
        - name: language
          in: query
          schema:
            type: string
            enum: [CN, EN]
            default: CN
          description: 语言设置
      responses:
        '200':
          description: 成功获取TSL定义
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/TslDefinition'
      components:
        schemas:
          TslDefinition:
            type: object
            properties:
              properties:
                type: array
                items:
                  type: object
                  properties:
                    code:
                      type: string
                      description: 属性代码
                    name:
                      type: string
                      description: 属性名称
                    specs:
                      type: object
                      properties:
                        unit:
                          type: string
                          description: 单位
                        dataType:
                          type: string
                          description: 数据类型
              services:
                type: array
                description: 服务列表
              events:
                type: array
                description: 事件列表
```

### 3. 设备管理接口

#### 获取设备列表
```yaml
  /v2/devicemgr/r3/openapi/product/device/overview:
    get:
      summary: 获取设备列表
      description: 获取指定产品下的设备列表
      security:
        - BearerAuth: []
      parameters:
        - name: productKey
          in: query
          required: true
          schema:
            type: string
          description: 产品Key
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 100
            minimum: 1
            maximum: 500
          description: 每页大小
        - name: pageNo
          in: query
          schema:
            type: integer
            default: 1
            minimum: 1
          description: 页码
      responses:
        '200':
          description: 成功获取设备列表
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/Device'
      components:
        schemas:
          Device:
            type: object
            properties:
              deviceKey:
                type: string
                description: 设备Key
              deviceName:
                type: string
                description: 设备名称
              productKey:
                type: string
                description: 产品Key
              sn:
                type: string
                description: 序列号
              deviceStatus:
                type: integer
                description: 设备状态 (1:在线 0:离线)
              isActived:
                type: integer
                description: 是否激活 (1:已激活 0:未激活)
              isVirtual:
                type: integer
                description: 是否虚拟设备 (1:是 0:否)
              isVerified:
                type: integer
                description: 是否验证 (1:已验证 0:未验证)
              authMode:
                type: integer
                description: 认证模式 (0:动态认证 1:静态认证 2:X509认证)
              dataFmt:
                type: integer
                description: 数据格式 (0:透传 3:物模型)
              createTime:
                type: integer
                description: 创建时间戳
              activedTime:
                type: integer
                description: 激活时间戳
              updateTime:
                type: integer
                description: 更新时间戳
```

#### 获取设备详情
```yaml
  /v2/devicemgr/r3/openapi/device/detail:
    get:
      summary: 获取设备详情
      description: 获取设备的详细信息
      security:
        - BearerAuth: []
      parameters:
        - name: productKey
          in: query
          required: true
          schema:
            type: string
          description: 产品Key
        - name: deviceKey
          in: query
          required: true
          schema:
            type: string
          description: 设备Key
      responses:
        '200':
          description: 成功获取设备详情
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        allOf:
                          - $ref: '#/components/schemas/Device'
                          - type: object
                            properties:
                              firstConnTime:
                                type: integer
                                description: 首次连接时间戳
                              lastConnTime:
                                type: integer
                                description: 最后连接时间戳
                              lastOfflineTime:
                                type: integer
                                description: 最后离线时间戳
```

### 4. 设备控制接口

#### 设备控制指令
```yaml
  /v2/deviceshadow/r3/openapi/dm/writeData:
    post:
      summary: 设备控制指令
      description: 向设备发送控制指令
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - data
                - devices
                - productKey
              properties:
                data:
                  type: string
                  description: 控制数据JSON字符串
                  example: '[{"FAN_SWITCH":"true"}]'
                devices:
                  type: array
                  items:
                    type: string
                  description: 设备Key列表
                productKey:
                  type: string
                  description: 产品Key
      responses:
        '200':
          description: 控制指令发送成功
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          type: object
                          properties:
                            code:
                              type: integer
                              description: 设备响应代码
                            deviceKey:
                              type: string
                              description: 设备Key
                            msg:
                              type: string
                              description: 响应消息
```

### 5. 设备数据接口

#### 读取设备数据
```yaml
  /v2/deviceshadow/r3/openapi/dm/readData:
    post:
      summary: 读取设备数据
      description: 读取设备影子数据
      security:
        - BearerAuth: []
      parameters:
        - name: language
          in: query
          schema:
            type: string
            enum: [CN, EN]
            default: CN
          description: 语言设置
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - data
                - devices
                - productKey
              properties:
                cacheTime:
                  type: integer
                  default: 600
                  description: 缓存时间（秒）
                data:
                  type: string
                  description: 要读取的属性JSON字符串
                  example: '["temperature", "humidity"]'
                devices:
                  type: array
                  items:
                    type: string
                  description: 设备Key列表
                isCache:
                  type: boolean
                  default: false
                  description: 是否启用缓存
                isCover:
                  type: boolean
                  default: false
                  description: 是否覆盖之前发送的数据
                productKey:
                  type: string
                  description: 产品Key
                qos:
                  type: integer
                  default: 1
                  description: QoS等级
      responses:
        '200':
          description: 成功读取设备数据
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          type: object
                          properties:
                            code:
                              type: integer
                              description: 响应代码
                            deviceKey:
                              type: string
                              description: 设备Key
                            productKey:
                              type: string
                              description: 产品Key
                            ticket:
                              type: string
                              description: 请求票据
                            message:
                              type: string
                              description: 响应消息
```

#### 查询设备位置
```yaml
  /v2/deviceshadow/r1/openapi/device/getlocation:
    get:
      summary: 查询设备位置
      description: 获取设备的位置信息
      security:
        - BearerAuth: []
      parameters:
        - name: deviceId
          in: query
          schema:
            type: integer
          description: 设备ID (与productKey+deviceKey二选一)
        - name: productKey
          in: query
          schema:
            type: string
          description: 产品Key (与deviceId二选一)
        - name: deviceKey
          in: query
          schema:
            type: string
          description: 设备Key (与deviceId二选一)
        - name: language
          in: query
          schema:
            type: string
            enum: [CN, EN]
            default: CN
          description: 语言设置
      responses:
        '200':
          description: 成功获取设备位置
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/DeviceLocation'
      components:
        schemas:
          DeviceLocation:
            type: object
            properties:
              deviceKey:
                type: string
                description: 设备Key
              productKey:
                type: string
                description: 产品Key
              locateTime:
                type: integer
                description: 定位时间戳
              locateStatus:
                type: string
                description: 定位状态
              wgsLat:
                type: number
                description: WGS84纬度
              wgsLng:
                type: number
                description: WGS84经度
              gcjLat:
                type: number
                description: GCJ02纬度
              gcjLng:
                type: number
                description: GCJ02经度
              accuracy:
                type: number
                description: 精度（米）
```

#### 查询设备资源
```yaml
  /v2/deviceshadow/r2/openapi/device/resource:
    get:
      summary: 查询设备资源
      description: 获取设备的资源信息
      security:
        - BearerAuth: []
      parameters:
        - name: productKey
          in: query
          required: true
          schema:
            type: string
          description: 产品Key
        - name: deviceKey
          in: query
          required: true
          schema:
            type: string
          description: 设备Key
        - name: language
          in: query
          schema:
            type: string
            enum: [CN, EN]
            default: CN
          description: 语言设置
      responses:
        '200':
          description: 成功获取设备资源信息
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/DeviceResource'
      components:
        schemas:
          DeviceResource:
            type: object
            properties:
              iccId:
                type: string
                description: ICCID
              phoneNum:
                type: string
                description: 电话号码
              simNum:
                type: string
                description: SIM卡号
              battery:
                type: string
                description: 电池电量
              signalStrength:
                type: string
                description: 信号强度
              version:
                type: string
                description: 固件版本
              voltage:
                type: string
                description: 电压
```

### 6. 历史数据接口

#### 查询设备数据历史
```yaml
  /v2/quecdatastorage/r1/openapi/device/data/history:
    get:
      summary: 查询设备数据历史
      description: 获取设备的历史数据记录
      security:
        - BearerAuth: []
      parameters:
        - name: productKey
          in: query
          required: true
          schema:
            type: string
          description: 产品Key
        - name: deviceKey
          in: query
          required: true
          schema:
            type: string
          description: 设备Key
        - name: language
          in: query
          schema:
            type: string
            enum: [CN, EN]
            default: CN
          description: 语言设置
        - name: pageNum
          in: query
          schema:
            type: integer
            default: 1
            minimum: 1
          description: 页码
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 10
            minimum: 1
            maximum: 100
          description: 每页大小
        - name: deviceId
          in: query
          schema:
            type: integer
          description: 设备ID（可选）
        - name: beginDateTimp
          in: query
          schema:
            type: integer
          description: 开始时间戳（毫秒）
        - name: endDateTimp
          in: query
          schema:
            type: integer
          description: 结束时间戳（毫秒）
        - name: direction
          in: query
          schema:
            type: integer
            enum: [1, 2]
          description: 数据方向 (1:上行 2:下行)
        - name: sendStatus
          in: query
          schema:
            type: integer
            enum: [-1, 0, 1]
          description: 发送状态 (-1:失败 0:未发送 1:已发送)
      responses:
        '200':
          description: 成功获取设备数据历史
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/DeviceDataHistory'
                      pageNum:
                        type: integer
                        description: 当前页码
                      pageSize:
                        type: integer
                        description: 每页大小
                      total:
                        type: integer
                        description: 总记录数
                      pages:
                        type: integer
                        description: 总页数
      components:
        schemas:
          DeviceDataHistory:
            type: object
            properties:
              id:
                type: integer
                description: 记录ID
              direction:
                type: integer
                description: 数据方向 (1:上行 2:下行)
              msgType:
                type: string
                description: 消息类型
              dataType:
                type: string
                description: 数据类型
              createTime:
                type: integer
                description: 创建时间戳
              sendTime:
                type: integer
                description: 发送时间戳
              updateTime:
                type: integer
                description: 更新时间戳
              sendStatus:
                type: integer
                description: 发送状态
              data:
                type: string
                description: 原始数据（Base64编码）
              thingModelData:
                type: string
                description: 物模型数据（JSON格式）
              dmData:
                type: string
                description: 设备管理数据
              ticket:
                type: string
                description: 请求票据
              sourceType:
                type: string
                description: 来源类型
              extData:
                type: object
                description: 扩展数据
```

#### 查询设备事件历史
```yaml
  /v2/quecdatastorage/r1/openapi/device/eventdata/history:
    get:
      summary: 查询设备事件历史
      description: 获取设备的事件历史记录
      security:
        - BearerAuth: []
      parameters:
        - name: productKey
          in: query
          required: true
          schema:
            type: string
          description: 产品Key
        - name: deviceKey
          in: query
          required: true
          schema:
            type: string
          description: 设备Key
        - name: language
          in: query
          schema:
            type: string
            enum: [CN, EN]
            default: CN
          description: 语言设置
        - name: pageNum
          in: query
          schema:
            type: integer
            default: 1
            minimum: 1
          description: 页码
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 10
            minimum: 1
            maximum: 100
          description: 每页大小
        - name: deviceId
          in: query
          schema:
            type: integer
          description: 设备ID（可选）
        - name: beginDateTimp
          in: query
          schema:
            type: integer
          description: 开始时间戳（毫秒）
        - name: endDateTimp
          in: query
          schema:
            type: integer
          description: 结束时间戳（毫秒）
        - name: eventType
          in: query
          schema:
            type: string
            enum: ['0', '1', '2', '3', '4', '5', '6']
          description: 事件类型 (0:离线 1:在线 2:重连 3:信息 4:告警 5:故障 6:复位)
      responses:
        '200':
          description: 成功获取设备事件历史
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/DeviceEventHistory'
                      pageNum:
                        type: integer
                        description: 当前页码
                      pageSize:
                        type: integer
                        description: 每页大小
                      total:
                        type: integer
                        description: 总记录数
                      pages:
                        type: integer
                        description: 总页数
      components:
        schemas:
          DeviceEventHistory:
            type: object
            properties:
              id:
                type: integer
                description: 事件ID
              eventType:
                type: string
                description: 事件类型
              eventCode:
                type: string
                description: 事件代码
              eventName:
                type: string
                description: 事件名称
              createTime:
                type: integer
                description: 事件发生时间戳
              outputData:
                type: string
                description: 输出参数
              abId:
                type: string
                description: AB ID
              packetId:
                type: string
                description: 数据包ID
              ticket:
                type: string
                description: 请求票据
              extData:
                type: object
                description: 扩展数据
```

### API 使用示例

#### 认证流程示例
```typescript
// 1. 构造认证参数
const timestamp = Date.now().toString();
const usernameParams = {
  ver: '1',
  auth_mode: 'accessKey',
  sign_method: 'sha256',
  access_key: 'your_access_key',
  timestamp: timestamp
};

// 2. 生成签名
const usernameParamsStr = Object.entries(usernameParams)
  .map(([k, v]) => `${k}=${v}`)
  .join('&');
const passwordPlain = `${usernameParamsStr}your_access_secret`;
const password = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordPlain));

// 3. 请求token
const tokenResponse = await fetch(
  `https://iot-api.acceleronix.io/v2/quecauth/accessKeyAuthrize/accessKeyLogin?grant_type=password&username=${encodeURIComponent(usernameParamsStr)}&password=${password}`
);
const tokenData = await tokenResponse.json();
const accessToken = tokenData.access_token;
```

#### 设备控制示例
```typescript
// 电源开关控制
const powerControlResponse = await fetch(
  'https://iot-api.acceleronix.io/v2/deviceshadow/r3/openapi/dm/writeData',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': accessToken
    },
    body: JSON.stringify({
      data: '[{"FAN_SWITCH":"true"}]',
      devices: ['device_key_123'],
      productKey: 'product_key_456'
    })
  }
);
```

#### 数据查询示例
```typescript
// 查询设备历史数据
const historyResponse = await fetch(
  'https://iot-api.acceleronix.io/v2/quecdatastorage/r1/openapi/device/data/history?productKey=product_key_456&deviceKey=device_key_123&pageNum=1&pageSize=10',
  {
    headers: {
      'Authorization': accessToken
    }
  }
);
```

### 错误处理

#### 常见错误代码
- **200**: 成功
- **400**: 请求参数错误
- **401**: 认证失败
- **403**: 权限不足
- **404**: 资源不存在
- **500**: 服务器内部错误

#### 错误响应格式
```json
{
  "code": 400,
  "msg": "Invalid parameter: productKey is required",
  "data": null
}
```

### 限制说明

1. **频率限制**: 每秒最多100次请求
2. **分页限制**: 单次查询最多返回500条记录
3. **数据保留**: 历史数据保留90天
4. **并发控制**: 同一设备的控制指令需要串行执行

## 结论

这个 MCP 服务器提供了完整的 IoT 设备管理功能，包括产品管理、设备控制、数据读取和历史查询。其架构清晰，功能完整，适合作为 IoT 平台的 MCP 接口实现。

在迁移过程中，重点关注:
1. 核心 API 工具函数的完整性
2. MCP 工具定义的准确性
3. 环境配置的正确性
4. 错误处理和用户体验的优化
5. **OpenAPI 规范的实现和接口对接**

通过遵循本指南和提供的 OpenAPI 规范，可以成功将功能迁移到新的 MCP 服务器项目中，并确保 API 接口的标准化和一致性。