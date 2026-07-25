import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let terminal: vscode.Terminal | undefined;

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

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
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

  const lensProvider = vscode.languages.registerCodeLensProvider("pxl", {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
      const top = new vscode.Range(0, 0, 0, 0);
      return [
        new vscode.CodeLens(top, {
          title: "\u25B6 Run .pxl",
          command: "pxl.runFile",
          arguments: [document.uri],
          tooltip: "Render this .pxl file to PNG",
        }),
      ];
    },
  });

  context.subscriptions.push(lensProvider);
}

export function deactivate() {}
