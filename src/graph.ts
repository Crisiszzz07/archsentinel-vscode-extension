//CHECK COLORS FOR FUTURE USES AND UPDATES
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Rule } from './analyzer';

/**
 * Helper to normalize paths to use forward slashes (OS Agnostic).
 */
function normalize(p: string): string {
    return p.split(path.sep).join('/');
}

export class DependencyGraph {
    // Store resolved path AND original import string to re-check rules later
    private adjacencyList: Map<string, { resolvedPath: string, originalImport: string, isIgnored: boolean }[]> = new Map();

    constructor() { }

    /**
     * Updates the graph for a specific file.
     * @param filePath The absolute path of the file.
     * @param imports A list of imports (resolved path + original string + ignored status).
     */
    public update(filePath: string, imports: { resolvedPath: string, originalImport: string, isIgnored: boolean }[]) {
        this.adjacencyList.set(normalize(filePath), imports);
    }

    /**
     * Detects cycles in the graph involving the given file.
     */
    public detectCycle(startNode: string): string[] {
        const normalizedStart = normalize(startNode);
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const pathStack: string[] = [];

        if (this.dfs(normalizedStart, visited, recursionStack, pathStack)) {
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
     * Calculates Instability Metric (I) for each node.
     */
    public getJsonGraph(rules: Rule[]): { nodes: any[], edges: any[] } {
        const nodes: any[] = [];
        const edges: any[] = [];
        const addedNodes = new Set<string>();

        // 1. Calculate Fan-in (Ca) for all nodes
        const fanInMap = new Map<string, number>();

        // Initialize fan-in for all known files
        for (const file of this.adjacencyList.keys()) {
            fanInMap.set(file, 0);
        }

        for (const imports of this.adjacencyList.values()) {
            for (const imp of imports) {
                const current = fanInMap.get(imp.resolvedPath) || 0;
                fanInMap.set(imp.resolvedPath, current + 1);
            }
        }

        for (const [file, imports] of this.adjacencyList.entries()) {
            // Add Source Node
            if (!addedNodes.has(file)) {
                const ce = imports.length; // Fan-out
                const ca = fanInMap.get(file) || 0; // Fan-in
                const total = ca + ce;
                const instability = total === 0 ? 0 : ce / total;
                const iLabel = instability.toFixed(2);

                // Determine Color based on Instability
                let color = '#77dd77'; // Green (Stable)
                if (instability > 0.7) {
                    color = '#ffb347'; // Orange (Volatile)
                } else if (instability > 0.3) {
                    color = '#fdfd96'; // Yellow (Hybrid)
                }

                nodes.push({
                    id: file,
                    label: `${path.basename(file)}\n(I: ${iLabel})`,
                    group: path.dirname(file),
                    color: {
                        background: color,
                        border: '#2B2B2B',
                        highlight: { background: color, border: '#2B2B2B' }
                    },
                    font: { color: '#000000' } // Black text for better contrast on light colors
                });
                addedNodes.add(file);
            }

            // Find applicable rules for this file (Scope)
            const applicableRules = rules.filter(rule => new RegExp(rule.scope).test(file));

            for (const imp of imports) {
                // Add Target Node (if not already added as a source)
                if (!addedNodes.has(imp.resolvedPath)) {
                    // For external/leaf nodes that are not in adjacencyList keys, 
                    // might not have full info, but we know Ca >= 1 (since  File imports it)
                    // treat them as having Ce=0 if theyre not analyzed yet.
                    const ce = 0;
                    const ca = fanInMap.get(imp.resolvedPath) || 0;
                    const total = ca + ce;
                    const instability = total === 0 ? 0 : ce / total;
                    const iLabel = instability.toFixed(2);

                    let color = '#77dd77';
                    if (instability > 0.7) color = '#ffb347';
                    else if (instability > 0.3) color = '#fdfd96';

                    nodes.push({
                        id: imp.resolvedPath,
                        label: `${path.basename(imp.resolvedPath)}\n(I: ${iLabel})`,
                        group: path.dirname(imp.resolvedPath),
                        color: {
                            background: color,
                            border: '#2B2B2B',
                            highlight: { background: color, border: '#2B2B2B' }
                        },
                        font: { color: '#000000' }
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
                let edgeColor = 'gray';
                let edgeWidth = 1;
                let edgeDashes: boolean | number[] = true; // Dashed by default (clean)

                if (isViolation) {
                    if (imp.isIgnored) {
                        edgeColor = '#FFA500'; // Orange for ignored violations
                        edgeWidth = 2;
                        edgeDashes = [5, 5]; // Dashed for ignored
                    } else {
                        edgeColor = 'red'; // Red for active violations
                        edgeWidth = 3;
                        edgeDashes = false; // Solid for active violations
                    }
                }

                edges.push({
                    from: file,
                    to: imp.resolvedPath,
                    color: { color: edgeColor },
                    width: edgeWidth,
                    dashes: edgeDashes,
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
        // Normalize current file path to ensure consistency
        // But we need the directory for resolution, so we use path.dirname on the OS specific path first if needed
        // Actually, path.dirname works on strings.
        // Let's assume currentFile is absolute. !!

        const currentDir = path.dirname(currentFile);

        if (importPath.startsWith('.')) {
            // Relative path: Resolve against current file directory
            const resolved = path.resolve(currentDir, importPath);

            // 1. Check if file exists exactly as imported (e.g. user.dart)
            if (fs.existsSync(resolved) && fs.lstatSync(resolved).isFile()) {
                return normalize(resolved);
            }

            // 2. Try extensions
            const extensions = ['.ts', '.tsx', '.dart', '.js', '.jsx'];
            for (const ext of extensions) {
                if (fs.existsSync(resolved + ext)) {
                    return normalize(resolved + ext);
                }
            }

            // Try directory index
            if (fs.existsSync(resolved) && fs.lstatSync(resolved).isDirectory()) {
                for (const ext of extensions) {
                    if (fs.existsSync(path.join(resolved, 'index' + ext))) {
                        return normalize(path.join(resolved, 'index' + ext));
                    }
                }
            }
        } else {
            // Absolute path or Package import
            // If it's an absolute path (unlikely in imports but possible)
            if (path.isAbsolute(importPath)) {
                if (fs.existsSync(importPath)) {
                    return normalize(importPath);
                }
            }
            
        }

        return null;
    }
}
