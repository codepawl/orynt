#!/usr/bin/env bun
import { 
  StateGraph, 
  TraceLedger, 
  AgentState, 
  AgentMessage, 
  LocalSessionMemoryStore, 
  LocalSemanticMemoryStore,
  MemoryManager
} from "@codepawl/core";

// Print logo and welcome
const showBanner = () => {
  console.log(`
   ___                       ___                  _ 
  / _ \\ _ __   ___ _ __     / _ \\__ ___      _| |
 | | | | '_ \\ / _ \\ '_ \\   / /_)/ _\` \\ \\ /\\ / / |
 | |_| | |_) |  __/ | | | / ___/ (_| |\\ V  V /| |
  \\___/| .__/ \\___|_| |_| \\/    \\__,_| \\_/\\_/ |_|
       |_|                                          
  CodePawl Server-Side Coding-Agent Ecosystem CLI
  `);
};

const showHelp = () => {
  showBanner();
  console.log(`Usage: codepawl [command] [options]

Commands:
  run <query>       Execute an agent workflow with a user prompt
  test-memory       Verify short-term and long-term memory operations
  help, -h, --help  Display this help menu
  -v, --version     Display version info

Examples:
  bun dev:cli run "Refactor utility functions in shared package"
  bun dev:cli test-memory
`);
};

// Define a sample LangGraph agent workflow for demonstration
async function executeAgentWorkflow(query: string) {
  console.log(`\n🤖 Launching Openpawl agent loop for query: "${query}"...\n`);
  
  const ledger = new TraceLedger(`trace_${Date.now()}`);
  const graph = new StateGraph();

  // Define Nodes
  graph.addNode("planner", async (state) => {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `[Planner Node] Creating plan for query: "${state.query}"`,
      timestamp: new Date().toISOString(),
    };
    
    // Simulate thinking/planning
    return {
      messages: [message],
      nextNode: "executor",
    };
  });

  graph.addNode("executor", async (state) => {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `[Executor Node] Simulating task execution for: "${state.query}"`,
      timestamp: new Date().toISOString(),
    };
    
    // Add token usage trace in ledger
    ledger.addTokenUsage(150, 80);
    
    return {
      messages: [message],
      // We'll let a conditional router decide what to do next
    };
  });

  graph.addNode("reporter", async (state) => {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `[Reporter Node] Task complete! Successfully executed workflow for query: "${state.query}"`,
      timestamp: new Date().toISOString(),
    };
    
    return {
      messages: [message],
      isComplete: true,
    };
  });

  // Define edges & conditional router
  graph.addEdge("planner", "executor");
  
  // Router from executor: if query contains "error", route to complete with error, else reporter
  graph.addConditionalEdge(
    "executor",
    (state: AgentState) => {
      if (state.query.toLowerCase().includes("error")) {
        return "fail";
      }
      return "success";
    },
    {
      success: "reporter",
      fail: "reporter", // Or we could route to a failure node, for now report the error
    }
  );

  graph.setEntryPoint("planner");

  const initialState = {
    query,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: query,
        timestamp: new Date().toISOString(),
      },
    ],
    context: {
      sessionId: `session_${Date.now()}`,
      maxIterations: 5,
      temperature: 0.2,
    },
  };

  try {
    const finalState = await graph.compileAndRun(initialState, ledger);
    
    console.log("--------------------------------------------------");
    console.log("✨ Execution State Summary:");
    console.log(`Status:   ${finalState.error ? "❌ FAILED" : "✅ SUCCESS"}`);
    console.log(`Steps Run: ${finalState.steps.length}`);
    if (finalState.error) {
      console.log(`Error:    ${finalState.error}`);
    }
    console.log("--------------------------------------------------");
    console.log("\n📜 Messages History:");
    finalState.messages.forEach(msg => {
      console.log(`[${msg.role.toUpperCase()}] ${msg.content}`);
    });
    
    console.log("\n📊 Trace Ledger Logs:");
    console.log(ledger.formatLog());
    
  } catch (err: unknown) {
    console.error("Fatal error running workflow:", err);
  }
}

// Memory verification command
async function testMemory() {
  console.log("🧠 Testing short-term and long-term memory operations...\n");
  
  const manager = new MemoryManager(
    new LocalSessionMemoryStore(),
    new LocalSemanticMemoryStore()
  );

  const sessionId = "session_test_123";
  console.log("1. Writing session state memory...");
  await manager.getSessions().set(sessionId, { currentFile: "index.ts", line: 42 });
  const sessionData = await manager.getSessions().get(sessionId);
  console.log("Read session data:", sessionData);

  console.log("\n2. Writing long-term semantic memory documents...");
  await manager.getSemanticStore().save({
    id: "doc_1",
    content: "Openpawl is an open-source framework for autonomous developer agents.",
    metadata: { tags: ["agent", "open-source"] },
    timestamp: new Date().toISOString()
  });
  await manager.getSemanticStore().save({
    id: "doc_2",
    content: "Trace ledger is used to record steps and audit token usage in agents.",
    metadata: { tags: ["trace", "audit"] },
    timestamp: new Date().toISOString()
  });

  console.log("Querying semantic memory for 'agent':");
  const queryResult1 = await manager.getSemanticStore().query("agent");
  console.log(JSON.stringify(queryResult1, null, 2));

  console.log("\nQuerying semantic memory for 'token usage':");
  const queryResult2 = await manager.getSemanticStore().query("token usage");
  console.log(JSON.stringify(queryResult2, null, 2));
  
  console.log("\nMemory test completed successfully!");
}

// Main execution CLI router
const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "-h" || command === "--help") {
    showHelp();
    return;
  }

  if (command === "-v" || command === "--version") {
    console.log("codepawl-cli v0.1.0 (Openpawl direction)");
    return;
  }

  if (command === "run") {
    const query = args.slice(1).join(" ");
    if (!query) {
      console.error("Error: Please provide a query to run. e.g. run 'Fix bug'");
      process.exit(1);
    }
    await executeAgentWorkflow(query);
    return;
  }

  if (command === "test-memory") {
    await testMemory();
    return;
  }

  console.error(`Unknown command: "${command}". Run "codepawl --help" for usage.`);
  process.exit(1);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
