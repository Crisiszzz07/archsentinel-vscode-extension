import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Rule } from './analyzer';

export class DependencyGraph {
    // Store resolved path AND original import string to re-check rules later
    private adjacencyList: Map<string, { resolvedPath: string, originalImport: string }[]> = new Map();

    constructor() { }

    /**
     * Updates the graph for a specific file.
     * @param filePath The absolute path of the file.
     * @param imports A list of imports (resolved path + original string).
     */
    public update(filePath: string, imports: { resolvedPath: string, originalImport: string }[]) {
        this.adjacencyList.set(filePath, imports);
    }

    /**
     * Detects cycles in the graph involving the given file.
     */
    public detectCycle(startNode: string): string[] {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const pathStack: string[] = [];

        if (this.dfs(startNode, visited, recursionStack, pathStack)) {
            return pathStack;
        }

        return [];
    }

    private dfs(node: string, visited: Set<string>, recursionStack: Set<string>, pathStack: string[]): boolean {
        visited.add(node);
        recursionStack.add(node);
        pathStack.push(node);

        const neighbors = this.adjacencyList.get(node);
        if (neighbors) {
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.resolvedPath)) {
                    if (this.dfs(neighbor.resolvedPath, visited, recursionStack, pathStack)) {
                        return true;
                    }
                } else if (recursionStack.has(neighbor.resolvedPath)) {
                    pathStack.push(neighbor.resolvedPath);
                    return true;
                }
            }
        }

        recursionStack.delete(node);
        pathStack.pop();
        return false;
    }

    /**
     * Returns the graph data in JSON format for Vis.js.
     * Applies rules dynamically to style edges.
     */
    public getJsonGraph(rules: Rule[]): { nodes: any[], edges: any[] } {
        const nodes: any[] = [];
        const edges: any[] = [];
        const addedNodes = new Set<string>();

        for (const [file, imports] of this.adjacencyList.entries()) {
            // Add Source Node
            if (!addedNodes.has(file)) {
                nodes.push({
                    id: file,
                    label: path.basename(file),
                    group: path.dirname(file)
                });
                addedNodes.add(file);
            }

            // Find applicable rules for this file (Scope)
            const applicableRules = rules.filter(rule => new RegExp(rule.scope).test(file));

            for (const imp of imports) {
                // Add Target Node
                if (!addedNodes.has(imp.resolvedPath)) {
                    nodes.push({
                        id: imp.resolvedPath,
                        label: path.basename(imp.resolvedPath),
                        group: path.dirname(imp.resolvedPath)
                    });
                    addedNodes.add(imp.resolvedPath);
                }

                // Check for Violations
                let isViolation = false;
                for (const rule of applicableRules) {
                    for (const forbiddenPattern of rule.forbidden) {
                        if (new RegExp(forbiddenPattern).test(imp.originalImport)) {
                            isViolation = true;
                            break;
                        }
                    }
                    if (isViolation) break;
                }

                // Style Edge
                edges.push({
                    from: file,
                    to: imp.resolvedPath,
                    color: isViolation ? { color: 'red' } : { color: 'gray' },
                    width: isViolation ? 3 : 1,
                    dashes: !isViolation, // Dashed if clean, solid if violation (user req: "dashes: false" for violation)
                    arrows: 'to'
                });
            }
        }

        return { nodes, edges };
    }

    /**
     * Resolves an import path to an absolute file path.
     */
    public resolveImport(currentFile: string, importPath: string): string | null {
        if (importPath.startsWith('.')) {
            const resolved = path.resolve(path.dirname(currentFile), importPath);
            const extensions = ['.ts', '.tsx', '.dart', '.js', '.jsx'];
            for (const ext of extensions) {
                if (fs.existsSync(resolved + ext)) {
                    return resolved + ext;
                }
            }
            if (fs.existsSync(resolved) && fs.lstatSync(resolved).isDirectory()) {
                for (const ext of extensions) {
                    if (fs.existsSync(path.join(resolved, 'index' + ext))) {
                        return path.join(resolved, 'index' + ext);
                    }
                }
            }
        }
        return null;
    }
}
