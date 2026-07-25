import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let terminal: vscode.Terminal | undefined;

function findPxlCli(fromFile: string): string | null {
  let dir = path.dirname(fromFile);
  while (true) {
    const candidate = path.join(dir, "dist", "cli.js");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("pxl.runFile", (uri?: vscode.Uri) => {
    let fileUri = uri;
    if (!fileUri) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }
      fileUri = editor.document.uri;
    }

    const filePath = fileUri.fsPath;
    if (!filePath.toLowerCase().endsWith(".pxl")) {
      vscode.window.showErrorMessage("Not a .pxl file");
      return;
    }

    const cliPath = findPxlCli(filePath);
    if (!cliPath) {
      vscode.window.showErrorMessage(
        "PXL CLI not found — dist/cli.js not found in any parent directory. Run 'npm install && npm run build' in the pxl-lang project root.",
        "Open Terminal"
      ).then((selection) => {
        if (selection === "Open Terminal") {
          const t = vscode.window.createTerminal();
          t.show();
          t.sendText("echo 'Run: cd <pxl-lang-dir> && npm install && npm run build'");
        }
      });
      return;
    }

    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = vscode.window.createTerminal({ name: "PXL" });
    }
    terminal.show();
    terminal.sendText(`node "${cliPath}" "${filePath}"`);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
