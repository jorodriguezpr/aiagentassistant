/**
 * AI Agent Assistant (AiAgentAssistant)
 * CLI Formatter - Pretty terminal output for aitalk
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

/**
 * CLI Formatter - Pretty terminal output for aitalk
 */

export class CliFormatter {
  // ANSI color codes
  static readonly RESET = '\x1b[0m';
  static readonly BRIGHT = '\x1b[1m';
  static readonly DIM = '\x1b[2m';

  static readonly RED = '\x1b[31m';
  static readonly GREEN = '\x1b[32m';
  static readonly YELLOW = '\x1b[33m';
  static readonly BLUE = '\x1b[34m';
  static readonly MAGENTA = '\x1b[35m';
  static readonly CYAN = '\x1b[36m';

  static readonly BG_BLUE = '\x1b[44m';
  static readonly BG_GREEN = '\x1b[42m';

  /**
   * Print welcome banner
   */
  static printWelcome(): void {
    console.clear();
    console.log(this.CYAN + this.BRIGHT);
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║          🤖 AiTalk - AI Console Chat Tool 🤖          ║');
    console.log('║              Multi-Agent Orchestration System         ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(this.RESET);
    console.log();
    console.log(this.BRIGHT + '💡 Commands:' + this.RESET);
    console.log('  ' + this.CYAN + '/help' + this.RESET + '     - Show help menu');
    console.log('  ' + this.CYAN + '/status' + this.RESET + '   - Show system status');
    console.log('  ' + this.CYAN + '/task' + this.RESET + '     - Task management');
    console.log('  ' + this.CYAN + '/scheduled' + this.RESET + ' - Scheduled tasks');
    console.log('  ' + this.CYAN + '/clear' + this.RESET + '    - Clear conversation');
    console.log('  ' + this.CYAN + '/status' + this.RESET + '   - Show system status');
    console.log('  ' + this.CYAN + '/exit' + this.RESET + '     - Exit the program');
    console.log();
    console.log(this.DIM + 'Type a message or command to start...' + this.RESET);
    console.log();
  }

  /**
   * Print system status
   */
  static printStatus(data: {
    provider: string;
    model: string;
    messageCount: number;
    toolCalls: number;
  }): void {
    console.log();
    console.log(this.BRIGHT + this.BLUE + '📊 System Status' + this.RESET);
    console.log('├─ Provider: ' + this.CYAN + data.provider + this.RESET);
    console.log('├─ Model: ' + this.CYAN + data.model + this.RESET);
    console.log('├─ Messages: ' + this.CYAN + data.messageCount + this.RESET);
    console.log('└─ Tool Calls: ' + this.CYAN + data.toolCalls + this.RESET);
    console.log();
  }

  /**
   * Print user message
   */
  static printUserMessage(text: string): void {
    console.log(this.BRIGHT + this.GREEN + '👤 You:' + this.RESET);
    console.log(text);
    console.log();
  }

  /**
   * Print AI response
   */
  static printAiResponse(text: string): void {
    console.log(this.BRIGHT + this.BLUE + '🤖 AI:' + this.RESET);
    console.log(text);
    console.log();
  }

  /**
   * Print thinking indicator
   */
  static printThinking(): void {
    process.stdout.write(this.DIM + this.YELLOW + '⏳ Thinking' + this.RESET);
  }

  /**
   * Print tool execution
   */
  static printToolExecution(toolName: string, args: any): void {
    console.log(this.BRIGHT + this.MAGENTA + '🔧 Tool: ' + toolName + this.RESET);
    console.log(this.DIM + JSON.stringify(args, null, 2) + this.RESET);
  }

  /**
   * Print tool result
   */
  static printToolResult(toolName: string, result: any): void {
    console.log(this.GREEN + '✅ ' + toolName + ' completed' + this.RESET);
    if (typeof result === 'string' && result.length < 200) {
      console.log(this.DIM + result + this.RESET);
    } else if (typeof result === 'object') {
      console.log(this.DIM + JSON.stringify(result, null, 2).substring(0, 500) + this.RESET);
    }
    console.log();
  }

  /**
   * Print error
   */
  static printError(message: string): void {
    console.log();
    console.log(this.RED + this.BRIGHT + '❌ Error: ' + this.RESET + message);
    console.log();
  }

  /**
   * Print help menu
   */
  static printHelp(): void {
    console.log();
    console.log(this.BRIGHT + this.CYAN + '📖 Help Menu' + this.RESET);
    console.log();
    console.log(this.BRIGHT + 'Commands:' + this.RESET);
    console.log('  /help       - Show this help menu');
    console.log('  /status     - Show system and session status');
    console.log('  /task       - Show task management info');
    console.log('  /scheduled  - List all scheduled/recurring tasks');
    console.log('  /clear      - Clear conversation history');
    console.log('  /exit       - Exit the program');
    console.log();
    console.log(this.BRIGHT + 'Usage:' + this.RESET);
    console.log('  Just type your message and press Enter');
    console.log('  AI will respond with answers or execute tools');
    console.log('  Tools can: think, execute commands, dispatch tasks');
    console.log();
    console.log(this.BRIGHT + 'Examples:' + this.RESET);
    console.log('  - "Who is your developer?"');
    console.log('  - "Install curl and wget"');
    console.log('  - "What is the system memory?"');
    console.log('  - "Execute a task for me"');
    console.log();
  }

  /**
   * Print prompt
   */
  static printPrompt(): void {
    process.stdout.write(this.BRIGHT + this.GREEN + '> ' + this.RESET);
  }

  /**
   * Print conversation cleared message
   */
  static printCleared(): void {
    console.log();
    console.log(this.GREEN + '✅ Conversation history cleared' + this.RESET);
    console.log();
  }

  /**
   * Print exit message
   */
  static printExit(): void {
    console.log();
    console.log(this.CYAN + this.BRIGHT + '👋 Thanks for using AiTalk!' + this.RESET);
    console.log();
  }

  /**
   * Print warning
   */
  static printWarning(message: string): void {
    console.log();
    console.log(this.YELLOW + this.BRIGHT + '⚠️  Warning: ' + this.RESET + message);
    console.log();
  }

  /**
   * Print info
   */
  static printInfo(message: string): void {
    console.log();
    console.log(this.CYAN + 'ℹ️  ' + message + this.RESET);
    console.log();
  }

  /**
   * Print separator
   */
  static printSeparator(): void {
    console.log(this.DIM + '─'.repeat(60) + this.RESET);
  }

  /**
   * Animate dots for thinking
   */
  static async animateThinking(durationMs: number = 3000): Promise<void> {
    const startTime = Date.now();
    let dots = 0;

    while (Date.now() - startTime < durationMs) {
      process.stdout.write('.');
      dots++;
      if (dots > 3) {
        process.stdout.write('\b\b\b   \b\b\b');
        dots = 0;
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    process.stdout.write('\r' + ' '.repeat(20) + '\r');
  }
}
