// Test script using SSE endpoint like Claude Code
async function testSSEPaginatedProductList() {
    const url = 'https://saas-mcp-server.zlinoliver.workers.dev/sse';
    
    try {
        console.log('🚀 Testing MCP Paginated Product List via SSE...');
        
        // Test initialization
        console.log('📋 Step 1: Initialize via SSE');
        const initResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'test-client',
                        version: '1.0.0'
                    }
                }
            })
        });
        
        const initText = await initResponse.text();
        console.log('📋 Init Response Status:', initResponse.status);
        console.log('📋 Init Response:', initText);
        
        // Test tool call
        console.log('📋 Step 2: Call get_product_list_paginated via SSE');
        
        const toolResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                    name: 'get_product_list_paginated',
                    arguments: {}
                }
            })
        });
        
        const toolText = await toolResponse.text();
        console.log('📋 Tool Response Status:', toolResponse.status);
        console.log('📋 Tool Response:', toolText);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testSSEPaginatedProductList();