import { AgentState, AgentNode, AgentEdgeRouter, AgentStep } from "../state/schema";
import { TraceLedger } from "../ledger/trace";

/**
 * A graph-based workflow engine for LangGraph-style agent orchestration.
 */
export class StateGraph {
  private readonly nodes = new Map<string, AgentNode>();
  private readonly edges = new Map<string, string>(); // sourceNode -> targetNode
  private readonly conditionalEdges = new Map<
    string,
    { router: AgentEdgeRouter; mapping: Record<string, string> }
  >();
  private entryPoint: string | null = null;

  /**
   * Registers a new node (state processor) in the graph.
   */
  public addNode(name: string, node: AgentNode): this {
    if (this.nodes.has(name)) {
      throw new Error(`Node with name "${name}" already exists.`);
    }
    this.nodes.set(name, node);
    return this;
  }

  /**
   * Registers a direct transition edge between two nodes.
   */
  public addEdge(source: string, target: string): this {
    this.edges.set(source, target);
    return this;
  }

  /**
   * Registers a conditional router edge from a source node.
   */
  public addConditionalEdge(
    source: string,
    router: AgentEdgeRouter,
    mapping: Record<string, string>
  ): this {
    this.conditionalEdges.set(source, { router, mapping });
    return this;
  }

  /**
   * Sets the entry point node where execution starts.
   */
  public setEntryPoint(name: string): this {
    this.entryPoint = name;
    return this;
  }

  /**
   * Runs the graph workflow starting from initial state, logging steps in the trace ledger.
   */
  public async compileAndRun(
    initialState: Omit<AgentState, "nextNode" | "isComplete" | "error" | "steps">,
    ledger: TraceLedger
  ): Promise<AgentState> {
    if (!this.entryPoint) {
      throw new Error("Entry point node is not set. Call setEntryPoint() first.");
    }

    let state: AgentState = {
      ...initialState,
      steps: [],
      nextNode: this.entryPoint,
      isComplete: false,
      error: null,
    };

    ledger.start();
    ledger.recordEvent("system", "workflow_init", "info", {
      entryPoint: this.entryPoint,
      query: state.query,
    });

    let iterations = 0;
    const maxIterations = state.context.maxIterations;

    while (!state.isComplete && state.nextNode && !state.error) {
      if (iterations >= maxIterations) {
        const errMsg = `Execution aborted: Max iterations (${maxIterations}) reached.`;
        state = { ...state, isComplete: true, error: errMsg, nextNode: null };
        ledger.recordEvent("system", "max_iterations_exceeded", "error", { iterations });
        break;
      }

      const currentNodeName = state.nextNode;
      const node = this.nodes.get(currentNodeName);
      if (!node) {
        const errMsg = `Node "${currentNodeName}" not found in graph nodes registry.`;
        state = { ...state, isComplete: true, error: errMsg, nextNode: null };
        ledger.recordEvent("system", "missing_node", "error", { nodeName: currentNodeName });
        break;
      }

      ledger.recordEvent("node_start", currentNodeName, "info", {
        iteration: iterations + 1,
      });

      const startTime = Date.now();
      let nodeUpdate: Partial<AgentState> = {};
      try {
        nodeUpdate = await node(state);
      } catch (err: unknown) {
        const nodeError = err instanceof Error ? err.message : String(err);
        state = {
          ...state,
          error: `Error in node "${currentNodeName}": ${nodeError}`,
          isComplete: true,
          nextNode: null,
        };
        ledger.recordEvent("system", "node_execution_failed", "error", {
          nodeName: currentNodeName,
          error: nodeError,
        });
        break;
      }
      const durationMs = Date.now() - startTime;

      // Update state with node results
      const newMessages = nodeUpdate.messages 
        ? [...state.messages, ...nodeUpdate.messages.filter(nm => !state.messages.some(sm => sm.id === nm.id))]
        : state.messages;

      const stepRecord: AgentStep = {
        id: crypto.randomUUID(),
        nodeName: currentNodeName,
        action: nodeUpdate.error ? "failed" : "completed",
        input: { query: state.query, currentNextNode: state.nextNode },
        output: nodeUpdate,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      state = {
        ...state,
        ...nodeUpdate,
        messages: newMessages,
        steps: [...state.steps, stepRecord],
      };

      ledger.addStep(stepRecord);

      // Determine next node transition
      let nextNode: string | null = null;

      // 1. Check direct transition edge
      if (this.edges.has(currentNodeName)) {
        nextNode = this.edges.get(currentNodeName)!;
      }
      // 2. Check conditional edge
      else if (this.conditionalEdges.has(currentNodeName)) {
        const cond = this.conditionalEdges.get(currentNodeName)!;
        let routeResult: string;
        try {
          routeResult = await cond.router(state);
        } catch (err: unknown) {
          const routerError = err instanceof Error ? err.message : String(err);
          state = {
            ...state,
            error: `Error in conditional router at node "${currentNodeName}": ${routerError}`,
            isComplete: true,
            nextNode: null,
          };
          ledger.recordEvent("system", "router_execution_failed", "error", {
            nodeName: currentNodeName,
            error: routerError,
          });
          break;
        }

        nextNode = cond.mapping[routeResult] ?? null;
        if (!nextNode) {
          state = {
            ...state,
            error: `Router result "${routeResult}" at node "${currentNodeName}" mapped to a missing destination.`,
            isComplete: true,
            nextNode: null,
          };
          ledger.recordEvent("system", "invalid_route_mapping", "error", {
            nodeName: currentNodeName,
            routeResult,
          });
          break;
        }
      }

      state = {
        ...state,
        nextNode,
        isComplete: nextNode === null || state.isComplete,
      };

      iterations++;
    }

    ledger.end();
    ledger.recordEvent("system", "workflow_complete", "info", {
      isComplete: state.isComplete,
      error: state.error,
      totalSteps: state.steps.length,
    });

    return state;
  }
}
