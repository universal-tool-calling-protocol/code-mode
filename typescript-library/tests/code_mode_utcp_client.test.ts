/**
 * Tests for CodeModeUtcpClient
 * This validates the code mode functionality using direct-call tools
 */

import { CodeModeUtcpClient } from '../src/index';
import { addFunctionToUtcpDirectCall } from '@utcp/direct-call';

// Test utility functions
const testResults: Record<string, any> = {};

// Setup test tools using direct-call
beforeAll(async () => {
  // Register test functions as direct-call tools
  
  // Simple math function
  addFunctionToUtcpDirectCall('add', async (a: number, b: number) => {
    testResults.addCalled = { a, b, timestamp: Date.now() };
    return { result: a + b, operation: 'addition' };
  });

  // String manipulation function
  addFunctionToUtcpDirectCall('greet', async (name: string, formal: boolean = false) => {
    testResults.greetCalled = { name, formal, timestamp: Date.now() };
    const greeting = formal ? `Good day, ${name}` : `Hey ${name}!`;
    return { greeting, isFormal: formal };
  });

  // Complex object handling function
  addFunctionToUtcpDirectCall('processData', async (data: any, options: any = {}) => {
    testResults.processDataCalled = { data, options, timestamp: Date.now() };
    return {
      processedData: {
        ...data,
        processed: true,
        processedAt: new Date().toISOString(),
        options
      },
      metadata: {
        itemCount: Array.isArray(data) ? data.length : 1,
        hasOptions: Object.keys(options).length > 0
      }
    };
  });

  // Function that throws an error
  addFunctionToUtcpDirectCall('throwError', async (message: string) => {
    testResults.throwErrorCalled = { message, timestamp: Date.now() };
    throw new Error(message);
  });

  // Function with no parameters
  addFunctionToUtcpDirectCall('getCurrentTime', async () => {
    testResults.getCurrentTimeCalled = { timestamp: Date.now() };
    return { 
      timestamp: Date.now(),
      iso: new Date().toISOString()
    };
  });

  // Array processing function
  addFunctionToUtcpDirectCall('sumArray', async (numbers: number[]) => {
    testResults.sumArrayCalled = { numbers, timestamp: Date.now() };
    return {
      sum: numbers.reduce((a, b) => a + b, 0),
      count: numbers.length,
      average: numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0
    };
  });
});

