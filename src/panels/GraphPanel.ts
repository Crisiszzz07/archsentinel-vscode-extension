import * as vscode from 'vscode';
import { DependencyGraph } from '../graph';
import { Rule } from '../analyzer';

export class GraphPanel {
    public static currentPanel: GraphPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, graph: DependencyGraph, rules: Rule[]) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update(graph, rules);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, graph: DependencyGraph, rules: Rule[]) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (GraphPanel.currentPanel) {
            GraphPanel.currentPanel._panel.reveal(column);
            GraphPanel.currentPanel._update(graph, rules);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'archSentinelGraph',
            'Architecture Graph',
            column || vscode.ViewColumn.One,
            {
                // Enable javascript in the webview
                enableScripts: true,
                // And restrict the webview to only loading content from our extension's `media` directory.
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        GraphPanel.currentPanel = new GraphPanel(panel, extensionUri, graph, rules);
    }

    public dispose() {
        GraphPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(graph: DependencyGraph, rules: Rule[]) {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview, graph, rules);
    }

    private _getHtmlForWebview(webview: vscode.Webview, graph: DependencyGraph, rules: Rule[]) {
        const graphData = graph.getJsonGraph(rules);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Architecture Graph</title>
            <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
            <style>
                body, html {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                    background-color: #1e1e1e; /* Dark theme background */
                    color: #ccc;
                }
                #mynetwork {
                    width: 100%;
                    height: 100%;
                    border: 1px solid lightgray;
                }
            </style>
        </head>
        <body>
            <div id="mynetwork"></div>
            <script type="text/javascript">
                const nodes = new vis.DataSet(${JSON.stringify(graphData.nodes)});
                const edges = new vis.DataSet(${JSON.stringify(graphData.edges)});

                const container = document.getElementById('mynetwork');
                const data = {
                    nodes: nodes,
                    edges: edges
                };
                const options = {
                    nodes: {
                        shape: 'dot',
                        size: 16,
                        font: {
                            color: '#ffffff'
                        },
                        borderWidth: 2
                    },
                    edges: {
                        width: 1,
                        smooth: {
                            type: 'continuous'
                        }
                    },
                    physics: {
                        stabilization: false,
                        barnesHut: {
                            gravitationalConstant: -8000,
                            springConstant: 0.04,
                            springLength: 95
                        }
                    },
                    layout: {
                        improvedLayout: true
                    },
                    interaction: {
                        hover: true
                    }
                };
                const network = new vis.Network(container, data, options);

                // --- Impact Analysis Interaction ---
                network.on("click", function (params) {
                    if (params.nodes.length > 0) {
                        // Node clicked
                        const clickedNodeId = params.nodes[0];
                        const connectedNodes = network.getConnectedNodes(clickedNodeId);
                        const allConnected = [clickedNodeId, ...connectedNodes];

                        // Update Nodes
                        const updateNodes = [];
                        nodes.forEach((node) => {
                            if (allConnected.includes(node.id)) {
                                updateNodes.push({ id: node.id, opacity: 1.0, font: { color: '#ffffff' } }); // Highlight
                            } else {
                                updateNodes.push({ id: node.id, opacity: 0.1, font: { color: 'rgba(255,255,255,0.1)' } }); // Dim
                            }
                        });
                        nodes.update(updateNodes);

                        // Update Edges
                        const updateEdges = [];
                        edges.forEach((edge) => {
                            if (allConnected.includes(edge.from) && allConnected.includes(edge.to)) {
                                updateEdges.push({ id: edge.id, opacity: 1.0 }); // Highlight
                            } else {
                                updateEdges.push({ id: edge.id, opacity: 0.1 }); // Dim
                            }
                        });
                        edges.update(updateEdges);

                    } else {
                        // Background clicked (Reset)
                        const updateNodes = [];
                        nodes.forEach((node) => {
                            updateNodes.push({ id: node.id, opacity: 1.0, font: { color: '#ffffff' } });
                        });
                        nodes.update(updateNodes);

                        const updateEdges = [];
                        edges.forEach((edge) => {
                            updateEdges.push({ id: edge.id, opacity: 1.0 });
                        });
                        edges.update(updateEdges);
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
