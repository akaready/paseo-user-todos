import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";

/**
 * Whether a permission request is for one of this plugin's own tools, by exact name and server, and
 * for nothing else. Tools of ours reach the model through Paseo's own MCP server, called "paseo".
 * Claude names the tool `mcp__paseo__<tool>`; Codex asks an MCP approval for server "paseo" whose
 * text names the tool. Anything else, from any provider, is left to the user.
 */
export function isOwnToolRequest(request: AgentPermissionRequest, tools: ReadonlySet<string>): boolean {
  if (request.kind !== "tool") return false;
  if (request.provider === "claude") {
    return request.name.startsWith("mcp__paseo__") && tools.has(request.name.slice("mcp__paseo__".length));
  }
  if (request.provider === "codex") {
    return (
      request.name === "CodexMcpElicitation" &&
      request.metadata?.serverName === "paseo" &&
      [...tools].some((tool) => request.description === `Allow the paseo MCP server to run tool "${tool}"?`)
    );
  }
  return false;
}
