"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let terminal;
function activate(context) {
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
            vscode.window.showErrorMessage("PXL CLI not found — run 'npm install && npm run build' in the project root first", "Open Terminal").then((selection) => {
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
function deactivate() { }
