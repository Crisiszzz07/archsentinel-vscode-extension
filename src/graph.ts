import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DependencyGraph {
    private adjacencyList: Map<string, Set<string>> = new Map();

    constructor() { }

    /**
     * Updates the graph for a specific file.
     * @param filePath The absolute path of the file.
     * @param imports A list of absolute paths that this file imports.
     */
    public update(filePath: string, imports: string[]) {
        this.adjacencyList.set(filePath, new Set(imports));
    }

    /**
     * Detects cycles in the graph involving the given file.
     * @param startNode The absolute path of the file to check for cycles.
     * @returns An array of file paths forming the cycle, or empty if no cycle.
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
                if (!visited.has(neighbor)) {
                    if (this.dfs(neighbor, visited, recursionStack, pathStack)) {
                        return true;
                    }
                } else if (recursionStack.has(neighbor)) {
                    // Cycle detected!
                    // Add the neighbor to close the loop for visualization
                    pathStack.push(neighbor);
                    return true;
                }
            }
        }

        recursionStack.delete(node);
        pathStack.pop();
        return false;
    }

    /**
     * Resolves an import path to an absolute file path.
     * This is a simplified resolver and might need enhancement for complex setups.
     */
    public resolveImport(currentFile: string, importPath: string): string | null {
        if (importPath.startsWith('.')) {
            const resolved = path.resolve(path.dirname(currentFile), importPath);
            // Try adding extensions
            const extensions = ['.ts', '.tsx', '.dart', '.js', '.jsx'];
            for (const ext of extensions) {
                if (fs.existsSync(resolved + ext)) {
                    return resolved + ext;
                }
            }
            // Check if it's a directory (index file)
            if (fs.existsSync(resolved) && fs.lstatSync(resolved).isDirectory()) {
                for (const ext of extensions) {
                    if (fs.existsSync(path.join(resolved, 'index' + ext))) {
                        return path.join(resolved, 'index' + ext);
                    }
                }
            }
        }
        // For non-relative imports (aliases, node_modules), we skip for now in this MVP
        return null;
    }
}
