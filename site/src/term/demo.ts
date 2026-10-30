/**
 * A tiny in-browser shell used when no pty agent is reachable. It is
 * deliberately not a real shell: it exists so the UI, tabs and theming can be
 * exercised with no backend at all.
 */

const BANNER = [
  "\x1b[38;5;111mImagoro terminal\x1b[0m \x1b[2m- demo shell (no backend)\x1b[0m",
  "\x1b[2mPoint a tab at a real pty agent for a real shell. Type `help`.\x1b[0m",
  ""
].join("\r\n");

const COMMANDS: Record<string, (args: string[]) => string> = {
  help: () =>
    [
      "available commands:",
      "  help        this text",
      "  about       what this terminal is",
      "  shells      shells a real agent would offer",
      "  ls          fake directory listing",
      "  pwd         fake working directory",
      "  whoami      current (fake) user",
      "  date        current time",
      "  echo <txt>  print text",
      "  clear       clear the screen"
    ].join("\r\n"),
  about: () =>
    "A browser terminal: tabs <-> wss:// pty agent(s) <-> node-pty <-> bash / zsh / powershell.exe\r\n" +
    "It ships inside the site as a page, not as a separate application.",
  shells: () =>
    "the demo cannot spawn processes.\r\n" +
    "a real agent advertises its shells at GET /shells\r\n" +
    "  linux/macos: bash, zsh, sh\r\n" +
    "  windows:     powershell.exe, pwsh.exe, cmd.exe",
  ls: () => "docs   packages   scripts   site   tools   updates   README.md   LICENSE",
  pwd: () => "/srv/site",
  whoami: () => "operator",
  date: () => new Date().toString(),
  echo: (args) => args.join(" ")
};

export class DemoShell {
  private line = "";
  private readonly prompt = "\x1b[38;5;111m$\x1b[0m ";

  constructor(private readonly write: (s: string) => void) {}

  start(): void {
    this.write(`${BANNER}\r\n${this.prompt}`);
  }

  input(data: string): void {
    for (const ch of data) {
      switch (ch) {
        case "\r":
        case "\n":
          this.write("\r\n");
          this.run(this.line);
          this.line = "";
          this.write(this.prompt);
          break;
        case "\u007f": // backspace
          if (this.line.length > 0) {
            this.line = this.line.slice(0, -1);
            this.write("\b \b");
          }
          break;
        case "\u0003": // Ctrl-C
          this.line = "";
          this.write("^C\r\n" + this.prompt);
          break;
        case "\u000c": // Ctrl-L
          this.write("\x1b[2J\x1b[H" + this.prompt + this.line);
          break;
        default:
          if (ch >= " ") {
            this.line += ch;
            this.write(ch);
          }
      }
    }
  }

  private run(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const [name, ...args] = trimmed.split(/\s+/);
    if (name === "clear") {
      this.write("\x1b[2J\x1b[H");
      return;
    }
    const fn = name ? COMMANDS[name] : undefined;
    this.write(fn ? `${fn(args)}\r\n` : `demo: command not found: ${name}\r\n`);
  }
}
