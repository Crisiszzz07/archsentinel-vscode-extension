import * as vscode from 'vscode';
import { analyzeDocument, Rule } from './analyzer';
import * as path from 'path';
import * as fs from 'fs';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    console.log('ArchSentinel is now active!');

    // 1. Crear la colección de diagnósticos (donde se guardan los errores visuales)
    diagnosticCollection = vscode.languages.createDiagnosticCollection('archSentinel');
    context.subscriptions.push(diagnosticCollection);

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
                // LLAMADA A TU LÓGICA (analyzer.ts)
                const diagnostics = analyzeDocument(document, config.rules);
                
                // Pintar los errores en VS Code
                diagnosticCollection.set(document.uri, diagnostics);
            }
        } catch (error) {
            console.error('Error reading arch-rules.json:', error);
        }
    } else {
        // Si no hay archivo de reglas, limpiamos los errores previos
        diagnosticCollection.clear();
    }
}

export function deactivate() {}