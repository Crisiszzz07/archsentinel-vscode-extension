import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraph } from './graph';

export interface Rule {
    scope: string; // Regex string to match the file path
    forbidden: string[]; // Regex strings to match forbidden import paths
    message: string;
}

/**
 * Analyzes a TextDocument for Clean Architecture violations based on provided rules.
 * Supports TypeScript (import ... from '...') and Dart (import '...').
 */
export function analyzeDocument(doc: vscode.TextDocument, rules: Rule[], graph: DependencyGraph): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const fileContent = doc.getText();
    const filePath = doc.fileName;
    const importsFound: string[] = [];

    // 1. Check if the current file falls within any rule's scope
    const applicableRules = rules.filter(rule => new RegExp(rule.scope).test(filePath));

    if (applicableRules.length === 0) {
        return diagnostics;
    }

    // 2. Define Regex for imports
    // TypeScript: import ... from 'module'; or import ... from "module";
    // Captures the module path in group 2
    const tsImportRegex = /import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g;

    // Dart: import 'package:...' or import "package:..."
    // Captures the import path in group 1
    const dartImportRegex = /import\s+['"]([^'"]+)['"]/g;

    const isDart = filePath.endsWith('.dart');
    const regex = isDart ? dartImportRegex : tsImportRegex;

    let match;
    while ((match = regex.exec(fileContent)) !== null) {
        const importPath = isDart ? match[1] : match[1];
        const start = match.index;
        const end = match.index + match[0].length;

        // Calculate range for the diagnostic
        // We want to highlight the import path, but for simplicity, we can highlight the whole statement
        // or try to find the path within the match. 
        // Let's highlight the specific import path string if possible, or the whole match.
        // The match[0] is the whole import statement.
        // The importPath is the string inside quotes.

        // Let's find the exact position of the importPath inside the match to be precise
        const importPathIndex = match[0].indexOf(importPath);
        const absoluteStart = start + importPathIndex;
        const absoluteEnd = absoluteStart + importPath.length;

        const range = new vscode.Range(
            doc.positionAt(absoluteStart),
            doc.positionAt(absoluteEnd)
        );

        // Resolve import for graph
        const resolvedPath = graph.resolveImport(filePath, importPath);
        if (resolvedPath) {
            importsFound.push(resolvedPath);
        }

        for (const rule of applicableRules) {
            for (const forbiddenPattern of rule.forbidden) {
                if (new RegExp(forbiddenPattern).test(importPath)) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `${rule.message} (Forbidden import: ${importPath})`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'ArchSentinel';
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    // Update graph and check for cycles
    graph.update(filePath, importsFound);
    const cycle = graph.detectCycle(filePath);

    if (cycle.length > 0) {
        // Create a diagnostic for the cycle
        // We attach it to the first line of the file for now
        const range = new vscode.Range(0, 0, 0, 0);
        const cyclePath = cycle.map(p => path.basename(p)).join(' -> ');
        const diagnostic = new vscode.Diagnostic(
            range,
            `Circular Dependency Detected: ${cyclePath}`,
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'ArchSentinel';
        diagnostics.push(diagnostic);
    }

    return diagnostics;
}