describe('CodeModeUtcpClient', () => {
  let client: CodeModeUtcpClient;

  beforeAll(async () => {
    // Create client
    client = await CodeModeUtcpClient.create();

    // First register the manual provider function
    addFunctionToUtcpDirectCall('getTestManual', async () => {
      return {
        utcp_version: '1.0.0',
        manual_version: '1.0.0',
        tools: [
          {
            name: 'add',
            description: 'Adds two numbers together',
            inputs: {
              type: 'object',
              properties: {
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' }
              },
              required: ['a', 'b']
            },
            outputs: {
              type: 'object',
              properties: {
                result: { type: 'number', description: 'Sum of the numbers' },
                operation: { type: 'string', description: 'Type of operation' }
              },
              required: ['result', 'operation']
            },
            tags: ['math', 'arithmetic'],
            tool_call_template: {
              call_template_type: 'direct-call',
              callable_name: 'add'
            }
          },
          {
            name: 'greet',
            description: 'Generates a greeting message',
            inputs: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name to greet' },
                formal: { type: 'boolean', description: 'Whether to use formal greeting', default: false }
              },
              required: ['name']
            },
            outputs: {
              type: 'object',
              properties: {
                greeting: { type: 'string', description: 'The greeting message' },
                isFormal: { type: 'boolean', description: 'Whether the greeting was formal' }
              },
              required: ['greeting', 'isFormal']
            },
            tags: ['text', 'greeting'],
            tool_call_template: {
              call_template_type: 'direct-call',
              callable_name: 'greet'
            }
          },
          {
            name: 'processData',
            description: 'Processes data with optional configuration',
            inputs: {
              type: 'object',
              properties: {
                data: { description: 'Data to process' },
                options: { type: 'object', description: 'Processing options', default: {} }
              },
              required: ['data']
            },
            outputs: {
              type: 'object',
              properties: {
                processedData: { description: 'The processed data' },
                metadata: { type: 'object', description: 'Processing metadata' }
              },
              required: ['processedData', 'metadata']
            },
            tags: ['processing', 'data'],
            tool_call_template: {
              call_template_type: 'direct-call',
              callable_name: 'processData'
            }
          },
          {
            name: 'throwError',
            description: 'Throws an error for testing error handling',
            inputs: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Error message' }
              },
              required: ['message']
            },
            outputs: {
              type: 'object',
              properties: {}
            },
            tags: ['testing', 'error'],
            tool_call_template: {
              call_template_type: 'direct-call',
              callable_name: 'throwError'
            }
          },
          {
            name: 'getCurrentTime',
            description: 'Gets the current timestamp',
            inputs: {
              type: 'object',
              properties: {},
              required: []
            },
            outputs: {
              type: 'object',
              properties: {
                timestamp: { type: 'number', description: 'Unix timestamp' },
                iso: { type: 'string', description: 'ISO date string' }
              },
              required: ['timestamp', 'iso']
            },
            tags: ['time', 'utility'],
            tool_call_template: {
              call_template_type: 'direct-call',
              callable_name: 'getCurrentTime'
            }
          },
          {
            name: 'sumArray',
            description: 'Calculates sum and statistics of a number array',
            inputs: {
              type: 'object',
              properties: {
                numbers: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'Array of numbers to sum'
                }
              },
              required: ['numbers']
            },
            outputs: {
              type: 'object',
              properties: {
                sum: { type: 'number', description: 'Sum of all numbers' },
                count: { type: 'number', description: 'Count of numbers' },
                average: { type: 'number', description: 'Average of numbers' }
              },
              required: ['sum', 'count', 'average']
            },
            tags: ['math', 'array', 'statistics'],
            tool_call_template: {
              call_template_type: 'direct-call',
              callable_name: 'sumArray'
            }
          }
        ]
      };
    });

    // Now register the manual that uses the getTestManual function
    try {
      const result = await client.registerManual({
        name: 'test_tools',
        call_template_type: 'direct-call',
        callable_name: 'getTestManual'
      });
      
      if (!result.success) {
        console.error('Manual registration failed:', result.errors);
        throw new Error(`Manual registration failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      console.error('Manual registration error:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  test('should create CodeModeUtcpClient instance', async () => {
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(CodeModeUtcpClient);
  });

  test('should have registered tools', async () => {
    const tools = await client.getTools();
    expect(tools.length).toBeGreaterThan(0);
    
    const toolNames = tools.map((t: any) => t.name.split('.').pop());
    expect(toolNames).toContain('add');
    expect(toolNames).toContain('greet');
    expect(toolNames).toContain('processData');
  });

  test('should convert tool to TypeScript interface', async () => {
    const tools = await client.getTools();
    const addTool = tools.find((t: any) => t.name.endsWith('.add'));
    expect(addTool).toBeDefined();

    const tsInterface = client.toolToTypeScriptInterface(addTool!);
    expect(tsInterface).toContain('namespace test_tools');
    expect(tsInterface).toContain('interface addInput');
    expect(tsInterface).toContain('interface addOutput');
    expect(tsInterface).toContain('a: number');
    expect(tsInterface).toContain('b: number');
    expect(tsInterface).toContain('result: number');
    expect(tsInterface).toContain('operation: string');
    expect(tsInterface).toContain('Access as: test_tools.add(args)');
  });

  test('should generate all tools TypeScript interfaces', async () => {
    const interfaces = await client.getAllToolsTypeScriptInterfaces();
    expect(interfaces).toContain('// Auto-generated TypeScript interfaces for UTCP tools');
    expect(interfaces).toContain('namespace test_tools');
    expect(interfaces).toContain('interface addInput');
    expect(interfaces).toContain('interface greetInput');
    expect(interfaces).toContain('interface processDataInput');
  });

  test('should execute simple code with basic operations', async () => {
    const code = `
      const x = 5;
      const y = 10;
      return x + y;
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result).toBe(15);
  });

  test('should execute code that calls a simple tool', async () => {
    // Clear previous call records
    delete testResults.addCalled;
    
    const code = `
      const result = test_tools.add({ a: 15, b: 25 });
      return result;
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.result).toBe(40);
    expect(result.operation).toBe('addition');
    
    // Verify the tool was called with correct parameters
    expect(testResults.addCalled).toBeDefined();
    expect(testResults.addCalled.a).toBe(15);
    expect(testResults.addCalled.b).toBe(25);
  });

  test('should execute code with multiple tool calls', async () => {
    // Clear previous call records
    delete testResults.addCalled;
    delete testResults.greetCalled;
    
    const code = `
      const mathResult = test_tools.add({ a: 10, b: 5 });
      const greetResult = test_tools.greet({ name: "Alice", formal: true });
      
      return {
        math: mathResult,
        greeting: greetResult,
        combined: \`\${greetResult.greeting} The sum is \${mathResult.result}\`
      };
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.math.result).toBe(15);
    expect(result.greeting.greeting).toBe("Good day, Alice");
    expect(result.greeting.isFormal).toBe(true);
    expect(result.combined).toBe("Good day, Alice The sum is 15");
    
    // Verify both tools were called
    expect(testResults.addCalled).toBeDefined();
    expect(testResults.greetCalled).toBeDefined();
  });

  test('should handle complex data structures', async () => {
    delete testResults.processDataCalled;
    
    const code = `
      const complexData = {
        users: [
          { name: "John", age: 30 },
          { name: "Jane", age: 25 }
        ],
        settings: { theme: "dark", notifications: true }
      };
      
      const result = test_tools.processData({ 
        data: complexData, 
        options: { validate: true, transform: "uppercase" } 
      });
      
      return result;
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.processedData.processed).toBe(true);
    expect(result.processedData.users).toBeDefined();
    expect(result.metadata.itemCount).toBe(1);
    expect(result.metadata.hasOptions).toBe(true);
    
    // Verify the tool was called with the complex data
    expect(testResults.processDataCalled).toBeDefined();
    expect(testResults.processDataCalled.data.users.length).toBe(2);
    expect(testResults.processDataCalled.options.validate).toBe(true);
  });

  test('should handle arrays and array processing tools', async () => {
    delete testResults.sumArrayCalled;
    
    const code = `
      const numbers = [1, 2, 3, 4, 5, 10];
      const stats = test_tools.sumArray({ numbers });
      
      return {
        original: numbers,
        statistics: stats,
        doubled: numbers.map(n => n * 2)
      };
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.statistics.sum).toBe(25);
    expect(result.statistics.count).toBe(6);
    expect(result.statistics.average).toBe(25/6);
    expect(result.doubled).toEqual([2, 4, 6, 8, 10, 20]);
    
    // Verify the tool was called correctly
    expect(testResults.sumArrayCalled).toBeDefined();
    expect(testResults.sumArrayCalled.numbers).toEqual([1, 2, 3, 4, 5, 10]);
  });

  test('should handle tool calls with no parameters', async () => {
    delete testResults.getCurrentTimeCalled;
    
    const code = `
      const timeResult = test_tools.getCurrentTime({});
      return {
        timeData: timeResult,
        isRecent: timeResult.timestamp > Date.now() - 5000
      };
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.timeData.timestamp).toBeDefined();
    expect(result.timeData.iso).toBeDefined();
    expect(result.isRecent).toBe(true);
    
    // Verify the tool was called
    expect(testResults.getCurrentTimeCalled).toBeDefined();
  });

  test('should handle tool errors correctly', async () => {
    const code = `
      try {
        test_tools.throwError({ message: "Test error message" });
        return { error: false };
      } catch (error) {
        return { 
          error: true, 
          message: error.message,
          caught: true
        };
      }
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.error).toBe(true);
    expect(result.caught).toBe(true);
    expect(result.message).toContain("Test error message");
  });

  test('should handle code execution timeout', async () => {
    const code = `
      // Infinite loop to test timeout
      while (true) {
        // isolated-vm will timeout this
      }
      return { completed: true };
    `;
    
    const result = await client.callToolChain(code, 1000);
    expect(result.result).toBeNull();
    expect(result.logs.some((log: string) => log.includes('Code execution failed'))).toBe(true);
  });

  test('should handle code syntax errors', async () => {
    const invalidCode = `
      const invalid syntax here
      return result;
    `;
    
    const result = await client.callToolChain(invalidCode);
    expect(result.result).toBeNull();
    expect(result.logs.some((log: string) => log.includes('Code execution failed'))).toBe(true);
  });

  test('should have access to basic JavaScript globals', async () => {
    const code = `
      return {
        mathPi: Math.PI,
        dateNow: Date.now(),
        arrayMethods: Array.isArray([1, 2, 3]),
        jsonStringify: JSON.stringify({ test: true }),
        objectKeys: Object.keys({ a: 1, b: 2 })
      };
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.mathPi).toBe(Math.PI);
    expect(typeof result.dateNow).toBe('number');
    expect(result.arrayMethods).toBe(true);
    expect(result.jsonStringify).toBe('{"test":true}');
    expect(result.objectKeys).toEqual(['a', 'b']);
  });

  test('should have access to TypeScript interfaces in execution context', async () => {
    const code = `
      return {
        hasInterfaces: typeof __interfaces === 'string',
        interfacesContainNamespace: __interfaces.includes('namespace test_tools'),
        canGetSpecificInterface: typeof __getToolInterface === 'function',
        addToolInterface: __getToolInterface('test_tools.add'),
        interfaceIsString: typeof __getToolInterface('test_tools.add') === 'string'
      };
    `;
    
    const { result } = await client.callToolChain(code);
    expect(result.hasInterfaces).toBe(true);
    expect(result.interfacesContainNamespace).toBe(true);
    expect(result.canGetSpecificInterface).toBe(true);
    expect(result.addToolInterface).toBeTruthy();
    expect(result.interfaceIsString).toBe(true);
  });

  test('should execute complex chained operations', async () => {
    // Clear call records
    Object.keys(testResults).forEach(key => delete testResults[key]);
    
    const code = `
      // Step 1: Get some numbers and process them
      const numbers = [5, 10, 15, 20];
      const arrayStats = test_tools.sumArray({ numbers });
      
      // Step 2: Use the sum in another calculation
      const addResult = test_tools.add({ a: arrayStats.sum, b: 100 });
      
      // Step 3: Create a greeting with the result
      const greeting = test_tools.greet({ name: "CodeMode", formal: false });
      
      // Step 4: Process all the data together
      const finalData = test_tools.processData({
        data: {
          arrayStats,
          addResult,
          greeting,
          executionTime: Date.now()
        },
        options: {
          includeMetadata: true,
          format: "enhanced"
        }
      });
      
      return {
        steps: {
          arrayProcessing: arrayStats,
          addition: addResult,
          greeting: greeting,
          finalProcessing: finalData
        },
        summary: {
          originalSum: arrayStats.sum,
          finalSum: addResult.result,
          greetingMessage: greeting.greeting,
          chainCompleted: true
        }
      };
    `;
    
    const result = await client.callToolChain(code, 15000);
    
    // Verify the chain worked correctly
    expect(result.result.steps.arrayProcessing.sum).toBe(50);
    expect(result.result.steps.addition.result).toBe(150);
    expect(result.result.steps.greeting.greeting).toBe("Hey CodeMode!");
    expect(result.result.steps.finalProcessing.processedData.processed).toBe(true);
    expect(result.result.summary.chainCompleted).toBe(true);
    
    // Verify all tools were called in the correct order
    expect(testResults.sumArrayCalled).toBeDefined();
    expect(testResults.addCalled).toBeDefined();
    expect(testResults.greetCalled).toBeDefined();
    expect(testResults.processDataCalled).toBeDefined();
    
    // Verify the parameters were passed correctly through the chain
    expect(testResults.addCalled.a).toBe(50); // Sum from array
    expect(testResults.addCalled.b).toBe(100);
    expect(testResults.greetCalled.name).toBe("CodeMode");
    expect(testResults.greetCalled.formal).toBe(false);
  });

  test('should return value from explicit async IIFE (issue #33)', async () => {
    // Regression test: user writes an async IIFE without an explicit outer 'return'.
    // The returned Promise used to be serialised as {} before the fix.
    const code = `
      (async () => {
        const result = test_tools.add({ a: 7, b: 8 });
        return result;
      })()
    `;

    const { result } = await client.callToolChain(code);
    expect(result).toBeDefined();
    expect(result.result).toBe(15);
    expect(result.operation).toBe('addition');
  });

  test('should support top-level await syntax (issue #33)', async () => {
    // Top-level await works because the wrapper is now an async function.
    const code = `
      const result = test_tools.add({ a: 3, b: 4 });
      const doubled = test_tools.add({ a: result.result, b: result.result });
      return doubled;
    `;

    const { result } = await client.callToolChain(code);
    expect(result.result).toBe(14);
  });

  test('should return value from async IIFE alongside console output (issue #33)', async () => {
    const code = `
      (async () => {
        console.log('inside async iife');
        const result = test_tools.add({ a: 100, b: 200 });
        return result;
      })()
    `;

    const { result, logs } = await client.callToolChain(code);
    expect(result.result).toBe(300);
    expect(logs).toContain('inside async iife');
  });

  test('should provide agent prompt template', () => {
    const promptTemplate = CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE;
    
    expect(typeof promptTemplate).toBe('string');
    expect(promptTemplate.length).toBeGreaterThan(0);
    expect(promptTemplate).toContain('Tool Discovery Phase');
    expect(promptTemplate).toContain('Interface Introspection');
    expect(promptTemplate).toContain('Code Execution Guidelines');
    expect(promptTemplate).toContain('await manual.tool');
    expect(promptTemplate).toContain('__interfaces');
    expect(promptTemplate).toContain('__getToolInterface');
    expect(promptTemplate).toContain('Discover first, code second');
  });

  test('should capture console.log output with callToolChain', async () => {
    const code = `
      console.log('First log message');
      console.log('Number:', 42);
      console.log('Object:', { name: 'test', value: 123 });
      
      const addResult = test_tools.add({ a: 10, b: 20 });
      console.log('Addition result:', addResult);
      
      return addResult.result;
    `;
    
    const { result, logs } = await client.callToolChain(code);
    
    expect(result).toBe(30);
    expect(logs).toHaveLength(4);
    expect(logs[0]).toBe('First log message');
    expect(logs[1]).toBe('Number: 42');
    expect(logs[2]).toContain('"name": "test"');
    expect(logs[2]).toContain('"value": 123');
    expect(logs[3]).toContain('Addition result:');
    expect(logs[3]).toContain('"result": 30');
  });

  test('should capture console error and warn with callToolChain', async () => {
    const code = `
      console.log('Regular log');
      console.error('This is an error');
      console.warn('This is a warning');
      console.info('This is info');
      
      return 'done';
    `;
    
    const { result, logs } = await client.callToolChain(code);
    
    expect(result).toBe('done');
    expect(logs).toHaveLength(4);
    expect(logs[0]).toBe('Regular log');
    expect(logs[1]).toBe('[ERROR] This is an error');
    expect(logs[2]).toBe('[WARN] This is a warning');
    expect(logs[3]).toBe('[INFO] This is info');
  });
});

// Export for potential manual testing
export { testResults };
