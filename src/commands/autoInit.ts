import * as vscode from 'vscode';
import * as path from 'path';

// Heuristic Lists (Aggressive Mapping)
const LAYER_DOMAIN = ['domain', 'core', 'entities', 'models'];
const LAYER_APP = ['application', 'usecases', 'providers', 'services'];
const LAYER_INFRA = ['infrastructure', 'data', 'repositories', 'services']; // Services can be ambiguous, but often infra or app. Let's keep it here too or prioritize one. User said services in INFRA list in prompt.
const LAYER_UI = ['ui', 'presentation', 'views', 'widgets', 'pages'];

interface Rule {
    scope: string;
    forbidden: string[];
    message?: string;
}

export async function generateConfig() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('ArchSentinel: No workspace open.');
        return;
    }

    const rootUri = workspaceFolders[0].uri;

    // 1. Root Detection
    let scanUri = rootUri;
    let relativePrefix = '';
    let detectedRootName = 'root';

    const srcUri = vscode.Uri.joinPath(rootUri, 'src');
    const libUri = vscode.Uri.joinPath(rootUri, 'lib');

    let srcExists = false;
    let libExists = false;

    try {
        await vscode.workspace.fs.stat(srcUri);
        srcExists = true;
    } catch (e) { /* ignore */ }

    try {
        await vscode.workspace.fs.stat(libUri);
        libExists = true;
    } catch (e) { /* ignore */ }

    if (srcExists) {
        scanUri = srcUri;
        relativePrefix = 'src/';
        detectedRootName = 'src';
    } else if (libExists) {
        scanUri = libUri;
        relativePrefix = 'lib/';
        detectedRootName = 'lib';
    } else {
        // Root is "."
        scanUri = rootUri;
        relativePrefix = '';
        detectedRootName = 'root';
    }

    // 2. Scanning
    let subdirs: string[] = [];
    try {
        const entries = await vscode.workspace.fs.readDirectory(scanUri);
        subdirs = entries
            .filter(([name, type]) => type === vscode.FileType.Directory)
            .map(([name]) => name);
    } catch (error) {
        vscode.window.showErrorMessage(`ArchSentinel: Error scanning directories: ${error}`);
        return;
    }

    // Map folders to layers
    const foundDomain = subdirs.filter(d => LAYER_DOMAIN.includes(d.toLowerCase()));
    const foundApp = subdirs.filter(d => LAYER_APP.includes(d.toLowerCase()));
    const foundInfra = subdirs.filter(d => LAYER_INFRA.includes(d.toLowerCase()));
    const foundUI = subdirs.filter(d => LAYER_UI.includes(d.toLowerCase()));

    const rules: Rule[] = [];
    let isFallback = false;

    // 3. Rule Generation Logic
    const allFoundLayers = [...foundDomain, ...foundApp, ...foundInfra, ...foundUI];

    if (allFoundLayers.length === 0) {
        // Fallback Strategy
        isFallback = true;
        rules.push({
            scope: "src/domain", // Example scope
            forbidden: ["src/infrastructure", "src/ui"],
            message: "❌ Example Rule: Domain should not import Infrastructure."
        });
    } else {
        // Domain Layer Rules
        if (foundDomain.length > 0) {
            // Forbidden = All other layers found
            const forbidden = [
                ...foundApp.map(d => `${relativePrefix}${d}`),
                ...foundInfra.map(d => `${relativePrefix}${d}`),
                ...foundUI.map(d => `${relativePrefix}${d}`),
                'react', 'flutter', '@angular/core', 'vue'
            ];

            foundDomain.forEach(domainFolder => {
                rules.push({
                    scope: `${relativePrefix}${domainFolder}`,
                    forbidden: forbidden,
                    message: "❌ The Domain layer must remain pure and independent."
                });
            });
        }

        // UI Layer Rules
        if (foundUI.length > 0) {
            // UI shouldn't touch DB directly (Infra)
            const forbidden = [
                ...foundInfra.map(d => `${relativePrefix}${d}`)
            ];

            foundUI.forEach(uiFolder => {
                rules.push({
                    scope: `${relativePrefix}${uiFolder}`,
                    forbidden: forbidden,
                    message: "⚠️ UI layer should not depend on Infrastructure details directly."
                });
            });
        }

        // App Layer Rules (Bonus: usually App depends on Domain, forbids Infra/UI details)
        if (foundApp.length > 0) {
            const forbidden = [
                ...foundInfra.map(d => `${relativePrefix}${d}`),
                ...foundUI.map(d => `${relativePrefix}${d}`), // App shouldn't depend on UI
                'react', 'flutter', 'express'
            ];
            foundApp.forEach(appFolder => {
                rules.push({
                    scope: `${relativePrefix}${appFolder}`,
                    forbidden: forbidden,
                    message: "⚠️ Application layer should not depend on Infrastructure or UI details."
                });
            });
        }
    }

    // Construct JSON
    const config = {
        rules: rules
    };

    const configUri = vscode.Uri.joinPath(rootUri, 'arch-rules.json');

    // Write File
    try {
        const content = JSON.stringify(config, null, 2);
        await vscode.workspace.fs.writeFile(configUri, Buffer.from(content, 'utf8'));

        // 4. User Feedback
        const openAction = 'Open Config';
        let message = '';

        if (isFallback) {
            message = '⚠️ No standard architecture detected. Generated a starter template for you to customize.';
        } else {
            message = `✅ Detected Clean Architecture in \`${detectedRootName}\` folder.`;
        }

        const result = await vscode.window.showInformationMessage(message, openAction);

        if (result === openAction) {
            const doc = await vscode.workspace.openTextDocument(configUri);
            await vscode.window.showTextDocument(doc);
        } else {
            const doc = await vscode.workspace.openTextDocument(configUri);
            await vscode.window.showTextDocument(doc);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`ArchSentinel: Failed to write config file: ${error}`);
    }
}
