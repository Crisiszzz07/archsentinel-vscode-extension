import * as vscode from 'vscode';

export class ArchSentinelFixProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        return context.diagnostics
            .filter(diagnostic => diagnostic.source === 'ArchSentinel')
            .map(diagnostic => this.createFix(document, diagnostic));
    }

    private createFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const fix = new vscode.CodeAction('Ignore this architecture violation', vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;

        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(diagnostic.range.start.line);

        // Get indentation of the current line
        const indentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex);

        // Insert comment on the line before
        const insertPosition = new vscode.Position(line.lineNumber, 0);
        const insertText = `${indentation}// arch-ignore\n`;

        edit.insert(document.uri, insertPosition, insertText);
        fix.edit = edit;

        return fix;
    }
}
