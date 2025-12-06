import * as vscode from 'vscode';

export class ArchStatusBar {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'archsentinel.showProblems';
        this.update([]);
        this.statusBarItem.show();
    }

    public update(diagnostics: vscode.Diagnostic[]) {
        const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warningCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
        const totalIssues = errorCount + warningCount;

        if (totalIssues === 0) {
            this.statusBarItem.text = '$(check) Arch: Clean';
            this.statusBarItem.backgroundColor = undefined; // Default background
            this.statusBarItem.tooltip = 'ArchSentinel: No architecture violations found.';
        } else {
            this.statusBarItem.text = `$(alert) Arch: ${totalIssues} Issues`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.statusBarItem.tooltip = `ArchSentinel: ${errorCount} Errors, ${warningCount} Warnings`;
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
