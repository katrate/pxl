import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let terminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("pxl.runFile", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!filePath.toLowerCase().endsWith(".pxl")) {
      vscode.window.showErrorMessage("Not a .pxl file");
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("File must be inside a workspace folder");
      return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;

    const cliPath = path.join(workspaceRoot, "dist", "cli.js");

    if (!fs.existsSync(cliPath)) {
      vscode.window.showErrorMessage(
        "PXL CLI not found — run 'npm install && npm run build' in the project root first",
        "Open Terminal"
      ).then((selection) => {
        if (selection === "Open Terminal") {
          const buildTerminal = vscode.window.createTerminal({ cwd: workspaceRoot });
          buildTerminal.sendText("npm install && npm run build");
          buildTerminal.show();
        }
      });
      return;
    }

    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = vscode.window.createTerminal({ cwd: workspaceRoot, name: "PXL" });
    }
    terminal.show();
    terminal.sendText(`node "${cliPath}" "${filePath}"`);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
