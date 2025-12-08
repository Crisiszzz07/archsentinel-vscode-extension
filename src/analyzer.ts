import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraph } from './graph';

export interface Rule {
    scope: string; // Regex string to match the file path
    forbidden: string[]; // Regex strings to match forbidden import paths
    message: string;
}

/**
 * Helper to normalize paths to use forward slashes (OS Agnostic).
 */
function normalize(p: string): string {
    return p.split(path.sep).join('/');
}

/**
 * Analyzes a TextDocument for Clean Architecture violations based on provided rules.
 * Supports TypeScript (import ... from '...') and Dart (import '...').
 */
export function analyzeDocument(doc: vscode.TextDocument, rules: Rule[], graph: DependencyGraph): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const fileContent = doc.getText();
    const filePath = normalize(doc.fileName);
    const fileDir = path.dirname(doc.fileName); // Keep OS specific for path.resolve
    const importsFound: { resolvedPath: string, originalImport: string, isIgnored: boolean }[] = [];

    // 1. Check if the current file falls within any rule's scope
    // We normalize the file path before checking scope
    const applicableRules = rules.filter(rule => new RegExp(rule.scope).test(filePath));

    if (applicableRules.length === 0) {
        return diagnostics;
    }

    // 2. Define Regex for imports
    // TypeScript: import ... from 'module'; or import ... from "module"; or require("module")
    // Captures the module path in group 2 or 3 depending on the match, but it can be simplified.
    // combined regex or separate ones.

    // TS Import: import ... from "..."
    const tsImportRegex = /import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g;
    // TS Require: require("...")
    const tsRequireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    // Dart: import 'package:...' or import "package:..." or import '...'
    const dartImportRegex = /import\s+['"]([^'"]+)['"]/g;

    const isDart = filePath.endsWith('.dart');
    const regexes = isDart ? [dartImportRegex] : [tsImportRegex, tsRequireRegex];

    for (const regex of regexes) {
        let match;
        // Reset regex state just in case
        regex.lastIndex = 0;

        while ((match = regex.exec(fileContent)) !== null) {
            const importPath = match[1]; // The captured path inside quotes
            const start = match.index;

            // Calculate range for the diagnostic
            // Find the exact position of the importPath inside the match
            const importPathIndex = match[0].indexOf(importPath);
            const absoluteStart = start + importPathIndex;
            const absoluteEnd = absoluteStart + importPath.length;

            const range = new vscode.Range(
                doc.positionAt(absoluteStart),
                doc.positionAt(absoluteEnd)
            );

            // Check for suppression comment on previous line
            const startPos = doc.positionAt(start);
            let isIgnored = false;
            if (startPos.line > 0) {
                const prevLine = doc.lineAt(startPos.line - 1);
                if (prevLine.text.trim().includes('// arch-ignore')) {
                    isIgnored = true;
                }
            }

            // 3. Robust Path Resolution
            let resolvedAbsolutePath = '';

            if (importPath.startsWith('.')) {
                // Relative path: Resolve against current file directory
                resolvedAbsolutePath = normalize(path.resolve(fileDir, importPath));
            } else {
                // Absolute path or package import (e.g. 'react', 'package:flutter')
                // For architecture checks, we treat these as is, but normalized if they look like paths
                resolvedAbsolutePath = normalize(importPath);
            }

            // 4. Check against Rules
            for (const rule of applicableRules) {
                for (const forbiddenPattern of rule.forbidden) {
                    const forbiddenRegex = new RegExp(forbiddenPattern);

                    // Check 1: Does the resolved absolute path match? (For relative imports)
                    // Check 2: Does the original import match? (For packages)

                    if (forbiddenRegex.test(resolvedAbsolutePath) || forbiddenRegex.test(importPath)) {
                        if (!isIgnored) {
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

            // Resolve import for graph (keep existing logic or update if needed)
            // The graph likely expects absolute paths for nodes to link correctly
            const graphResolvedPath = graph.resolveImport(doc.fileName, importPath);
            if (graphResolvedPath) {
                importsFound.push({ resolvedPath: graphResolvedPath, originalImport: importPath, isIgnored: isIgnored });
            }
        }
    }

    // Update graph and check for cycles
    graph.update(doc.fileName, importsFound);
    const cycle = graph.detectCycle(doc.fileName);

    if (cycle.length > 0) {
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
