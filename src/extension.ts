import * as vscode from 'vscode';
import { analyzeDocument, Rule } from './analyzer';
import { DependencyGraph } from './graph';
import { ArchStatusBar } from './ui/statusBar';
import { GraphPanel } from './panels/GraphPanel';
import { ArchSentinelFixProvider } from './quickFix';
import * as path from 'path';
import * as fs from 'fs';
import { generateConfig } from './commands/autoInit';

let diagnosticCollection: vscode.DiagnosticCollection;
let graph: DependencyGraph;
let statusBar: ArchStatusBar;

export function activate(context: vscode.ExtensionContext) {
	console.log('ArchSentinel is now active!');

	// 1. Crear la colección de diagnósticos (donde se guardan los errores visuales)
	diagnosticCollection = vscode.languages.createDiagnosticCollection('archSentinel');
	context.subscriptions.push(diagnosticCollection);

	// Initialize Dependency Graph
	graph = new DependencyGraph();

	// Initialize Status Bar
	statusBar = new ArchStatusBar();
	context.subscriptions.push(statusBar);

	// Register Command to Show Problems
	context.subscriptions.push(
		vscode.commands.registerCommand('archsentinel.showProblems', () => {
			vscode.commands.executeCommand('workbench.action.problems.focus');
		})
	);

	// Register Command to Show Graph
	context.subscriptions.push(
		vscode.commands.registerCommand('archsentinel.showGraph', () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) return;

			const rootPath = workspaceFolders[0].uri.fsPath;
			const configPath = path.join(rootPath, 'arch-rules.json');
			let rules: Rule[] = [];

			if (fs.existsSync(configPath)) {
				try {
					const configContent = fs.readFileSync(configPath, 'utf-8');
					const config = JSON.parse(configContent);
					if (config && config.rules) {
						rules = config.rules;
					}
				} catch (error) {
					console.error('Error reading arch-rules.json for graph:', error);
				}
			}

			GraphPanel.createOrShow(context.extensionUri, graph, rules);
		})
	);

	// Register Command to Init / Auto-Detect
	context.subscriptions.push(
		vscode.commands.registerCommand('archsentinel.init', () => {
			generateConfig();
		})
	);

	// Register Quick Fix Provider
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			['typescript', 'typescriptreact', 'dart'],
			new ArchSentinelFixProvider(),
			{
				providedCodeActionKinds: ArchSentinelFixProvider.providedCodeActionKinds
			}
		)
	);

	// 2. Escuchar cuando se guarda un archivo
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(document => {
			runAnalysis(document);
		})
	);

	// 3. Escuchar cuando se abre un archivo
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(document => {
			runAnalysis(document);
		})
	);

	// 4. Ejecutar análisis inicial en el archivo activo si lo hay
	if (vscode.window.activeTextEditor) {
		runAnalysis(vscode.window.activeTextEditor.document);
	}
}

function runAnalysis(document: vscode.TextDocument) {
	// Solo analizar si es Typescript o Dart (puedes agregar más)
	if (document.languageId !== 'typescript' && document.languageId !== 'dart' && document.languageId !== 'typescriptreact') {
		return;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) return;

	// Buscar el archivo arch-rules.json en la raíz del proyecto
	const rootPath = workspaceFolders[0].uri.fsPath;
	const configPath = path.join(rootPath, 'arch-rules.json');

	if (fs.existsSync(configPath)) {
		try {
			// Leer y parsear las reglas
			const configContent = fs.readFileSync(configPath, 'utf-8');
			const config = JSON.parse(configContent);

			if (config && config.rules) {
				// LLAMADA A LÓGICA (analyzer.ts)
				const diagnostics = analyzeDocument(document, config.rules, graph);

				// Pintar los errores en VS Code
				diagnosticCollection.set(document.uri, diagnostics);

				// Update Status Bar
				// Note: This only updates based on the current document's diagnostics. 
				// Ideally, it should aggregate diagnostics from the collection. !!!!!
				// For MVP let's just use the current document's diagnostics.
				statusBar.update(diagnostics);
			}
		} catch (error) {
			console.error('Error reading arch-rules.json:', error);
		}
	} else {
		// Si no hay archivo de reglas, limpiamos los errores previos (eng: if there are no rules' file, clean previous issues)
		diagnosticCollection.clear();
	}
}

export function deactivate() { }